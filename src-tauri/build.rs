fn main() {
    // Only these app commands exist for the front end, and each one must also be allowed in
    // capabilities/default.json. Anything not listed here can't be called at all.
    tauri_build::try_build(tauri_build::Attributes::new().app_manifest(
        tauri_build::AppManifest::new().commands(&["models_folder", "list_models", "read_model"]),
    ))
    .expect("failed to run tauri-build");
}
