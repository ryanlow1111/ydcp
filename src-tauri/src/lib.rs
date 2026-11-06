//! YDCP — Your Desktop Companion Project.
//!
//! One transparent, frameless, always-on-top window shows the companion (drawn by the front
//! end with three.js). There's no Dock or taskbar icon; a small menu bar / notification-area
//! icon holds Quit. Clicks pass through everywhere except on her (`set_click_through`, driven
//! by the front end from the cursor feed in `cursor`), she can be dragged, and she comes back
//! where she was left (`settings`). Models are read only from `~/.ydcp/models/` (`assets`).

mod assets;
mod cursor;
mod settings;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, Manager, PhysicalPosition, Runtime, WebviewWindow, WindowEvent};

use settings::{Area, Position};

/// Space between her window and the screen's edges, in logical pixels.
const EDGE_MARGIN: f64 = 24.0;

/// Places the window where she was left, if that spot is still on a screen; otherwise at the
/// bottom-right of the primary screen's usable area (above the Dock or taskbar).
fn place_window<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let size = window.outer_size()?;
    let areas: Vec<Area> = window
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
        .collect();
    let saved = assets::data_dir(window.app_handle())
        .map(|dir| settings::load(&dir.join("settings.json")).position)
        .ok()
        .flatten();
    if let Some(Position { x, y }) = saved
        && settings::fits_on_a_screen(Position { x, y }, (size.width, size.height), &areas)
    {
        return window.set_position(PhysicalPosition::new(x, y));
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

/// The menu bar (macOS) / notification-area (Windows) icon. For now it only holds Quit, since
/// there's no Dock icon or app menu to quit from; M3 fills in the full menu.
fn add_tray<R: Runtime>(app: &App<R>) -> tauri::Result<()> {
    let quit = MenuItem::with_id(app, "quit", "Quit YDCP", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&quit])?;
    let mut tray = TrayIconBuilder::with_id("ydcp")
        .tooltip("YDCP")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(|app, event| {
            if event.id() == "quit" {
                app.exit(0);
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

/// Starts the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(cursor::PendingMove::default())
        .invoke_handler(tauri::generate_handler![
            assets::models_folder,
            assets::list_models,
            assets::read_model,
            set_click_through
        ])
        .on_window_event(|window, event| {
            if let WindowEvent::Moved(position) = event {
                window.state::<cursor::PendingMove>().record(*position);
            }
        })
        .setup(|app| {
            // A desktop pet, not a regular app: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Err(error) = assets::ensure_dirs(app.handle()) {
                eprintln!("YDCP: {error}");
            }
            add_tray(app)?;
            if let Some(window) = app.get_webview_window("main") {
                place_window(&window)?;
                cursor::start(window);
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running YDCP");
}
