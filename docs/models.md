# Models and model profiles

> 🚧 Model loading arrives in v0.1. This page describes how it will work.

YDCP shows any **VRM 0.x or 1.0** model (`.vrm`). To get one, including converting a VRChat avatar, see [README → Add your model](../README.md#add-your-model).

## Where models live

| OS | Folder |
|---|---|
| macOS | `~/.ydcp/models/` |
| Windows | `%USERPROFILE%\.ydcp\models\` |

Add models with **Menu → Models → Add model…**, or copy `.vrm` files into the folder; YDCP notices them. Limit: 100 MB per model.

## Model profile (optional)

A JSON file with the same name as the model, next to it: `my-model.vrm` + `my-model.json`. Every field is optional.

```json
{
  "name": "My Model",
  "credit": "Model by Someone",
  "scale": 1.0,
  "faces": { "angry": "Angry_Custom" },
  "motionFixes": {
    "greeting": { "clearArms": { "lift": 0.7, "forward": 0.3 } },
    "peace": { "clearArms": { "pose": { "upper": [0.8, 0, -0.8], "lower": [0, 1.8, 0] } } }
  }
}
```

| Field | What it does | Default |
|---|---|---|
| `name` | Name in the Models menu and About… | The VRM's title, else the file name |
| `credit` | Credit line in About… | The VRM's author |
| `scale` | Extra size (1.0 = automatic fit) | `1.0` |
| `faces` | Maps YDCP faces (`happy`, `angry`, `sad`, `surprised`, `relaxed`, `blink`) to your model's expression names | Standard VRM expression names |
| `motionFixes` | Arm adjustments per motion `id`, for models whose head, hair or sleeves hide their hands | None: motions play exactly as made |

### `motionFixes.<motion id>.clearArms`

Some motions bring the hands up to the face. On a model with a big head or long twintails, the hand ends up hidden. While the hand is raised, `clearArms` moves the arm; when the hand is down, the motion is untouched. Angles are in radians and written for the right arm; the left arm is mirrored.

| Field | Meaning |
|---|---|
| `lift` | Turns the upper arm out away from the head. The sign depends on the pose: try `0.7` or `-0.4` |
| `forward` | Brings the elbow forward so the hand stays in front of the hair |
| `straighten` | Opens the elbow, so a hand folded across the face swings out beside it |
| `pose` | Instead of turning the arm, blends it to a fixed pose: `upper` and `lower` arm Euler angles `[x, y, z]` |

**Tuning tip:** start with no fix, look at the motion, then try small values (0.2–0.4) and grow from there.

## Licences

Every model has its own terms. YDCP shows the licence fields from the VRM file in **About…**. Before converting or using a model, check: use outside VRChat, modification or VRM conversion, AI-related use (if you use the agent link), and redistribution. Never share model files.
