//! YDCP — Your Desktop Companion Project.
//!
//! M0: the app shell. It opens one window that shows a placeholder card, so the build and
//! release pipeline can be proven on macOS and Windows before the companion arrives (M1).

/// Starts the app.
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running YDCP");
}
