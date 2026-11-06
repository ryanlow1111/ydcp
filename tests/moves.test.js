import { describe, expect, test } from 'vitest'
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

  test('VRM 0.x flips the centre-line pitch only', () => {
    const pose = () => ({ head: [0.3, 0, 0], leftUpperArm: [0.3, 0, 0] })
    const vrm1 = sampledClip(fakeVrm(), 'a', 1, pose, 1)
    const vrm0 = sampledClip(fakeVrm(), 'b', 1, pose, -1)
    const track = (clip, bone) => clip.tracks.find(one => one.name === `Normalized_${bone}.quaternion`).values[0]
    expect(track(vrm0, 'head')).toBeCloseTo(-track(vrm1, 'head'))
    expect(track(vrm0, 'leftUpperArm')).toBeCloseTo(track(vrm1, 'leftUpperArm'))
  })
})
