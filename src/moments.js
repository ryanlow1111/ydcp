// Built-in cute moments: short motions she does when poked, from the menu, as a greeting, or
// when an agent finishes (she doesn't play them on her own).
// Written as code (no files needed), in VRM 1.0 space (see moves.js). Hands are placed relative
// to her measured face and body (body.js), so they land right on a chibi or a tall figure, and
// her whole body takes part: weight shifts, chest and head turn with the gesture.
//
// Each moment is a whole-body clip; the mixer fades it in over her vibe and back out.

import { defaultBody, solveArm } from './body.js'
import { RELAXED_HANDS, armsDown, bothSides, breathing, combine, curledFingers, leftOf, mirrorPose, sampledClip, stance, wave } from './moves.js'

/** Arms from wrist targets: { upper, lower } per side, as bones. */
const arm = (side, body, target, pole) => {
  const { upper, lower } = solveArm(side, body, target, pole)
  return { [`${side}UpperArm`]: upper, [`${side}LowerArm`]: lower }
}

/**
 * Each moment: face, length in seconds, and `pose(t, body)` giving her whole body at time t.
 * Its name and what she says are in src/locales/*.json (`moment.<id>`, `moment.<id>.line`).
 */
export const MOMENTS = {
  wave: {
    face: 'happy',
    duration: 2.8,
    pose: (t, body) => {
      const { face, height } = body
      // The forearm swings from the elbow, side to side, with the hand following a beat later.
      const swing = wave(t, 0.6)
      return combine(
        breathing(t),
        stance(0.9, -1),
        { leftUpperArm: armsDown(body, t).leftUpperArm, leftLowerArm: armsDown(body, t).leftLowerArm },
        arm('right', body, [-(face.halfWidth + height * 0.085 + swing * height * 0.028), face.eyeY + height * 0.02, height * 0.05], [-0.8, -1, 0.1]),
        leftOf(curledFingers({})),
        curledFingers({ index: 0.06, middle: 0.08, ring: 0.1, little: 0.12, thumb: 0.05 }),
        {
          rightHand: [0, 0, wave(t, 0.6, 0.12) * 0.22],
          rightShoulder: [0, 0, -0.06],
          chest: [0, 0.06, 0.015],
          neck: [0, -0.02, 0.03],
          head: [0, 0.05, 0.08],
        },
      )
    },
  },
  peace: {
    face: 'happy',
    duration: 3,
    pose: (t, body) => {
      const { face, height } = body
      return combine(
        breathing(t),
        stance(1, -1),
        { leftUpperArm: armsDown(body, t).leftUpperArm, leftLowerArm: armsDown(body, t).leftLowerArm },
        arm('right', body, [-(face.halfWidth * 1.05 + height * 0.04), face.eyeY - height * 0.05, face.front * 0.35 + height * 0.05], [-0.8, -1, 0.15]),
        leftOf(curledFingers({})),
        curledFingers({ index: 0, middle: 0, ring: 1.15, little: 1.15, thumb: 0.55 }),
        {
          rightHand: [0, 0, 0.08 + wave(t, 1.5) * 0.04],
          chest: [0, 0.05, 0.02],
          neck: [0, 0, 0.04],
          head: [0.02, 0.05, 0.13],
        },
      )
    },
  },
  shy: {
    face: 'relaxed',
    duration: 3.2,
    pose: (t, body) => {
      const { face, height, frontZ, shoulder } = body
      // Hands together in front of her chest, shoulders drawn in, knees together, looking down.
      const y = Math.min(shoulder.right[1] - height * 0.035, face.eyeY - height * 0.07)
      const z = Math.max(frontZ, face.front * 0.5) + height * 0.035
      return combine(
        breathing(t),
        arm('right', body, [-height * 0.016, y, z + height * 0.005], [-1, -0.9, -0.15]),
        arm('left', body, [height * 0.016, y - height * 0.006, z], [1, -0.9, -0.15]),
        RELAXED_HANDS,
        bothSides({
          rightShoulder: [0, 0.05, 0.05],
          rightUpperLeg: [0, 0.05, 0.035],
          rightFoot: [0, -0.03, 0],
        }),
        {
          hips: [0, wave(t, 1.6) * 0.03, wave(t, 1.6, 0.25) * 0.012],
          spine: [0.04, 0, 0],
          chest: [0.03, 0, 0],
          neck: [0.08, 0, 0.05],
          head: [0.16, wave(t, 1.6) * 0.06 + 0.08, 0.1],
        },
      )
    },
  },
  highfive: {
    face: 'happy',
    duration: 2.6,
    pose: (t, body) => {
      const { height, upperArm } = body
      const [x, y, z] = body.shoulder.right
      // She holds her open hand up beside her shoulder, forearm upright, palm toward you, and
      // waits for your clap. The knock when it comes is added live (pet.js): it depends on
      // when you clap, so it can't be part of the clip.
      const bob = wave(t, 1.3) * height * 0.003
      return combine(
        breathing(t),
        stance(0.8, -1),
        { leftUpperArm: armsDown(body, t).leftUpperArm, leftLowerArm: armsDown(body, t).leftLowerArm },
        arm('right', body, [x - upperArm * 0.75, y + upperArm * 0.45 + bob, z + upperArm * 0.3], [-1, -0.6, 0.3]),
        leftOf(curledFingers({})),
        curledFingers({ index: 0.02, middle: 0.02, ring: 0.03, little: 0.05, thumb: 0 }),
        {
          chest: [0, 0.04, 0.005],
          neck: [0, 0, 0.02],
          head: [0, 0.04, 0.05],
        },
      )
    },
  },
}

/** The built-in moments' ids, in menu order. */
export const MOMENT_IDS = Object.keys(MOMENTS)

/** Builds the built-in moment clips (all, or just `ids`) for a loaded model. */
export function makeMoments(vrm, vrm0 = false, body = defaultBody(), ids = MOMENT_IDS) {
  const clips = {}
  for (const id of ids) {
    const moment = MOMENTS[id]
    clips[id] = sampledClip(vrm, id, moment.duration, t => moment.pose(t, body), vrm0)
  }
  return clips
}

/** Built-in moment `id` done with her other hand: the same clip in a mirror, named `<id>:left`. */
export function makeMirrored(vrm, vrm0 = false, body = defaultBody(), id) {
  const moment = MOMENTS[id]
  return sampledClip(vrm, `${id}:left`, moment.duration, t => mirrorPose(moment.pose(t, body)), vrm0)
}
