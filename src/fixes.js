// Adjustments to motion clips from files (.vrma), driven by settings rather than code:
// - per model (its profile's `motionFixes`): `clearArms` moves raised hands out from behind a
//   big head or long hair;
// - per motion (`motions.json`): `trim` cuts the start/end, e.g. an opening crouch.
//
// Arm math happens in VRM 1.0 space (see moves.js); VRM 0.x clips are converted in and out.

import * as THREE from 'three'

const Y = new THREE.Vector3(0, 1, 0)
const Z = new THREE.Vector3(0, 0, 1)

/** A rotation turned 180° about y (VRM 0.x ↔ 1.0 space), in place. */
function turn(q) {
  q.x = -q.x
  q.z = -q.z
  return q
}

/**
 * While a hand is raised up by her face, moves that arm so the hand ends up beside her head:
 * `lift` turns the upper arm away from her head, `forward` brings the elbow forward,
 * `straighten` opens the elbow, and `pose` blends the arm to a fixed pose instead
 * (`{ upper: [x, y, z], lower: [x, y, z] }`, written for the right arm in VRM 1.0 space).
 * With the hand down, the motion is untouched; wrist and fingers are always kept.
 */
export function clearArms(clip, vrm, vrm0, { lift = 0, forward = 0, straighten = 0, pose } = {}) {
  const upperQ = new THREE.Quaternion()
  const lowerQ = new THREE.Quaternion()
  const turnBy = new THREE.Quaternion()
  const forearm = new THREE.Vector3()
  const hand = new THREE.Vector3()
  const toSpace = q => (vrm0 ? turn(q) : q)

  for (const side of ['left', 'right']) {
    // VRM 1.0 space: her left arm points along +x, her right along -x.
    const outward = side === 'left' ? 1 : -1
    const upper = vrm.humanoid.getNormalizedBoneNode(`${side}UpperArm`)
    const lower = vrm.humanoid.getNormalizedBoneNode(`${side}LowerArm`)
    const handNode = vrm.humanoid.getNormalizedBoneNode(`${side}Hand`)
    const upperTrack = upper && clip.tracks.find(track => track.name === `${upper.name}.quaternion`)
    const lowerTrack = lower && clip.tracks.find(track => track.name === `${lower.name}.quaternion`)
    if (!upperTrack || !lowerTrack) {
      continue
    }
    const upperLength = lower.position.length() || 1
    const lowerLength = handNode?.position.length() || upperLength
    const upperAt = upperTrack.clone().createInterpolant()
    const lowerAt = lowerTrack.clone().createInterpolant()

    /** How far up her hand is at `time`: 0 down, 1 up by her face. */
    const raisedAt = time => {
      toSpace(upperQ.fromArray(upperAt.evaluate(time)))
      toSpace(lowerQ.fromArray(lowerAt.evaluate(time)))
      forearm.set(outward, 0, 0).applyQuaternion(lowerQ).applyQuaternion(upperQ)
      hand.set(outward * upperLength, 0, 0).applyQuaternion(upperQ).addScaledVector(forearm, lowerLength)
      const handUp = hand.y / (upperLength + lowerLength)
      return Math.max(THREE.MathUtils.smoothstep(forearm.y, 0.2, 0.7), THREE.MathUtils.smoothstep(handUp, -0.05, 0.25))
    }

    if (pose) {
      const target = euler => {
        const [x, y, z] = side === 'right' ? euler : [euler[0], -euler[1], -euler[2]]
        return new THREE.Quaternion().setFromEuler(new THREE.Euler(x, y, z))
      }
      const upperTarget = target(pose.upper ?? [0, 0, 0])
      const lowerTarget = target(pose.lower ?? [0, 0, 0])
      upperTrack.times.forEach((time, k) => {
        const w = raisedAt(time)
        toSpace(toSpace(upperQ.fromArray(upperTrack.values, k * 4)).slerp(upperTarget, w)).toArray(upperTrack.values, k * 4)
      })
      lowerTrack.times.forEach((time, k) => {
        const w = raisedAt(time)
        toSpace(toSpace(lowerQ.fromArray(lowerTrack.values, k * 4)).slerp(lowerTarget, w)).toArray(lowerTrack.values, k * 4)
      })
      continue
    }

    upperTrack.times.forEach((time, k) => {
      const w = raisedAt(time)
      const q = toSpace(upperQ.fromArray(upperTrack.values, k * 4))
      q.premultiply(turnBy.setFromAxisAngle(Y, -outward * forward * w))
      q.premultiply(turnBy.setFromAxisAngle(Z, -outward * lift * w))
      toSpace(q).toArray(upperTrack.values, k * 4)
    })
    if (straighten !== 0) {
      lowerTrack.times.forEach((time, k) => {
        const q = toSpace(lowerQ.fromArray(lowerTrack.values, k * 4))
        q.multiply(turnBy.setFromAxisAngle(Y, outward * straighten * raisedAt(time)))
        toSpace(q).toArray(lowerTrack.values, k * 4)
      })
    }
  }
}

/** Cuts `start` seconds off the beginning and keeps up to `end` seconds (of the original). */
export function trimClip(clip, start = 0, end = clip.duration) {
  const from = Math.max(0, Math.min(start, clip.duration - 0.1))
  const to = Math.max(from + 0.1, Math.min(end, clip.duration))
  for (const track of clip.tracks) {
    track.trim(from, to).shift(-from)
  }
  clip.duration = to - from
}

/**
 * The second at which an opening crouch is over: once the hips have come up (to their highest
 * point) and landed back at standing height. 0 if there's no crouch.
 */
export function crouchEnd(clip, vrm) {
  const hips = vrm.humanoid.getNormalizedBoneNode('hips')
  const track = hips && clip.tracks.find(one => one.name === `${hips.name}.position`)
  if (!track || track.times.length < 3) {
    return 0
  }
  const heights = track.times.map((_, k) => track.values[k * 3 + 1])
  const top = Math.max(...heights)
  const first = heights[0]
  // No crouch: she starts within 5% of her highest point.
  if (first >= top * 0.95) {
    return 0
  }
  const up = heights.findIndex(y => y >= top * 0.97)
  const settled = heights.at(-1)
  const landed = heights.findIndex((y, k) => k > up && Math.abs(y - settled) < 0.015)
  return landed > 0 ? Math.min(track.times[landed], clip.duration - 1) : 0
}

/** Applies `motions.json`'s `trim` setting: "crouch", or { start, end } in seconds. */
export function applyTrim(clip, vrm, trim) {
  if (trim === 'crouch') {
    const start = crouchEnd(clip, vrm)
    if (start > 0) {
      trimClip(clip, start)
    }
  } else if (trim && typeof trim === 'object') {
    trimClip(clip, Number(trim.start) || 0, Number(trim.end) || clip.duration)
  }
}
