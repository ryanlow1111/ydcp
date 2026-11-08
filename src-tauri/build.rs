fn main() {
    // Only these app commands exist for the front end, and each one must also be allowed in
    // capabilities/default.json. Anything not listed here can't be called at all.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&[
            "models_folder",
            "list_models",
            "read_model",
            "read_profile",
            "list_anims",
            "read_anim",
            "read_motions",
            "set_click_through",
            "current_model",
            "frame_rate",
            "saved_outfit",
            "set_catalogue",
            "add_model",
        ]),
    ))
    .expect("failed to run tauri-build");
}
