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

To see what any VRM models have and lack, without opening the app (the files stay where they are, and models are never added to the repo):

```bash
npm run check:models -- ~/.ydcp/models
```

Two dev pages run YDCP in a normal browser tab after `npx vite`. Put test models in `dev/models/` first; that folder is git-ignored.

- `http://localhost:1420/dev/pose.html?model=<name>`: the pose lab, for trying and tuning motions. Add `&raf=timer` to keep it animating in a background tab.
- `http://localhost:1420/dev/app.html?model=<name>`: the real front end, with its cards, with the Rust side faked. From the console, `__app.pick('aboutModel')` or `__app.pick('outfit', 'hat01')` acts like a menu pick, and `__app.emit('cursor', { x: 300, y: 100, inside: true })` moves the cursor she sees. `&raf=timer` works here too.

## Translations

YDCP speaks English, Japanese (`ja`), Simplified Chinese (`zh-Hans`) and Traditional Chinese (`zh-Hant`). All its words, from the menu (Rust) to the cards and her lines (front end), are in `src/locales/<code>.json`, one file per language with the same keys.

- **Fixing a translation:** edit the value in that language's file. Keep `{placeholders}` exactly as they are; `npm test` checks them.
- **Adding a language:** copy `en.json` to `src/locales/<code>.json` and translate every value. Then add it to `TABLES` in `src/i18n.js`, and to `LANGUAGES` and `tables()` in `src-tauri/src/i18n.rs` with its own name (e.g. `("ko", "한국어")`). Map its system locales in `from_locale`.
- Her lines (`lines.*`) are lists. Any number of lines works, but keep her voice: warm, short, a little playful.
- Model names, expression names and file names are never translated.

## Project layout

| Path | What's there |
|---|---|
| `src/` | The front end (three.js + three-vrm): rendering, motions, moods |
| `src-tauri/` | The Rust app: window, tray menu, file access, click-through |
| `src-tauri/capabilities/` | What the front end may ask the app to do; keep it minimal |
| `scripts/` | Version, privacy, release-notes and checksum helpers used by CI |
| `src/locales/` | Every word YDCP shows, one file per language (see Translations) |
| `tests/` | JavaScript unit tests (Vitest) |
| `dev/` | Dev-only pages (pose lab, app in a browser); never shipped |
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
4. The **Release** workflow builds macOS (universal) and Windows (x64, ARM64) into **one draft release** with `SHA256SUMS-*.txt` files, plus the agent-link hook scripts (`ydcp-state.sh`, `ydcp-state.ps1`) that the Claude Code hooks guide downloads. If any build fails, nothing is published.
5. Download the draft's files, install them on macOS and Windows, and run through the manual checklist in [docs/PLAN.md §11](docs/PLAN.md#11-testing).
6. Press **Publish**. For a test build, either tick **Set as a pre-release** when publishing, or use a numeric pre-release version such as `0.1.0-1`, which is marked as a pre-release automatically. Names like `0.1.0-beta.1` don't work: Windows MSI installers only accept numeric pre-releases, and `npm run check:version` rejects them.

Once Windows signing is set up (below), step 4 pauses on each Windows build until you approve its signing requests in SignPath: two per build (the app, then the installers), so four per release. Each one waits up to 2 hours.

### Windows code signing (SignPath Foundation)

Windows builds are signed for free through [SignPath Foundation](https://signpath.org/), which signs open-source projects. macOS stays unsigned. The release workflow is already wired for it, and it stays unsigned until the settings below exist. The policy users see is [docs/code-signing.md](docs/code-signing.md).

**Before applying:** the repository must be public, with at least one published release. Turn on two-factor authentication on GitHub.

1. Apply at [signpath.org](https://signpath.org/) with the repository link. Their conditions are at [signpath.org/terms](https://signpath.org/terms).
2. Once approved, in SignPath:
   - Note the **organization ID**, and create (or check) the project with the slug `ydcp`, linked to this GitHub repository as a trusted build system.
   - Make sure it has the signing policies `test-signing` and `release-signing`. Release signing needs an approver: you.
   - Create two **artifact configurations**:

     `app`, for the app on its own (the GitHub artifact is a zip with `ydcp.exe` in it):
     ```xml
     <?xml version="1.0" encoding="utf-8"?>
     <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
       <zip-file>
         <pe-file path="ydcp.exe" product-name="YDCP">
           <authenticode-sign/>
         </pe-file>
       </zip-file>
     </artifact-configuration>
     ```

     `installers`, for the installers built from the signed app:
     ```xml
     <?xml version="1.0" encoding="utf-8"?>
     <artifact-configuration xmlns="http://signpath.io/artifact-configuration/v1">
       <zip-file>
         <pe-file path="*-setup.exe" max-matches="1" product-name="YDCP">
           <authenticode-sign/>
         </pe-file>
         <msi-file path="*.msi" min-matches="0" max-matches="1">
           <authenticode-sign/>
         </msi-file>
       </zip-file>
     </artifact-configuration>
     ```
   - Create a **CI user** with the *Submitter* role on the project, and copy its API token.
3. In GitHub, go to **Settings → Secrets and variables → Actions** and add:
   - the secret `SIGNPATH_API_TOKEN`: the CI user's token
   - the variable `SIGNPATH_ORGANIZATION_ID`
   - the variable `SIGNPATH_PROJECT_SLUG`, only if the slug isn't `ydcp`
4. Run the **Release** workflow by hand (**Actions → Release → Run workflow**). It signs with SignPath's test certificate, with no approval needed, which proves the setup works. Then tag a release as usual.
5. Change the **Status** line at the top of [docs/code-signing.md](docs/code-signing.md), and the "aren't code-signed yet" lines in the README and [docs/install-windows.md](docs/install-windows.md).

SignPath Foundation's conditions to keep in mind: every release is approved by hand; only code from this repository is signed; YDCP stays MIT with no proprietary parts; and the "Code signing policy" link stays on the README and on every release page.
