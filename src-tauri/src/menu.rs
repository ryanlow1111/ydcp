//! The menu bar (macOS) / notification-area (Windows) menu, built from what YDCP knows now:
//! the models in the models folder, the motions the front end reports, and the settings.
//! Picking an item either acts here (size, always on top, show/hide, add files, quit) or is
//! passed to the front end as a `menu` event (a moment, a vibe, a face, a model, About).

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

use crate::settings::Size;

/// One motion or vibe in the menu.
#[derive(Debug, Clone, Default, Deserialize)]
pub struct Item {
    pub id: String,
    pub name: String,
}

/// The motions the front end can play, as it reports them.
#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Catalogue {
    #[serde(default)]
    pub built_in: Vec<Item>,
    #[serde(default)]
    pub library: Vec<Item>,
    #[serde(default)]
    pub vibes: Vec<Item>,
    #[serde(default)]
    pub faces: Vec<String>,
}

/// Everything the menu shows.
#[derive(Debug, Clone)]
pub struct MenuState {
    pub models: Vec<String>,
    pub model: Option<String>,
    pub catalogue: Catalogue,
    pub vibe: String,
    pub face: Option<String>,
    pub size: Size,
    pub on_top: bool,
    pub visible: bool,
}

impl Default for MenuState {
    fn default() -> Self {
        MenuState {
            models: Vec::new(),
            model: None,
            catalogue: Catalogue::default(),
            vibe: "auto".into(),
            face: None,
            size: Size::Medium,
            on_top: true,
            visible: true,
        }
    }
}

/// The menu's state, shared by the app.
#[derive(Default)]
pub struct SharedMenu(pub Mutex<MenuState>);

/// What a picked menu item means, from its id.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(tag = "kind", content = "id", rename_all = "camelCase")]
pub enum Pick {
    ShowHide,
    Model(String),
    AddModel,
    Moment(String),
    Vibe(String),
    Face(Option<String>),
    AddMotions,
    ReloadMotions,
    Size(String),
    OnTop,
    OpenFolder,
    About,
    Quit,
}

impl Pick {
    /// Reads a menu item id (as made by `build`).
    pub fn parse(id: &str) -> Option<Pick> {
        let (kind, rest) = id.split_once(':').unwrap_or((id, ""));
        Some(match kind {
            "show" => Pick::ShowHide,
            "model" => Pick::Model(rest.to_string()),
            "add-model" => Pick::AddModel,
            "moment" => Pick::Moment(rest.to_string()),
            "vibe" => Pick::Vibe(rest.to_string()),
            "face" if rest == "none" => Pick::Face(None),
            "face" => Pick::Face(Some(rest.to_string())),
            "add-motions" => Pick::AddMotions,
            "reload-motions" => Pick::ReloadMotions,
            "size" => Pick::Size(rest.to_string()),
            "on-top" => Pick::OnTop,
            "open-folder" => Pick::OpenFolder,
            "about" => Pick::About,
            "quit" => Pick::Quit,
            _ => return None,
        })
    }
}

/// "idle" → "Idle".
fn capitalised(text: &str) -> String {
    let mut chars = text.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().collect::<String>() + chars.as_str()
    })
}

/// "My Model.vrm" → "My Model".
fn model_label(file: &str) -> &str {
    file.strip_suffix(".vrm")
        .or_else(|| file.strip_suffix(".VRM"))
        .unwrap_or(file)
}

