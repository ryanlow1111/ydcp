//! The menu's words in English, Japanese, Simplified and Traditional Chinese, from the same
//! files the front end uses (`src/locales/*.json`), built into the app. The language follows
//! the system unless Menu → Language picks one.

use std::collections::HashMap;
use std::sync::OnceLock;

use serde_json::Value;

/// The languages YDCP speaks: code, and its own name for the Language menu.
pub const LANGUAGES: [(&str, &str); 4] = [
    ("en", "English"),
    ("ja", "日本語"),
    ("zh-Hans", "简体中文"),
    ("zh-Hant", "繁體中文"),
];

type Table = HashMap<String, Value>;

fn tables() -> &'static HashMap<&'static str, Table> {
    static TABLES: OnceLock<HashMap<&'static str, Table>> = OnceLock::new();
    TABLES.get_or_init(|| {
        let files = [
            ("en", include_str!("../../src/locales/en.json")),
            ("ja", include_str!("../../src/locales/ja.json")),
            ("zh-Hans", include_str!("../../src/locales/zh-Hans.json")),
            ("zh-Hant", include_str!("../../src/locales/zh-Hant.json")),
        ];
        files
            .into_iter()
            .map(|(code, text)| (code, serde_json::from_str(text).unwrap_or_default()))
            .collect()
    })
}

/// The text for `key` in `language`, or in English if it's missing there, or the key itself.
pub fn t(language: &str, key: &str) -> String {
    let lookup = |code: &str| {
        tables()
            .get(code)
            .and_then(|table| table.get(key))
            .and_then(Value::as_str)
            .map(str::to_string)
    };
    lookup(language)
        .or_else(|| lookup("en"))
        .unwrap_or_else(|| key.to_string())
}

/// `t` with `{name}` placeholders filled in.
pub fn tf(language: &str, key: &str, values: &[(&str, &str)]) -> String {
    values.iter().fold(t(language, key), |text, (name, value)| {
        text.replace(&format!("{{{name}}}"), value)
    })
}

/// YDCP's language for a system locale such as "ja-JP", "zh-TW" or "en-GB".
pub fn from_locale(locale: &str) -> &'static str {
    let locale = locale.replace('_', "-").to_lowercase();
    let traditional = ["zh-hant", "zh-tw", "zh-hk", "zh-mo"];
    if locale.starts_with("ja") {
        "ja"
    } else if traditional.iter().any(|prefix| locale.starts_with(prefix)) {
        "zh-Hant"
    } else if locale.starts_with("zh") {
        "zh-Hans"
    } else {
        "en"
    }
}

/// The language to use: the menu's choice if it's one YDCP has, else the system's.
pub fn resolve(choice: Option<&str>) -> &'static str {
    choice
        .and_then(|choice| LANGUAGES.iter().find(|(code, _)| *code == choice))
        .map(|(code, _)| *code)
        .unwrap_or_else(|| from_locale(&sys_locale::get_locale().unwrap_or_default()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn every_language_file_reads() {
        for (code, _) in LANGUAGES {
            assert!(tables()[code].len() > 50, "{code} didn't load");
        }
    }

    #[test]
    fn falls_back_to_english_then_the_key() {
        assert_eq!(t("ja", "menu.models"), "モデル");
        assert_eq!(t("xx", "menu.models"), "Models");
        assert_eq!(t("ja", "no.such.key"), "no.such.key");
        assert_eq!(
            tf("en", "menu.everyMinutes", &[("n", "45")]),
            "Every 45 minutes"
        );
    }

    #[test]
    fn system_locales_map_to_a_language() {
        assert_eq!(from_locale("ja-JP"), "ja");
        assert_eq!(from_locale("zh-CN"), "zh-Hans");
        assert_eq!(from_locale("zh-Hans-SG"), "zh-Hans");
        assert_eq!(from_locale("zh_TW"), "zh-Hant");
        assert_eq!(from_locale("zh-Hant-MY"), "zh-Hant");
        assert_eq!(from_locale("zh-HK"), "zh-Hant");
        assert_eq!(from_locale("en-MY"), "en");
        assert_eq!(from_locale("fr-FR"), "en");
        assert_eq!(from_locale(""), "en");
    }

    #[test]
    fn the_menus_choice_wins() {
        assert_eq!(resolve(Some("zh-Hant")), "zh-Hant");
        assert_eq!(resolve(Some("en")), "en");
        // Unknown choices fall back to the system's language (whatever this machine's is).
        assert_eq!(resolve(Some("klingon")), resolve(None));
    }
}
