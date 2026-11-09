import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { CLASPED_HANDS, LOOP, VIBES, armsClasped, makeLoops, sampledClip, wave } from '../src/moves.js'
import { defaultBody, wristOf } from '../src/body.js'

/** A stand-in for a loaded VRM: every humanoid bone exists, named after itself. */
const fakeVrm = (missing = []) => ({
  humanoid: {
    getNormalizedBoneNode: name => (missing.includes(name) ? null : { name: `Normalized_${name}` }),
  },
})

describe('built-in motions', () => {
  test('wave is one smooth cycle per period', () => {
    expect(wave(0, 4)).toBeCloseTo(0)
    expect(wave(1, 4)).toBeCloseTo(1)
    expect(wave(4, 4)).toBeCloseTo(0)
  })

  test('makes idle, sway, bop and sleepy, each a full loop long', () => {
    const loops = makeLoops(fakeVrm())
    expect(Object.keys(loops).sort()).toEqual(['bop', 'idle', 'sleepy', 'sway'])
    for (const name of VIBES) {
      expect(loops[name]).toBeDefined()
    }
    for (const clip of Object.values(loops)) {
      expect(clip.duration).toBe(LOOP)
      expect(clip.tracks.length).toBeGreaterThan(5)
    }
  })

  test('every loop is valid quaternions and ends where it starts', () => {
    for (const pitchSign of [1, -1]) {
      for (const clip of Object.values(makeLoops(fakeVrm(), pitchSign))) {
        for (const track of clip.tracks) {
          const values = track.values
          expect(values.every(Number.isFinite), `${clip.name} ${track.name}`).toBe(true)
          for (let i = 0; i < values.length; i += 4) {
            const length = Math.hypot(values[i], values[i + 1], values[i + 2], values[i + 3])
            expect(length).toBeCloseTo(1, 5)
          }
          const first = Array.from(values.slice(0, 4))
          const last = Array.from(values.slice(-4))
          // Same rotation (q and -q are the same turn): |dot| ≈ 1.
          const dot = first.reduce((sum, value, k) => sum + value * last[k], 0)
          expect(Math.abs(dot), `${clip.name} ${track.name} loops smoothly`).toBeCloseTo(1, 4)
        }
      }
    }
  })

  test('skips bones the model does not have', () => {
    const clip = sampledClip(fakeVrm(['upperChest', 'leftShoulder']), 'test', 1, () => ({
      leftShoulder: [0, 0, 0.1],
      head: [0.1, 0, 0],
    }))
    expect(clip.tracks.map(track => track.name)).toEqual(['Normalized_head.quaternion'])
  })

  test('VRM 0.x models get every rotation turned 180° (x and z flipped)', () => {
    const pose = () => ({ head: [0.3, 0.2, 0.1], leftUpperArm: [0.4, 0.1, -1.2] })
    const vrm1 = sampledClip(fakeVrm(), 'a', 1, pose, false)
    const vrm0 = sampledClip(fakeVrm(), 'b', 1, pose, true)
    for (const bone of ['head', 'leftUpperArm']) {
      const q1 = vrm1.tracks.find(one => one.name === `Normalized_${bone}.quaternion`).values
      const q0 = vrm0.tracks.find(one => one.name === `Normalized_${bone}.quaternion`).values
      expect(q0[0]).toBeCloseTo(-q1[0])
      expect(q0[1]).toBeCloseTo(q1[1])
      expect(q0[2]).toBeCloseTo(-q1[2])
      expect(q0[3]).toBeCloseTo(q1[3])
    }
  })

  test('on a VRM 1.0 model the arms rest down at her sides', () => {
    // Right arm points along -x at rest (T-pose). Lowered, it should point mostly down (-y).
    const idle = makeLoops(fakeVrm(), false).idle
    const values = idle.tracks.find(one => one.name === 'Normalized_rightUpperArm.quaternion').values
    const q = new THREE.Quaternion(values[0], values[1], values[2], values[3])
    const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(q)
    expect(dir.y).toBeLessThan(-0.8)
  })

  test('hands are never flat: every loop curls her fingers', () => {
    const { idle } = makeLoops(fakeVrm())
    const names = idle.tracks.map(track => track.name)
    expect(names).toContain('Normalized_rightMiddleProximal.quaternion')
    expect(names).toContain('Normalized_leftMiddleProximal.quaternion')
  })

  test('hands held together rest one over the other, never in the same place', () => {
    const chibi = { ...defaultBody(), height: 0.9, upperArm: 0.13, lowerArm: 0.12, hand: 0.07, shoulder: { right: [-0.1, 0.62, 0], left: [0.1, 0.62, 0] }, hipsY: 0.38, frontZ: 0.08 }
    for (const body of [defaultBody(), chibi]) {
      const arms = armsClasped(body)
      const right = wristOf('right', body, { upper: arms.rightUpperArm, lower: arms.rightLowerArm })
      const left = wristOf('left', body, { upper: arms.leftUpperArm, lower: arms.leftLowerArm })
      // Her right hand lies in front of her left, at least a finger's thickness out…
      expect(right[2] - left[2]).toBeGreaterThan(body.height * 0.02)
      // …the wrists sit apart, each on its own side, and both are in front of her body.
      expect(right[0]).toBeLessThan(0)
      expect(left[0]).toBeGreaterThan(0)
      expect(left[0] - right[0]).toBeGreaterThan(body.hand * 0.4)
      expect(left[2]).toBeGreaterThan(body.frontZ)
    }
    // Relaxed: the wrists aren't turned, only the fingers curl.
    expect(CLASPED_HANDS.rightHand).toBeUndefined()
    expect(CLASPED_HANDS.leftHand).toBeUndefined()
    expect(CLASPED_HANDS.rightMiddleProximal).toBeDefined()
    expect(CLASPED_HANDS.leftMiddleProximal).toBeDefined()
  })
})
