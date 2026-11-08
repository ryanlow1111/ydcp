//! The user's own files: models in `~/.ydcp/models/`, motions in `~/.ydcp/anims/`
//! (Windows: under `%USERPROFILE%\.ydcp\`).
//!
//! The front end can only list and read files **inside** those folders, by plain file name.
//! Names with paths, `..`, hidden names, or the wrong extension are refused, and a file that
//! resolves (through a link) to somewhere else is refused too.

use std::fs;
use std::path::{Path, PathBuf};

use tauri::{AppHandle, Manager, Runtime, ipc::Response};

/// The largest model YDCP loads, in bytes. Bigger files are refused, not half-loaded.
pub const MAX_MODEL_BYTES: u64 = 100 * 1024 * 1024;
/// The largest motion (.vrma) YDCP loads.
pub const MAX_MOTION_BYTES: u64 = 20 * 1024 * 1024;
/// The largest settings file (motions.json, a model profile) YDCP reads.
pub const MAX_SETTINGS_BYTES: u64 = 256 * 1024;

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

/// `~/.ydcp/anims`.
pub fn anims_dir<R: Runtime>(app: &AppHandle<R>) -> Result<PathBuf, String> {
    data_dir(app).map(|dir| dir.join("anims"))
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
pub fn plain_files(dir: &Path, extension: &str) -> Vec<String> {
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

/// A small settings file inside `dir`, as text; `None` if it isn't there.
fn read_settings_file(dir: &Path, name: &str) -> Result<Option<String>, String> {
    if !dir.join(name).exists() {
        return Ok(None);
    }
    let bytes = read_inside(dir, name, ".json", MAX_SETTINGS_BYTES)?;
    String::from_utf8(bytes)
        .map(Some)
        .map_err(|_| format!("\"{name}\" isn't text."))
}

/// A plain, safe file name for a picked file: unsafe characters become `_`. Keeps `extension`.
pub fn safe_name(original: &str, extension: &str) -> Option<String> {
    let cleaned: String = original
        .chars()
        .map(|c| {
            if c.is_control() || matches!(c, '/' | '\\' | ':' | '<' | '>' | '"' | '|' | '?' | '*') {
                '_'
            } else {
                c
            }
        })
        .collect();
    let cleaned = cleaned.trim().trim_start_matches('.').replace("..", "_");
    is_plain_name(&cleaned, extension).then_some(cleaned)
}

/// Copies a picked file into `dir` (never overwriting: "name (2).vrm" etc.). Returns its new name.
pub fn copy_in(
    source: &Path,
    dir: &Path,
    extension: &str,
    max_bytes: u64,
) -> Result<String, String> {
    let original = source
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("That file has no usable name.")?;
    let name = safe_name(original, extension)
        .ok_or_else(|| format!("\"{original}\" isn't a {extension} file."))?;
    let size = fs::metadata(source)
        .map_err(|error| error.to_string())?
        .len();
    if size > max_bytes {
        return Err(format!(
            "\"{original}\" is {} MB; the limit is {} MB.",
            size / 1024 / 1024,
            max_bytes / 1024 / 1024
        ));
    }
    fs::create_dir_all(dir).map_err(|error| error.to_string())?;
    let stem = &name[..name.len() - extension.len()];
    let mut target = name.clone();
    let mut n = 2;
    while dir.join(&target).exists() {
        target = format!("{stem} ({n}){extension}");
        n += 1;
    }
    fs::copy(source, dir.join(&target))
        .map_err(|error| format!("Couldn't copy \"{original}\": {error}"))?;
    Ok(target)
}

/// Brings an opened file (a double-clicked `.vrm`) into `dir`: a file already in `dir`, or the
/// same file opened before (same name and contents), is used as it is; anything else is copied
/// in as `copy_in` does. Returns its name in `dir`.
pub fn bring_in(
    source: &Path,
    dir: &Path,
    extension: &str,
    max_bytes: u64,
) -> Result<String, String> {
    let same_folder = match (source.parent().map(fs::canonicalize), fs::canonicalize(dir)) {
        (Some(Ok(parent)), Ok(dir)) => parent == dir,
        _ => false,
    };
    let name = source.file_name().and_then(|name| name.to_str());
    if let Some(name) = name
        && is_plain_name(name, extension)
    {
        if same_folder {
            return Ok(name.to_string());
        }
        let existing = dir.join(name);
        let same_size = matches!(
            (fs::metadata(source), fs::metadata(&existing)),
            (Ok(a), Ok(b)) if a.len() == b.len() && a.len() <= max_bytes
        );
        if same_size && fs::read(source).ok() == fs::read(&existing).ok() {
            return Ok(name.to_string());
        }
    }
    copy_in(source, dir, extension, max_bytes)
}

/// What's in a folder, to notice changes: each plain file's name, size and change time.
pub fn folder_signature(dir: &Path) -> Vec<(String, u64, u128)> {
    let Ok(entries) = fs::read_dir(dir) else {
        return Vec::new();
    };
    let mut items: Vec<(String, u64, u128)> = entries
        .filter_map(Result::ok)
        .filter_map(|entry| {
            let name = entry.file_name().into_string().ok()?;
            let meta = entry.metadata().ok()?;
            let changed = meta
                .modified()
                .ok()
                .and_then(|time| time.duration_since(std::time::UNIX_EPOCH).ok())
                .map_or(0, |since| since.as_millis());
            Some((name, meta.len(), changed))
        })
        .collect();
    items.sort();
    items
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

/// A model's optional profile (`<model>.json` next to it), as text.
#[tauri::command]
pub fn read_profile<R: Runtime>(
    app: AppHandle<R>,
    model: String,
) -> Result<Option<String>, String> {
    if !is_plain_name(&model, ".vrm") {
        return Err(format!("\"{model}\" isn't a .vrm file name."));
    }
    let stem = &model[..model.len() - ".vrm".len()];
    read_settings_file(&models_dir(&app)?, &format!("{stem}.json"))
}

/// The `.vrma` files in the motions folder.
#[tauri::command]
pub fn list_anims<R: Runtime>(app: AppHandle<R>) -> Result<Vec<String>, String> {
    Ok(plain_files(&anims_dir(&app)?, ".vrma"))
}

/// One motion file's bytes.
#[tauri::command]
pub fn read_anim<R: Runtime>(app: AppHandle<R>, name: String) -> Result<Response, String> {
    read_inside(&anims_dir(&app)?, &name, ".vrma", MAX_MOTION_BYTES).map(Response::new)
}

/// The motions folder's optional `motions.json`, as text.
#[tauri::command]
pub fn read_motions<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    read_settings_file(&anims_dir(&app)?, "motions.json")
}

/// The user's own lines for her, `~/.ydcp/lines.json`, as text or null (it's optional).
#[tauri::command]
pub fn read_lines<R: Runtime>(app: AppHandle<R>) -> Result<Option<String>, String> {
    read_settings_file(&data_dir(&app)?, "lines.json")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn plain_names_pass() {
        assert!(is_plain_name("aiko.vrm", ".vrm"));
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
    fn picked_files_get_safe_names() {
        assert_eq!(safe_name("Aiko.vrm", ".vrm").as_deref(), Some("Aiko.vrm"));
        assert_eq!(safe_name("a:b*c.vrm", ".vrm").as_deref(), Some("a_b_c.vrm"));
        assert_eq!(
            safe_name(".hidden.vrm", ".vrm").as_deref(),
            Some("hidden.vrm")
        );
        assert_eq!(safe_name("x..y.vrm", ".vrm").as_deref(), Some("x_y.vrm"));
        assert_eq!(safe_name("model.fbx", ".vrm"), None);
    }

    #[test]
    fn copies_in_without_overwriting() {
        let source_dir = temp_folder("copy-src");
        let dir = temp_folder("copy-dst");
        let source = source_dir.join("Aiko.vrm");
        fs::write(&source, b"model").unwrap();
        assert_eq!(copy_in(&source, &dir, ".vrm", 100).unwrap(), "Aiko.vrm");
        assert_eq!(copy_in(&source, &dir, ".vrm", 100).unwrap(), "Aiko (2).vrm");
        assert!(
            copy_in(&source, &dir, ".vrm", 2)
                .unwrap_err()
                .contains("limit")
        );
        assert!(copy_in(&source_dir.join("missing.vrm"), &dir, ".vrm", 100).is_err());
        fs::remove_dir_all(&dir).unwrap();
        fs::remove_dir_all(&source_dir).unwrap();
    }

    #[test]
    fn opened_files_are_not_copied_twice() {
        let source_dir = temp_folder("open-src");
        let dir = temp_folder("open-dst");
        let source = source_dir.join("Lily.vrm");
        fs::write(&source, b"model").unwrap();
        assert_eq!(bring_in(&source, &dir, ".vrm", 100).unwrap(), "Lily.vrm");
        // The same download opened again: the copy already there is used.
        assert_eq!(bring_in(&source, &dir, ".vrm", 100).unwrap(), "Lily.vrm");
        // A file already in the models folder is used where it is.
        assert_eq!(
            bring_in(&dir.join("Lily.vrm"), &dir, ".vrm", 100).unwrap(),
            "Lily.vrm"
        );
        // A different model with the same name gets its own copy.
        fs::write(&source, b"other model").unwrap();
        assert_eq!(
            bring_in(&source, &dir, ".vrm", 100).unwrap(),
            "Lily (2).vrm"
        );
        assert_eq!(fs::read_dir(&dir).unwrap().count(), 2);
        fs::remove_dir_all(&dir).unwrap();
        fs::remove_dir_all(&source_dir).unwrap();
    }

    #[test]
    fn settings_files_are_optional_text() {
        let dir = temp_folder("settings-file");
        assert_eq!(read_settings_file(&dir, "motions.json").unwrap(), None);
        fs::write(dir.join("motions.json"), "{}").unwrap();
        assert_eq!(
            read_settings_file(&dir, "motions.json").unwrap().as_deref(),
            Some("{}")
        );
        fs::remove_dir_all(&dir).unwrap();
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
