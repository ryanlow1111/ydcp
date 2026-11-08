//! The menu bar (macOS) / notification-area (Windows) menu, built from what YDCP knows now:
//! the models in the models folder, the motions the front end reports, and the settings.
//! Picking an item either acts here (size, always on top, show/hide, add files, quit) or is
//! passed to the front end as a `menu` event (a moment, a vibe, a face, an outfit part, a
//! model, About).

use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::menu::{CheckMenuItem, IsMenuItem, Menu, MenuItem, PredefinedMenuItem, Submenu};
use tauri::{AppHandle, Manager, Runtime};

use crate::agent::AgentLink;
use crate::settings::{self, Size};

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
    /// The face she's holding: a new model may not have the old one.
    #[serde(default)]
    pub face: Option<String>,
    /// The model's outfit parts (a hat, glasses…), shown or hidden alongside any face.
    #[serde(default)]
    pub outfit: Vec<String>,
    /// The outfit parts she's wearing now.
    #[serde(default)]
    pub wearing: Vec<String>,
}

impl Catalogue {
    /// Shows or hides one outfit part (`None` takes them all off). Returns what she wears then,
    /// or `None` if the model has no such part.
    pub fn toggle_outfit(&mut self, part: Option<&str>) -> Option<Vec<String>> {
        match part {
            None => self.wearing.clear(),
            Some(part) if !self.outfit.iter().any(|name| name == part) => return None,
            Some(part) => {
                if self.wearing.iter().any(|name| name == part) {
                    self.wearing.retain(|name| name != part);
                } else {
                    self.wearing.push(part.to_string());
                }
            }
        }
        Some(self.wearing.clone())
    }
}

/// Everything the menu shows.
#[derive(Debug, Clone)]
pub struct MenuState {
    pub models: Vec<String>,
    pub model: Option<String>,
    pub catalogue: Catalogue,
    pub vibe: String,
    pub face: Option<String>,
    /// Her size as a factor of 320 × 480; the Size menu ticks a preset if it matches.
    pub scale: f64,
    pub on_top: bool,
    /// Whether YDCP starts when the user logs in (the system's own setting, read at launch).
    pub start_at_login: bool,
    /// Why "Start at login" can't be used from where YDCP is running, if it can't.
    pub login_blocked: Option<&'static str>,
    pub visible: bool,
    pub agent_link: AgentLink,
    /// 60 or 30 frames a second.
    pub frame_rate: u32,
    /// Break reminders every so many minutes (0: off).
    pub break_every: u32,
    /// Minutes left on the timer, if one is running (the front end keeps the time).
    pub timer_left: Option<u32>,
    /// Whether `~/.ydcp/state.json` exists (an agent hook has written it).
    pub agent_found: bool,
}

