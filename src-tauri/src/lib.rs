//! YDCP — Your Desktop Companion Project.
//!
//! One transparent, frameless, always-on-top window shows the companion (drawn by the front
//! end with three.js). There's no Dock or taskbar icon; a menu bar / notification-area icon
//! holds the menu (`menu`). Clicks pass through everywhere except on her (`set_click_through`,
//! driven by the front end from the cursor feed in `cursor`), she can be dragged, and she
//! comes back where she was left (`settings`). Models and motions are read only from
//! `~/.ydcp/` (`assets`), and changes there are noticed (`watch`).

mod agent;
mod assets;
mod cursor;
mod i18n;
mod menu;
mod settings;
mod watch;

use std::path::{Path, PathBuf};
use std::process::Command;

use tauri::tray::TrayIconBuilder;
use tauri::{
    App, AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewWindow,
    WindowEvent,
};
use tauri_plugin_autostart::{MacosLauncher, ManagerExt};
use tauri_plugin_dialog::DialogExt;

use menu::{Catalogue, MenuState, Pick, SharedMenu};
use settings::{Area, Position, Size};

/// Space between her window and the screen's edges, in logical pixels.
const EDGE_MARGIN: f64 = 24.0;

fn settings_path<R: Runtime>(app: &AppHandle<R>) -> Option<PathBuf> {
    assets::data_dir(app)
        .ok()
        .map(|dir| dir.join("settings.json"))
}

/// Changes and saves one setting.
fn save_setting<R: Runtime>(app: &AppHandle<R>, change: impl FnOnce(&mut settings::Settings)) {
    if let Some(path) = settings_path(app)
        && let Err(error) = settings::update(&path, change)
    {
        eprintln!("YDCP: couldn't save settings: {error}");
    }
}

/// The usable area of every screen, in physical pixels.
fn screen_areas<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<Vec<Area>> {
    Ok(window
        .available_monitors()?
        .iter()
        .map(|monitor| {
            let area = monitor.work_area();
            Area {
                x: area.position.x,
                y: area.position.y,
                width: area.size.width,
                height: area.size.height,
            }
        })
        .collect())
}

/// Places the window where she was left, if that spot is still on a screen; otherwise at the
/// bottom-right of the primary screen's usable area (above the Dock or taskbar).
fn place_window<R: Runtime>(
    window: &WebviewWindow<R>,
    saved: Option<Position>,
) -> tauri::Result<()> {
    let size = window.outer_size()?;
    if let Some(position) = saved
        && settings::fits_on_a_screen(position, (size.width, size.height), &screen_areas(window)?)
    {
        return window.set_position(PhysicalPosition::new(position.x, position.y));
    }
    let Some(monitor) = window.primary_monitor()? else {
        return Ok(());
    };
    let area = monitor.work_area();
    let margin = (EDGE_MARGIN * monitor.scale_factor()).round() as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    window.set_position(PhysicalPosition::new(
        x.max(area.position.x),
        y.max(area.position.y),
    ))
}

/// Resizes her window, keeping her feet where they were (bottom-centre stays put).
fn apply_scale<R: Runtime>(window: &WebviewWindow<R>, scale: f64) -> tauri::Result<f64> {
    // Never taller than the screen she's on.
    let fits = window
        .current_monitor()?
        .map(|monitor| {
            f64::from(monitor.work_area().size.height) / monitor.scale_factor() * 0.95
                / settings::logical_size(1.0).1
        })
        .unwrap_or(settings::MAX_SCALE);
    let scale = scale
        .min(fits)
        .clamp(settings::MIN_SCALE, settings::MAX_SCALE);
    let before = window.outer_size()?;
    let position = window.outer_position()?;
    let (width, height) = settings::logical_size(scale);
    window.set_size(LogicalSize::new(width, height))?;
    let after = window.outer_size()?;
    let x = position.x + (before.width as i32 - after.width as i32) / 2;
    let y = position.y + before.height as i32 - after.height as i32;
    window.set_position(PhysicalPosition::new(x, y))?;
    Ok(scale)
}

