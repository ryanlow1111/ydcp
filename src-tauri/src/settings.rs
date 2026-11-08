//! `~/.ydcp/settings.json`: small things YDCP remembers between launches — where she stands,
//! which model, her size, always-on-top, each model's outfit. Unknown fields are kept as they are, so newer
//! versions' settings survive.

use std::collections::BTreeMap;
use std::fs;
use std::path::Path;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

use crate::agent::AgentLink;

/// Where her window's top-left corner was, in physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

/// Frames a second unless the menu says otherwise.
pub const DEFAULT_FRAME_RATE: u32 = 60;

/// The frame rates the menu offers; anything else in the file falls back to the default.
pub fn valid_frame_rate(rate: Option<u32>) -> u32 {
    rate.filter(|rate| [60, 30].contains(rate))
        .unwrap_or(DEFAULT_FRAME_RATE)
}

/// Her window's size: Small 0.75×, Medium 1×, Large 1.4× of 320 × 480.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum Size {
    Small,
    #[default]
    Medium,
    Large,
}

impl Size {
    pub const ALL: [Size; 3] = [Size::Small, Size::Medium, Size::Large];

    /// The window's size in logical pixels.
    pub fn logical(self) -> (f64, f64) {
        let factor = match self {
            Size::Small => 0.75,
            Size::Medium => 1.0,
            Size::Large => 1.4,
        };
        (320.0 * factor, 480.0 * factor)
    }

    pub fn label(self) -> &'static str {
        match self {
            Size::Small => "Small",
            Size::Medium => "Medium",
            Size::Large => "Large",
        }
    }

    pub fn id(self) -> &'static str {
        match self {
            Size::Small => "small",
            Size::Medium => "medium",
            Size::Large => "large",
        }
    }
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    /// The chosen model's file name in the models folder.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<Size>,
    #[serde(
        default,
        rename = "alwaysOnTop",
        skip_serializing_if = "Option::is_none"
    )]
    pub always_on_top: Option<bool>,
    /// Whether she reacts to an agent's state file (off by default).
    #[serde(default, rename = "agentLink", skip_serializing_if = "Option::is_none")]
    pub agent_link: Option<AgentLink>,
    #[serde(default, rename = "frameRate", skip_serializing_if = "Option::is_none")]
    pub frame_rate: Option<u32>,
    /// The outfit parts shown on each model (by file name), e.g. `"lily.vrm": ["hat01"]`.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub outfits: BTreeMap<String, Vec<String>>,
    /// Everything else in the file, kept untouched.
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

impl Settings {
    /// The outfit parts last shown on `model`.
    pub fn outfit(&self, model: &str) -> Vec<String> {
        self.outfits.get(model).cloned().unwrap_or_default()
    }

    /// Remembers the outfit parts shown on `model`; none forgets the model's entry.
    pub fn set_outfit(&mut self, model: &str, parts: &[String]) {
        if parts.is_empty() {
            self.outfits.remove(model);
        } else {
            self.outfits.insert(model.to_string(), parts.to_vec());
        }
    }
}

/// The settings in `path`; defaults if the file is missing or unreadable.
pub fn load(path: &Path) -> Settings {
    fs::read_to_string(path)
        .ok()
        .and_then(|text| serde_json::from_str(&text).ok())
        .unwrap_or_default()
}

/// Writes the settings in one step (a temporary file, then a rename), so a crash mid-write
/// never leaves a broken file.
pub fn save(path: &Path, settings: &Settings) -> std::io::Result<()> {
    let text = serde_json::to_string_pretty(settings)?;
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, format!("{text}\n"))?;
    fs::rename(&temporary, path)
}

/// One settings change at a time: the menu (model, size, …) and the position saver (another
/// thread) both change the file, and each must see the other's last change.
static CHANGING: Mutex<()> = Mutex::new(());

/// Loads, changes and saves the settings in one go, one change at a time.
pub fn update(path: &Path, change: impl FnOnce(&mut Settings)) -> std::io::Result<()> {
    let _turn = CHANGING
        .lock()
        .unwrap_or_else(std::sync::PoisonError::into_inner);
    let mut settings = load(path);
    let before = settings.clone();
    change(&mut settings);
    if settings == before && path.exists() {
        return Ok(());
    }
    save(path, &settings)
}

/// A screen's usable area (without the Dock, menu bar or taskbar), in physical pixels.
#[derive(Debug, Clone, Copy)]
pub struct Area {
    pub x: i32,
    pub y: i32,
    pub width: u32,
    pub height: u32,
}

