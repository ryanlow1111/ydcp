# Changelog

All notable changes to YDCP are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and YDCP uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- Click-through (M2): clicks pass through to the apps behind her everywhere except on her body; a small margin around her makes thin parts easy to grab.
- Drag her anywhere; a quick click pokes her (a little hop, a surprised face, then a big smile).
- She comes back where you left her (saved in `~/.ydcp/settings.json`), or to the bottom-right if that screen is gone.
- Her head follows the cursor anywhere on screen, not only over her window.
- Smoother motion: up to 60 frames a second (each frame takes about 1 ms); the click-through pixel check runs about 20 times a second instead of every frame.
- She floats on the desktop (M1): a transparent, frameless, always-on-top window on every Space, with no Dock or taskbar icon. She appears at the bottom-right of the main screen.
- Built-in vibe loops (idle, sway, bop) that cross-fade, a head that follows the cursor, a soft smile and blinks. They work on any VRM 0.x or 1.0 model, with no motion files needed.
- Models load from `~/.ydcp/models/` (Windows: `%USERPROFILE%\.ydcp\models\`). Only plain `.vrm` file names inside that folder can be read, up to 100 MB. With no model, a card shows where to put one.
- A menu bar / notification-area icon with Quit.
- Project setup (M0): Tauri 2 + Vite app shell for macOS and Windows, original app icon.
- CI on macOS and Windows: lint, tests, Rust format/clippy/tests, dependency audits, and version and privacy checks.
- Release workflow: one tag builds macOS (universal) and Windows (x64, ARM64) into one draft release with checksums.
- MIT licence, README, contributing guide, code of conduct, security policy, issue and PR templates.
