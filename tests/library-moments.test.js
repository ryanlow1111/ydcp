import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { modelProfile, motionEntries, parseJson, tidyName } from '../src/library.js'
import { MOMENTS, MOMENT_IDS, blendPose, envelope, makeMoments } from '../src/moments.js'
import { crouchEnd, trimClip } from '../src/fixes.js'

const fakeVrm = () => ({
  humanoid: { getNormalizedBoneNode: name => ({ name: `Normalized_${name}`, position: new THREE.Vector3(0.2, 0, 0) }) },
})

describe('motions.json', () => {
  test('file motions get sensible defaults', () => {
    const [entry] = motionEntries(['my_dance-02.vrma'])
    expect(entry).toMatchObject({ id: 'my_dance-02', name: 'My dance 02', face: 'happy', line: null, random: true, loop: false, speed: 1 })
  })

  test('settings are applied, checked, and hidden files left out', () => {
    const entries = motionEntries(['a.vrma', 'b.vrma', 'c.vrma'], {
      'a.vrma': { name: 'Bang!', face: 'angry', line: 'Hmph!', trim: 'crouch', speed: 1.5, credit: 'Someone' },
      'b.vrma': { hidden: true },
      'c.vrma': { face: 'grumpy', speed: -2, loop: 'yes', trim: 5 },
    })
    expect(entries.map(entry => entry.file)).toEqual(['a.vrma', 'c.vrma'])
    expect(entries[0]).toMatchObject({ name: 'Bang!', face: 'angry', line: 'Hmph!', trim: 'crouch', speed: 1.5, credit: 'Someone' })
    expect(entries[1]).toMatchObject({ face: 'happy', speed: 1, loop: false, trim: null })
  })

  test('two files with the same id stay apart', () => {
    const entries = motionEntries(['x.vrma', 'y.vrma'], { 'x.vrma': { id: 'wave' }, 'y.vrma': { id: 'wave' } })
    expect(new Set(entries.map(entry => entry.id)).size).toBe(2)
  })

  test('broken or missing JSON never throws', () => {
    expect(parseJson('{ nope')).toEqual({})
    expect(parseJson(null)).toEqual({})
    expect(parseJson('[1, 2]')).toEqual({})
    expect(parseJson('{"a": 1}')).toEqual({ a: 1 })
    expect(tidyName('VRMA_01.vrma')).toBe('VRMA 01')
  })
})

describe('model profiles', () => {
  test('defaults with no profile: no fixes, normal size', () => {
    expect(modelProfile()).toEqual({ name: null, credit: null, scale: 1, faces: {}, motionFixes: {} })
  })

  test('keeps valid settings, drops the rest', () => {
    const profile = modelProfile({
      name: 'Miku',
      scale: 99,
      faces: { angry: 'Angry_Custom', nonsense: 'x', happy: '' },
      motionFixes: { peace: { clearArms: { lift: 0.4 } }, bad: { other: 1 } },
    })
    expect(profile.name).toBe('Miku')
    expect(profile.scale).toBe(1)
    expect(profile.faces).toEqual({ angry: 'Angry_Custom' })
    expect(Object.keys(profile.motionFixes)).toEqual(['peace'])
  })
})

describe('built-in moments', () => {
  test('the envelope rises, holds and falls back to nothing', () => {
    expect(envelope(0, 3)).toBe(0)
    expect(envelope(1.5, 3)).toBe(1)
    expect(envelope(3, 3)).toBe(0)
    expect(envelope(0.2, 3)).toBeGreaterThan(0)
  })

  test('blending moves only toward the target bones', () => {
    const out = blendPose({ head: [0, 0, 0], spine: [1, 1, 1] }, { head: [1, 0, 0] }, 0.5)
    expect(out.head).toEqual([0.5, 0, 0])
    expect(out.spine).toEqual([1, 1, 1])
  })

  test('every moment is a valid clip that starts and ends in her resting pose', () => {
    const clips = makeMoments(fakeVrm())
    expect(Object.keys(clips)).toEqual(MOMENT_IDS)
    const rest = makeMoments(fakeVrm(), false, ['wave']).wave
    for (const [id, clip] of Object.entries(clips)) {
      expect(clip.duration).toBe(MOMENTS[id].duration)
      for (const track of clip.tracks) {
        expect(track.values.every(Number.isFinite), `${id} ${track.name}`).toBe(true)
      }
      // Frame 0: the envelope is 0, so arms are where they rest (same as any other moment's frame 0).
      const arm = track => track.name === 'Normalized_rightUpperArm.quaternion'
      const first = Array.from(clip.tracks.find(arm).values.slice(0, 4))
      const restFirst = Array.from(rest.tracks.find(arm).values.slice(0, 4))
      first.forEach((value, k) => expect(value).toBeCloseTo(restFirst[k], 5))
    }
  })

  test('every moment has a name, a face and something to say', () => {
    for (const moment of Object.values(MOMENTS)) {
      expect(moment.name).toBeTruthy()
      expect(moment.face).toBeTruthy()
      expect(moment.line).toBeTruthy()
    }
  })
})

describe('trimming file motions', () => {
  const clipWithHips = heights => {
    const times = heights.map((_, k) => k * 0.5)
    const values = heights.flatMap(y => [0, y, 0])
    const track = new THREE.VectorKeyframeTrack('Normalized_hips.position', times, values)
    return new THREE.AnimationClip('test', times.at(-1), [track])
  }

  test('finds the end of an opening crouch, once she has landed', () => {
    const clip = clipWithHips([0.3, 0.3, 0.6, 0.82, 0.77, 0.77, 0.77, 0.77])
    expect(crouchEnd(clip, fakeVrm())).toBe(2)
  })

  test('no crouch, no trim', () => {
    expect(crouchEnd(clipWithHips([0.77, 0.78, 0.77, 0.77]), fakeVrm())).toBe(0)
  })

  test('trimming shortens the clip and starts it at zero', () => {
    const clip = clipWithHips([0.1, 0.2, 0.3, 0.4, 0.5])
    trimClip(clip, 1, 1.5)
    expect(clip.duration).toBeCloseTo(0.5)
    expect(clip.tracks[0].times[0]).toBeCloseTo(0)
  })
})
