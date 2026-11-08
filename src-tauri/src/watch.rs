//! Notices files added, changed or removed in the models and motions folders, and changes to
//! the user's `lines.json` (checked every 2 seconds, by name, size and change time), so the
//! menu and the front end stay current without a restart; and, only while the agent link is
//! on, an agent's `state.json` (checked twice a second). No OS file-watching API, no extra
//! permissions.

use std::path::Path;
use std::thread;
use std::time::{Duration, SystemTime};

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::agent::{self, AgentLink};
use crate::assets;
use crate::menu::{self, Pick, SharedMenu};

const TICK: Duration = Duration::from_millis(500);
/// Folders are checked every this many ticks (2 seconds).
const FOLDER_TICKS: u32 = 4;

/// Watches the agent's state file: reports each new state once, never one from before it
/// started watching (so an old "done" doesn't replay at launch or when switched on).
#[derive(Default)]
struct AgentWatch {
    mode: Option<AgentLink>,
    seen: Option<(u64, SystemTime)>,
    found: Option<bool>,
}

impl AgentWatch {
    fn tick<R: Runtime>(&mut self, app: &AppHandle<R>, path: &Path) {
        let mode = app
            .state::<SharedMenu>()
            .0
            .lock()
            .map(|state| state.agent_link)
            .unwrap_or_default();
        let signature = agent::signature(path);
        let found = signature.is_some();
        if self.found != Some(found) {
            self.found = Some(found);
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.agent_found = found;
            }
            menu::refresh(app);
        }
        if self.mode != Some(mode) {
            // Just switched (or just started): take what's there as already seen.
            self.mode = Some(mode);
            self.seen = signature;
            return;
        }
        if !mode.watches(found) || signature == self.seen {
            return;
        }
        self.seen = signature;
        if let Some(state) = agent::read(path) {
            let _ = app.emit_to("main", "agent", state);
        }
    }
}

/// Starts watching on a background thread.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || {
        let models_dir = assets::models_dir(&app).ok();
        let anims_dir = assets::anims_dir(&app).ok();
        let state_file = assets::data_dir(&app)
            .ok()
            .map(|dir| dir.join("state.json"));
        let lines_file = assets::data_dir(&app)
            .ok()
            .map(|dir| dir.join("lines.json"));
        let mut lines_seen = lines_file.as_deref().and_then(agent::signature);
        let mut models_seen = models_dir.as_deref().map(assets::folder_signature);
        let mut anims_seen = anims_dir.as_deref().map(assets::folder_signature);
        let mut agent_watch = AgentWatch::default();
        let mut ticks: u32 = 0;
        loop {
            thread::sleep(TICK);
            ticks = ticks.wrapping_add(1);
            if let Some(path) = state_file.as_ref() {
                agent_watch.tick(&app, path);
            }
            if !ticks.is_multiple_of(FOLDER_TICKS) {
                continue;
            }
            if let Some(dir) = models_dir.as_deref() {
                let now = Some(assets::folder_signature(dir));
                if now != models_seen {
                    let current_changed =
                        current_model_changed(&app, models_seen.as_deref(), now.as_deref());
                    models_seen = now;
                    models_changed(&app, current_changed);
                    // A model's profile may have new lines for her.
                    let _ = app.emit_to("main", "lines", ());
                }
            }
            if let Some(path) = lines_file.as_deref() {
                let now = agent::signature(path);
                if now != lines_seen {
                    lines_seen = now;
                    let _ = app.emit_to("main", "lines", ());
                }
            }
            if let Some(dir) = anims_dir.as_deref() {
                let now = Some(assets::folder_signature(dir));
                if now != anims_seen {
                    anims_seen = now;
                    let _ = app.emit_to("main", "library", ());
                }
            }
        }
    });
}

/// Whether the current model's file itself was replaced (same name, new content).
fn current_model_changed<R: Runtime>(
    app: &AppHandle<R>,
    before: Option<&[(String, u64, u128)]>,
    after: Option<&[(String, u64, u128)]>,
) -> bool {
    let Ok(state) = app
        .state::<SharedMenu>()
        .0
        .lock()
        .map(|state| state.model.clone())
    else {
        return false;
    };
    let Some(model) = state else {
        return false;
    };
    let find = |list: Option<&[(String, u64, u128)]>| {
        list.and_then(|items| items.iter().find(|item| item.0 == model).cloned())
    };
    match (find(before), find(after)) {
        (Some(old), Some(new)) => old != new,
        _ => false,
    }
}

/// Updates the model list; if the current model is gone (or there was none), picks another.
pub fn models_changed<R: Runtime>(app: &AppHandle<R>, reload_current: bool) {
    let models = assets::models_dir(app)
        .map(|dir| assets::plain_files(&dir, ".vrm"))
        .unwrap_or_default();
    let shared = app.state::<SharedMenu>();
    let switch_to = {
        let Ok(mut state) = shared.0.lock() else {
            return;
        };
        state.models = models;
        let keeps_current = state
            .model
            .as_ref()
            .is_some_and(|model| state.models.contains(model));
        if keeps_current {
            reload_current.then(|| state.model.clone()).flatten()
        } else {
            state.model = state.models.first().cloned();
            Some(state.model.clone().unwrap_or_default())
        }
    };
    menu::refresh(app);
    if let Some(model) = switch_to {
        crate::choose_model(app, &model);
        let _ = app.emit_to("main", "pick", Pick::Model(model));
    }
}