impl Default for MenuState {
    fn default() -> Self {
        MenuState {
            models: Vec::new(),
            model: None,
            catalogue: Catalogue::default(),
            // Calm by default: she stays on Idle unless the menu picks another vibe.
            vibe: "idle".into(),
            face: None,
            scale: 1.0,
            on_top: true,
            start_at_login: false,
            login_blocked: None,
            visible: true,
            agent_link: AgentLink::Off,
            frame_rate: settings::DEFAULT_FRAME_RATE,
            break_every: 0,
            timer_left: None,
            agent_found: false,
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
    Outfit(Option<String>),
    AddMotions,
    ReloadMotions,
    Size(String),
    OnTop,
    StartAtLogin,
    Agent(String),
    FrameRate(String),
    BreakEvery(String),
    Timer(String),
    CancelTimer,
    OpenFolder,
    About,
    AboutModel,
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
            "outfit" if rest == "none" => Pick::Outfit(None),
            "outfit" => Pick::Outfit(Some(rest.to_string())),
            "add-motions" => Pick::AddMotions,
            "reload-motions" => Pick::ReloadMotions,
            "size" => Pick::Size(rest.to_string()),
            "on-top" => Pick::OnTop,
            "start-at-login" => Pick::StartAtLogin,
            "agent" => Pick::Agent(rest.to_string()),
            "frame-rate" => Pick::FrameRate(rest.to_string()),
            "break-every" => Pick::BreakEvery(rest.to_string()),
            "timer" => Pick::Timer(rest.to_string()),
            "cancel-timer" => Pick::CancelTimer,
            "open-folder" => Pick::OpenFolder,
            "about" => Pick::About,
            "about-model" => Pick::AboutModel,
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
    model_items.push(Box::new(MenuItem::with_id(
        app,
        "about-model",
        "About this model…",
        state.model.is_some(),
        None::<&str>,
    )?));
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
    if state.catalogue.faces.is_empty() {
        face_items.push(Box::new(MenuItem::new(
            app,
            "This model has no expressions",
            false,
            None::<&str>,
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

    // Outfit ▸ — only for a model with parts to show or hide; any number at once.
    let mut outfit_items: Vec<Box<dyn IsMenuItem<R>>> = vec![
        Box::new(check(
            "outfit:none",
            "Model's default",
            state.catalogue.wearing.is_empty(),
        )?),
        Box::new(separator()?),
    ];
    for part in &state.catalogue.outfit {
        let worn = state.catalogue.wearing.contains(part);
        outfit_items.push(Box::new(check(
            &format!("outfit:{part}"),
            &capitalised(part),
            worn,
        )?));
    }
    let outfit = Submenu::with_items(app, "Outfit", true, &refs(&outfit_items))?;

    // Size ▸
    let mut size_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for size in Size::ALL {
        size_items.push(Box::new(check(
            &format!("size:{}", size.id()),
            size.label(),
            Size::matching(state.scale) == Some(size),
        )?));
    }
    size_items.push(Box::new(separator()?));
    size_items.push(Box::new(MenuItem::new(
        app,
        if cfg!(target_os = "macos") {
            "Any size: pinch or ⌘-scroll over her"
        } else {
            "Any size: Ctrl-scroll over her"
        },
        false,
        None::<&str>,
    )?));
    let sizes = Submenu::with_items(app, "Size", true, &refs(&size_items))?;

    // Frame rate ▸
    let rates = Submenu::with_items(
        app,
        "Frame rate",
        true,
        &[
            &check("frame-rate:60", "60 fps (smooth)", state.frame_rate == 60)?,
            &check(
                "frame-rate:30",
                "30 fps (saves power)",
                state.frame_rate == 30,
            )?,
        ],
    )?;

    // Reminders ▸ — a break reminder and a timer, both off unless picked.
    let mut break_items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(check(
        "break-every:0",
        "Off",
        state.break_every == 0,
    )?)];
    for minutes in settings::BREAK_CHOICES {
        break_items.push(Box::new(check(
            &format!("break-every:{minutes}"),
            &format!("Every {minutes} minutes"),
            state.break_every == minutes,
        )?));
    }
    let mut timer_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for minutes in settings::TIMER_CHOICES {
        timer_items.push(Box::new(item(
            &format!("timer:{minutes}"),
            &format!("{minutes} minutes"),
        )?));
    }
    let mut reminder_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if let Some(left) = state.timer_left {
        reminder_items.push(Box::new(MenuItem::new(
            app,
            format!("Timer: {left} min left"),
            false,
            None::<&str>,
        )?));
        reminder_items.push(Box::new(item("cancel-timer", "Cancel timer")?));
        reminder_items.push(Box::new(separator()?));
    }
    reminder_items.push(Box::new(Submenu::with_items(
        app,
        "Break reminder",
        true,
        &refs(&break_items),
    )?));
    reminder_items.push(Box::new(Submenu::with_items(
        app,
        if state.timer_left.is_some() {
            "New timer"
        } else {
            "Timer"
        },
        true,
        &refs(&timer_items),
    )?));
    let reminders = Submenu::with_items(app, "Reminders", true, &refs(&reminder_items))?;

    // React to agent ▸ (off by default; for people who use an AI agent or a script).
    let mut agent_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for mode in AgentLink::ALL {
        let id = format!("agent:{}", mode.id());
        agent_items.push(Box::new(check(
            &id,
            mode.label(),
            state.agent_link == mode,
        )?));
    }
    if state.agent_link != AgentLink::Off {
        agent_items.push(Box::new(separator()?));
        let status = if state.agent_found {
            "Agent found ✓"
        } else {
            "No agent found yet"
        };
        agent_items.push(Box::new(MenuItem::new(app, status, false, None::<&str>)?));
    }
    let agent = Submenu::with_items(app, "React to agent", true, &refs(&agent_items))?;

    let show = item(
        "show",
        if state.visible {
            "Hide YDCP"
        } else {
            "Show YDCP"
        },
    )?;
    let on_top = check("on-top", "Always on top", state.on_top)?;
    let login = match state.login_blocked {
        Some(why) => CheckMenuItem::with_id(
            app,
            "start-at-login",
            format!("Start at login ({why})"),
            false,
            false,
            None::<&str>,
        )?,
        None => check("start-at-login", "Start at login", state.start_at_login)?,
    };
    let folder = item("open-folder", "Open pet folder")?;
    let about = item("about", "About YDCP…")?;
    let quit = item("quit", "Quit YDCP")?;
    let separators = [separator()?, separator()?, separator()?];
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&show, &separators[0], &models, &motions];
    if !state.catalogue.outfit.is_empty() {
        items.push(&outfit);
    }
    items.extend([
        &reminders as &dyn IsMenuItem<R>,
        &sizes,
        &rates,
        &on_top,
        &login,
        &agent,
        &separators[1],
        &folder,
        &about,
        &separators[2],
        &quit,
    ]);
    Menu::with_items(app, &items)
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
        assert_eq!(Pick::parse("about-model"), Some(Pick::AboutModel));
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
        assert_eq!(Pick::parse("outfit:none"), Some(Pick::Outfit(None)));
        assert_eq!(
            Pick::parse("outfit:hat01"),
            Some(Pick::Outfit(Some("hat01".into())))
        );
        assert_eq!(Pick::parse("size:large"), Some(Pick::Size("large".into())));
        assert_eq!(Pick::parse("agent:auto"), Some(Pick::Agent("auto".into())));
        assert_eq!(
            Pick::parse("frame-rate:30"),
            Some(Pick::FrameRate("30".into()))
        );
        assert_eq!(Pick::parse("start-at-login"), Some(Pick::StartAtLogin));
        assert_eq!(
            Pick::parse("break-every:45"),
            Some(Pick::BreakEvery("45".into()))
        );
        assert_eq!(Pick::parse("timer:25"), Some(Pick::Timer("25".into())));
        assert_eq!(Pick::parse("cancel-timer"), Some(Pick::CancelTimer));
        assert_eq!(Pick::parse("nonsense"), None);
    }

    #[test]
    fn outfit_parts_toggle_on_and_off() {
        let mut catalogue = Catalogue {
            outfit: vec!["hat01".into(), "tie".into()],
            ..Catalogue::default()
        };
        assert_eq!(
            catalogue.toggle_outfit(Some("hat01")),
            Some(vec!["hat01".into()])
        );
        assert_eq!(
            catalogue.toggle_outfit(Some("tie")),
            Some(vec!["hat01".into(), "tie".into()])
        );
        assert_eq!(
            catalogue.toggle_outfit(Some("hat01")),
            Some(vec!["tie".into()])
        );
        assert_eq!(catalogue.toggle_outfit(Some("cape")), None);
        assert_eq!(catalogue.toggle_outfit(None), Some(vec![]));
    }

    #[test]
    fn labels() {
        assert_eq!(capitalised("idle"), "Idle");
        assert_eq!(model_label("My Model.vrm"), "My Model");
    }
}
