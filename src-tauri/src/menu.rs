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
use crate::i18n;
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
    /// Whether "Start at login" can't be used from where YDCP is running (macOS, not installed).
    pub login_blocked: bool,
    /// The language in use ('en', 'ja', 'zh-Hans', 'zh-Hant').
    pub language: &'static str,
    /// Menu → Language's choice; `None` follows the system.
    pub language_choice: Option<String>,
    pub visible: bool,
    pub agent_link: AgentLink,
    /// 60 or 30 frames a second.
    pub frame_rate: u32,
    /// Break reminders every so many minutes (0: off).
    pub break_every: u32,
    /// Minutes left on the timer, if one is running (the front end keeps the time).
    pub timer_left: Option<u32>,
    /// How often she speaks up on her own: 'quiet', 'calm' or 'chatty'.
    pub chattiness: &'static str,
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
            login_blocked: false,
            language: "en",
            language_choice: None,
            visible: true,
            agent_link: AgentLink::Off,
            frame_rate: settings::DEFAULT_FRAME_RATE,
            break_every: 0,
            timer_left: None,
            chattiness: settings::DEFAULT_CHATTINESS,
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
    Chattiness(String),
    Language(String),
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
            "chattiness" => Pick::Chattiness(rest.to_string()),
            "language" => Pick::Language(rest.to_string()),
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
    let tr = |key: &str| i18n::t(state.language, key);
    let disabled = |text: &str| MenuItem::new(app, text, false, None::<&str>);

    // Models ▸
    let mut model_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if state.models.is_empty() {
        model_items.push(Box::new(disabled(&tr("menu.noModels"))?));
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
    model_items.push(Box::new(item("add-model", &tr("menu.addModel"))?));
    model_items.push(Box::new(MenuItem::with_id(
        app,
        "about-model",
        tr("menu.aboutModel"),
        state.model.is_some(),
        None::<&str>,
    )?));
    let models = Submenu::with_items(app, tr("menu.models"), true, &refs(&model_items))?;

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
        &tr("menu.vibeAuto"),
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
        tr("menu.vibes"),
        true,
        &refs(&vibe_items),
    )?));

    let mut face_items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(check(
        "face:none",
        &tr("menu.faceOwn"),
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
        face_items.push(Box::new(disabled(&tr("menu.noExpressions"))?));
    }
    motion_items.push(Box::new(Submenu::with_items(
        app,
        tr("menu.expressions"),
        true,
        &refs(&face_items),
    )?));
    motion_items.push(Box::new(separator()?));
    motion_items.push(Box::new(item("add-motions", &tr("menu.addMotions"))?));
    motion_items.push(Box::new(item("reload-motions", &tr("menu.reloadMotions"))?));
    let motions = Submenu::with_items(app, tr("menu.motions"), true, &refs(&motion_items))?;

    // Outfit ▸ — only for a model with parts to show or hide; any number at once.
    let mut outfit_items: Vec<Box<dyn IsMenuItem<R>>> = vec![
        Box::new(check(
            "outfit:none",
            &tr("menu.outfitDefault"),
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
    let outfit = Submenu::with_items(app, tr("menu.outfit"), true, &refs(&outfit_items))?;

    // Size ▸
    let mut size_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for size in Size::ALL {
        size_items.push(Box::new(check(
            &format!("size:{}", size.id()),
            &tr(&format!("menu.size.{}", size.id())),
            Size::matching(state.scale) == Some(size),
        )?));
    }
    size_items.push(Box::new(separator()?));
    size_items.push(Box::new(disabled(&tr(if cfg!(target_os = "macos") {
        "menu.anySizeMac"
    } else {
        "menu.anySizeWindows"
    }))?));
    let sizes = Submenu::with_items(app, tr("menu.size"), true, &refs(&size_items))?;

    // Frame rate ▸
    let rates = Submenu::with_items(
        app,
        tr("menu.frameRate"),
        true,
        &[
            &check("frame-rate:60", &tr("menu.fps60"), state.frame_rate == 60)?,
            &check("frame-rate:30", &tr("menu.fps30"), state.frame_rate == 30)?,
        ],
    )?;

    // Reminders ▸ — a break reminder and a timer, both off unless picked.
    let mut break_items: Vec<Box<dyn IsMenuItem<R>>> = vec![Box::new(check(
        "break-every:0",
        &tr("menu.off"),
        state.break_every == 0,
    )?)];
    for minutes in settings::BREAK_CHOICES {
        break_items.push(Box::new(check(
            &format!("break-every:{minutes}"),
            &i18n::tf(
                state.language,
                "menu.everyMinutes",
                &[("n", &minutes.to_string())],
            ),
            state.break_every == minutes,
        )?));
    }
    let mut timer_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for minutes in settings::TIMER_CHOICES {
        timer_items.push(Box::new(item(
            &format!("timer:{minutes}"),
            &i18n::tf(
                state.language,
                "menu.minutes",
                &[("n", &minutes.to_string())],
            ),
        )?));
    }
    let mut reminder_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    if let Some(left) = state.timer_left {
        reminder_items.push(Box::new(disabled(&i18n::tf(
            state.language,
            "menu.timerLeft",
            &[("n", &left.to_string())],
        ))?));
        reminder_items.push(Box::new(item("cancel-timer", &tr("menu.cancelTimer"))?));
        reminder_items.push(Box::new(separator()?));
    }
    reminder_items.push(Box::new(Submenu::with_items(
        app,
        tr("menu.breakReminder"),
        true,
        &refs(&break_items),
    )?));
    reminder_items.push(Box::new(Submenu::with_items(
        app,
        tr(if state.timer_left.is_some() {
            "menu.newTimer"
        } else {
            "menu.timer"
        }),
        true,
        &refs(&timer_items),
    )?));
    let reminders = Submenu::with_items(app, tr("menu.reminders"), true, &refs(&reminder_items))?;

    // Chattiness ▸ — how often she speaks up on her own.
    let mut chattiness_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for choice in settings::CHATTINESS {
        chattiness_items.push(Box::new(check(
            &format!("chattiness:{choice}"),
            &tr(&format!("menu.chattiness.{choice}")),
            state.chattiness == choice,
        )?));
    }
    let chattiness =
        Submenu::with_items(app, tr("menu.chattiness"), true, &refs(&chattiness_items))?;

    // React to agent ▸ (off by default; for people who use an AI agent or a script).
    let mut agent_items: Vec<Box<dyn IsMenuItem<R>>> = Vec::new();
    for mode in AgentLink::ALL {
        let id = format!("agent:{}", mode.id());
        agent_items.push(Box::new(check(
            &id,
            &tr(&format!("menu.agent.{}", mode.id())),
            state.agent_link == mode,
        )?));
    }
    if state.agent_link != AgentLink::Off {
        agent_items.push(Box::new(separator()?));
        agent_items.push(Box::new(disabled(&tr(if state.agent_found {
            "menu.agentFound"
        } else {
            "menu.agentMissing"
        }))?));
    }
    let agent = Submenu::with_items(app, tr("menu.agent"), true, &refs(&agent_items))?;

    // Language ▸ — each language by its own name, so anyone can find theirs.
    let mut language_items: Vec<Box<dyn IsMenuItem<R>>> = vec![
        Box::new(check(
            "language:auto",
            &tr("menu.languageAuto"),
            state.language_choice.is_none(),
        )?),
        Box::new(separator()?),
    ];
    for (code, name) in i18n::LANGUAGES {
        language_items.push(Box::new(check(
            &format!("language:{code}"),
            name,
            state.language_choice.as_deref() == Some(code),
        )?));
    }
    let language = Submenu::with_items(app, tr("menu.language"), true, &refs(&language_items))?;

    let show = item(
        "show",
        &tr(if state.visible {
            "menu.hide"
        } else {
            "menu.show"
        }),
    )?;
    let on_top = check("on-top", &tr("menu.onTop"), state.on_top)?;
    let login = if state.login_blocked {
        CheckMenuItem::with_id(
            app,
            "start-at-login",
            tr("menu.startAtLoginBlocked"),
            false,
            false,
            None::<&str>,
        )?
    } else {
        check(
            "start-at-login",
            &tr("menu.startAtLogin"),
            state.start_at_login,
        )?
    };
    let folder = item("open-folder", &tr("menu.openFolder"))?;
    let about = item("about", &tr("menu.about"))?;
    let quit = item("quit", &tr("menu.quit"))?;
    let separators = [separator()?, separator()?, separator()?];
    let mut items: Vec<&dyn IsMenuItem<R>> = vec![&show, &separators[0], &models, &motions];
    if !state.catalogue.outfit.is_empty() {
        items.push(&outfit);
    }
    items.extend([
        &reminders as &dyn IsMenuItem<R>,
        &chattiness,
        &sizes,
        &rates,
        &on_top,
        &login,
        &agent,
        &language,
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
        assert_eq!(
            Pick::parse("chattiness:quiet"),
            Some(Pick::Chattiness("quiet".into()))
        );
        assert_eq!(
            Pick::parse("language:zh-Hant"),
            Some(Pick::Language("zh-Hant".into()))
        );
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
