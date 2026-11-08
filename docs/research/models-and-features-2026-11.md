# How VRM models are built, and what YDCP is missing

Research notes, November 2026. Sources are listed at the end. Findings marked **checked** were confirmed against YDCP's code or the test models in `dev/models`.

## In short

- Most problems come from **how creators set up expressions**, not from the 3D model itself. Faces, mouth shapes, face-tracking shapes and outfit toggles are all stored the same way: as VRM expressions. Nothing in the file says which kind each one is, so YDCP has to guess.
- **BOOTH models are mostly VRM 0.x made in Unity.** This is because VSeeFace, the most popular VTuber app, reads only VRM 0.x. Many include 52 extra face-tracking shapes ("perfect sync"). YDCP lists all of them as faces today (**checked**: about 64 extra menu entries).
- **Outfit toggles are a creator choice, not a standard.** When a model has them, they're made as on/off expressions that change a material's transparency or a shape key, and either "on" or "off" can be the default. VRChat avatars usually lose their toggles when converted, because VRChat uses Unity animations for them.
- **YDCP is already strong where others are weak:** it reads both VRM 0.x and 1.0, needs no network, runs on Mac and Windows, and stays calm and light. Its biggest gaps compared with other apps are everyday features: start at login, a timer or alarm, sitting on the taskbar, free resizing, moving her mouth when she talks, and Japanese/Chinese menus.

## 1. How creators build VRM models

### VRoid Studio (free, the most common starting point)

- Exports VRM 0.0 or VRM 1.0. VRM 1.0 export has been available since v1.20 (fixed in v1.20.2).
- Expressions use the standard names automatically (joy, angry, sorrow, fun, surprised, blink, mouth shapes). These models "just work" in YDCP.
- No outfit toggles: one model is one outfit. Creators who want another outfit export another file.
- Face-tracking shapes can be added later with tools such as HANA Tool, which copies them between VRoid models.

### Unity with UniVRM (most paid BOOTH models)

- Usually exported as **VRM 0.x**, because VSeeFace reads only VRM 0.x and loading a 1.0 model there gives an error.
- Faces are set up as BlendShapeClips. Creators often add their own (happy01–08 like Lily, "Brows up", "Brows down").
- **Face tracking ("perfect sync")** needs all **52 ARKit shapes** as extra expressions, named `eyeBlinkLeft`, `jawOpen`, `mouthSmileLeft` and so on. VSeeFace also supports 10 extra mouth shapes (`SIL`, `CH`, `DD`, `FF`, `KK`, `NN`, `PP`, `RR`, `SS`, `TH`). These are for camera tracking and aren't meant to be shown as faces.
- **Outfit toggles:** VSeeFace's guide recommends putting all outfits in one model and hiding parts by changing a material's transparency through an expression. Creators can also mark an expression "Is Binary" so it snaps fully on or off.
- The licence is often a separate document (for example the VN3 licence common on BOOTH), not the fields inside the file.

### Blender (VRM Add-on, and accessory-toggle add-ons)

- A free BOOTH add-on, "VRM Toggle", turns a selected accessory into an on/off expression that changes material transparency. It is VRM 0.x only.
- It has a **"start hidden" option**, and per-toggle "Shown / Hidden" starting states. So for some models turning an expression on shows the item, and for others it hides it. The file doesn't say which.

### VRChat avatars converted to VRM

- VRChat switches clothing with Unity animations and menus, which VRM can't store.
- Converters such as SoulFlame VRM Exporter let you **pick an outfit before exporting**, then save that one look. PhysBones (hair physics) are converted, or have to be rebuilt as VRM spring bones.
- So most converted avatars have **no outfit toggles at all**. Nothing YDCP does can bring them back.

### Other details that vary between models

- **Neutral:** some models use a "Neutral" expression as their resting face. VSeeFace applies it by default, but YDCP never does (**checked**). Those models look slightly different in YDCP than in VSeeFace.
- **Eye movement:** models can turn the eyes with eye bones or with look expressions. three-vrm handles both, and YDCP uses it.
- **Look:** most models use the MToon toon shader. three-vrm supports both versions, so this isn't a concern.

