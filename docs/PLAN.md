# YDCP: Your Desktop Companion Project, product and implementation plan

> **Name: YDCP, Your Desktop Companion Project.** App name `YDCP`, repo `ydcp`, data folder `~/.ydcp/`.
> **Decision:** YDCP is released **without any model**. Users add their own VRM model; see the [README](../README.md).

A free, open-source desktop pet for **macOS and Windows**. A 3D VRM character floats on your desktop with a transparent background and stays on top of other windows. Clicks pass through to the apps behind her except on her body. She vibes, does cute moments, reacts to pokes, and gets sleepy when you're away.

She can **optionally** react to an AI coding agent, such as cheering when a task finishes, through a tiny local file that any agent or script can write. People who don't use AI agents never need that part.

- **Privacy promise:** no accounts, no network, no telemetry, no auto-updater, no open ports, no special OS permissions.
- **Status:** plan; the browser-pane prototype exists (Appendix A)
- **Platforms:** macOS 13+ (Apple Silicon and Intel, as one universal build) and Windows 10/11 (x64 and ARM64). **Every version is released for both together from one tag** (§10). Linux is not planned for v1.

---

## 1. Product goals

**For users**
- Install from GitHub Releases: a `.dmg` on Mac, a `-setup.exe` on Windows. No admin rights needed on Windows.
- **First launch asks for a model.** No model is bundled. A welcome card shows how to add your own `.vrm`, including converting a VRChat avatar (README). Built-in motions work as soon as a model is added.
- **Choose freely:** any `.vrm` model and any `.vrma` motion, switched from the menu without a restart.
- **Optional agent link:** **off by default**. Users switch it to On (or Auto) from the menu. While it's off, nothing is watched.
- Small and light: under 1–3% CPU when idle, and roughly 15 MB to download (Tauri, not Electron).

**For you and contributors**
- MIT-licensed code, a clear repo, docs for `motions.json`, model profiles and the agent-link file.
- One tag builds, checksums and publishes both platforms; a human reviews the draft release before publishing.
- Nothing in the repo that we don't have the right to share (§3).

**Non-goals for v1:** App Store or Microsoft Store, Linux, voice or lip sync, any built-in AI, cloud features, accounts, analytics.

---

## 2. Name, branding and trademarks

- **Don't use "Claude", "Anthropic", Clawd, or Anthropic logos or art** in the app name, icon, repo name or screenshots. Anthropic's trademark guidelines allow use of their marks only with prior approval and forbid implying sponsorship or affiliation. The prototype's "Claude Pet" name and the Clawd model stay private.
- **Mentioning Claude Code as one integration:** keep it factual and secondary in the docs, for example "Integrations: Claude Code hooks, or any script", with this disclaimer:
  > YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic. Claude and Claude Code are trademarks of Anthropic, PBC.
- If you want the integration named more prominently, ask Anthropic first (the guidelines point to marketing@anthropic.com).
- **Name check before going public:** GitHub org and repo free, no conflicting app or trademark in app stores or common trademark registries, and a domain if you want one. Candidate names are in §16.
- **Icon:** an original monochrome menu bar or tray icon plus a colour app icon, made by you or CC0. Never derived from someone else's character.
- Not legal advice. For anything unclear, ask before launch.

---

## 3. What ships vs what users bring

| Content | Ships in repo/app? | Licence | Notes |
|---|---|---|---|
| App code (Rust, JS) | ✅ | MIT | Ours |
| Built-in vibe loops (idle, sway, bop, sleepy) | ✅ | MIT | Generated in code (`makeLoops`), ours |
| **Built-in moments** (wave, peace, shy) | ✅ | MIT | **New:** written in code from curves, like the vibe loops; no third-party files (§6.3) |
| App icon, tray icon, UI art | ✅ | MIT or CC0 | Original |
| Default VRM model | ❌ **decided: none** | — | Users bring their own model (VRoid Studio, VRoid Hub, BOOTH, or a converted VRChat avatar whose terms allow it). See the README |
| VRoid VRMA_MotionPack (BOOTH 5512385) | ❌ | Free, **no redistribution** | Users download from BOOTH; we ship a `motions.json` preset for those files (the preset is our text, not their files) |
| BOOTH models | ❌ | Per model | Users add their own; never in the repo, screenshots or GIFs unless the model's terms allow |
| README screenshots and GIFs | ✅ | — | Only with a CC0 model or your own VRoid model |

