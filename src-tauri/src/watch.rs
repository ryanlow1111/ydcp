//! Notices files added, changed or removed in the models and motions folders (checked every
//! 2 seconds, by name, size and change time), so the menu and the front end stay current
//! without a restart. No OS file-watching API, no extra permissions.

use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager, Runtime};

use crate::assets;
use crate::menu::{self, Pick, SharedMenu};

const EVERY: Duration = Duration::from_secs(2);

/// Starts watching on a background thread.
pub fn start<R: Runtime>(app: AppHandle<R>) {
    thread::spawn(move || {
        let models_dir = assets::models_dir(&app).ok();
        let anims_dir = assets::anims_dir(&app).ok();
        let mut models_seen = models_dir.as_deref().map(assets::folder_signature);
        let mut anims_seen = anims_dir.as_deref().map(assets::folder_signature);
        loop {
            thread::sleep(EVERY);
            if let Some(dir) = models_dir.as_deref() {
                let now = Some(assets::folder_signature(dir));
                if now != models_seen {
                    let current_changed =
                        current_model_changed(&app, models_seen.as_deref(), now.as_deref());
                    models_seen = now;
                    models_changed(&app, current_changed);
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
