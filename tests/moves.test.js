import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { LOOP, VIBES, makeLoops, sampledClip, wave } from '../src/moves.js'

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

  test('the tuned loops look exactly as before on a VRM 0.x model', () => {
    // Before the VRM 1.0 conversion, a VRM 0.x model got: centre-line pitch flipped, all else as written.
    const loops = makeLoops(fakeVrm(), true)
    const sway = loops.sway
    const at = (bone, frame) => sway.tracks.find(one => one.name === `Normalized_${bone}.quaternion`).values.slice(frame * 4, frame * 4 + 4)
    // Prototype sway at t=0: clasped rightUpperArm [0, 0.4, -1.28]; head [0.02 (bow), y, 0].
    const arm = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0.4, -1.28))
    expect(at('rightUpperArm', 0)[0]).toBeCloseTo(arm.x)
    expect(at('rightUpperArm', 0)[2]).toBeCloseTo(arm.z)
    const head = new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.02, Math.sin(0.5 * Math.PI * 2) * 0.05, Math.sin(0) * 0.1))
    expect(at('head', 0)[0]).toBeCloseTo(head.x)
  })

  test('on a VRM 1.0 model the arms rest down at her sides', () => {
    // Right arm points along -x at rest (T-pose). Lowered, it should point mostly down (-y).
    const idle = makeLoops(fakeVrm(), false).idle
    const values = idle.tracks.find(one => one.name === 'Normalized_rightUpperArm.quaternion').values
    const q = new THREE.Quaternion(values[0], values[1], values[2], values[3])
    const dir = new THREE.Vector3(-1, 0, 0).applyQuaternion(q)
    expect(dir.y).toBeLessThan(-0.8)
  })
})