`.gitignore` blocks `*.vrm` and `*.vrma` everywhere. No model or motion file is ever committed.

---

## 4. Architecture

```
┌──── OPTIONAL: agent hook (Claude Code hooks, a Claude desktop mod, any script) ──┐
│ writes ~/.ydcp/state.json   e.g. {"mood":"done"}                           │
└──────────────────────────────────────┬───────────────────────────────────────┘
                                       │ local file only — may not exist
┌──────────────────────────────────────▼──────────────────────── YDCP ──────┐
│ Rust (src-tauri) — same code for macOS and Windows                           │
│  • watch.rs   state.json (only while the agent link is on); models/, anims/  │
│  • cursor.rs  global cursor position ~20×/s → "cursor" (window-local px)     │
│  • window     set_ignore_cursor_events on/off (click-through)                │
│  • tray.rs    menu bar (mac) / notification-area (Windows) icon + menu       │
│  • assets.rs  list/read/add models & motions — only inside ~/.ydcp/       │
│                                                                              │
│ WebView (src/) — Vite bundle, no remote code (WKWebView on mac, WebView2 win)│
│  • pet.js     three.js + three-vrm render loop, faces, cursor-follow         │
│  • moves.js   built-in loops + built-in moments (generated, ours)            │
│  • library.js model switching, motion list, motions.json, model profiles     │
│  • fixes.js   clearArms / trim, from settings not hard-coded                 │
│  • mood.js    standalone mood (timers, cursor idle) + optional agent mood    │
│  • hit.js     1-pixel alpha test under the cursor → click-through on/off     │
│  • bridge.js  Tauri events and commands                                      │
└──────────────────────────────────────────────────────────────────────────────┘
```

