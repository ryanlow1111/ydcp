# Models and model profiles

YDCP shows any **VRM 0.x or 1.0** model (`.vrm`). To get one, including converting a VRChat avatar, see [README → Add your model](../README.md#add-your-model).

## Where models live

| OS | Folder |
|---|---|
| macOS | `~/.ydcp/models/` |
| Windows | `%USERPROFILE%\.ydcp\models\` |

Add models with **Menu → Models → Add model…**, or copy `.vrm` files into the folder; YDCP notices them. Limit: 100 MB per model.

## What a model has

**Menu → Models → About this model…** says what the loaded model has and lacks: faces, blinking, hair and clothes physics, finger and eye bones, size, and the licence stored in its file. If something doesn't work on a model, look here first.

Developers can get the same report for a whole folder: `npm run check:models -- ~/.ydcp/models`.

## Model profile (optional)

A JSON file with the same name as the model, next to it: `my-model.vrm` + `my-model.json`. Every field is optional.

```json
{
  "name": "My Model",
  "credit": "Model by Someone",
  "scale": 1.0,
  "faces": { "angry": "Angry_Custom" },
  "outfit": ["hat01", "Glasses"],
  "motionFixes": {
    "greeting": { "clearArms": { "lift": 0.7, "forward": 0.3 } },
    "peace": { "clearArms": { "pose": { "upper": [-0.8, 0, 0.8], "lower": [0, 1.8, 0] } } }
  }
}
```

| Field | What it does | Default |
|---|---|---|
| `name` | Name in the Models menu and About… | The VRM's title, else the file name |
| `credit` | Credit line in About… | The VRM's author |
| `scale` | Extra size (1.0 = automatic fit) | `1.0` |
| `outfit` | Exactly which expressions are [outfit parts](#outfit-parts). `[]` means none | Worked out by YDCP |
| `faces` | Maps YDCP faces (`happy`, `angry`, `sad`, `surprised`, `relaxed`, `blink`) to your model's expression names | Standard VRM expression names |
| `motionFixes` | Arm adjustments per motion `id`, for models whose head, hair or sleeves hide their hands | None: motions play exactly as made |

### `motionFixes.<motion id>.clearArms`

Some motions bring the hands up to the face. On a model with a big head or long twintails, the hand ends up hidden. While the hand is raised, `clearArms` moves the arm; when the hand is down, the motion is untouched. Angles are in radians, written for the right arm in **VRM 1.0 space** (the same space `.vrma` files use; YDCP converts for VRM 0.x models), and the left arm is mirrored.

| Field | Meaning |
|---|---|
| `lift` | Turns the upper arm out away from the head. The sign depends on the pose: try `0.7` or `-0.4` |
| `forward` | Brings the elbow forward so the hand stays in front of the hair |
| `straighten` | Opens the elbow, so a hand folded across the face swings out beside it |
| `pose` | Instead of turning the arm, blends it to a fixed pose: `upper` and `lower` arm Euler angles `[x, y, z]`. Example: `upper [-0.8, 0, 0.8]`, `lower [0, 1.8, 0]` holds the hand beside the cheek |

**Expressions:** **Menu → Motions → Expressions** lists the expressions the loaded model really has, custom ones included (outfit parts are in their own menu, see [Outfit parts](#outfit-parts)). If a standard face isn't there, she just keeps her usual look for that moment; a `faces` mapping can point it at one of the model's custom expressions.

**Tuning tip:** start with no fix, look at the motion, then try small values (0.2–0.4) and grow from there.

## Outfit parts

Some models use expressions to show or hide parts of the outfit: a hat, glasses, a tie, a skirt. YDCP lists those in **Menu → Outfit**, separate from her faces, so she can wear any number of them with any expression (for example a hat and glasses with a happy face). YDCP remembers each model's outfit.

YDCP decides an expression is an outfit part when its name doesn't say it's a face (happy, blink, blush, tears…) and at least one of these is true:

- the model marks it as on/off ("Is Binary" in UniVRM, VRoid or Blender);
- it changes only meshes or materials that none of the standard faces use, such as a separate hat mesh;
- its name says so: hat, glasses, ribbon, tie, skirt, wings, 帽子, メガネ and similar.

**Models → About this model…** lists what it found. If it's wrong, list the outfit parts in the profile's `outfit` field; that list replaces YDCP's guesses. What an outfit part does when ticked depends on the model: on some, ticking it shows the item; on others it hides it.

## Licences

Every model has its own terms. YDCP shows the licence fields from the VRM file in **About…**. Before converting or using a model, check: use outside VRChat, modification or VRM conversion, AI-related use (if you use the agent link), and redistribution. Never share model files.