## 2. What this means for YDCP

| Finding | YDCP today | What to do |
|---|---|---|
| Perfect-sync models have 52 tracking shapes, plus sometimes 10 extra mouth shapes and "Brows up/down" | All listed under Expressions (**checked**: 67 entries for a typical model) | Leave these well-known names out of Expressions. Small change, high value |
| Outfit toggles change material transparency or a shape key, often marked binary | The new Outfit menu uses both clues (**checked** on Lily: 7 of 7 found, no false parts on the other 5 models) | Keep. Add the in-app "Face / Outfit" switch for models it sorts wrong |
| A toggle's starting state can be "shown" or "hidden" | Menu says "Model's default" and leaves it at that | Keep the neutral wording; note in the docs that ticking may hide a part |
| VRChat conversions usually have no toggles | Not explained | Add a line to the README's VRChat section: pick the outfit before converting |
| Some models rely on Neutral as their resting face | Neutral is never applied | Apply Neutral when no other face is showing, as VSeeFace does |
| Her talking is a speech bubble only | Mouth never moves (**checked**) | Open and close the mouth (aa/oh) while a line is showing. Cheap and noticeable |
| BOOTH creators target VRM 0.x, VRoid targets 1.0 | Both supported | An advantage: MateEngine and VSeeFace read only VRM 0.x |

## 3. What other VRM desktop companions offer

| Feature | YDCP | MateEngine | Desktop Mate | VMagicMirror | uDesktopMascot | VRM on Desktop |
|---|---|---|---|---|---|---|
| Your own VRM 0.x / 1.0 | ✓ / ✓ | ✓ / partly (MToon10 "coming") | Mod only | ✓ / ✓ | ✓ / ✓ | ✓ / ✓ |
| Mac and Windows | ✓ | Windows (community ports) | Windows | Windows | ✓ | Windows |
| Follows the cursor (head, eyes) | ✓ | ✓ + upper body, catches the cursor | — | ✓ (copies your typing and mouse) | — | — |
| Drag her around | ✓ | ✓ | ✓ | — | ✓ | ✓ |
| Reacts to clicks | ✓ (one moment) | Head pats with hearts, shy reactions, chibi mode | ✓ | — | Click voices | — |
| Idle variety | 4 loops + 3 moments | 10 idles | ✓ | ✓ | ✓ | VRMA motions |
| Own motions (.vrma) | ✓ | — | — | ✓ (experimental) | — | ✓ |
| Sits on windows or the taskbar | — | Disabled (anti-cheat worries) | ✓ (moves with the window) | — | — | — |
| Dances to music | — | ✓ (chosen apps only) | — | — | Random background music | — |
| Alarm / timer | — | — | ✓ (her main feature) | — | — | — |
| Voice, lip sync | — | — | Character voices | Mic lip sync | Voice clips, TTS | — |
| AI chat | Optional agent link (off) | Small local AI | — | — | Local speech, LLM | — |
| Outfit or accessory toggles | ✓ (new) | — | DLC outfits | Hotkey expressions | — | — |
| Start at login | — | ? | ✓ | ? | — | ✓ |
| Free resize (scroll wheel) | 3 sizes | ✓ size slider | ✓ | ✓ | ✓ settings file | ✓ wheel |
| Open a .vrm by double-clicking | — | — | — | — | — | ✓ |
| Frame rate / power saving | ✓ (60/30, 15 while dozing, 0 hidden) | ✓ | ? | ✓ | ✓ | ✓ |
| Languages | English | 13 | Japanese, English, more | Japanese, English | Japanese, English | Japanese, English |
| Checks the model, explains problems | ✓ (About this model) | Needs proper bones | — | — | — | — |
| No network, no telemetry | ✓ | Steam | Steam | ✓ | ✓ | VRoid Hub, auto-update |

## 4. What YDCP is missing, by priority

### Before going public (models people will actually load)

