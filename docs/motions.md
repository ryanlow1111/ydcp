# Motions

## Built in

These need no files and work with any VRM model:

- **Vibes** (looping): Idle, Sway, Bop, Sleepy. She stays calm on **Idle** by default; **Menu → Motions → Vibes → Auto (drift)** lets her drift between them.
- **Moments** (played once): Wave, Peace, Shy, High five. They only play when asked: click her, pick one from the menu, or as her greeting when you come back. Two have their own triggers: click a hand for a High five, and rest the cursor on her face for Shy.

They're fitted to each model when it loads: YDCP measures her arms, shoulders and face, then places her hands for that body, so they land right on a chibi or a tall figure.

Motions from files appear below the built-in ones in **Menu → Motions**. A file motion called `peace` never replaces the built-in Peace.

## Adding motions

YDCP plays **VRM Animation** files (`.vrma`). Put them in the motions folder, or use **Menu → Motions → Add motions…**:

| OS | Folder |
|---|---|
| macOS | `~/.ydcp/anims/` |
| Windows | `%USERPROFILE%\.ydcp\anims\` |

New, removed or changed files show up in the menu by themselves. Limit: 20 MB per motion. FBX and Mixamo animations must be converted to `.vrma` first.

### The free VRoid motion pack

pixiv's **[VRoid VRMA Motion Pack](https://vroid.booth.pm/items/5512385)** has 7 free motions. Its terms don't allow us to include it, so:

1. Download it from BOOTH and copy `VRMA_01.vrma` … `VRMA_07.vrma` into the motions folder.
2. Copy [`presets/vroid-motion-pack.motions.json`](presets/vroid-motion-pack.motions.json) into the same folder and rename it `motions.json`.

The preset gives the motions names, faces, lines and the pack's required credit. It also cuts the crouch at the start of the greeting and hides the two motions that don't suit a desktop companion.

**Credit:** the pack asks for "Animation credits to pixiv Inc.'s VRoid Project". The preset's `credit` fields put this in **About…**.

## `motions.json`

Optional. Keys are file names in the folder; every field is optional.

```json
{
  "VRMA_04.vrma": { "id": "shoot", "name": "Bang!", "face": "angry", "line": "Hmph! Bang!! 💢" },
  "my-dance.vrma": { "name": "Little dance", "loop": true }
}
```

| Field | What it does | Default |
|---|---|---|
| `id` | Stable name, used by model profiles' `motionFixes` | File name without `.vrma` |
| `name` | Label in the Motions menu | Tidied file name |
| `face` | Expression while it plays: `happy`, `angry`, `sad`, `surprised`, `relaxed`, `blink` | `happy` |
| `line` | What she says when she does it (on a poke, from the menu, or as the agent cheer) | None |
| `credit` | Credit line shown in **About…** (e.g. what the pack's terms ask for) | None |
| `random` | Whether a poke can pick it | `true` |
| `onDone` | Use it to cheer when an AI agent finishes (one motion) | The built-in Peace |
| `loop` | Play it as a looping vibe instead of once | `false` |
| `trim` | `"crouch"` (skip an opening crouch), or `{ "start": 1.5, "end": 6 }` in seconds | None |
| `speed` | Playback speed | `1` |
| `hidden` | Keep the file but don't show or use it | `false` |
