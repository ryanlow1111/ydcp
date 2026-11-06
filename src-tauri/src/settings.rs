//! `~/.ydcp/settings.json`: small things YDCP remembers between launches (for now, where she
//! stands). Unknown fields are kept as they are, so newer versions' settings survive.

use std::fs;
use std::path::Path;

use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};

/// Where her window's top-left corner was, in physical screen pixels.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub struct Position {
    pub x: i32,
    pub y: i32,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub position: Option<Position>,
    /// Everything else in the file, kept untouched.
    #[serde(flatten)]
    pub other: Map<String, Value>,
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
        fs::write(&path, r#"{ "agentLink": "off", "size": "large" }"#).unwrap();
        let mut settings = load(&path);
        settings.position = Some(Position { x: -1200, y: 300 });
        save(&path, &settings).unwrap();
        let again = load(&path);
        assert_eq!(again.position, Some(Position { x: -1200, y: 300 }));
        assert_eq!(again.other.get("agentLink"), Some(&Value::from("off")));
        assert_eq!(again.other.get("size"), Some(&Value::from("large")));
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
