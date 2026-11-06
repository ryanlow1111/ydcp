// Built-in motions, generated from smooth curves, so YDCP needs no motion files to feel alive.
// They drive VRM *normalized* bones, so they work on any VRM 0.x or 1.0 model.

import * as THREE from 'three'

/**
 * The centre line's pitch (hips to head) runs the other way in a VRM 0.x skeleton: there a
 * positive angle tips the head back. Poses here are written as for VRM 1.0 (+x bows forward);
 * `pitchSign` (-1 for VRM 0.x) flips them.
 */
export const CENTRE_LINE = new Set(['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'])

/** Every loop lasts a whole number of each rhythm in it, so its end joins its start smoothly. */
export const LOOP = 24

/** The loops she drifts between while she vibes. */
export const VIBES = ['idle', 'sway', 'bop']

/** One full cycle of `period` seconds, at phase `phase` (0..1). */
export const wave = (t, period, phase = 0) => Math.sin((t / period + phase) * Math.PI * 2)

/**
 * A clip sampled from smooth curves at 24 fps. `pose(t)` gives `[x, y, z]` Euler angles per
 * humanoid bone; bones the model doesn't have are skipped.
 */
export function sampledClip(vrm, name, duration, pose, pitchSign = 1) {
  const fps = 24
  const frames = Math.round(duration * fps)
  const times = Array.from({ length: frames + 1 }, (_, i) => (i / frames) * duration)
  const tracks = {}
  const euler = new THREE.Euler()
  const quat = new THREE.Quaternion()
  for (const time of times) {
    for (const [boneName, [x, y, z]] of Object.entries(pose(time))) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName)
      if (!node) {
        continue
      }
      quat.setFromEuler(euler.set(CENTRE_LINE.has(boneName) ? x * pitchSign : x, y, z))
      ;(tracks[node.name] ??= []).push(quat.x, quat.y, quat.z, quat.w)
    }
  }
  return new THREE.AnimationClip(
    name,
    duration,
    Object.entries(tracks).map(([nodeName, values]) => new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values)),
  )
}

/** The vibe loops: idle, sway, bop and sleepy, each `LOOP` seconds long. */
export function makeLoops(vrm, pitchSign = 1) {
  const clip = (name, pose) => sampledClip(vrm, name, LOOP, pose, pitchSign)

  // Arms at her sides; each part breathes and sways on its own rhythm.
  const rest = (t, droop = 0) => ({
    hips: [0, wave(t, 8, 0.1) * 0.03, wave(t, 8) * 0.02],
    spine: [wave(t, 4) * 0.02 + droop * 0.5, 0, wave(t, 8, 0.3) * -0.015],
    chest: [wave(t, 4, 0.15) * 0.025 + droop * 0.4, wave(t, 8, 0.6) * 0.02, 0],
    leftShoulder: [0, 0, wave(t, 4, 0.2) * 0.02 - droop * 0.1],
    rightShoulder: [0, 0, -wave(t, 4, 0.2) * 0.02 + droop * 0.1],
    leftUpperArm: [wave(t, 8, 0.4) * 0.04, 0, 1.2 - wave(t, 4, 0.25) * 0.025 + droop * 0.1],
    rightUpperArm: [wave(t, 8, 0.9) * 0.04, 0, -1.2 + wave(t, 4, 0.25) * 0.025 - droop * 0.1],
    leftLowerArm: [0, -0.2 + wave(t, 8, 0.5) * 0.04, 0],
    rightLowerArm: [0, 0.2 + wave(t, 8, 0.0) * 0.04, 0],
    neck: [droop * 0.6, wave(t, 8, 0.7) * 0.05, wave(t, 8, 0.2) * 0.02],
    head: [wave(t, 4, 0.35) * 0.015 + droop * 0.4, wave(t, 8, 0.45) * 0.06, wave(t, 8, 0.85) * 0.04],
  })

  // Hands clasped in front of her.
  const clasped = {
    leftUpperArm: [0, -0.4, 1.28],
    rightUpperArm: [0, 0.4, -1.28],
    leftLowerArm: [0, -0.9, 0],
    rightLowerArm: [0, 0.9, 0],
    leftHand: [0, 0, 0.2],
    rightHand: [0, 0, -0.2],
  }

  const idle = clip('idle', t => rest(t))

  // Sway: hands clasped, rocking side to side, head tilting the other way with each rock.
  const sway = clip('sway', t => ({
    ...rest(t),
    ...clasped,
    hips: [0, wave(t, 6, 0.25) * 0.05, wave(t, 3) * 0.06],
    spine: [wave(t, 1.5) * 0.01, 0, wave(t, 3) * -0.05],
    chest: [0, 0, wave(t, 3) * -0.03],
    neck: [0, wave(t, 6) * 0.04, wave(t, 3) * 0.04],
    head: [0.02, wave(t, 6, 0.5) * 0.05, wave(t, 3) * 0.1],
  }))

  // Bop: humming along to a tune in her head at an easy 100 BPM. Each nod dips quickly and
  // rises slowly; the chest leads and the neck and head follow a moment later; shoulders lift
  // one at a time and her weight rocks side to side each bar; the groove swells and settles.
  const BEAT = 0.6
  const BAR = BEAT * 2
  /** 0 at rest, 1 at the bottom of a nod: a soft, uneven pulse, quick down and slow up. */
  const pulse = t => {
    const u = (((t / BEAT) % 1) + 1) % 1
    return (1 - Math.cos(Math.PI * 2 * u ** 0.6)) / 2
  }
  /** How into it she is: swells and settles twice a loop. */
  const groove = t => 0.7 + 0.3 * wave(t, 12)
  const lift = (t, side) => Math.max(0, side * wave(t, BAR, 0.1)) ** 2
  const bop = clip('bop', t => {
    const g = groove(t)
    return {
      ...rest(t),
      ...clasped,
      hips: [0, wave(t, 8) * 0.03, wave(t, BAR) * 0.035 * g],
      spine: [pulse(t) * 0.015 * g, 0, wave(t, BAR, 0.05) * -0.025 * g],
      chest: [pulse(t - 0.03) * 0.025 * g, wave(t, 8, 0.3) * 0.025, wave(t, BAR, 0.1) * -0.015 * g],
      leftShoulder: [0, 0, lift(t, 1) * 0.05 * g],
      rightShoulder: [0, 0, -lift(t, -1) * 0.05 * g],
      leftLowerArm: [0, -0.9 - pulse(t - 0.05) * 0.03 * g, 0],
      rightLowerArm: [0, 0.9 + pulse(t - 0.05) * 0.03 * g, 0],
      neck: [pulse(t - 0.07) * 0.04 * g, wave(t, 8, 0.6) * 0.04, wave(t, BAR, 0.2) * 0.03 * g],
      head: [0.02 + pulse(t - 0.11) * 0.06 * g, wave(t, 8, 0.75) * 0.07, wave(t, BAR, 0.25) * 0.06 * g + wave(t, 12) * 0.03],
    }
  })

  // Sleepy: drooping, head tipped to one side, slow breaths.
  const sleepy = clip('sleepy', t => ({
    ...rest(t, 0.1),
    ...clasped,
    spine: [0.06 + wave(t, 6) * 0.035, 0, 0],
    head: [0.35 + wave(t, 6, 0.1) * 0.04, 0, 0.28],
  }))

  return { idle, sway, bop, sleepy }
}
