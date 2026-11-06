//! YDCP — Your Desktop Companion Project.
//!
//! M1: she floats on the desktop. One transparent, frameless, always-on-top window shows the
//! companion (drawn by the front end with three.js); there's no Dock or taskbar icon, and a
//! small menu bar / notification-area icon holds Quit. Models are read only from
//! `~/.ydcp/models/` (see `assets`).

mod assets;

use tauri::menu::{Menu, MenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{App, Manager, PhysicalPosition, Runtime, WebviewWindow};

/// Space between her window and the screen's edges, in logical pixels.
const EDGE_MARGIN: f64 = 24.0;

/// Places the window at the bottom-right of the primary screen's usable area (above the Dock
/// or taskbar). M2 remembers where she was dragged instead.
fn place_bottom_right<R: Runtime>(window: &WebviewWindow<R>) -> tauri::Result<()> {
    let Some(monitor) = window.primary_monitor()? else {
        return Ok(());
    };
    let area = monitor.work_area();
    let size = window.outer_size()?;
    let margin = (EDGE_MARGIN * monitor.scale_factor()).round() as i32;
    let x = area.position.x + area.size.width as i32 - size.width as i32 - margin;
    let y = area.position.y + area.size.height as i32 - size.height as i32 - margin;
    window.set_position(PhysicalPosition::new(
        x.max(area.position.x),
        y.max(area.position.y),
    ))
}

/// The menu bar (macOS) / notification-area (Windows) icon. M1 only needs Quit, since there's
/// no Dock icon or app menu to quit from; M3 fills in the full menu.
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

/// Starts the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            assets::models_folder,
            assets::list_models,
            assets::read_model
        ])
        .setup(|app| {
            // A desktop pet, not a regular app: no Dock icon, no app menu.
            #[cfg(target_os = "macos")]
            app.set_activation_policy(tauri::ActivationPolicy::Accessory);

            if let Err(error) = assets::ensure_dirs(app.handle()) {
                eprintln!("YDCP: {error}");
            }
            add_tray(app)?;
            if let Some(window) = app.get_webview_window("main") {
                place_bottom_right(&window)?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running YDCP");
}