1. **Leave face-tracking shapes out of Expressions** (ARKit 52, the 10 extra mouth shapes, Brows up/down). Without this, every perfect-sync BOOTH model has a menu with about 60 meaningless entries.
2. **In-app "Face / Outfit" switch** in About this model, saved per model, so a wrong guess takes one click to fix.
3. **Mouth moves while she talks.** Makes the bubble feel alive, and costs almost nothing.
4. **Neutral as her resting face** when the model has one.
5. **Test set** of 10–15 varied models (VRoid 1.0, BOOTH perfect-sync, a VRChat conversion, one with toggles) through `npm run check:models`.

### High value, fits YDCP's calm and private style

6. **Start at login** (Tauri autostart plugin). Most people expect a desktop companion to come back after a restart.
7. **Timer / alarm / break reminder.** Desktop Mate's best-liked feature. She could wave and say the time or "time for a break", which matches her mood system.
8. **Free resizing.** Scroll wheel or a slider over her, instead of only Small / Medium / Large.
9. **Head-pat reaction.** Hovering or stroking over her head gets a happy face. Small, and a favourite in MateEngine.
10. **Japanese and Chinese menus.** Many VRM users and creators are on BOOTH.
11. **Open a .vrm by double-clicking** (file association), so adding a model is one step.

### Later, or only if wanted

12. **Sit on the taskbar or a window edge.** Popular in Desktop Mate. It's tricky on both systems, and MateEngine turned it off over anti-cheat worries. Sitting on the bottom of the screen is a safer first step.
13. **Dance to music.** Needs system audio capture, which on macOS asks for screen-recording permission. That clashes with YDCP's privacy promise unless it stays strictly optional.
14. **Voice and TTS.** Needs bundled voices with their own licences.
15. **Built-in AI chat.** Already covered by the optional agent link. A chat feature would add network or large local models.

## Sources

- [VRM Toggle, Blender add-on for accessory toggles (BOOTH)](https://booth.pm/en/items/8651657)
- [VSeeFace manual: expressions, perfect sync, VRM 0.x only, outfits through material blendshapes](https://www.vseeface.icu/)
- [UniVRM: BlendShape setup](https://vrm.dev/en/univrm/blendshape/blendshape_setup/)
- [VRM 1.0 overview](https://vrm.dev/vrm1/) and [VRM 1.0 lookAt spec](https://github.com/vrm-c/vrm-specification/blob/master/specification/VRMC_vrm-1.0/lookAt.ja.md)
- [VRoid Studio v1.20.2: VRM 1.0 export re-enabled](https://vroid.com/en/studio/notice/62qSFvhlfsQMgFY7xzqeIH)
- [HANA Tool v5 for VRM 1.x (BOOTH)](https://booth.pm/en/items/4607357)
- [Warudo: 3D primer (ARKit names, expressions)](https://docs.warudo.app/docs/tutorials/3d-primer)
- [Animaze: perfect sync for VRM](https://www.animaze.us/manual/vrmavatar/vrmperfectsync)
- [MoguraVR: SoulFlame VRM Exporter for VRChat avatars](https://www.moguravr.com/?p=379559)
- [note.com: converting a VRChat avatar to VRM](https://note.com/kohadachan/n/na79185ccced1)
- [MateEngine on Steam](https://store.steampowered.com/app/3625270)
- [Desktop Mate on Steam](https://store.steampowered.com/app/3301060) and [GIGAZINE review](https://gigazine.net/gsc_news/en/20250224-desktop-mate-yukimiku-snow-miku-2025)
- [VMagicMirror v5.0.0 (Window Forest)](https://forest.watch.impress.co.jp/docs/news/2116867.html) and [VMagicMirror manual](https://malaybaku.github.io/VMagicMirror/en/get_started)
- [uDesktopMascot (GitHub)](https://github.com/MidraLab/uDesktopMascot)
- [VRM on Desktop (BOOTH)](https://booth.pm/en/items/6488104)
- [Amica, open-source VRM AI companion](https://github.com/semperai/amica)
