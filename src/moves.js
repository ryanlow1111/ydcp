// Built-in motions, generated from smooth curves, so YDCP needs no motion files to feel alive.
// They drive VRM *normalized* bones, so they work on any VRM 0.x or 1.0 model.
//
// Poses are written in VRM 1.0 space, the same space VRM Animation (.vrma) files use: the
// model faces +z, her left arm points along +x. In that space, for example:
//   head/spine +x bows forward · rightUpperArm +z lowers the right arm (-z raises it)
//   leftUpperArm -z lowers the left arm · rightLowerArm +y bends the right elbow forward.
// Arms are placed by where the hand should be and solved for each body (body.js), so they fit
// any proportions.
// A VRM 0.x skeleton faces the other way (turned 180° about y), so for those models every
// rotation's x and z are flipped (`vrm0`), exactly as three-vrm-animation does for .vrma clips.

import * as THREE from 'three'
import { defaultBody, solveArm } from './body.js'

/** The body's centre line, hips to head. */
export const CENTRE_LINE = new Set(['hips', 'spine', 'chest', 'upperChest', 'neck', 'head'])

/** The same pose on the other side of the body: a right-arm pose made into a left-arm one. */
export const mirror = ([x, y, z]) => [x, -y, -z]

/** Every loop lasts a whole number of each rhythm in it, so its end joins its start smoothly. */
export const LOOP = 24

/** The loops she drifts between while she vibes. */
export const VIBES = ['idle', 'sway', 'bop']

/** One full cycle of `period` seconds, at phase `phase` (0..1). */
export const wave = (t, period, phase = 0) => Math.sin((t / period + phase) * Math.PI * 2)

/**
 * A clip sampled from smooth curves at 24 fps. `pose(t)` gives `[x, y, z]` Euler angles per
 * humanoid bone, in VRM 1.0 space; `vrm0` converts them for a VRM 0.x model. Bones the model
 * doesn't have are skipped.
 */
export function sampledClip(vrm, name, duration, pose, vrm0 = false) {
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
      quat.setFromEuler(vrm0 ? euler.set(-x, y, -z) : euler.set(x, y, z))
      ;(tracks[node.name] ??= []).push(quat.x, quat.y, quat.z, quat.w)
    }
  }
  return new THREE.AnimationClip(
    name,
    duration,
    Object.entries(tracks).map(([nodeName, values]) => new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values)),
  )
}

/** Adds poses together, bone by bone (for small angles, that's combining the turns). */
export function combine(...poses) {
  const out = {}
  for (const pose of poses) {
    for (const [bone, [x, y, z]] of Object.entries(pose)) {
      const was = out[bone] ?? [0, 0, 0]
      out[bone] = [was[0] + x, was[1] + y, was[2] + z]
    }
  }
  return out
}

/** A right-side pose (bones named right…) plus its mirror image on the left. */
export function bothSides(right) {
  const out = {}
  for (const [bone, value] of Object.entries(right)) {
    out[bone] = value
    out[bone.replace(/^right/, 'left')] = mirror(value)
  }
  return out
}

/** One hand's fingers, curled by these amounts (written for the right hand: +z curls). */
export function curledFingers({ index = 0.25, middle = 0.35, ring = 0.45, little = 0.5, thumb = 0.15 }) {
  const finger = (name, amount) => ({
    [`right${name}Proximal`]: [0, 0, amount],
    [`right${name}Intermediate`]: [0, 0, amount * 1.2],
    [`right${name}Distal`]: [0, 0, amount * 0.8],
  })
  return {
    ...finger('Index', index),
    ...finger('Middle', middle),
    ...finger('Ring', ring),
    ...finger('Little', little),
    rightThumbProximal: [0, -thumb, thumb],
    rightThumbDistal: [0, -thumb, 0],
  }
}

/** The right-side bones of a right-hand pose, mirrored for the left hand. */
export function leftOf(right) {
  return Object.fromEntries(Object.entries(right).map(([bone, value]) => [bone.replace(/^right/, 'left'), mirror(value)]))
}

/** Relaxed hands: gently curled fingers, never flat like a mannequin's. */
export const RELAXED_HANDS = bothSides(curledFingers({}))

