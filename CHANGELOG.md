# Changelog

All notable changes to YDCP are listed here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and YDCP uses [Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed
- Hands held together (Sway, Bop, Sleepy) no longer pass through each other: they hang relaxed, her right resting just in front of her left, spaced to fit each model's hands.
- Picking **Sleepy** yourself keeps the full frame rate. She only slows down to save power when she dozes off because you're away.

## [0.1.2] - 2026-11-08

Your own lines for her, and a kinder word when things go wrong. macOS and Windows.

### Added
- Your own lines for her: add to or replace her greetings, musings, pat lines, cheers and more, for every model (`~/.ydcp/lines.json`) or one character (a `lines` block in her profile). Changes are picked up without a restart. See [docs/lines.md](docs/lines.md).
- She says something encouraging when the agent link reports `failed` without a line of its own.
- A [code signing policy](docs/code-signing.md). Windows releases are ready to be signed for free through SignPath Foundation once it approves the project; this release is still unsigned.

### Changed
- More cheer lines (eight instead of three, in every language), so agent cheers repeat less.

## [0.1.1] - 2026-11-08

Calmer by default, outfits, reminders, any size, head pats, and Japanese and Chinese. macOS and Windows.

### Added
- Models → About this model… says what the loaded model has and lacks, in plain words: faces, blinking, hair physics, finger and eye bones, size, and the licence in its file.
- `npm run check:models -- <folder>`: the same report for a whole folder of models, for testing before a release.
- Menu → Outfit: for models whose expressions show or hide a hat, glasses, a tie and so on, YDCP lists those separately from her faces. Wear any number of them with any expression; each model remembers its outfit. A profile's `outfit` list can say exactly which expressions are outfit parts.
- Sorted wrong? Models → About this model… shows a model's own expressions as Faces and Outfit; click one to move it to the other group. Remembered per model.
- Her mouth moves while she talks.
- A model's Neutral expression is her resting face, as in VSeeFace.
- Any size: pinch on a trackpad, or ⌘/Ctrl + scroll over her, from half size to double (Small / Medium / Large stay as presets). She grows from her feet and never gets taller than the screen.
- Head pats: move the cursor gently back and forth over her head and she smiles, leans into it, and sometimes says something. No click needed.
- Menu → Reminders: a break reminder every 30–90 minutes of work (time away counts as a break), and a 5–60 minute timer. She waves and tells you; no sound. Both off unless you pick them.
- Menu → Start at login (off by default). On a Mac, YDCP must be in Applications first.
- Open a `.vrm` with YDCP (double-click, or Open With): it's copied into the models folder, unless it's there already, and she switches to it.
- Japanese, Simplified Chinese and Traditional Chinese: the menu, cards, model notes and everything she says. YDCP follows the system language; Menu → Language picks one. Translations are in `src/locales/`, and fixes are welcome.
- The agent-link hook scripts (`ydcp-state.sh`, `ydcp-state.ps1`) are attached to every release, with checksums, so app users can set up the Claude Code hooks without the source code. The setup guide now covers downloading them, adding hooks to a settings file that already has other settings, and starting a new session.
- Face-tracking shapes (perfect sync: the 52 ARKit shapes, VSeeFace's extra mouth shapes and brows) stay out of the menus, so perfect-sync models no longer list dozens of meaningless "expressions".

### Changed
- Calmer by default: she stays on her gentle Idle loop and no longer plays moments on her own. Click her, pick a moment from the menu, or let her greet you when you come back. Menu → Motions → Vibes → Auto (drift) brings back the livelier rhythm. She keeps talking now and then.
- Clicking her no longer makes her hop; she looks surprised, then does a moment.
- Menu → Motions → Expressions now lists what the loaded model really has, including its custom expressions. A model with no usable expressions says so.

### Fixed
- Windows: the documented Claude Code hook command used `%USERPROFILE%`, which Git Bash and PowerShell don't expand, so the hook couldn't find its script. It now lets PowerShell find the script in your home folder.

## [0.1.0] - 2026-11-07

First beta, for friends. macOS and Windows.

### Fixed
- She no longer starts in a T-pose for a moment when she appears.
- The speech bubble no longer squeezes into half the window; long lines stay above her face.
- VRM 1.0 models (what VRoid Studio exports today) no longer raise their arms or tilt the wrong way: all built-in poses are written in VRM 1.0 space and converted for VRM 0.x models.

### Added
- Built-in poses fit every body: YDCP measures each model when it loads and places her hands for its proportions. Natural standing pose (weight on one leg), relaxed fingers, and the whole body joins in gestures.
- Menu → Frame rate: 60 fps (smooth, the default) or 30 fps (saves power).
- She uses much less CPU while dozing (15 fps), and none while hidden.
- Her own mood, no AI needed: she dozes off after 10 minutes with no cursor movement and wakes up with a hello when you're back; she greets you on launch, muses now and then, and sometimes mentions the time of day.
- Optional agent link, **off by default**: Menu → React to agent → Off / On / Auto. While it's on, `~/.ydcp/state.json` (written by an agent's hook or any script) makes her cheer on `done`, doze on `sleepy`, or say a `line`. Stale, broken or oversized files are ignored, and an old state is never replayed.
- `integrations/claude-desktop-mod`: a tested mod for the Claude desktop app that writes the state file (working / done / failed / idle).
- Menu bar / notification-area menu: Show/Hide, Models ▸ (switch without restarting, Add model…), Motions ▸ (moments, Vibes ▸, Expressions ▸, Add motions…, Reload), Size ▸ (Small, Medium, Large), Always on top, Open pet folder, About YDCP…, Quit. Size, always-on-top and the chosen model are remembered.
- Built-in moments, written as code so no files are needed: Wave, Peace and Shy. She does one now and then, and when poked, with a speech bubble.
- Motion library: any `.vrma` in `~/.ydcp/anims/` appears in the menu; optional `motions.json` sets name, face, line, credit, trim (e.g. an opening crouch), speed, loop and hidden. Changes are picked up without a restart.
- Model profiles (`<model>.json` next to the model): name, credit, size, face mapping and per-motion arm fixes.
- About YDCP… shows the version, the model's credit and licence (read from the file), and motion credits.
- Click-through: clicks pass through to the apps behind her everywhere except on her body; a small margin around her makes thin parts easy to grab.
- Drag her anywhere; a quick click pokes her (a little hop, a surprised face, then a big smile).
- She comes back where you left her (saved in `~/.ydcp/settings.json`), or to the bottom-right if that screen is gone.
- Her head follows the cursor anywhere on screen, not only over her window.
- Smoother motion: up to 60 frames a second (each frame takes about 1 ms); the click-through pixel check runs about 20 times a second instead of every frame.
- She floats on the desktop: a transparent, frameless, always-on-top window on every Space, with no Dock or taskbar icon. She appears at the bottom-right of the main screen.
- Built-in vibe loops (idle, sway, bop, sleepy) that cross-fade, a head that follows the cursor, a soft smile and blinks. They work on any VRM 0.x or 1.0 model, with no motion files needed.
- Models load from `~/.ydcp/models/` (Windows: `%USERPROFILE%\.ydcp\models\`). Only plain `.vrm` file names inside that folder can be read, up to 100 MB. With no model, a card shows where to put one.
- A menu bar / notification-area icon with Quit.
- Project setup: Tauri 2 + Vite app shell for macOS and Windows, original app icon.
- CI on macOS and Windows: lint, tests, Rust format/clippy/tests, dependency audits, and version and privacy checks.
- Release workflow: one tag builds macOS (universal) and Windows (x64, ARM64) into one draft release with checksums.
- MIT licence, README, contributing guide, code of conduct, security policy, issue and PR templates.
