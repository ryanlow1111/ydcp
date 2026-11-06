// Built-in cute moments: short motions she does on her own, when poked, or from the menu.
// Written as code (no files needed), in VRM 1.0 space (see moves.js), so they work on any
// VRM model. Arm poses are written for her right arm; `mirror` makes the left one.
//
// Each moment is a whole-body clip: her resting, breathing pose plus the moment's own parts,
// so nothing snaps to a T-pose while it plays. The mixer fades it in and back out.

import { mirror, restPose, sampledClip, wave } from './moves.js'

/** 0 → 1 → 0 over a moment: in over `rise` seconds, out over the last `fall` seconds. */
export function envelope(t, duration, rise = 0.35, fall = 0.45) {
  const smooth = x => x * x * (3 - 2 * x)
  if (t < rise) {
    return smooth(t / rise)
  }
  if (t > duration - fall) {
    return smooth(Math.max(0, duration - t) / fall)
  }
  return 1
}

/** Blends two poses: `from` toward `to` by `k` (0..1), bone by bone (missing bones count as 0). */
export function blendPose(from, to, k) {
  const out = { ...from }
  for (const [bone, value] of Object.entries(to)) {
    const base = from[bone] ?? [0, 0, 0]
    out[bone] = base.map((v, i) => v + (value[i] - v) * k)
  }
  return out
}

/** Right-arm bones with a pose, plus the mirrored left-arm ones. */
function bothArms(right) {
  const out = {}
  for (const [bone, value] of Object.entries(right)) {
    out[bone] = value
    out[bone.replace(/^right/, 'left')] = mirror(value)
  }
  return out
}

/** Curled fingers, written for the right hand (VRM 1.0: +z curls a right finger toward the palm). */
const curl = (finger, amount) => ({
  [`right${finger}Proximal`]: [0, 0, amount],
  [`right${finger}Intermediate`]: [0, 0, amount * 1.1],
  [`right${finger}Distal`]: [0, 0, amount * 0.8],
})

/** The peace sign's hand: index and middle up, ring and little curled. */
const peaceHand = { ...curl('Ring', 1.2), ...curl('Little', 1.2), rightThumbProximal: [0, -0.4, 0.3], rightThumbDistal: [0, -0.5, 0] }

/**
 * Each moment: its menu name, face, what she says, length in seconds, and `pose(t)` giving the
 * moment's own bones at time t (blended over her resting pose by the envelope).
 */
export const MOMENTS = {
  wave: {
    name: 'Wave',
    face: 'happy',
    line: 'Hi hi~ 👋',
    duration: 2.8,
    pose: t => ({
      rightShoulder: [0, 0, -0.12],
      rightUpperArm: [-0.85, 0, 0.15],
      rightLowerArm: [0, 1.55 + wave(t, 0.45) * 0.28, 0],
      rightHand: [0, 0, wave(t, 0.45, 0.1) * 0.25],
      head: [0, 0.08, 0.07],
      spine: [0, 0, -0.03],
    }),
  },
  peace: {
    name: 'Peace',
    face: 'happy',
    line: 'Peace! ✌️',
    duration: 3,
    pose: t => ({
      rightUpperArm: [-0.8, 0, 0.8],
      rightLowerArm: [0, 1.8, 0],
      rightHand: [0, 0, wave(t, 1.5) * 0.05],
      ...peaceHand,
      head: [0.03, 0.06, 0.12],
      neck: [0, 0, 0.05],
    }),
  },
  cheer: {
    name: 'Cheer',
    face: 'happy',
    line: 'Yay!! ✨',
    duration: 2.6,
    pose: t => {
      const pump = Math.max(0, wave(t, 0.5)) * 0.18
      return {
        ...bothArms({
          rightShoulder: [0, 0, -0.2],
          rightUpperArm: [0, 0, -0.72 - pump],
          rightLowerArm: [0, 0.25, 0],
        }),
        spine: [-0.04, 0, 0],
        head: [-0.1, 0, 0],
      }
    },
  },
  shy: {
    name: 'Shy',
    face: 'relaxed',
    line: 'E-eh? Don’t stare so much…',
    duration: 3.2,
    pose: t => ({
      ...bothArms({
        rightUpperArm: [-1.3, -0.25, 0.6],
        rightLowerArm: [0, 2.1, 0],
        rightHand: [0, 0, 0.15],
      }),
      head: [0.16, wave(t, 1.6) * 0.06, 0.12],
      neck: [0.08, 0, 0.05],
      spine: [0.05, 0, wave(t, 1.6, 0.25) * 0.03],
    }),
  },
  stretch: {
    name: 'Stretch',
    face: 'relaxed',
    line: 'Mmmh~ stretch!',
    duration: 3.6,
    pose: t => {
      const lean = Math.sin(Math.min(1, Math.max(0, (t - 0.6) / 2.4)) * Math.PI * 2) * 0.13
      return {
        ...bothArms({
          rightShoulder: [0, 0, -0.25],
          rightUpperArm: [0, 0, -1.45],
          rightLowerArm: [0, 0.15, 0],
        }),
        spine: [-0.03, 0, lean],
        chest: [-0.03, 0, lean * 0.6],
        head: [-0.06, 0, -lean * 0.5],
      }
    },
  },
}

/** The built-in moments' ids, in menu order. */
export const MOMENT_IDS = Object.keys(MOMENTS)

/** Builds the built-in moment clips (all, or just `ids`) for a loaded model. */
export function makeMoments(vrm, vrm0 = false, ids = MOMENT_IDS) {
  const clips = {}
  for (const id of ids) {
    const moment = MOMENTS[id]
    clips[id] = sampledClip(
      vrm,
      id,
      moment.duration,
      t => blendPose(restPose(t), moment.pose(t), envelope(t, moment.duration)),
      vrm0,
    )
  }
  return clips
}