/// Builds the whole menu for `state`.
pub fn build<R: Runtime, M: Manager<R>>(app: &M, state: &MenuState) -> tauri::Result<Menu<R>> {
    let item = |id: &str, text: &str| MenuItem::with_id(app, id, text, true, None::<&str>);
    let check = |id: &str, text: &str, checked: bool| {
        CheckMenuItem::with_id(app, id, text, true, checked, None::<&str>)
    };
    let separator = || PredefinedMenuItem::separator(app);

    // Models ▸
    let mut model_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if state.models.is_empty() {
        model_items.push(Box::new(MenuItem::new(
            app,
            "No models yet",
            false,
            None::<&str>,
        )?));
    }
    for file in &state.models {
        let current = state.model.as_deref() == Some(file.as_str());
        model_items.push(Box::new(check(
            &format!("model:{file}"),
            model_label(file),
            current,
        )?));
    }
    model_items.push(Box::new(separator()?));
    model_items.push(Box::new(item("add-model", "Add model…")?));
    let models = Submenu::with_items(app, "Models", true, &refs(&model_items))?;

    // Motions ▸ — moments, then Vibes ▸ and Expressions ▸.
    let mut motion_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for moment in &state.catalogue.built_in {
        motion_items.push(Box::new(item(
            &format!("moment:{}", moment.id),
            &moment.name,
        )?));
    }
    if !state.catalogue.library.is_empty() {
        motion_items.push(Box::new(separator()?));
        for moment in &state.catalogue.library {
            motion_items.push(Box::new(item(
                &format!("moment:{}", moment.id),
                &moment.name,
            )?));
        }
    }
    motion_items.push(Box::new(separator()?));

    let mut vibe_items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(check(
        "vibe:auto",
        "Auto (drift)",
        state.vibe == "auto",
    )?)];
    for vibe in &state.catalogue.vibes {
        vibe_items.push(Box::new(check(
            &format!("vibe:{}", vibe.id),
            &vibe.name,
            state.vibe == vibe.id,
        )?));
    }
    motion_items.push(Box::new(Submenu::with_items(
        app,
        "Vibes",
        true,
        &refs(&vibe_items),
    )?));

    let mut face_items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(check(
        "face:none",
        "Her own",
        state.face.is_none(),
    )?)];
    for face in &state.catalogue.faces {
        let checked = state.face.as_deref() == Some(face.as_str());
        face_items.push(Box::new(check(
            &format!("face:{face}"),
            &capitalised(face),
            checked,
        )?));
    }
    motion_items.push(Box::new(Submenu::with_items(
        app,
        "Expressions",
        true,
        &refs(&face_items),
    )?));
    motion_items.push(Box::new(separator()?));
    motion_items.push(Box::new(item("add-motions", "Add motions…")?));
    motion_items.push(Box::new(item("reload-motions", "Reload motions")?));
    let motions = Submenu::with_items(app, "Motions", true, &refs(&motion_items))?;

    // Size ▸
    let mut size_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for size in Size::ALL {
        size_items.push(Box::new(check(
            &format!("size:{}", size.id()),
            size.label(),
            state.size == size,
        )?));
    }
    let sizes = Submenu::with_items(app, "Size", true, &refs(&size_items))?;

    let show = item(
        "show",
        if state.visible {
            "Hide YDCP"
        } else {
            "Show YDCP"
        },
    )?;
    let on_top = check("on-top", "Always on top", state.on_top)?;
    let folder = item("open-folder", "Open pet folder")?;
    let about = item("about", "About YDCP…")?;
    let quit = item("quit", "Quit YDCP")?;
    Menu::with_items(
        app,
        &[
            &show,
            &separator()?,
            &models,
            &motions,
            &sizes,
            &on_top,
            &separator()?,
            &folder,
            &about,
            &separator()?,
            &quit,
        ],
    )
}

fn refs<R: Runtime>(items: &[Box<dyn IsMenuItem<R>>]) -> Vec<&dyn IsMenuItem<R>> {
    items.iter().map(AsRef::as_ref).collect()
}

/// Rebuilds the tray icon's menu from the shared state.
pub fn refresh<R: Runtime>(app: &AppHandle<R>) {
    let shared = app.state::<SharedMenu>();
    let Ok(state) = shared.0.lock().map(|state| state.clone()) else {
        return;
    };
    match build(app, &state) {
        Ok(menu) => {
            if let Some(tray) = app.tray_by_id("ydcp") {
                let _ = tray.set_menu(Some(menu));
            }
        }
        Err(error) => eprintln!("YDCP: couldn't build the menu: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_menu_ids() {
        assert_eq!(Pick::parse("quit"), Some(Pick::Quit));
        assert_eq!(
            Pick::parse("model:My Model.vrm"),
            Some(Pick::Model("My Model.vrm".into()))
        );
        assert_eq!(
            Pick::parse("moment:lib:peace"),
            Some(Pick::Moment("lib:peace".into()))
        );
        assert_eq!(Pick::parse("face:none"), Some(Pick::Face(None)));
        assert_eq!(
            Pick::parse("face:angry"),
            Some(Pick::Face(Some("angry".into())))
        );
        assert_eq!(Pick::parse("size:large"), Some(Pick::Size("large".into())));
        assert_eq!(Pick::parse("nonsense"), None);
    }

    #[test]
    fn labels() {
        assert_eq!(capitalised("idle"), "Idle");
        assert_eq!(model_label("My Model.vrm"), "My Model");
    }
}
