import { describe, expect, test } from 'vitest'
import * as THREE from 'three'
import { modelProfile, motionEntries, parseJson, tidyName } from '../src/library.js'
import { MOMENTS, MOMENT_IDS, makeMoments } from '../src/moments.js'
import { defaultBody, solveArm, wristOf } from '../src/body.js'
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
  test('the set is Wave, Peace and Shy (Cheer and Stretch were removed)', () => {
    expect(MOMENT_IDS).toEqual(['wave', 'peace', 'shy'])
  })

  test('every moment is a valid clip of the right length', () => {
    const clips = makeMoments(fakeVrm())
    expect(Object.keys(clips)).toEqual(MOMENT_IDS)
    for (const [id, clip] of Object.entries(clips)) {
      expect(clip.duration).toBe(MOMENTS[id].duration)
      for (const track of clip.tracks) {
        expect(track.values.every(Number.isFinite), `${id} ${track.name}`).toBe(true)
      }
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

describe('placing her hands (fits any proportions)', () => {
  const chibi = {
    ...defaultBody(),
    height: 1.6,
    upperArm: 0.17,
    lowerArm: 0.16,
    shoulder: { right: [-0.1, 0.98, 0], left: [0.1, 0.98, 0] },
  }
  const distance = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

  for (const [name, body] of [['tall', defaultBody()], ['chibi', chibi]]) {
    for (const side of ['right', 'left']) {
      test(`${name}, ${side} arm: the wrist lands on a reachable target`, () => {
        const shoulder = body.shoulder[side]
        const reach = body.upperArm + body.lowerArm
        const out = side === 'right' ? -1 : 1
        for (const offset of [
          [out * 0.4, 0.4, 0.2],
          [out * 0.3, -0.6, 0.2],
          [-out * 0.2, -0.5, 0.45],
        ]) {
          const target = shoulder.map((v, i) => v + offset[i] * reach)
          expect(distance(wristOf(side, body, solveArm(side, body, target)), target)).toBeLessThan(0.002)
        }
      })
    }
  }

  test('a target out of reach: the arm stretches toward it, and stays valid', () => {
    const body = defaultBody()
    const target = [-2, 1.17, 0]
    const wrist = wristOf('right', body, solveArm('right', body, target))
    expect(wrist.every(Number.isFinite)).toBe(true)
    expect(wrist[0]).toBeLessThan(-0.5)
  })

  test('the elbow only bends one way: forward, about its own axis', () => {
    const body = defaultBody()
    const right = solveArm('right', body, [-0.2, 1.3, 0.1])
    const left = solveArm('left', body, [0.2, 1.3, 0.1])
    expect(right.lower[0]).toBe(0)
    expect(right.lower[2]).toBe(0)
    expect(right.lower[1]).toBeGreaterThan(0)
    expect(left.lower[1]).toBeLessThan(0)
  })

  test('a raised hand with the elbow out shows her palm to the front, without a wrist twist', () => {
    const body = defaultBody()
    const { upper, lower } = solveArm('right', body, [-0.25, 1.35, 0.05], [-0.8, -1, 0.1])
    const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(...upper))
    q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(...lower)))
    // A right palm faces -y in the T-pose.
    const palm = new THREE.Vector3(0, -1, 0).applyQuaternion(q)
    expect(palm.z).toBeGreaterThan(0.6)
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
