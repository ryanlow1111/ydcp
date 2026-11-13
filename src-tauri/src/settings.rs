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

/// The break reminder intervals the menu offers, in minutes (0 or anything else: off).
pub const BREAK_CHOICES: [u32; 4] = [30, 45, 60, 90];
/// The timer lengths the menu offers, in minutes.
pub const TIMER_CHOICES: [u32; 6] = [5, 10, 15, 25, 45, 60];

/// A break reminder interval from the settings or the menu; anything unknown is off (0).
pub fn valid_break_every(minutes: Option<u32>) -> u32 {
    minutes
        .filter(|minutes| BREAK_CHOICES.contains(minutes))
        .unwrap_or(0)
}

/// Menu → Chattiness: how often she speaks up on her own (the front end does the rationing).
pub const CHATTINESS: [&str; 3] = ["quiet", "calm", "chatty"];
pub const DEFAULT_CHATTINESS: &str = "calm";

/// The chattiness choices the menu offers; anything else in the file falls back to calm.
pub fn valid_chattiness(choice: Option<&str>) -> &'static str {
    CHATTINESS
        .into_iter()
        .find(|known| Some(*known) == choice)
        .unwrap_or(DEFAULT_CHATTINESS)
}

/// What she remembers between launches: the last day she saw you and how many days in a row
/// (the front end works these out; see src/memory.js). Nothing else about you is kept.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct Memory {
    /// The user's own calendar day, as "YYYY-MM-DD".
    #[serde(default, rename = "lastDay", skip_serializing_if = "Option::is_none")]
    pub last_day: Option<String>,
    #[serde(default)]
    pub streak: u32,
}

/// A memory worth saving: a real-looking day and a sensible run of days. Anything else is refused.
pub fn valid_memory(memory: Memory) -> Option<Memory> {
    let day = memory.last_day.as_deref()?;
    let shaped = day.len() == 10
        && day.char_indices().all(|(index, character)| match index {
            4 | 7 => character == '-',
            _ => character.is_ascii_digit(),
        });
    (shaped && (1..=100_000).contains(&memory.streak)).then_some(memory)
}

/// Frames a second unless the menu says otherwise.
pub const DEFAULT_FRAME_RATE: u32 = 60;

/// The frame rates the menu offers; anything else in the file falls back to the default.
pub fn valid_frame_rate(rate: Option<u32>) -> u32 {
    rate.filter(|rate| [60, 30].contains(rate))
        .unwrap_or(DEFAULT_FRAME_RATE)
}

/// Her window at 1× is 320 × 480 logical pixels.
const BASE_SIZE: (f64, f64) = (320.0, 480.0);
/// How small and how big she can be made (pinch or ⌘/Ctrl-scroll over her).
pub const MIN_SCALE: f64 = 0.5;
pub const MAX_SCALE: f64 = 2.0;

/// The window's size in logical pixels at `scale`.
pub fn logical_size(scale: f64) -> (f64, f64) {
    (BASE_SIZE.0 * scale, BASE_SIZE.1 * scale)
}

/// Her size from the settings: `scale` if it's usable, else the older `size` preset, else 1×.
pub fn valid_scale(scale: Option<f64>, size: Option<Size>) -> f64 {
    match scale {
        Some(scale) if scale.is_finite() => scale.clamp(MIN_SCALE, MAX_SCALE),
        _ => size.unwrap_or_default().factor(),
    }
}

/// The menu's size presets: Small 0.75×, Medium 1×, Large 1.4× of 320 × 480.
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

    pub fn factor(self) -> f64 {
        match self {
            Size::Small => 0.75,
            Size::Medium => 1.0,
            Size::Large => 1.4,
        }
    }

    /// The preset `scale` is, if it's one of them.
    pub fn matching(scale: f64) -> Option<Size> {
        Size::ALL
            .into_iter()
            .find(|size| (size.factor() - scale).abs() < 0.01)
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
    /// Her size as a factor of 320 × 480 (0.5–2); replaces `size` when present.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub scale: Option<f64>,
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
    /// Menu → Language: 'en', 'ja', 'zh-Hans' or 'zh-Hant'; missing follows the system.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub language: Option<String>,
    /// Break reminders every so many minutes of work (off unless set).
    #[serde(
        default,
        rename = "breakEvery",
        skip_serializing_if = "Option::is_none"
    )]
    pub break_every: Option<u32>,
    /// The last day she saw you and the run of days (see `Memory`).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub memory: Option<Memory>,
    /// Menu → Chattiness: 'quiet', 'calm' or 'chatty' (calm unless set).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub chattiness: Option<String>,
    /// The outfit parts shown on each model (by file name), e.g. `"lily.vrm": ["hat01"]`.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub outfits: BTreeMap<String, Vec<String>>,
    /// Which expressions are outfit parts, for models where the user sorted them in About this
    /// model (replacing YDCP's guess), e.g. `"lily.vrm": ["hat01", "glass"]`.
    #[serde(
        default,
        rename = "outfitParts",
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub outfit_parts: BTreeMap<String, Vec<String>>,
    /// Everything else in the file, kept untouched.
    #[serde(flatten)]
    pub other: Map<String, Value>,
}