**Data folder:** `~/.ydcp/` on both OS (`%USERPROFILE%\.ydcp\` on Windows). It's simple for hooks and friends to find, the same everywhere, and "Open pet folder" in the menu shows it.
```
~/.ydcp/
├── settings.json           model, size, position per monitor, always-on-top, agentLink
├── state.json              OPTIONAL — written by an agent hook
├── models/  *.vrm  (+ optional <name>.json profile)
└── anims/   *.vrma (+ optional motions.json)
```

---

## 5. First-run experience

1. The app opens with a small welcome card next to the tray icon. It explains how to drag her, click her, and where the menu is.
2. **Model (none is bundled):** the card shows:
   - "Add a model (.vrm)…", which opens a file picker and copies the file into `~/.ydcp/models/`.
   - "I have a VRChat avatar", which opens the README section on checking for a VRM version or converting one, and on licence rules.
   - Links to make a free model in VRoid Studio or find one on VRoid Hub or BOOTH, opened in the browser only when clicked.
   - A reminder to check the model's terms.
   - It also accepts a `.vrm` dragged onto the card.
   - Until a model is added, only the card and the tray icon are shown.
3. **Motions:** the built-in loops and moments work right away. A "Get more motions" link opens the docs page explaining the VRoid pack, plus a ready-made preset file.
4. **Agent link:** nothing asked. It's **off** by default. Users who want it pick Menu → React to agent → On (or Auto). The docs explain how to set up a hook.

---

## 6. Features and implementation

### 6.1 Transparent floating window
`tauri.conf.json` (key parts):
```json
{
  "productName": "YDCP",
  "identifier": "io.github.ryanlow1111.ydcp",
  "app": {
    "macOSPrivateApi": true,
    "windows": [{
      "label": "pet", "width": 320, "height": 480,
      "transparent": true, "decorations": false, "shadow": false,
      "alwaysOnTop": true, "visibleOnAllWorkspaces": true,
      "skipTaskbar": true, "resizable": false, "focus": false
    }],
    "security": {
      "csp": "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' blob: data:; connect-src 'self' ipc: http://ipc.localhost blob: data:"
    }
  },
  "bundle": {
    "active": true,
    "targets": ["dmg", "app", "nsis", "msi"],
    "windows": { "nsis": { "installMode": "currentUser" }, "webviewInstallMode": { "type": "downloadBootstrapper" } }
  }
}
```
- **macOS:** `ActivationPolicy::Accessory` (no Dock icon). `macOSPrivateApi` is needed for transparency, which rules out the App Store (a non-goal).
- **Windows:** WebView2 with a transparent background, `skipTaskbar`, and the tray icon in the notification area. On Windows 11, check for a 1 px border and fix it with `shadow: false` and the window-effects settings.
- **Renderer:** `WebGLRenderer({ alpha: true, premultipliedAlpha: true })` with `setClearColor(0, 0)`. The window shows only her and the speech bubble.
- **WebView2 runtime:** preinstalled on Windows 11 and current Windows 10. The bootstrapper only contacts Microsoft at install time, and only if it's missing (noted in the privacy section of the README).

### 6.2 Click-through, drag, poke, position
- `cursor.rs` polls the cursor every 50 ms (no OS permission on either platform). It converts to window-local logical px with the window's scale factor, which handles per-monitor DPI on Windows and Retina on Mac.
- `hit.js` reads 1–5 pixels of alpha at the cursor right after each render. When "solid" changes, it calls `set_click_through`, which sets `set_ignore_cursor_events`.
- **Drag vs poke:**
  - Moving more than 4 px after `pointerdown` is a drag: `startDragging()`.
  - Releasing in under 250 ms without moving is a poke: a random moment plus its line.
- The cursor feed also drives her head following the cursor anywhere on screen.
- **Position:** saved per monitor in `settings.json`. If she's off-screen (for example a monitor was unplugged), she moves to the bottom-right of the main screen.

### 6.3 Motions: built-in and user library
**Built-in, ours (MIT), no files needed:**
- **Vibe loops:** idle, sway, bop, sleepy. Already written; the bop has the 100 BPM pulse and follow-through.
- **New moments written as code clips** (same `sampledClip` approach). **Set:** wave hello, peace sign beside the cheek, shy. Hands are placed by where they should be, relative to her measured face and body (`body.js`), and solved for each model, so they fit any proportions.
- - **Faces:** happy, angry, relaxed, surprised, sad, blink. Bang-style moments use angry.

**User library:** any `.vrma` in `anims/` appears in the Motions menu and is watched for changes. `motions.json` is optional:
```json
{
  "VRMA_02.vrma": { "id": "greeting", "name": "Greeting", "face": "happy", "line": "Hehe~ hi hi!", "trim": "crouch" },
  "VRMA_03.vrma": { "id": "peace", "name": "Peace sign", "line": "Peace! ✌️", "onDone": true },
  "VRMA_04.vrma": { "id": "shoot", "name": "Bang!", "face": "angry", "line": "Hmph! Bang!! 💢" },
  "VRMA_05.vrma": { "hidden": true },
  "my-dance.vrma": { "name": "Little dance", "loop": true }
}
```
| Field | Meaning | Default |
|---|---|---|
| `id` | Stable name, used by model profiles | file name |
| `name` | Menu label | tidied file name |
| `face` | Expression while playing | `happy` |
| `line` | Said when she does it (a poke, the menu, the agent cheer) | none |
| `random` | Joins her own and poke moments | `true` |
| `onDone` | The cheer when an agent finishes | built-in Peace |
| `loop` | Plays as a vibe loop | `false` |
| `trim` | `"crouch"` or `{ "start": s, "end": s }` | none |
| `speed` | Playback speed | `1` |
| `hidden` | Ignore this file | `false` |

- **Preset:** `docs/presets/vroid-motion-pack.motions.json` is a ready-made file for users who download the VRoid pack themselves. It has the tuned names, faces, lines and the crouch trim.
- **Formats:** `.vrma` only. FBX and Mixamo files must be converted first (docs link to tools).

### 6.4 Models and per-model profiles
- **Models menu:** every `.vrm` in `models/` plus "Add model…", which copies the file in. Works with VRM 0.x and 1.0.
- **Switching** (no restart):
  1. Dispose the old model (`VRMUtils.deepDispose`) and its clips.
  2. Load the new one with `rotateVRM0` and the holder group, and set `pitchSign` from the meta version.
  3. Rebuild the loops and clips, apply the profile fixes, and refit the camera.
- **Optional profile** (`models/<name>.json`):
```json
{
  "name": "My Model", "credit": "Model by …", "scale": 1.0,
  "faces": { "angry": "Angry_Custom" },
  "motionFixes": {
    "greeting": { "clearArms": { "lift": 0.7, "forward": 0.3 } },
    "peace": { "clearArms": { "pose": { "upper": [0.8, 0, -0.8], "lower": [0, 1.8, 0] } } }
  }
}
```
- **No profile means no arm fixes**, so motions play as made. The fixes we tuned for big-headed models are documented as an example.
- **Name and credit:** they default to the VRM meta (title and author) and show in About….
- **Licence display:** About… shows the model's licence fields from its VRM meta, for example "Redistribution: not allowed". The app never uploads or shares models.
- **Safety:**
  - Files over 100 MB (model) or 20 MB (motion) are refused.
  - Loading runs in try/catch; a broken file shows a note in the menu, not a crash.

### 6.5 Menu (mac menu bar / Windows notification area)
- Show / Hide
- **Models ▸** list (current ticked), Add model…
- **Motions ▸**
  - Moments: built-in, then library
  - Vibes ✓
  - Expressions ▸
  - Add motions…
  - Reload
- **Size ▸** Small / Medium / Large
- Always on top ✓
- **React to agent ▸** Off (default) / On / Auto. Under On and Auto it shows "(no agent found)" while there's no `state.json`.
- Open pet folder
- About… (version, licence, credits for the model and motions, privacy statement, project link)
- Quit

### 6.6 Mood: standalone first, agent optional
- **Standalone:**
  - Calm by default (changed after beta feedback: constant motion was distracting): she stays on Idle, and moments only play on a poke, from the menu, or as a greeting. Vibes → Auto (drift) rotates loops every 20–40 s. Musings every 70–160 s.
  - She gets sleepy after 10 minutes with no cursor movement and wakes when it moves or on a poke.
  - She greets you on launch and when she wakes.
- **`agentLink`:**
  - `off` (**default**): never read it. A new user's YDCP never touches `state.json`.
  - `on`: always watch.
  - `auto`: watch only if `state.json` exists. Handy for people who switch agents on and off.
- **Agent moods** are layered on standalone mood:
  - `done` → cheer (the `onDone` motion plus a line).
  - `sleepy` → sleepy.
  - Other moods → keep vibing.
  - A file that hasn't changed in 30 minutes is ignored.

### 6.7 Performance
- **Frame rate:** 60 fps by default, with a menu option for 30; 15 fps while she dozes. `setPixelRatio(min(dpr, 2))`. A frame is only requested when one is due: requesting every display refresh and skipping kept WebKit's display timer running, which cost about 10% of a core with nothing drawn.
- **Pausing:** she isn't drawn while hidden.
- **Measured** (release build, M1, Medium window, a VRM 0.x test model, % of one CPU core, app plus its WebKit processes): window not shown 0, 15 fps (the dozing rate, measured with a build flag) about 9, 30 fps about 22, 60 fps about 30.
- **Original target missed:** the plan's "under about 3%" isn't reachable while she animates. Turning off hair physics or antialiasing changed almost nothing (about 29% either way), so the cost is WebKit presenting each frame, not her model. Revisit if it matters: a native renderer would be a much larger project.
- **Still unmeasured:** memory after 10 model switches, Large size, Windows.

---

## 7. Agent-link contract and integrations

`~/.ydcp/state.json`, read-only for the app.

Minimum:
```json
{ "mood": "done" }
```
Optional fields: `"line": "string"` (said in her bubble) and `"at": <ms epoch>`. Unknown fields are ignored. Moods: `idle`, `working`, `done`, `failed`, `sleepy`.

**Integrations in `integrations/`, each with a short README:**
- **`claude-code-hooks/`:** standard Claude Code hooks in `settings.json`. A `Stop` hook writes `{"mood":"done"}`, and `UserPromptSubmit` writes `{"mood":"working"}`. It has macOS/Linux `sh` and Windows PowerShell versions, for example:
  - mac: `printf '{"mood":"done"}' > ~/.ydcp/state.json`
  - Windows: `Set-Content "$env:USERPROFILE\.ydcp\state.json" '{"mood":"done"}'`
- **`claude-desktop-mod/`:** the existing prototype mod (`clawd-pet/hooks/register.ts`), changed to write `~/.ydcp/state.json`, for Claude desktop users who use mods.
- **`generic/`:** examples for "build finished", "tests passed", or other agents' hooks.
- All integrations carry the trademark disclaimer (§2).

---

## 8. Privacy and security

**Privacy (stated in the README and About…)**
| Promise | Enforced by |
|---|---|
| No network at runtime | CSP allows only the app's own files and IPC; no HTTP plugin; no remote URLs in code; libraries bundled. A CI check fails the build if `http(s)://` appears in `src/` outside comments or links |
| No telemetry, no auto-updater | Neither plugin; dependency review on each PR |
| No open ports | No server; file watch only |
| Least file access | Commands only touch `~/.ydcp/`; names validated (no `/`, `\`, `..`; allowed extensions); size caps |
| Least permissions | `capabilities/default.json`: `core:event:default`, `core:window:allow-start-dragging`, `core:window:allow-set-size`, `window-state:default`, `dialog:allow-open`, `opener:allow-reveal-item-in-dir` (pet folder only), `opener:allow-open-url` (fixed docs and project links only) |
| No special OS permissions | No Input Monitoring, Accessibility, Screen Recording, Camera or Mic, on either OS |
| No shell | No shell plugin |

Install-time note: on Windows, if WebView2 is missing, the installer downloads it from Microsoft once.

**Security process**
- `SECURITY.md`: private reporting via GitHub Security Advisories.
- Dependabot for npm, Cargo and Actions. `cargo audit` and `npm audit` run in CI.
- Release artifacts get `SHA256SUMS-*.txt` files and GitHub build-provenance attestations (`actions/attest-build-provenance`).
- Actions are pinned to commit SHAs. The release workflow has the minimum token permissions.

---

## 9. Repository layout

```
ydcp/
├── README.md               what it is, GIF (CC0/own model), install for mac & Windows, privacy, FAQ
├── LICENSE                 MIT
├── CONTRIBUTING.md         dev setup (Rust, Node), how to run, PR checklist, asset rules
├── CODE_OF_CONDUCT.md      Contributor Covenant
├── SECURITY.md
├── CHANGELOG.md            Keep a Changelog, SemVer
├── docs/
│   ├── install-macos.md    incl. opening an unsigned app (§10.3)
│   ├── install-windows.md  incl. SmartScreen note
│   ├── models.md           finding/making models, licences, profiles
│   ├── motions.md          motions.json reference, VRoid pack how-to
│   ├── agent-link.md       state.json contract + integrations
│   └── presets/vroid-motion-pack.motions.json
├── integrations/           claude-code-hooks/, claude-desktop-mod/, generic/
├── src/                    pet.js, moves.js, library.js, fixes.js, mood.js, hit.js, bridge.js, main.js
├── src-tauri/              Cargo.toml, tauri.conf.json, capabilities/, icons/, src/*.rs
├── tests/                  Vitest (JS)
├── .github/
│   ├── workflows/ci.yml        lint, tests, cargo check/clippy on macOS + Windows, privacy grep
│   ├── workflows/release.yml   tag → build mac + Windows → one draft release (§10)
│   ├── ISSUE_TEMPLATE/         bug (OS, version, model type), feature
│   ├── PULL_REQUEST_TEMPLATE.md
│   └── dependabot.yml
└── .gitignore              node_modules, target, *.vrm, *.vrma
```

---

## 10. Build and release: macOS and Windows together

### 10.1 Rule
- **One tag, one release, both platforms.** Pushing `v0.1.0` starts `release.yml`.
- **Both or neither:** if either platform fails, nothing is published. The draft stays, and you fix it and re-run.
- **Version** comes from `package.json` = `tauri.conf.json` = `Cargo.toml`. A CI check fails if they differ.

### 10.2 `release.yml` (outline)
```yaml
on: { push: { tags: ['v*'] } }
permissions: { contents: write, id-token: write, attestations: write }
jobs:
  build:
    strategy:
      fail-fast: true
      matrix:
        include:
          - os: macos-latest
            args: --target universal-apple-darwin      # Apple Silicon + Intel in one .dmg
          - os: windows-latest
            args: --target x86_64-pc-windows-msvc
          - os: windows-latest
            args: --target aarch64-pc-windows-msvc     # Windows on ARM (and Parallels/UTM on Mac)
    runs-on: ${{ matrix.os }}
    steps:
      - checkout; setup Node; setup Rust (+ targets); npm ci
      - uses: tauri-apps/tauri-action@<pinned-sha>
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          # macOS signing/notarization — optional; empty = unsigned build (§10.3)
          APPLE_CERTIFICATE: ${{ secrets.APPLE_CERTIFICATE }}
          APPLE_CERTIFICATE_PASSWORD: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
          APPLE_SIGNING_IDENTITY: ${{ secrets.APPLE_SIGNING_IDENTITY }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_PASSWORD: ${{ secrets.APPLE_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
        with:
          tagName: v__VERSION__
          releaseName: YDCP v__VERSION__
          releaseDraft: true          # you review, then publish both at once
          args: ${{ matrix.args }}
      - attest build provenance for the artifacts
  checksums:
    needs: build                       # runs only if every platform built
    # (actual workflow: .github/workflows/release.yml — a `draft` job creates the release first,
    #  each build job uploads its installers + its own SHA256SUMS-<platform>.txt to it)
```
- **Release assets:**
  - `YDCP_<v>_universal.dmg`
  - `YDCP_<v>_x64-setup.exe` and `.msi`
  - `YDCP_<v>_arm64-setup.exe` (MSI can't target ARM64)
  - `SHA256SUMS-macos-universal.txt`, `SHA256SUMS-windows-x64.txt`, `SHA256SUMS-windows-arm64.txt`
- **Release notes:** taken from `CHANGELOG.md`, plus a short "How to install" block per OS and the privacy line.
- **Publish:** you test both builds from the draft (§13), then press Publish once. Both platforms go live together.

### 10.3 Code signing (costs and options)
**Decided:** start unsigned. One extra step for the Mac build: **ad-hoc sign** it by setting `"bundle": { "macOS": { "signingIdentity": "-" } }`, used only when no Apple certificate secret is set. Apple Silicon Macs refuse fully unsigned apps, often with a misleading "app is damaged" message. An ad-hoc signature costs nothing and changes this to the normal "Open Anyway" flow.

| | Unsigned (free, start here) | Signed |
|---|---|---|
| **macOS** | Gatekeeper blocks the first open. User goes to System Settings → Privacy & Security → "Open Anyway", or runs `xattr -dr com.apple.quarantine /Applications/YDCP.app`. Documented in `docs/install-macos.md` | Apple Developer Program (about US$99/year) → Developer ID signing + notarization in CI with the secrets above. No warning |
| **Windows** | SmartScreen shows "Windows protected your PC" → More info → Run anyway. Documented in `docs/install-windows.md` | **SignPath Foundation: free for OSI-licensed open-source projects** with automated public builds; apply once the repo is public. Or a paid certificate or Azure Artifact Signing |

**Plan:** v0.1 ships unsigned with clear docs (fine for friends). Apply to SignPath after the repo is public. Decide on the Apple account if the Mac audience grows.

### 10.4 Updates
- No auto-updater, to keep the privacy promise. About… shows the version and a "Releases page" link, opened only when clicked.
- People can "Watch → Releases" on GitHub.
- Optional later: an opt-in "Check for updates" button that calls the GitHub API once per click. Off by default.

---

## 11. Testing

- **CI on every PR** (macOS + Windows runners): ESLint, Vitest, `cargo clippy`, `cargo test`, `tauri build --debug` (compile only), the privacy grep, and the version-match check.
- **Unit tests:**
  - Rust: name validation (`../x.vrm`, `a\b.vrm`, wrong extension, too big), state JSON (good, partial, garbage, stale), settings read/write.
  - JS: `motions.json` defaults merge, profile defaults (no profile means no fixes), agent link modes, built-in clip generation (no NaN, loops join smoothly).
- **Manual release checklist,** on both OS:
  1. Fresh install from the draft release.
  2. First-run card appears.
  3. Add a model and switch it.
  4. Drop in a `.vrma`; it appears in the menu.
  5. Click-through works on empty space.
  6. Drag her, quit, relaunch: she's in the same spot.
  7. Sleepy after 10 minutes and wakes on a cursor move.
  8. With a fresh install the agent link is Off: writing `state.json` does nothing. Switch it On: a hook makes her cheer.
  9. Multi-monitor and DPI 100%/150%.
  10. Uninstall leaves only `~/.ydcp/` (documented).
- **Windows testing from your Mac:** run the ARM64 build in Windows 11 on UTM or Parallels. Before a public release, also get a friend with a real x64 Windows PC to test (beta group, §14).
- **Privacy check per release:** no listening ports, and no outbound connections after launch (Little Snitch or `nettop` on Mac; Resource Monitor → Network on Windows).

---

## 12. Milestones

| # | Milestone | Done when |
|---|---|---|
| M0 | Repo + setup | Public-ready skeleton (§9), MIT licence, CI green on mac + Windows with an empty app |
| M1 | Floating window | She renders transparent and always on top on **both** OS; no Dock or taskbar icon |
| M2 | Click-through, drag, poke, position | §6.2 works on both OS, including Windows DPI 150% |
| M3 | Built-in moves + model/motion library + menu | §6.3–6.5; works with an empty `anims/` |
| M4 | Mood + optional agent link + integrations | §6.6–7; one-hour standalone run; hooks examples tested on both OS |
| M5 | Release pipeline | §10: tag → draft with mac + Windows + checksums; install docs |
| **v0.1.0** | **Friends beta** | Unsigned, both OS, released together; checklist §11 passed |
| M6 | Polish from feedback | Performance targets, bug fixes, README GIF |
| **v0.2.0** | **Public launch** | Name check done, Windows signed via SignPath if approved, docs complete, announcement |

Rough size: M0–M2 about 2 sessions, M3 about 1–2, M4 about 1, M5 about 1.

---

## 13. Launch checklist (public)

- [ ] Name check done (§2), no Anthropic or other trademarks in the name, icon or screenshots
- [ ] README: GIF with a CC0 or own model, install steps for both OS, privacy promise, disclaimer
- [ ] LICENSE (MIT), CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, CHANGELOG
- [ ] No `.vrm` or `.vrma` in git history (check with `git log --all -- '*.vrm' '*.vrma'`)
- [ ] No model bundled; the README "Add your model" section was tested by a friend from a fresh install, including one VRChat avatar conversion
- [ ] Release built from a tag by CI (not locally), checksums and attestations attached
- [ ] Both OS tested from the draft; then published together
- [ ] Optional: SignPath application, Apple Developer account, a short demo video

---

## 14. Sharing with friends (before public)

The repo starts **private on your personal GitHub account**. Each beta build comes from the same CI release (§10), never a build from your laptop, so friends get the exact files you tested.

**Option A: GitHub (for friends with a GitHub account)**
- Add them as collaborators with read access (**Settings → Collaborators**); a free personal account allows this for private repos.
- Publish the beta as a **pre-release** (tick "Set as a pre-release"). They download from the Releases page and can open issues for feedback.

**Option B: Google Drive (for everyone else)**
1. From the draft or pre-release, download: `YDCP_<v>_universal.dmg`, `YDCP_<v>_x64-setup.exe`, `YDCP_<v>_arm64-setup.exe`, the `SHA256SUMS-*.txt` files, and the install guide (`docs/install-macos.md`, `docs/install-windows.md`, or a PDF of the README "Download and install" and "Add your model" sections).
2. Put them in a Drive folder named for the version, for example `YDCP v0.1.0 beta`. Keep each version in its own folder.
3. Share the folder **with specific people** (their emails), not "Anyone with the link". Unsigned installers passed around publicly are the kind of file people (and Google) get suspicious of.
4. Send the **SHA256 checksums in a separate message** (chat or email), so friends can check the download wasn't changed:
   - macOS: `shasum -a 256 ~/Downloads/YDCP_*_universal.dmg`
   - Windows (PowerShell): `Get-FileHash $HOME\Downloads\YDCP_*_x64-setup.exe`
5. In the message, tell them what to expect: the macOS "Open Anyway" step, and on Windows **More info → Run anyway**. Also remind them they need their own `.vrm` model (README "Add your model").

**Notes**
- Our files are about 10–20 MB, under the size where Drive shows its "can't scan for viruses" warning. Drive may still show a generic warning for `.exe` files; that's normal for unsigned software.
- Downloading from Drive (or anywhere in a browser) marks the files as "from the internet". That's what triggers Gatekeeper and SmartScreen, the same as GitHub; the install docs cover it.
- If a friend's antivirus flags the unsigned installer, offer the `.msi` instead, or ask them to report it as a false positive. Once SignPath signing is in place (after going public), this mostly goes away.
- Avoid chat apps for the installers: Discord, WhatsApp and similar often compress, rename or block `.exe` files, or have small size limits.

**Feedback:** an issue template, or a simple form for non-GitHub friends: OS and version, model source (no model files attached), what happened, and a screenshot.

Make the repo public at v0.2.0 after the launch checklist (§13).

---

## 15. Risks

| Risk | Impact | Plan |
|---|---|---|
| macOS private transparency API changes | Opaque background | Check in M1; fallback `tauri-nspanel` or a masked window |
| Windows transparent window quirks (border, black flash on start) | Looks broken | Test in M1 on Windows 11; show the window only after the first frame renders |
| Unsigned builds scare users | Fewer installs | Clear install docs; SignPath for Windows; Apple account later |
| Trademark complaint | Forced rename | Neutral name, disclaimer, no Anthropic art (§2) |
| Someone shares a model or motion they don't have rights to via issues or PRs | Licence problems | CONTRIBUTING asset rules; PR template checkbox; `.gitignore`; remove on report |
| No bundled model, so the first run is harder | Some users give up | A clear welcome card, a step-by-step README with a VRChat section, a troubleshooting table, and the issue template asks which step failed |
| Arm fixes wrong for other models | Odd poses | Fixes only via profiles, off by default |
| Pixel hit-test lag | Edge clicks go to the app behind | Padding; faster poll near the window |
| Cross-platform paths and DPI bugs | Wrong position or hit-test | Logical px everywhere; DPI tests in the checklist |

---

## 16. Open questions

1. ~~Name~~ **Decided:** YDCP, Your Desktop Companion Project. Still do the availability check (§2).
2. ~~GitHub~~ **Decided:** your personal account (repo `ydcp`, private until v0.2.0).
3. ~~Licence~~ **Decided:** MIT.
4. ~~Signing~~ **Decided:** start unsigned (Mac ad-hoc signed, §10.3). Revisit Apple and SignPath after going public.
5. ~~Default model~~ **Decided:** none bundled; users add their own.
6. ~~Built-in moments~~ **Decided:** wave, peace, shy. Cheer and Stretch were built, then removed: they didn't look natural.
7. ~~Agent link default~~ **Decided:** `off`.

All open questions are answered. Next step: **M0, repo setup.**

---

## Appendix A: Porting from the current prototype

The prototype lives in the Claude desktop dev-mods folder (`clawd-pet/`, private, session-only):
- **`web/vrm.js` → `src/pet.js` + `moves.js` + `fixes.js`:**
  - Keep: `sampledClip`, `makeLoops` (idle, sway, 100 BPM bop, sleepy), `CENTRE_LINE`/`pitchSign`, `FOLLOW_BASE` cursor follow, faces and blink, `frameBody`.
  - `raiseArmsClear` and `skipCrouch` become profile and `motions.json`-driven fixes.
  - The tuned peace pose `upper [0.8, 0, -0.8]`, `lower [0, 1.8, 0]` seeds the built-in peace moment.
- **Drop:**
  - The importmap/CDN (replaced by npm + Vite).
  - The Motions panel (replaced by the tray menu).
  - The page title and credit line (moved to About…).
  - The `state.json` polling (replaced by the file watch).
- **`hooks/register.ts`:** moves to `integrations/claude-desktop-mod/`. It writes `~/.ydcp/state.json`, drops the local `python3 http.server` and `/clawd` pane opening, and adds the disclaimer.
- **Never moved into the public repo:** private test models, the VRoid `.vrma` files, the Clawd model and conversion scripts.
