//! The user's own files: models live in `~/.ydcp/models/` (Windows: `%USERPROFILE%\.ydcp\models\`).
//!
//! The front end can only list and read files **inside** that folder, by plain file name.
//! Names with paths, `..`, hidden names, or the wrong extension are refused, and a file that
//! resolves (through a link) to somewhere else is refused too.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime, ipc::Response};

/// The largest model YDCP loads, in bytes. Bigger files are refused, not half-loaded.
pub const MAX_MODEL_BYTES: u64 = 100 * 1024 * 1024;

/// `~/.ydcp`, YDCP's one data folder.
pub fn data_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    app.path()
        .home_dir()
        .map(|home| home.join(".ydcp"))
        .map_err(|_| "Could not find your home folder.".to_string())
}

/// `~/.ydcp/models`.
pub fn models_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    data_dir(app).map(|dir| dir.join("models"))
}

/// Creates `~/.ydcp/models` and `~/.ydcp/anims` if they're missing.
pub fn ensure_dirs<R: Runtime>(app: &AppHandle<R>) -> Result<(), String> {
    let data = data_dir(app)?;
    for sub in ["models", "anims"] {
        fs::create_dir_all(data.join(sub))
            .map_err(|error| format!("Could not create {}: {error}", data.join(sub).display()))?;
    }
    Ok(())
}

/// Whether `name` is a plain file name with `extension` (like `.vrm`): no folders, no `..`,
/// not hidden, no characters Windows treats specially.
pub fn is_plain_name(name: &str, extension: &str) -> bool {
    let lower = name.to_lowercase();
    !name.is_empty()
        && name.len() <= 255
        && !name.starts_with('.')
        && !name.contains(['/', '\\', ':', '<', '>', '"', '|', '?', '*'])
        && !name.contains("..")
        && !name.chars().any(char::is_control)
        && lower.ends_with(extension)
        && lower.len() > extension.len()
}

/// The plain file names in `dir` that end with `extension`, sorted, ignoring anything else.
fn plain_files(dir: &Path, extension: &str) -> Vec<String> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut names: Vec<String> = entries
        .filter_map(Result::ok)
        .filter(|entry| {
            entry
                .file_type()
                .is_ok_and(|kind| kind.is_file() || kind.is_symlink())
        })
        .filter_map(|entry| entry.file_name().into_string().ok())
        .filter(|name| is_plain_name(name, extension))
        .collect();
    names.sort_by_key(|name| name.to_lowercase());
    names
}

/// Reads `dir/name` if it's a plain name, really inside `dir`, and at most `max_bytes`.
fn read_inside(dir: &Path, name: &str, extension: &str, max_bytes: u64) -> Result<Vec<u8>, String> {
    if !is_plain_name(name, extension) {
        return Err(format!("\"{name}\" isn't a {extension} file name."));
    }
    let folder = fs::canonicalize(dir).map_err(|_| format!("{} doesn't exist.", dir.display()))?;
    let path = fs::canonicalize(dir.join(name)).map_err(|_| format!("\"{name}\" wasn't found."))?;
    if path.parent() != Some(folder.as_path()) {
        return Err(format!("\"{name}\" points outside {}.", dir.display()));
    }
    let size = fs::metadata(&path)
        .map_err(|error| error.to_string())?
        .len();
    if size > max_bytes {
        return Err(format!(
            "\"{name}\" is {} MB; the limit is {} MB.",
            size / 1024 / 1024,
            max_bytes / 1024 / 1024
        ));
    }
    fs::read(&path).map_err(|error| format!("Could not read \"{name}\": {error}"))
}

/// The models folder's path, to show the user where to put models.
#[tauri::command]
pub fn models_folder<R: Runtime>(app: AppHandle<R>) -> Result<String, String> {
    models_dir(&app).map(|dir| dir.display().to_string())
}

/// The `.vrm` files in the models folder.
#[tauri::command]
pub fn list_models<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    Ok(plain_files(&models_dir(&app)?, ".vrm"))
}

/// One model's bytes, as a binary response (no JSON copy of a 100 MB file).
#[tauri::command]
pub fn read_model<R: Runtime>(app: AppHandle<R>, name: String) -> Result<Response, String> {
    read_inside(&models_dir(&app)?, &name, ".vrm", MAX_MODEL_BYTES).map(Response::new)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_names_pass() {
        assert!(is_plain_name("miku.vrm", ".vrm"));
        assert!(is_plain_name("My Model (v2).VRM", ".vrm"));
        assert!(is_plain_name("可愛い.vrm", ".vrm"));
    }

    #[test]
    fn paths_and_tricks_are_refused() {
        for name in [
            "",
            ".vrm",
            ".hidden.vrm",
            "../secret.vrm",
            "a/b.vrm",
            "a\\b.vrm",
            "C:evil.vrm",
            "model.vrm:stream",
            "x..vrm",
            "model.fbx",
            "model.vrm.exe",
            "bad\nname.vrm",
        ] {
            assert!(!is_plain_name(name, ".vrm"), "{name:?} should be refused");
        }
    }

    /// A fresh, empty folder for one test.
    fn temp_folder(test: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("ydcp-test-{test}-{}", std::process::id()));
        let _ = fs::remove_dir_all(&dir);
        fs::create_dir_all(&dir).unwrap();
        dir
    }

    #[test]
    fn lists_only_models_sorted() {
        let dir = temp_folder("list");
        for name in ["b.vrm", "A.vrm", "notes.txt", ".hidden.vrm"] {
            fs::write(dir.join(name), b"x").unwrap();
        }
        fs::create_dir(dir.join("folder.vrm")).unwrap();
        assert_eq!(plain_files(&dir, ".vrm"), vec!["A.vrm", "b.vrm"]);
        fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn reads_inside_and_enforces_the_size_limit() {
        let dir = temp_folder("read");
        fs::write(dir.join("ok.vrm"), b"12345").unwrap();
        assert_eq!(read_inside(&dir, "ok.vrm", ".vrm", 10).unwrap(), b"12345");
        assert!(
            read_inside(&dir, "ok.vrm", ".vrm", 4)
                .unwrap_err()
                .contains("limit")
        );
        assert!(read_inside(&dir, "missing.vrm", ".vrm", 10).is_err());
        assert!(read_inside(&dir, "../ok.vrm", ".vrm", 10).is_err());
        fs::remove_dir_all(&dir).unwrap();
    }

    #[cfg(unix)]
    #[test]
    fn refuses_links_that_point_outside() {
        let dir = temp_folder("link");
        let outside = temp_folder("link-outside");
        fs::write(outside.join("secret.vrm"), b"secret").unwrap();
        std::os::unix::fs::symlink(outside.join("secret.vrm"), dir.join("sneaky.vrm")).unwrap();
        assert!(
            read_inside(&dir, "sneaky.vrm", ".vrm", 100)
                .unwrap_err()
                .contains("outside")
        );
        fs::remove_dir_all(&dir).unwrap();
        fs::remove_dir_all(&outside).unwrap();
    }
}
