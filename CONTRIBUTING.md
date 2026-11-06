# Contributing to YDCP

Thanks for helping make YDCP better! Bug reports, ideas, docs, motion settings and code are all welcome. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Two rules that matter most

1. **Assets.** Never commit, attach, or link to download a model (`.vrm`), motion (`.vrma`), avatar package, or art you don't have the right to share. Most VRChat and BOOTH models forbid redistribution. The repo's `.gitignore` blocks these files on purpose. For screenshots, use your own VRoid model or a model whose terms allow sharing.
2. **Privacy.** YDCP makes no network requests, has no telemetry, no auto-updater, no open ports, and asks for no special OS permissions. Changes that break this won't be merged. `npm run check:privacy` catches the common cases in CI.

## Set up

You need:
- [Node.js](https://nodejs.org/) 20 or newer
- [Rust](https://rustup.rs/) (stable)
- The [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS: Xcode Command Line Tools on macOS; Microsoft C++ Build Tools and WebView2 on Windows

```bash
git clone https://github.com/ryanlow1111/ydcp.git
cd ydcp
npm install
npm run tauri dev
```

## Checks (run before a pull request)

```bash
npm run check                       # lint, unit tests, version check, privacy check
cd src-tauri
cargo fmt --check
cargo clippy --all-targets -- -D warnings
cargo test
```

CI runs the same checks on macOS and Windows.

## Project layout

| Path | What's there |
|---|---|
| `src/` | The front end (three.js + three-vrm): rendering, motions, moods |
| `src-tauri/` | The Rust app: window, tray menu, file access, click-through |
| `src-tauri/capabilities/` | What the front end may ask the app to do; keep it minimal |
| `scripts/` | Version, privacy, release-notes and checksum helpers used by CI |
| `tests/` | JavaScript unit tests (Vitest) |
| `docs/` | User docs (install, models, motions, agent link) and the project plan |
| `integrations/` | Optional examples for AI agents and scripts |
| `assets/icon/` | The original app icon source (`npx tauri icon assets/icon/app-icon.svg` regenerates all sizes) |

The roadmap and design decisions are in [docs/PLAN.md](docs/PLAN.md).

## Pull requests

- Keep each PR focused on one change. Describe what changed and why, and fill in the checklist.
- Test on the OS you have and say which one. Changes to windows, the tray, click-through or file paths should ideally be tried on both macOS and Windows.
- Update the docs and `CHANGELOG.md` (under **Unreleased**) when users will notice the change.

## Releasing (maintainers)

macOS and Windows are always released together from one tag.

1. Set the new version in `package.json` **and** `src-tauri/Cargo.toml`. `tauri.conf.json` reads it from `package.json`, and `npm run check:version` catches mismatches.
2. Move the **Unreleased** notes in `CHANGELOG.md` under a new `## [X.Y.Z] - YYYY-MM-DD` heading.
3. Commit, then tag and push: `git tag vX.Y.Z && git push origin vX.Y.Z`.
4. The **Release** workflow builds macOS (universal) and Windows (x64, ARM64) into **one draft release** with `SHA256SUMS-*.txt` files. If any build fails, nothing is published.
5. Download the draft's files, install them on macOS and Windows, and run through the manual checklist in [docs/PLAN.md §11](docs/PLAN.md#11-testing).
6. Press **Publish**. Use a pre-release version (for example `0.1.0-beta.1`) for test builds; it's marked as a pre-release automatically.