/// Resizes her to `scale` (kept within limits), remembers it, and returns the size she got.
fn set_scale<R: Runtime>(app: &AppHandle<R>, scale: f64) -> f64 {
    let Some(window) = app.get_webview_window("main") else {
        return scale;
    };
    let scale = match apply_scale(&window, scale) {
        Ok(scale) => scale,
        Err(error) => {
            eprintln!("YDCP: couldn't resize: {error}");
            return scale;
        }
    };
    let preset_changed = app
        .state::<SharedMenu>()
        .0
        .lock()
        .map(|mut state| {
            let before = Size::matching(state.scale);
            state.scale = scale;
            before != Size::matching(scale)
        })
        .unwrap_or(false);
    save_setting(app, |settings| {
        settings.scale = Some(scale);
        settings.size = None;
    });
    if preset_changed {
        menu::refresh(app);
    }
    scale
}

/// Remembers `model` as the chosen one (menu tick + settings).
pub(crate) fn choose_model<R: Runtime>(app: &AppHandle<R>, model: &str) {
    if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
        state.model = (!model.is_empty()).then(|| model.to_string());
    }
    let chosen = (!model.is_empty()).then(|| model.to_string());
    save_setting(app, |settings| settings.model = chosen);
    menu::refresh(app);
}

/// Opens YDCP's data folder in Finder / File Explorer.
fn open_folder<R: Runtime>(app: &AppHandle<R>) {
    let Ok(dir) = assets::data_dir(app) else {
        return;
    };
    let opener = if cfg!(target_os = "windows") {
        "explorer"
    } else {
        "open"
    };
    if let Err(error) = Command::new(opener).arg(&dir).spawn() {
        eprintln!("YDCP: couldn't open {}: {error}", dir.display());
    }
}

/// "Add model…": pick a .vrm, copy it into the models folder, and switch to it.
/// The language in use, for words that come from Rust (dialogs, problems).
fn language<R: Runtime>(app: &AppHandle<R>) -> &'static str {
    app.state::<SharedMenu>()
        .0
        .lock()
        .map_or("en", |state| state.language)
}

fn add_model_dialog<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    let words = language(&app);
    app.dialog()
        .file()
        .set_title(i18n::t(words, "dialog.addModel"))
        .add_filter(i18n::t(words, "dialog.vrmFilter"), &["vrm"])
        .pick_file(move |picked| {
            let Some(path) = picked.and_then(|file| file.into_path().ok()) else {
                return;
            };
            let copied = assets::models_dir(&app)
                .and_then(|dir| assets::copy_in(&path, &dir, ".vrm", assets::MAX_MODEL_BYTES));
            match copied {
                Ok(name) => {
                    watch::models_changed(&app, false);
                    choose_model(&app, &name);
                    let _ = app.emit_to("main", "pick", Pick::Model(name));
                }
                Err(error) => {
                    let _ = app.emit_to("main", "problem", error);
                }
            }
        });
}

/// A `.vrm` opened from Finder / File Explorer (double-click or Open With): it's brought into
/// the models folder (unless it's there already) and she switches to it.
fn open_model_files<R: Runtime>(app: &AppHandle<R>, paths: impl IntoIterator<Item = PathBuf>) {
    let Some(path) = paths.into_iter().find(|path| is_vrm(path)) else {
        return;
    };
    let brought = assets::models_dir(app)
        .and_then(|dir| assets::bring_in(&path, &dir, ".vrm", assets::MAX_MODEL_BYTES));
    match brought {
        Ok(name) => {
            watch::models_changed(app, false);
            choose_model(app, &name);
            let _ = app.emit_to("main", "pick", Pick::Model(name));
        }
        Err(error) => {
            let _ = app.emit_to("main", "problem", error);
        }
    }
}

fn is_vrm(path: &Path) -> bool {
    path.extension()
        .is_some_and(|extension| extension.eq_ignore_ascii_case("vrm"))
}

