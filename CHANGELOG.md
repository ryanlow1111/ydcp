# Changelog

All notable changes to YDCP are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and YDCP uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- VRM 1.0 models (what VRoid Studio exports today) no longer raise their arms or tilt the wrong way: all built-in poses are written in VRM 1.0 space and converted for VRM 0.x models.

### Added
- Menu bar / notification-area menu (M3): Show/Hide, Models ▸ (switch without restarting, Add model…), Motions ▸ (moments, Vibes ▸, Expressions ▸, Add motions…, Reload), Size ▸ (Small, Medium, Large), Always on top, Open pet folder, About YDCP…, Quit. Size, always-on-top and the chosen model are remembered.
- Built-in moments, written as code so no files are needed: Wave, Peace, Cheer, Shy and Stretch. She does one now and then, and when poked, with a speech bubble.
- Motion library: any `.vrma` in `~/.ydcp/anims/` appears in the menu; optional `motions.json` sets name, face, line, credit, trim (e.g. an opening crouch), speed, loop and hidden. Changes are picked up without a restart.
- Model profiles (`<model>.json` next to the model): name, credit, size, face mapping and per-motion arm fixes.
- About YDCP… shows the version, the model's credit and licence (read from the file), and motion credits.
- Click-through (M2): clicks pass through to the apps behind her everywhere except on her body; a small margin around her makes thin parts easy to grab.
- Drag her anywhere; a quick click pokes her (a little hop, a surprised face, then a big smile).
- She comes back where you left her (saved in `~/.ydcp/settings.json`), or to the bottom-right if that screen is gone.
- Her head follows the cursor anywhere on screen, not only over her window.
- Smoother motion: up to 60 frames a second (each frame takes about 1 ms); the click-through pixel check runs about 20 times a second instead of every frame.
- She floats on the desktop (M1): a transparent, frameless, always-on-top window on every Space, with no Dock or taskbar icon. She appears at the bottom-right of the main screen.
- Built-in vibe loops (idle, sway, bop, sleepy) that cross-fade, a head that follows the cursor, a soft smile and blinks. They work on any VRM 0.x or 1.0 model, with no motion files needed.
- Models load from `~/.ydcp/models/` (Windows: `%USERPROFILE%\.ydcp\models\`). Only plain `.vrm` file names inside that folder can be read, up to 100 MB. With no model, a card shows where to put one.
- A menu bar / notification-area icon with Quit.
- Project setup (M0): Tauri 2 + Vite app shell for macOS and Windows, original app icon.
- CI on macOS and Windows: lint, tests, Rust format/clippy/tests, dependency audits, and version and privacy checks.
- Release workflow: one tag builds macOS (universal) and Windows (x64, ARM64) into one draft release with checksums.
- MIT licence, README, contributing guide, code of conduct, security policy, issue and PR templates.
