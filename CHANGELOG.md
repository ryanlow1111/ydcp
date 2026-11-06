# Changelog

All notable changes to YDCP are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and YDCP uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added
- She floats on the desktop (M1): a transparent, frameless, always-on-top window on every Space, with no Dock or taskbar icon. She appears at the bottom-right of the main screen.
- Built-in vibe loops (idle, sway, bop) that cross-fade, a head that follows the cursor, a soft smile and blinks. They work on any VRM 0.x or 1.0 model, with no motion files needed.
- Models load from `~/.ydcp/models/` (Windows: `%USERPROFILE%\.ydcp\models\`). Only plain `.vrm` file names inside that folder can be read, up to 100 MB. With no model, a card shows where to put one.
- A menu bar / notification-area icon with Quit.
- Project setup (M0): Tauri 2 + Vite app shell for macOS and Windows, original app icon.
- CI on macOS and Windows: lint, tests, Rust format/clippy/tests, dependency audits, and version and privacy checks.
- Release workflow: one tag builds macOS (universal) and Windows (x64, ARM64) into one draft release with checksums.
- MIT licence, README, contributing guide, code of conduct, security policy, issue and PR templates.