/// "Add motions…": pick .vrma files and copy them into the motions folder.
fn add_motions_dialog<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    app.dialog()
        .file()
        .set_title(i18n::t(language(&app), "dialog.addMotions"))
        .add_filter(i18n::t(language(&app), "dialog.vrmaFilter"), &["vrma"])
        .pick_files(move |picked| {
            let Some(files) = picked else {
                return;
            };
            let Ok(dir) = assets::anims_dir(&app) else {
                return;
            };
            for file in files {
                if let Ok(path) = file.into_path()
                    && let Err(error) =
                        assets::copy_in(&path, &dir, ".vrma", assets::MAX_MOTION_BYTES)
                {
                    let _ = app.emit_to("main", "problem", error);
                }
            }
            let _ = app.emit_to("main", "library", ());
        });
}

/// What happens when a menu item is picked.
fn on_pick<R: Runtime>(app: &AppHandle<R>, pick: Pick) {
    let window = app.get_webview_window("main");
    match pick {
        Pick::ShowHide => {
            if let Some(window) = window {
                let visible = window.is_visible().unwrap_or(true);
                let _ = if visible {
                    window.hide()
                } else {
                    window.show()
                };
                app.state::<cursor::Geometry>().refresh(&window);
                if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                    state.visible = !visible;
                }
                menu::refresh(app);
            }
        }
        Pick::Model(ref model) => {
            choose_model(app, model);
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::AddModel => add_model_dialog(app),
        Pick::AddMotions => add_motions_dialog(app),
        Pick::ReloadMotions => {
            let _ = app.emit_to("main", "library", ());
        }
        Pick::Vibe(ref vibe) => {
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.vibe = vibe.clone();
            }
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::Face(ref face) => {
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.face = face.clone();
            }
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::Outfit(ref part) => {
            let changed = app
                .state::<SharedMenu>()
                .0
                .lock()
                .ok()
                .and_then(|mut state| {
                    let wearing = state.catalogue.toggle_outfit(part.as_deref())?;
                    Some((state.model.clone()?, wearing))
                });
            let Some((model, wearing)) = changed else {
                return;
            };
            save_setting(app, |settings| settings.set_outfit(&model, &wearing));
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::Moment(_) | Pick::About | Pick::AboutModel => {
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::Size(ref id) => {
            if let Some(size) = Size::ALL.into_iter().find(|size| size.id() == id) {
                set_scale(app, size.factor());
                menu::refresh(app);
            }
        }
        Pick::OnTop => {
            let on_top = app
                .state::<SharedMenu>()
                .0
                .lock()
                .map(|mut state| {
                    state.on_top = !state.on_top;
                    state.on_top
                })
                .unwrap_or(true);
            if let Some(window) = window {
                let _ = window.set_always_on_top(on_top);
            }
            save_setting(app, |settings| settings.always_on_top = Some(on_top));
            menu::refresh(app);
        }
        Pick::BreakEvery(ref id) => {
            let minutes = settings::valid_break_every(id.parse().ok());
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.break_every = minutes;
            }
            save_setting(app, |settings| {
                settings.break_every = (minutes > 0).then_some(minutes);
            });
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", Pick::BreakEvery(minutes.to_string()));
        }
        Pick::Language(ref id) => {
            let choice = (id != "auto").then(|| id.clone());
            let now = i18n::resolve(choice.as_deref());
            let kept = choice.filter(|choice| choice == now);
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.language = now;
                state.language_choice = kept.clone();
            }
            save_setting(app, |settings| settings.language = kept);
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", Pick::Language(now.to_string()));
        }
        Pick::Timer(_) | Pick::CancelTimer => {
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::StartAtLogin => {
            let launcher = app.autolaunch();
            let want = !launcher.is_enabled().unwrap_or(false);
            let result = if want {
                launcher.enable()
            } else {
                launcher.disable()
            };
            if let Err(error) = result {
                let text = i18n::tf(
                    language(app),
                    "problem.startAtLogin",
                    &[("error", &error.to_string())],
                );
                let _ = app.emit_to("main", "problem", text);
            }
            let now = launcher.is_enabled().unwrap_or(false);
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.start_at_login = now;
            }
            menu::refresh(app);
        }
        Pick::Agent(ref id) => {
            let Some(mode) = agent::AgentLink::ALL
                .into_iter()
                .find(|mode| mode.id() == id)
            else {
                return;
            };
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.agent_link = mode;
            }
            save_setting(app, |settings| settings.agent_link = Some(mode));
            menu::refresh(app);
        }
        Pick::FrameRate(ref id) => {
            let rate = settings::valid_frame_rate(id.parse().ok());
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.frame_rate = rate;
            }
            save_setting(app, |settings| settings.frame_rate = Some(rate));
            menu::refresh(app);
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::OpenFolder => open_folder(app),
        Pick::Quit => app.exit(0),
    }
}