impl Settings {
    /// The outfit parts last shown on `model`.
    pub fn outfit(&self, model: &str) -> Vec<String> {
        self.outfits.get(model).cloned().unwrap_or_default()
    }

    /// The user's own list of `model`'s outfit parts, if they sorted them.
    pub fn outfit_parts(&self, model: &str) -> Option<Vec<String>> {
        self.outfit_parts.get(model).cloned()
    }

    /// Remembers the user's list of `model`'s outfit parts; `None` lets YDCP decide again.
    pub fn set_outfit_parts(&mut self, model: &str, parts: Option<&[String]>) {
        match parts {
            Some(parts) => {
                self.outfit_parts.insert(model.to_string(), parts.to_vec());
            }
            None => {
                self.outfit_parts.remove(model);
            }
        }
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

        // The user's own sorting: an empty list (no parts) is kept, None forgets it.
        assert_eq!(load(&path).outfit_parts("lily.vrm"), None);
        update(&path, |settings| {
            settings.set_outfit_parts("lily.vrm", Some(&[]))
        })
        .unwrap();
        assert_eq!(load(&path).outfit_parts("lily.vrm"), Some(vec![]));
        update(&path, |settings| {
            settings.set_outfit_parts("lily.vrm", None)
        })
        .unwrap();
        assert!(!fs::read_to_string(&path).unwrap().contains("outfitParts"));
        let _ = fs::remove_file(path);
    }

    #[test]
    fn break_reminders_are_off_unless_a_menu_choice() {
        assert_eq!(valid_break_every(None), 0);
        assert_eq!(valid_break_every(Some(45)), 45);
        assert_eq!(valid_break_every(Some(7)), 0);
    }

    #[test]
    fn only_a_sensible_memory_is_saved() {
        let memory = |day: &str, streak| Memory {
            last_day: Some(day.to_string()),
            streak,
        };
        assert_eq!(
            valid_memory(memory("2026-11-13", 4)),
            Some(memory("2026-11-13", 4))
        );
        assert_eq!(valid_memory(memory("2026-11-13", 0)), None);
        assert_eq!(valid_memory(memory("2026-11-13", 4_000_000)), None);
        assert_eq!(valid_memory(memory("13/11/2026", 4)), None);
        assert_eq!(valid_memory(memory("2026-11-13T10:00", 4)), None);
        assert_eq!(valid_memory(Memory::default()), None);
    }

    #[test]
    fn memory_is_stored_under_its_own_names() {
        let text = r#"{"memory":{"lastDay":"2026-11-13","streak":4}}"#;
        let settings: Settings = serde_json::from_str(text).unwrap();
        assert_eq!(
            settings.memory,
            Some(Memory {
                last_day: Some("2026-11-13".into()),
                streak: 4
            })
        );
        assert!(
            serde_json::to_string(&settings)
                .unwrap()
                .contains(r#""lastDay":"2026-11-13""#)
        );
    }

    #[test]
    fn chattiness_falls_back_to_calm() {
        assert_eq!(valid_chattiness(Some("quiet")), "quiet");
        assert_eq!(valid_chattiness(Some("chatty")), "chatty");
        assert_eq!(valid_chattiness(Some("shouty")), "calm");
        assert_eq!(valid_chattiness(None), "calm");
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
        assert_eq!(logical_size(Size::Medium.factor()), (320.0, 480.0));
        assert_eq!(logical_size(Size::Small.factor()), (240.0, 360.0));
        assert_eq!(logical_size(Size::Large.factor()), (448.0, 672.0));
        assert_eq!(Size::matching(1.4), Some(Size::Large));
        assert_eq!(Size::matching(1.2), None);
    }

    #[test]
    fn scale_comes_from_the_settings_or_the_old_preset() {
        assert_eq!(valid_scale(Some(1.25), Some(Size::Small)), 1.25);
        assert_eq!(valid_scale(None, Some(Size::Large)), 1.4);
        assert_eq!(valid_scale(None, None), 1.0);
        assert_eq!(valid_scale(Some(9.0), None), MAX_SCALE);
        assert_eq!(valid_scale(Some(0.1), None), MIN_SCALE);
        assert_eq!(valid_scale(Some(f64::NAN), Some(Size::Small)), 0.75);
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
