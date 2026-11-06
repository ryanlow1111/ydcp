//! The optional agent link: an AI agent's hook (or any script) writes `~/.ydcp/state.json`,
//! e.g. `{"mood":"done"}`, and she reacts. Off by default; while it's off the file is never
//! read. See docs/agent-link.md.

use std::fs;
use std::path::Path;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

/// Ignored when it hasn't changed for this long, so a crashed tool can't leave her stuck.
pub const STALE_AFTER: Duration = Duration::from_secs(30 * 60);
/// The state file is tiny; anything bigger is refused.
pub const MAX_STATE_BYTES: u64 = 64 * 1024;

/// What the agent link does: never read the file, always watch it, or watch it while it exists.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum AgentLink {
    #[default]
    Off,
    On,
    Auto,
}

impl AgentLink {
    pub const ALL: [AgentLink; 3] = [AgentLink::Off, AgentLink::On, AgentLink::Auto];

    pub fn id(self) -> &'static str {
        match self {
            AgentLink::Off => "off",
            AgentLink::On => "on",
            AgentLink::Auto => "auto",
        }
    }

    pub fn label(self) -> &'static str {
        match self {
            AgentLink::Off => "Off",
            AgentLink::On => "On",
            AgentLink::Auto => "Auto (while an agent is set up)",
        }
    }

    /// Whether the file should be read, given whether it exists.
    pub fn watches(self, file_exists: bool) -> bool {
        match self {
            AgentLink::Off => false,
            AgentLink::On => true,
            AgentLink::Auto => file_exists,
        }
    }
}

/// What the agent says, as passed on to the front end.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct AgentState {
    pub mood: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub line: Option<String>,
}

#[derive(Deserialize)]
struct StateFile {
    mood: String,
    #[serde(default)]
    line: Option<String>,
    #[serde(default)]
    at: Option<f64>,
}

const MOODS: [&str; 5] = ["idle", "working", "done", "failed", "sleepy"];

fn millis(time: SystemTime) -> f64 {
    time.duration_since(UNIX_EPOCH)
        .map_or(0.0, |since| since.as_millis() as f64)
}

/// Reads the state file's text. `changed` is when the file last changed; `now` is now.
/// Unknown moods, broken JSON and stale states give `None`.
pub fn parse(text: &str, changed: SystemTime, now: SystemTime) -> Option<AgentState> {
    let file: StateFile = serde_json::from_str(text).ok()?;
    if !MOODS.contains(&file.mood.as_str()) {
        return None;
    }
    let written = file
        .at
        .filter(|at| at.is_finite() && *at > 0.0)
        .unwrap_or(millis(changed));
    if millis(now) - written > STALE_AFTER.as_millis() as f64 {
        return None;
    }
    let line = file
        .line
        .map(|line| line.trim().chars().take(140).collect::<String>())
        .filter(|line| !line.is_empty());
    Some(AgentState {
        mood: file.mood,
        line,
    })
}

/// The state file's size and change time, to notice when it's rewritten.
pub fn signature(path: &Path) -> Option<(u64, SystemTime)> {
    let meta = fs::metadata(path).ok()?;
    Some((meta.len(), meta.modified().ok()?))
}

/// Reads and parses the state file, if it's a sensible size.
pub fn read(path: &Path) -> Option<AgentState> {
    let meta = fs::metadata(path).ok()?;
    if !meta.is_file() || meta.len() > MAX_STATE_BYTES {
        return None;
    }
    let text = fs::read_to_string(path).ok()?;
    parse(&text, meta.modified().ok()?, SystemTime::now())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(seconds_ago: u64) -> SystemTime {
        SystemTime::now() - Duration::from_secs(seconds_ago)
    }

    #[test]
    fn reads_a_mood_and_an_optional_line() {
        let now = SystemTime::now();
        assert_eq!(
            parse(r#"{"mood":"done"}"#, now, now),
            Some(AgentState {
                mood: "done".into(),
                line: None
            })
        );
        assert_eq!(
            parse(
                r#"{"mood":"done","line":"  Build finished!  ","extra":1}"#,
                now,
                now
            ),
            Some(AgentState {
                mood: "done".into(),
                line: Some("Build finished!".into())
            })
        );
    }

    #[test]
    fn ignores_broken_unknown_and_stale_states() {
        let now = SystemTime::now();
        assert_eq!(parse("{ nope", now, now), None);
        assert_eq!(parse(r#"{"mood":"dancing"}"#, now, now), None);
        assert_eq!(parse(r#"{"mood":"done"}"#, at(31 * 60), now), None);
        // `at` (milliseconds) wins over the file's change time when given.
        let old_at = millis(at(2 * 60 * 60));
        assert_eq!(
            parse(&format!(r#"{{"mood":"done","at":{old_at}}}"#), now, now),
            None
        );
        let fresh_at = millis(at(5));
        assert!(
            parse(
                &format!(r#"{{"mood":"done","at":{fresh_at}}}"#),
                at(3 * 60 * 60),
                now
            )
            .is_some()
        );
    }

    #[test]
    fn long_lines_are_cut() {
        let now = SystemTime::now();
        let long = "x".repeat(500);
        let state = parse(&format!(r#"{{"mood":"done","line":"{long}"}}"#), now, now).unwrap();
        assert_eq!(state.line.unwrap().len(), 140);
    }

    #[test]
    fn modes() {
        assert!(!AgentLink::Off.watches(true));
        assert!(AgentLink::On.watches(false));
        assert!(AgentLink::Auto.watches(true));
        assert!(!AgentLink::Auto.watches(false));
        assert_eq!(AgentLink::default(), AgentLink::Off);
    }
}