/// Whether YDCP can't start at login from where it's running: macOS runs an app opened
/// straight from Downloads (or from the disk image) from a temporary copy, and a login item
/// pointing there would break. The menu then says to move YDCP to Applications first.
fn login_blocked() -> bool {
    std::env::current_exe().is_ok_and(|exe| login_blocked_for(&exe.to_string_lossy()))
}

fn login_blocked_for(path: &str) -> bool {
    cfg!(target_os = "macos")
        && (path.contains("/AppTranslocation/") || path.starts_with("/Volumes/"))
}

/// Reads whether YDCP starts at login. If it does, the login item is written again, so it
/// follows the app if the user moved it.
fn start_at_login<R: Runtime>(app: &AppHandle<R>, blocked: bool) -> bool {
    let launcher = app.autolaunch();
    let enabled = launcher.is_enabled().unwrap_or(false);
    if enabled && !blocked {
        let _ = launcher.enable();
    }
    enabled
}

/// The menu bar (macOS) / notification-area (Windows) icon and its menu.
fn add_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let state = app
        .state::<SharedMenu>()
        .0
        .lock()
        .map(|state| state.clone())
        .unwrap_or_default();
    let mut tray = TrayIconBuilder::with_id("ydcp")
        .tooltip("YDCP")
        .menu(&menu::build(app, &state)?)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            if let Some(pick) = Pick::parse(event.id().as_ref()) {
                on_pick(app, pick);
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}

/// Lets clicks pass through the window (`on`), or catches them (when the cursor is over her).
#[tauri::command]
fn set_click_through<R: Runtime>(window: WebviewWindow<R>, on: bool) -> Result<(), String> {
    window
        .set_ignore_cursor_events(on)
        .map_err(|error| error.to_string())
}

/// The chosen model's file name, if there is one.
#[tauri::command]
fn current_model<R: Runtime>(app: AppHandle<R>) -> Option<String> {
    app.state::<SharedMenu>().0.lock().ok()?.model.clone()
}

/// Her size as a factor of 320 × 480.
#[tauri::command]
fn pet_scale<R: Runtime>(app: AppHandle<R>) -> f64 {
    app.state::<SharedMenu>()
        .0
        .lock()
        .map_or(1.0, |state| state.scale)
}

/// Resizes her (pinch or ⌘/Ctrl-scroll over her); returns the size she got.
#[tauri::command]
fn set_pet_scale<R: Runtime>(app: AppHandle<R>, scale: f64) -> f64 {
    if scale.is_finite() {
        set_scale(&app, scale)
    } else {
        pet_scale(app)
    }
}

/// The language in use: 'en', 'ja', 'zh-Hans' or 'zh-Hant'.
#[tauri::command]
fn app_language<R: Runtime>(app: AppHandle<R>) -> &'static str {
    language(&app)
}

/// Break reminders every so many minutes (0: off).
#[tauri::command]
fn break_every<R: Runtime>(app: AppHandle<R>) -> u32 {
    app.state::<SharedMenu>()
        .0
        .lock()
        .map_or(0, |state| state.break_every)
}