/** Her body breathing and swaying, each part on its own rhythm. `droop` slumps her forward. */
export const breathing = (t, droop = 0) => ({
  hips: [0, wave(t, 8, 0.1) * 0.03, -wave(t, 8) * 0.02],
  spine: [wave(t, 4) * 0.02 + droop * 0.5, 0, wave(t, 8, 0.3) * 0.015],
  chest: [wave(t, 4, 0.15) * 0.025 + droop * 0.4, wave(t, 8, 0.6) * 0.02, 0],
  rightShoulder: [0, 0, wave(t, 4, 0.2) * 0.02 - droop * 0.1],
  leftShoulder: [0, 0, -wave(t, 4, 0.2) * 0.02 + droop * 0.1],
  neck: [droop * 0.6, wave(t, 8, 0.7) * 0.05, -wave(t, 8, 0.2) * 0.02],
  head: [wave(t, 4, 0.35) * 0.015 + droop * 0.4, wave(t, 8, 0.45) * 0.06, -wave(t, 8, 0.85) * 0.04],
})

/**
 * How people really stand: weight on one leg, the other knee soft, hips tipped one way and
 * shoulders the other. `side` 1 puts the weight on her right leg, -1 on her left. The legs turn
 * back against the hips, so her feet stay on the ground.
 */
export function stance(amount = 1, side = 1) {
  const tip = -0.045 * amount * side
  const relaxed = side > 0 ? 'left' : 'right'
  return combine(
    {
      hips: [0, 0.05 * amount * side, tip],
      spine: [0, -0.02 * amount * side, -tip * 0.6],
      chest: [0, -0.03 * amount * side, -tip * 0.5],
      neck: [0, 0, -tip * 0.3],
      rightUpperLeg: [0, 0, -tip],
      leftUpperLeg: [0, 0, -tip],
    },
    {
      [`${relaxed}UpperLeg`]: [-0.11 * amount, 0, 0],
      [`${relaxed}LowerLeg`]: [0.2 * amount, 0, 0],
      [`${relaxed}Foot`]: [-0.09 * amount, 0, 0],
    },
  )
}

/** Both arms from where each wrist should be; `targets(side)` gives [x, y, z]; `pole(side)` the elbow's lean. */
function armsTo(body, targets, pole) {
  const out = {}
  for (const side of ['right', 'left']) {
    const { upper, lower } = solveArm(side, body, targets(side), pole(side))
    out[`${side}UpperArm`] = upper
    out[`${side}LowerArm`] = lower
  }
  return out
}

const sideSign = side => (side === 'right' ? -1 : 1)

/** Arms hanging by her sides, clear of her body and skirt, elbows soft and a little back. */
export function armsDown(body, t = 0) {
  const reach = body.upperArm + body.lowerArm
  return armsTo(
    body,
    side => {
      const shoulder = body.shoulder[side]
      const out = Math.max(Math.abs(shoulder[0]) * 1.05, body.clearX + body.height * 0.02)
      return [sideSign(side) * out, shoulder[1] - reach * 0.93, body.height * 0.018 + wave(t, 8, side === 'right' ? 0.9 : 0.4) * body.height * 0.006]
    },
    side => [sideSign(side) * 0.5, 0, -1],
  )
}

/**
 * Hands held together in front of her, resting relaxed on her skirt or lower belly. The wrists
 * aren't turned: each hand hangs on from its forearm, her right resting just in front of her left
 * so the two never pass through each other. The wrists sit about a third of her own hand's length
 * apart (so small and large hands both fit), the right hand a hand's thickness further out.
 */
export function armsClasped(body, lift = 0) {
  const hand = body.hand ?? body.height * 0.065
  return armsTo(
    body,
    side => [
      sideSign(side) * hand * 0.3,
      body.hipsY + body.height * 0.015 + lift,
      body.frontZ + body.height * (side === 'right' ? 0.05 : 0.012),
    ],
    side => [sideSign(side) * 0.8, -0.3, -0.5],
  )
}

/** Fingers for the clasp: the right hand's, in front, curl gently over the left; the left's a little more. */
export const CLASPED_HANDS = {
  ...curledFingers({ index: 0.12, middle: 0.16, ring: 0.2, little: 0.24, thumb: 0.1 }),
  ...leftOf(curledFingers({ index: 0.3, middle: 0.38, ring: 0.45, little: 0.5 })),
}

/**
 * Held up by your hand while you drag her: shoulders hunched, arms a little out from her
 * sides, legs hanging with toes pointed and a slow, small kick. A short loop of its own.
 */
