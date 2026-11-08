# YDCP: Your Desktop Companion Project

**A free, open-source desktop companion for macOS and Windows.** Your own 3D character stands calmly on your desktop, chats now and then, waves when you come back, reacts when you click her, and gets sleepy when you're away.

<!-- TODO: demo GIF. Record it with your own VRoid model or a model whose terms allow sharing; never a model you can't redistribute. -->

- 🪟 **Floats on your desktop:** no window or background, always on top. Clicks go straight through to your apps except on her.
- 🎭 **Your model, your motions:** bring any VRM model and any `.vrma` motion, and switch between them from the menu.
- 🔒 **Private by design:** no account, no internet, no tracking, no auto-updates. Your files never leave your computer.
- 🤖 **AI agent link (optional):** she can cheer when your AI coding agent or build script finishes. You don't need any AI to use YDCP.

> **YDCP does not include a character model.** You add your own in a few clicks; see [Add your model](#add-your-model).

> 🚧 **Status: in development.** The first beta (v0.1) is on its way. This README describes v0.1; the plan and progress are in [docs/PLAN.md](docs/PLAN.md).

---

## Contents

- [Download and install](#download-and-install)
- [Add your model](#add-your-model)
  - [Where to get a VRM model](#where-to-get-a-vrm-model)
  - [Using a VRChat avatar](#using-a-vrchat-avatar)
  - [Put the model into YDCP](#put-the-model-into-ydcp)
  - [Check the model's terms first](#check-the-models-terms-first)
- [Using YDCP](#using-ydcp)
- [Motions](#motions)
- [AI agent link (optional)](#ai-agent-link-optional)
- [Troubleshooting](#troubleshooting)
- [Your data and uninstalling](#your-data-and-uninstalling)
- [Privacy](#privacy)
- [Build from source](#build-from-source)
- [Contributing](#contributing)
- [Licence and credits](#licence-and-credits)

---

## Download and install

Get the latest version from the **[Releases page](../../releases/latest)**. macOS and Windows are released together, so both always have the same version.

| Your computer | Download |
|---|---|
| Mac (Apple Silicon or Intel) | `YDCP_<version>_universal.dmg` |
| Windows 10/11 (most PCs) | `YDCP_<version>_x64-setup.exe` |
| Windows on ARM (Surface Pro X, Snapdragon laptops, Windows in Parallels/UTM on a Mac) | `YDCP_<version>_arm64-setup.exe` |

You can check your download against the `SHA256SUMS-*.txt` files on the release page. Step-by-step: [macOS](docs/install-macos.md) · [Windows](docs/install-windows.md).

### macOS
1. Open the `.dmg` and drag **YDCP** into **Applications**.
2. Open YDCP. Early versions aren't signed by Apple yet, so macOS may say it "can't be opened" or "cannot verify the developer". Then:
   - Open **System Settings → Privacy & Security**, scroll down, and click **Open Anyway** next to YDCP; or
   - In Terminal, run:
     ```bash
     xattr -dr com.apple.quarantine /Applications/YDCP.app
     ```
3. YDCP has no Dock icon. Look for its icon in the **menu bar** at the top right of your screen.

### Windows
1. Run `YDCP_<version>_x64-setup.exe`. It installs just for you, with no admin rights needed.
2. If Windows shows **"Windows protected your PC"**, click **More info → Run anyway**. This appears because early versions aren't code-signed yet.
3. YDCP has no taskbar button. Look for its icon in the **notification area** at the bottom right; click **^** if it's hidden.
4. YDCP uses Microsoft Edge WebView2. Windows 11 and up-to-date Windows 10 already have it. If not, the installer downloads it once from Microsoft.

---

## Add your model

YDCP shows a **VRM** model (a `.vrm` file). VRM is an open 3D avatar format used by VRoid, VTubing apps and many BOOTH creators. Both **VRM 0.x and VRM 1.0** work.

### Where to get a VRM model

| Source | How | Notes |
|---|---|---|
| **Make your own: [VRoid Studio](https://vroid.com/en/studio)** (free, Mac and Windows) | Design a character → **Export → Export as VRM** | Easiest, and the model is yours |
| **[VRoid Hub](https://hub.vroid.com/en)** | Open a model → **Download** if the creator allows it | Check the model's conditions on its page |
| **[BOOTH](https://booth.pm/en/search/VRM)** | Search "VRM". Many avatars include a `.vrm` file in the download | Read each item's terms (see below) |
| **A VRChat avatar you own** | See [Using a VRChat avatar](#using-a-vrchat-avatar) | You may need to convert it, and only if its terms allow |

### Using a VRChat avatar

VRChat avatars usually come as a **Unity package** (`.unitypackage`) or an `.fbx`, not a `.vrm`. YDCP can't open those directly. There are three ways:

**1. Check if a VRM is already included (best).** Many BOOTH avatars sold for VRChat also include a VRM version. Unzip the download and look for a `.vrm` file, or a folder named `VRM`. Also check the BOOTH page for "VRM" or "VRM対応" (VRM supported). If there is one, skip to [Put the model into YDCP](#put-the-model-into-ydcp).

**2. Convert it in Unity with UniVRM.** For avatars that only come as a Unity package.
1. **Check the terms first** (see [below](#check-the-models-terms-first)). Converting is a modification; many VRChat avatars only allow it if the terms say "VRM conversion OK".
2. Open a Unity project with the avatar, using the Unity version the avatar was made for (VRChat currently uses Unity 2022.3).
3. Import **[UniVRM](https://github.com/vrm-c/UniVRM/releases)**, the official VRM tools for Unity.
4. Make sure the avatar's rig is set to **Humanoid** (select the model `.fbx` → Inspector → **Rig → Animation Type: Humanoid**).
5. Select the avatar in the scene, then use the UniVRM export menu (**VRM0 → Export to VRM 0.x**, or **VRM1 → Export VRM 1.0**).
6. In the export window, fill in the model info: **title, author, and licence/permissions** (copy them from the avatar's terms).
7. Set up **expressions**, so YDCP can show happy, angry, sad, surprised and relaxed faces, plus **blink**. In the VRM expression (BlendShape) settings, link each one to the avatar's matching face shape keys. Without this she'll keep one face.
8. Optional: set up **spring bones** so her hair and skirt sway. VRChat PhysBones don't carry over automatically.

**3. Convert it in Blender.** Use the **[VRM Add-on for Blender](https://vrm-addon-for-blender.info/en/)**:
1. **Check the terms first.**
2. Install the add-on, then **File → Import → FBX** (the avatar's `.fbx`).
3. In the VRM panel, check the **humanoid bone mapping** (most VRChat avatars map automatically), then fill in the **meta** (title, author, licence).
4. Set up the expressions and blink the same way as step 7 above.
5. **File → Export → VRM**.

**What changes after converting a VRChat avatar**
- **Shaders:** VRChat shaders such as Poiyomi or lilToon don't exist in VRM. VRM uses the **MToon** toon shader, so colours and outlines may look a bit different. Adjust MToon settings in Unity or Blender if needed.
- **Physics:** PhysBones don't transfer. Without VRM spring bones, the hair won't sway (the motions still work).
- **Size:** very heavy avatars (more than 100 MB, or many millions of polygons) won't load. Use a lighter "Quest" or optimized version if the avatar has one.
- **Gimmicks:** outfit toggles, particles and other gimmicks don't carry over. Pick the outfit you like before you export.

### Put the model into YDCP

**Easy way:** click the YDCP icon (menu bar on Mac, notification area on Windows) → **Models → Add model…** → choose your `.vrm`. On the first launch you can also drag the `.vrm` onto the welcome card.

**Or copy the file yourself** into the models folder:

| | Models folder |
|---|---|
| macOS | `~/.ydcp/models/` (in Finder: **Go → Go to Folder…** and paste `~/.ydcp/models`) |
| Windows | `%USERPROFILE%\.ydcp\models\` (paste into the File Explorer address bar) |

Or use **Open pet folder** in the YDCP menu. YDCP notices new files by itself, so there's no need to restart.

Then choose it in **Models ▸ your model's name**. YDCP remembers your choice.

<details>
<summary><b>Optional: a profile for your model</b> (custom faces, size, arm fixes)</summary>

Put a JSON file next to the model with the same name, for example `models/my-model.vrm` + `models/my-model.json`:

```json
{
  "name": "My Model",
  "credit": "Model by Someone",
  "scale": 1.0,
  "faces": { "angry": "Angry_Custom" },
  "motionFixes": {
    "peace": { "clearArms": { "pose": { "upper": [0.8, 0, -0.8], "lower": [0, 1.8, 0] } } }
  }
}
```

- `faces`: maps YDCP's faces (`happy`, `angry`, `sad`, `surprised`, `relaxed`, `blink`) to your model's expression names, if it uses custom ones.
- `scale`: makes her bigger or smaller (1.0 = auto fit).
- `motionFixes`: moves the arms during a motion, for models whose big heads or long hair hide their hands. See [docs/models.md](docs/models.md).
- Every field is optional. With no profile, everything uses sensible defaults.
</details>

### Check the model's terms first

Every model has its own terms. Before using, converting or sharing a model, read the terms on its BOOTH, VRoid Hub or creator page and look for:

| Question | Why it matters |
|---|---|
| **Use outside VRChat / on other platforms?** | Some avatars are licensed *only* for VRChat |
| **Modification / VRM conversion allowed?** | Converting a VRChat avatar is a modification |
| **AI-related use allowed?** | Some creators forbid "AI" use. If you turn on the [AI agent link](#ai-agent-link-optional), check this. With the link off, YDCP is a plain desktop pet |
| **Redistribution allowed?** | Almost always **no**. Never share the model file or your converted `.vrm` |

YDCP only reads your model from your own computer. It never uploads, shares or modifies the file.

---

## Using YDCP

| To… | Do this |
|---|---|
| Move her | Drag her |
| Poke her | Click her quickly; she does a random cute moment |
| Click the app behind her | Just click; empty space is click-through |
| Change size | Menu → **Size** → Small / Medium / Large |
| Pick a motion | Menu → **Motions** → a moment, a vibe, or an expression |
| Change model | Menu → **Models** |
| Keep or stop always-on-top | Menu → **Always on top** |
| Save power on a laptop | Menu → **Frame rate** → 30 fps |
| Hide / show | Menu → **Show / Hide** |

When you leave the mouse alone for about 10 minutes she gets sleepy, and she wakes up when you're back.

---

## Motions

**Built in (no files needed):** vibes (Idle, Sway, Bop, Sleepy) and moments (Wave, Peace, Shy). They work with any VRM model.

**Add more:** put `.vrma` files (VRM Animation) into the motions folder, or use **Motions → Add motions…**:

| | Motions folder |
|---|---|
| macOS | `~/.ydcp/anims/` |
| Windows | `%USERPROFILE%\.ydcp\anims\` |

New motions appear in the menu by themselves.

- **Free official motions:** the **[VRoid VRMA Motion Pack](https://vroid.booth.pm/items/5512385)** (7 motions). Download it yourself from BOOTH; its terms don't allow us to include it. Then copy [`docs/presets/vroid-motion-pack.motions.json`](docs/presets/vroid-motion-pack.motions.json) into the motions folder as `motions.json`. This gives the motions nice names, faces and lines, and fixes the greeting's crouch.
- **Your own settings:** `motions.json` sets each motion's name, face, speech line, speed, trimming and more. See [docs/motions.md](docs/motions.md).
- **Formats:** only `.vrma`. FBX and Mixamo animations must be converted to `.vrma` first.
- Motions you add are credited in **About…**. Follow each pack's credit rules (for example, the VRoid pack asks for "Animation credits to pixiv Inc.'s VRoid Project").

---

## AI agent link (optional)

You don't need this to use YDCP. If you use an AI coding agent, or any script, it can make her react, for example cheering when a task finishes.

How it works: the agent writes a tiny file, and YDCP reads it. Nothing goes over the network.

```
~/.ydcp/state.json          (Windows: %USERPROFILE%\.ydcp\state.json)
{ "mood": "done" }
```

Moods: `done` (she cheers), `working`, `sleepy`, `idle`, `failed`. You can add `"line": "text"` for her to say.

It's **off** when you install YDCP. To turn it on, open Menu → **React to agent**:
- **Off** (default): ignores the file completely.
- **On**: reacts to the file.
- **Auto**: reacts only while the file exists.

Ready-made examples are in [`integrations/`](integrations/):
- **Claude Code hooks** (macOS shell and Windows PowerShell): `integrations/claude-code-hooks/`
- **Claude desktop mod:** `integrations/claude-desktop-mod/`
- **Any script**, for example when a long build finishes:
  - macOS: `printf '{"mood":"done"}' > ~/.ydcp/state.json`
  - Windows (PowerShell): `Set-Content "$env:USERPROFILE\.ydcp\state.json" '{"mood":"done"}'`

> YDCP is an independent project. It is not affiliated with, endorsed by, or sponsored by Anthropic or any AI company. Claude and Claude Code are trademarks of Anthropic, PBC.

---

## Troubleshooting

| Problem | Try this |
|---|---|
| Something doesn't work on one model | Menu → **Models** → **About this model…** says what that model has and lacks |
| Nothing appears after launch | No model yet: add one ([Add your model](#add-your-model)). Also check the menu bar or notification-area icon → **Show** |
| "Can't be opened" (Mac) / "Windows protected your PC" | See [Download and install](#download-and-install) |
| The model won't load / shows an error in the menu | Make sure it's a real `.vrm`, not a renamed `.fbx` or `.unitypackage`. The file must be under 100 MB. Re-export it from VRoid Studio, UniVRM or Blender |
| She faces away or lies down | Re-export with the rig set to **Humanoid** and correct bone mapping |
| Her face never changes | The model has no VRM expressions set up. Add happy, angry and blink in UniVRM or Blender, or map them in a [profile](#put-the-model-into-ydcp) |
| Her hair doesn't move | The model has no VRM spring bones (common after converting from VRChat) |
| Colours look different from VRChat | VRM uses the MToon shader; adjust it when exporting |
| Hands go through her head or body in a motion | Add `motionFixes` in a [profile](#put-the-model-into-ydcp); see [docs/models.md](docs/models.md) |
| Clicks don't reach the app behind her | Click a bit further from her; the area right around her body counts as her |
| She's off-screen after unplugging a monitor | Relaunch YDCP; she moves back to the main screen |
| A `.vrma` motion doesn't show up | Check that it ends in `.vrma` and isn't `"hidden": true` in `motions.json`; then Menu → **Motions → Reload** |

Still stuck? [Open an issue](../../issues/new/choose). Tell us your OS, YDCP version, where the model came from and which step failed. **Please don't attach model files.**

---

## Your data and uninstalling

Everything YDCP uses is in one folder: `~/.ydcp/` (Windows: `%USERPROFILE%\.ydcp\`):

```
.ydcp/
├── models/        your .vrm files (+ optional profiles)
├── anims/         your .vrma files (+ optional motions.json)
├── settings.json  your choices: model, size, position, agent link
└── state.json     only if an AI agent or script writes it
```

**Uninstall:**
- **macOS:** quit YDCP, delete `/Applications/YDCP.app`, and delete `~/.ydcp/` if you want your models and settings gone too.
- **Windows:** **Settings → Apps → YDCP → Uninstall**, then delete `%USERPROFILE%\.ydcp\` if you like.

---

## Privacy

- No account, no sign-in, no analytics, no tracking, no ads.
- **No internet use while running.** No auto-update checks. Links (such as the Releases page) open in your browser only when you click them.
- No open network ports. The AI agent link is a local file.
- **No special permissions:** no screen recording, accessibility, input monitoring, camera or microphone.
- YDCP reads and writes only its own `.ydcp` folder.
- The only time anything is downloaded is on Windows if WebView2 is missing during install, from Microsoft.

The code is open, so you can check all of this yourself.

---

## Build from source

You need [Node.js](https://nodejs.org/) 20+, [Rust](https://rustup.rs/), and the [Tauri prerequisites](https://tauri.app/start/prerequisites/) for your OS (Xcode Command Line Tools on Mac; Microsoft C++ Build Tools and WebView2 on Windows).

```bash
git clone https://github.com/ryanlow1111/ydcp.git
cd ydcp
npm install
npm run tauri dev      # run in development
npm run tauri build    # build an installer for your OS
```

Releases are built by GitHub Actions from a version tag, for macOS and Windows together. See [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Contributing

Bug reports, ideas, motions settings and code are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) and our [Code of Conduct](CODE_OF_CONDUCT.md).

**Asset rule:** never commit, attach or link to download model (`.vrm`) or motion (`.vrma`) files you don't have the right to share. The repo blocks them on purpose.

Found a security problem? Please report it privately; see [SECURITY.md](SECURITY.md).

---

## Licence and credits

- **YDCP code:** [MIT License](LICENSE)
- **Built with:** [Tauri](https://tauri.app/) (MIT/Apache-2.0), [three.js](https://threejs.org/) (MIT), [three-vrm](https://github.com/pixiv/three-vrm) (MIT)
- **Models and motions you add** belong to their creators and follow their own terms. YDCP shows their credits in **About…**.
- YDCP is an independent project, not affiliated with VRoid, pixiv, VRChat, Anthropic, or any model creator.