/// The front end's timer: minutes left (or none), for the menu.
#[tauri::command]
fn set_timer_left<R: Runtime>(app: AppHandle<R>, minutes: Option<u32>) {
    let changed = app
        .state::<SharedMenu>()
        .0
        .lock()
        .map(|mut state| std::mem::replace(&mut state.timer_left, minutes) != minutes)
        .unwrap_or(false);
    if changed {
        menu::refresh(&app);
    }
}

/// Shows her if she was hidden (a timer she was asked to keep went off).
#[tauri::command]
fn show_pet<R: Runtime>(app: AppHandle<R>) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(true) {
        return;
    }
    let _ = window.show();
    app.state::<cursor::Geometry>().refresh(&window);
    if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
        state.visible = true;
    }
    menu::refresh(&app);
}

/// The chosen frame rate.
#[tauri::command]
fn frame_rate<R: Runtime>(app: AppHandle<R>) -> u32 {
    app.state::<SharedMenu>()
        .0
        .lock()
        .map_or(settings::DEFAULT_FRAME_RATE, |state| state.frame_rate)
}

/// What YDCP remembers about one model's outfit.
#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct OutfitPrefs {
    /// The parts she wore last.
    wearing: Vec<String>,
    /// Which expressions are outfit parts, if the user sorted them (else YDCP decides).
    parts: Option<Vec<String>>,
}

/// The outfit remembered for `model`.
#[tauri::command]
fn saved_outfit<R: Runtime>(app: AppHandle<R>, model: String) -> OutfitPrefs {
    let saved = settings_path(&app)
        .map(|path| settings::load(&path))
        .unwrap_or_default();
    OutfitPrefs {
        wearing: saved.outfit(&model),
        parts: saved.outfit_parts(&model),
    }
}

/// The user sorted `model`'s expressions in About this model: `parts` are its outfit parts
/// (`None` lets YDCP decide again), and she now wears `wearing`.
#[tauri::command]
fn sort_outfit<R: Runtime>(
    app: AppHandle<R>,
    model: String,
    parts: Option<Vec<String>>,
    wearing: Vec<String>,
) {
    save_setting(&app, |settings| {
        settings.set_outfit_parts(&model, parts.as_deref());
        settings.set_outfit(&model, &wearing);
    });
}

/// The front end tells the menu which motions, vibes, faces and outfit parts it has.
#[tauri::command]
fn set_catalogue<R: Runtime>(app: AppHandle<R>, catalogue: Catalogue) {
    if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
        state.face = catalogue.face.clone();
        state.catalogue = catalogue;
    }
    menu::refresh(&app);
}

/// "Add a model…" from the welcome card: the same file picker as the menu's.
#[tauri::command]
fn add_model<R: Runtime>(app: AppHandle<R>) {
    add_model_dialog(&app);
}