export function makeCarried(vrm, vrm0 = false, body = defaultBody()) {
  const reach = body.upperArm + body.lowerArm
  const arms = armsTo(
    body,
    side => {
      const shoulder = body.shoulder[side]
      const out = Math.max(Math.abs(shoulder[0]) * 1.05, body.clearX + body.height * 0.02) + body.height * 0.035
      return [sideSign(side) * out, shoulder[1] - reach * 0.86, body.height * 0.05]
    },
    side => [sideSign(side) * 0.5, 0, -1],
  )
  return sampledClip(
    vrm,
    'carried',
    4,
    t =>
      combine(arms, RELAXED_HANDS, bothSides({ rightShoulder: [0, 0, -0.1] }), {
        spine: [0.03, 0, 0],
        neck: [0.04, 0, 0],
        head: [0.05, 0, wave(t, 4) * 0.03],
        rightUpperLeg: [-0.1 + wave(t, 2) * 0.06, 0, 0.03],
        leftUpperLeg: [-0.1 - wave(t, 2) * 0.06, 0, -0.03],
        rightLowerLeg: [0.28 + wave(t, 2, 0.2) * 0.08, 0, 0],
        leftLowerLeg: [0.28 - wave(t, 2, 0.2) * 0.08, 0, 0],
        rightFoot: [0.4, 0, 0],
        leftFoot: [0.4, 0, 0],
      }),
    vrm0,
  )
}

/** The vibe loops: idle, sway, bop and sleepy, each `LOOP` seconds long, fitted to `body`. */
export function makeLoops(vrm, vrm0 = false, body = defaultBody()) {
  const clip = (name, pose) => sampledClip(vrm, name, LOOP, pose, vrm0)
  const clasped = armsClasped(body)

  // Idle: arms down, weight easing from one leg's side now and then.
  const idle = clip('idle', t =>
    combine(breathing(t), stance(0.85 + wave(t, 12) * 0.15), armsDown(body, t), RELAXED_HANDS),
  )

  // Sway: hands together, rocking side to side, head tilting the other way with each rock.
  const sway = clip('sway', t => ({
    ...combine(breathing(t), stance(0.5), clasped, CLASPED_HANDS),
    hips: [0, wave(t, 6, 0.25) * 0.05, -wave(t, 3) * 0.06],
    spine: [wave(t, 1.5) * 0.01, 0, wave(t, 3) * 0.05],
    chest: [0, 0, wave(t, 3) * 0.03],
    neck: [0, wave(t, 6) * 0.04, -wave(t, 3) * 0.04],
    head: [0.02, wave(t, 6, 0.5) * 0.05, -wave(t, 3) * 0.1],
    rightUpperLeg: [0, 0, wave(t, 3) * 0.06],
    leftUpperLeg: [0, 0, wave(t, 3) * 0.06],
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
      ...combine(breathing(t), armsClasped(body, -pulse(t - 0.05) * body.height * 0.004 * g), CLASPED_HANDS),
      hips: [0, wave(t, 8) * 0.03, -wave(t, BAR) * 0.035 * g],
      spine: [pulse(t) * 0.015 * g, 0, wave(t, BAR, 0.05) * 0.025 * g],
      chest: [pulse(t - 0.03) * 0.025 * g, wave(t, 8, 0.3) * 0.025, wave(t, BAR, 0.1) * 0.015 * g],
      leftShoulder: [0, 0, -lift(t, 1) * 0.05 * g],
      rightShoulder: [0, 0, lift(t, -1) * 0.05 * g],
      neck: [pulse(t - 0.07) * 0.04 * g, wave(t, 8, 0.6) * 0.04, -wave(t, BAR, 0.2) * 0.03 * g],
      head: [0.02 + pulse(t - 0.11) * 0.06 * g, wave(t, 8, 0.75) * 0.07, -wave(t, BAR, 0.25) * 0.06 * g - wave(t, 12) * 0.03],
      rightUpperLeg: [0, 0, wave(t, BAR) * 0.035 * g],
      leftUpperLeg: [0, 0, wave(t, BAR) * 0.035 * g],
    }
  })

  // Sleepy: drooping, head tipped to one side, slow breaths.
  const sleepy = clip('sleepy', t => ({
    ...combine(breathing(t, 0.1), stance(0.5), clasped, CLASPED_HANDS),
    spine: [0.06 + wave(t, 6) * 0.035, 0, 0],
    head: [0.35 + wave(t, 6, 0.1) * 0.04, 0, -0.28],
  }))

  return { idle, sway, bop, sleepy }
}
