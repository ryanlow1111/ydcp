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
mod menu;
mod settings;
mod watch;

use std::path::PathBuf;
use std::process::Command;

use tauri::tray::TrayIconBuilder;
use tauri::{
    App, AppHandle, Emitter, LogicalSize, Manager, PhysicalPosition, Runtime, WebviewWindow,
    WindowEvent,
};
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
fn apply_size<R: Runtime>(window: &WebviewWindow<R>, size: Size) -> tauri::Result<()> {
    let before = window.outer_size()?;
    let position = window.outer_position()?;
    let (width, height) = size.logical();
    window.set_size(LogicalSize::new(width, height))?;
    let after = window.outer_size()?;
    let x = position.x + (before.width as i32 - after.width as i32) / 2;
    let y = position.y + before.height as i32 - after.height as i32;
    window.set_position(PhysicalPosition::new(x, y))
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
fn add_model_dialog<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    app.dialog()
        .file()
        .set_title("Add a VRM model")
        .add_filter("VRM model", &["vrm"])
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

/// "Add motions…": pick .vrma files and copy them into the motions folder.
fn add_motions_dialog<R: Runtime>(app: &AppHandle<R>) {
    let app = app.clone();
    app.dialog()
        .file()
        .set_title("Add VRM Animation motions")
        .add_filter("VRM Animation", &["vrma"])
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
        Pick::Moment(_) | Pick::About => {
            let _ = app.emit_to("main", "pick", pick);
        }
        Pick::Size(ref id) => {
            let Some(size) = Size::ALL.into_iter().find(|size| size.id() == id) else {
                return;
            };
            if let Some(window) = window
                && let Err(error) = apply_size(&window, size)
            {
                eprintln!("YDCP: couldn't resize: {error}");
            }
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                state.size = size;
            }
            save_setting(app, |settings| settings.size = Some(size));
            menu::refresh(app);
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

/// The chosen frame rate.
#[tauri::command]
fn frame_rate<R: Runtime>(app: AppHandle<R>) -> u32 {
    app.state::<SharedMenu>()
        .0
        .lock()
        .map_or(settings::DEFAULT_FRAME_RATE, |state| state.frame_rate)
}

/// The front end tells the menu which motions, vibes and faces it has.
#[tauri::command]
fn set_catalogue<R: Runtime>(app: AppHandle<R>, catalogue: Catalogue) {
    if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
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
            let size = saved.size.unwrap_or_default();
            let on_top = saved.always_on_top.unwrap_or(true);
            let agent_link = saved.agent_link.unwrap_or_default();
            let frame_rate = settings::valid_frame_rate(saved.frame_rate);
            if let Ok(mut state) = app.state::<SharedMenu>().0.lock() {
                *state = MenuState {
                    models,
                    model,
                    size,
                    on_top,
                    agent_link,
                    frame_rate,
                    ..MenuState::default()
                };
            }

            add_tray(app)?;
            if let Some(window) = app.get_webview_window("main") {
                let (width, height) = size.logical();
                window.set_size(LogicalSize::new(width, height))?;
                window.set_always_on_top(on_top)?;
                place_window(&window, saved.position)?;
                cursor::start(window);
            }
            watch::start(app.handle().clone());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running YDCP");
}