/// Starts the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default();
    // Windows starts a second YDCP for a double-clicked .vrm; it hands the file to this one and
    // quits. (macOS keeps one copy running and sends the file as an Opened event instead.)
    #[cfg(windows)]
    let builder = builder.plugin(tauri_plugin_single_instance::init(|app, args, cwd| {
        open_model_files(
            app,
            args.into_iter()
                .skip(1)
                .map(|arg| Path::new(&cwd).join(arg)),
        );
    }));
    builder
        .plugin(tauri_plugin_dialog::init())
        // "Start at login", used from Rust only. LaunchAgent, not AppleScript: no prompt to
        // let YDCP control System Events.
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            None,
        ))
        .manage(cursor::PendingMove::default())
        .manage(cursor::Geometry::default())
        .manage(SharedMenu::default())
        .invoke_handler(tauri::generate_handler![
            assets::models_folder,
            assets::list_models,
            assets::read_model,
            assets::read_profile,
            assets::list_anims,
            assets::read_anim,
            assets::read_motions,
            set_click_through,
            current_model,
            frame_rate,
            app_language,
            pet_scale,
            set_pet_scale,
            break_every,
            set_timer_left,
            show_pet,
            saved_outfit,
            sort_outfit,
            set_catalogue,
            add_model
        ])
        .on_window_event(|window, event| match event {
            WindowEvent::Moved(position) => {
                window.state::<cursor::PendingMove>().record(*position);
                window.state::<cursor::Geometry>().moved(*position);
            }
            WindowEvent::Resized(_) | WindowEvent::ScaleFactorChanged { .. } => {
                if let Some(webview) = window.app_handle().get_webview_window(window.label()) {
                    window.state::<cursor::Geometry>().refresh(&webview);
                }
            }
            _ => {}
        })
        .setup(|app| {
            // A desktop pet, not a regular app: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Err(error) = assets::ensure_dirs(app.handle()) {
                eprintln!("YDCP: {error}");
            }
            let saved = settings_path(app.handle())
                .map(|path| settings::load(&path))
                .unwrap_or_default();
            let models = assets::models_dir(app.handle())
                .map(|dir| assets::plain_files(&dir, ".vrm"))
                .unwrap_or_default();
            let model = saved
                .model
                .clone()
                .filter(|model| models.contains(model))
                .or_else(|| models.first().cloned());
            let scale = settings::valid_scale(saved.scale, saved.size);
            let on_top = saved.always_on_top.unwrap_or(true);
            let agent_link = saved.agent_link.unwrap_or_default();
            let frame_rate = settings::valid_frame_rate(saved.frame_rate);
            let break_every = settings::valid_break_every(saved.break_every);
            let login_blocked = login_blocked();
            let start_at_login = start_at_login(app.handle(), login_blocked);
            let language_choice = saved
                .language
                .clone()
                .filter(|choice| i18n::LANGUAGES.iter().any(|(code, _)| code == choice));
            let language = i18n::resolve(language_choice.as_deref());
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                *state = MenuState {
                    models,
                    model,
                    scale,
                    on_top,
                    agent_link,
                    frame_rate,
                    start_at_login,
                    login_blocked,
                    language,
                    language_choice,
                    break_every,
                    ..MenuState::default()
                };
            }

            add_tray(app)?;
            if let Some(window) = app.get_webview_window("main") {
                let (width, height) = settings::logical_size(scale);
                window.set_size(LogicalSize::new(width, height))?;
                window.set_always_on_top(on_top)?;
                place_window(&window, saved.position)?;
                cursor::start(window);
            }
            watch::start(app.handle().clone());
            // Windows: started by double-clicking a .vrm.
            open_model_files(app.handle(), std::env::args_os().skip(1).map(PathBuf::from));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while starting YDCP")
        .run(|app, event| {
            // macOS: a .vrm double-clicked or opened with YDCP, at launch or while running.
            #[cfg(target_os = "macos")]
            if let tauri::RunEvent::Opened { urls } = event {
                open_model_files(
                    app,
                    urls.into_iter().filter_map(|url| url.to_file_path().ok()),
                );
            }
            #[cfg(not(target_os = "macos"))]
            let _ = (app, event);
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn only_vrm_files_are_opened() {
        assert!(is_vrm(Path::new("/x/Lily.vrm")));
        assert!(is_vrm(Path::new(r"C:\x\Lily.VRM")));
        assert!(!is_vrm(Path::new("/x/Lily.vrma")));
        assert!(!is_vrm(Path::new("--flag")));
    }

    #[test]
    #[cfg(target_os = "macos")]
    fn start_at_login_needs_a_real_install_on_macos() {
        assert!(!login_blocked_for(
            "/Applications/YDCP.app/Contents/MacOS/ydcp"
        ));
        assert!(!login_blocked_for(
            "/Users/me/Applications/YDCP.app/Contents/MacOS/ydcp"
        ));
        assert!(login_blocked_for(
            "/private/var/folders/x/AppTranslocation/ABC/d/YDCP.app/Contents/MacOS/ydcp"
        ));
        assert!(login_blocked_for(
            "/Volumes/YDCP/YDCP.app/Contents/MacOS/ydcp"
        ));
    }

    #[test]
    #[cfg(not(target_os = "macos"))]
    fn start_at_login_works_from_anywhere_elsewhere() {
        assert!(!login_blocked_for(r"C:\Program Files\YDCP\ydcp.exe"));
    }
}