/// Whether a window at `position` with `size` (physical pixels) would have its centre on one
/// of `areas`, so she's never restored onto a screen that's gone.
pub fn fits_on_a_screen(position: Position, size: (u32, u32), areas: &[Area]) -> bool {
    let centre_x = i64::from(position.x) + i64::from(size.0) / 2;
    let centre_y = i64::from(position.y) + i64::from(size.1) / 2;
    areas.iter().any(|area| {
        let left = i64::from(area.x);
        let top = i64::from(area.y);
        centre_x >= left
            && centre_x < left + i64::from(area.width)
            && centre_y >= top
            && centre_y < top + i64::from(area.height)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    fn temp_file(test: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("ydcp-settings-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir.join("settings.json")
    }

    #[test]
    fn missing_or_broken_files_give_defaults() {
        let path = temp_file("missing");
        assert_eq!(load(&path), Settings::default());
        fs::write(&path, "{ not json").unwrap();
        assert_eq!(load(&path), Settings::default());
    }

    #[test]
    fn saves_and_keeps_unknown_fields() {
        let path = temp_file("roundtrip");
        fs::write(
            &path,
            r#"{ "agentLink": "off", "size": "large", "future": "kept" }"#,
        )
        .unwrap();
        let mut settings = load(&path);
        settings.position = Some(Position { x: -1200, y: 300 });
        save(&path, &settings).unwrap();
        let again = load(&path);
        assert_eq!(again.position, Some(Position { x: -1200, y: 300 }));
        assert_eq!(again.agent_link, Some(AgentLink::Off));
        assert_eq!(again.size, Some(Size::Large));
        assert_eq!(again.other.get("future"), Some(&Value::from("kept")));
    }

    #[test]
    fn update_changes_one_thing_and_keeps_the_rest() {
        let path = temp_file("update");
        fs::write(&path, r#"{ "agentLink": "off", "model": "a.vrm" }"#).unwrap();
        update(&path, |settings| settings.always_on_top = Some(false)).unwrap();
        let again = load(&path);
        assert_eq!(again.model.as_deref(), Some("a.vrm"));
        assert_eq!(again.always_on_top, Some(false));
        assert_eq!(again.agent_link, Some(AgentLink::Off));
    }

    #[test]
    fn changes_from_two_threads_never_lose_each_other() {
        let path = temp_file("threads");
        let positions = {
            let path = path.clone();
            std::thread::spawn(move || {
                for x in 0..200 {
                    update(&path, |settings| {
                        settings.position = Some(Position { x, y: 0 })
                    })
                    .unwrap();
                }
            })
        };
        for _ in 0..200 {
            update(&path, |settings| {
                settings.always_on_top = Some(false);
                settings.model = Some("a.vrm".into());
            })
            .unwrap();
        }
        positions.join().unwrap();
        let end = load(&path);
        assert_eq!(end.position, Some(Position { x: 199, y: 0 }));
        assert_eq!(end.always_on_top, Some(false));
        assert_eq!(end.model.as_deref(), Some("a.vrm"));
    }

    #[test]
    fn remembers_each_models_outfit() {
        let path = temp_file("outfits");
        let hat = vec!["hat01".to_string(), "tie".to_string()];
        update(&path, |settings| settings.set_outfit("lily.vrm", &hat)).unwrap();
        update(&path, |settings| {
            settings.set_outfit("other.vrm", &["glass".into()])
        })
        .unwrap();
        let saved = load(&path);
        assert_eq!(saved.outfit("lily.vrm"), hat);
        assert_eq!(saved.outfit("nobody.vrm"), Vec::<String>::new());
        update(&path, |settings| settings.set_outfit("lily.vrm", &[])).unwrap();
        assert!(!load(&path).outfits.contains_key("lily.vrm"));
        update(&path, |settings| settings.set_outfit("other.vrm", &[])).unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("outfits"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn frame_rate_falls_back_to_60() {
        assert_eq!(valid_frame_rate(Some(30)), 30);
        assert_eq!(valid_frame_rate(Some(60)), 60);
        assert_eq!(valid_frame_rate(Some(7)), 60);
        assert_eq!(valid_frame_rate(None), 60);
    }

    #[test]
    fn sizes_scale_the_window() {
        assert_eq!(Size::Medium.logical(), (320.0, 480.0));
        assert_eq!(Size::Small.logical(), (240.0, 360.0));
        assert_eq!(Size::Large.logical(), (448.0, 672.0));
    }

    #[test]
    fn only_restores_onto_a_screen_that_exists() {
        let main = Area {
            x: 0,
            y: 25,
            width: 1920,
            height: 1000,
        };
        let left = Area {
            x: -1280,
            y: 0,
            width: 1280,
            height: 1024,
        };
        let size = (320, 480);
        assert!(fits_on_a_screen(
            Position { x: 1500, y: 500 },
            size,
            &[main]
        ));
        assert!(fits_on_a_screen(
            Position { x: -900, y: 200 },
            size,
            &[main, left]
        ));
        // The left screen was unplugged.
        assert!(!fits_on_a_screen(
            Position { x: -900, y: 200 },
            size,
            &[main]
        ));
        // Mostly off the right edge.
        assert!(!fits_on_a_screen(
            Position { x: 1800, y: 500 },
            size,
            &[main]
        ));
    }
}
