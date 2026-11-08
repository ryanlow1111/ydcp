import { describe, expect, test } from 'vitest'
import { TABLES } from '../src/i18n.js'
import * as THREE from 'three'
import { customLines, faceList, isTrackingShape, layeredLines, modelProfile, motionEntries, parseJson, resolveFace, sortExpressions, tidyName } from '../src/library.js'
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

describe('expressions: the menu lists what the model really has', () => {
  const list = (...names) => names.map(name => ({ name, binds: 1 }))

  test('standard faces first, then custom ones, then blink; mouth shapes and gaze left out', () => {
    const faces = faceList(list('aa', 'blink', 'Wink', 'sad', 'lookUp', 'happy', 'Blush', 'neutral', 'blinkLeft'))
    expect(faces).toEqual(['happy', 'sad', 'Blush', 'Wink', 'blink'])
  })

  test('expressions that move nothing are left out', () => {
    expect(faceList([{ name: 'angry', binds: 0 }, { name: 'happy', binds: 2 }])).toEqual(['happy'])
  })

  test('a model with no usable expressions has an empty list', () => {
    expect(faceList([])).toEqual([])
    expect(faceList(list('aa', 'neutral'))).toEqual([])
  })

  test('finds a face by name, in other capitals, or through the profile', () => {
    const faces = ['happy', 'Surprised', 'Smile_02']
    expect(resolveFace('happy', faces)).toBe('happy')
    expect(resolveFace('surprised', faces)).toBe('Surprised')
    expect(resolveFace('angry', faces)).toBeNull()
    expect(resolveFace('angry', faces, { angry: 'Smile_02' })).toBe('Smile_02')
    expect(resolveFace(null, faces)).toBeNull()
  })

  test('a model with only numbered faces uses its first one', () => {
    const faces = ['happy02', 'happy01', 'happy10', 'sad_1', 'happyish', 'blink']
    expect(resolveFace('happy', faces)).toBe('happy01')
    expect(resolveFace('sad', faces)).toBe('sad_1')
    expect(resolveFace('blink', faces)).toBe('blink')
    expect(resolveFace('angry', faces)).toBeNull()
  })
})

describe('face-tracking shapes (perfect sync) stay out of the menus', () => {
  test('the 52 ARKit shapes, in the spellings models use', () => {
    for (const name of ['eyeBlinkLeft', 'EyeBlinkLeft', 'eyeBlink_L', 'eyeBlinkL', 'ARKit_jawOpen', 'mouthSmile_R', 'tongueOut', 'cheekPuff', 'browInnerUp']) {
      expect(isTrackingShape(name), name).toBe(true)
    }
  })

  test('VSeeFace’s extra mouth shapes and brows', () => {
    for (const name of ['SIL', 'CH', 'DD', 'FF', 'KK', 'NN', 'PP', 'RR', 'SS', 'TH', 'Brows up', 'Brows down']) {
      expect(isTrackingShape(name), name).toBe(true)
    }
  })

  test('faces and outfit parts aren’t mistaken for them', () => {
    for (const name of ['happy', 'happy01', 'Smile_L', 'Wink', 'blink', 'Blush', 'hat01', 'Sil', 'Cool', 'mouth', 'sweat']) {
      expect(isTrackingShape(name), name).toBe(false)
    }
  })

  test('a perfect-sync model lists only its real faces', () => {
    const names = ['happy', 'angry', 'blink', 'eyeBlinkLeft', 'jawOpen', 'mouthSmileLeft', 'tongueOut', 'SIL', 'Brows up', 'Wink']
    const expressions = names.map(name => ({ name, binds: 1, targets: ['face'] }))
    expect(faceList(expressions)).toEqual(['happy', 'angry', 'Wink', 'blink'])
    expect(sortExpressions(expressions).outfit).toEqual([])
  })
})

describe('outfit parts: shown alongside a face, any number at once', () => {
  const face = (name, extra = {}) => ({ name, binds: 1, targets: ['face'], ...extra })

  test('the Lily case: parts the model marks on/off, on the same mesh as her face', () => {
    const { faces, outfit } = sortExpressions([
      face('aa'),
      face('blink'),
      face('happy01'),
      face('sad01'),
      face('sweat'),
      face('hat01', { binary: true }),
      face('hat02', { binary: true }),
      face('FBI', { binary: true }),
      face('Bow', { binary: true }),
    ])
    expect(outfit).toEqual(['Bow', 'FBI', 'hat01', 'hat02'])
    expect(faces).toEqual(['happy01', 'sad01', 'sweat', 'blink'])
  })

  test('parts on their own mesh, or named like clothes, count too', () => {
    const { faces, outfit } = sortExpressions([
      face('blink'),
      face('happy'),
      face('Smile_A'),
      face('Wings', { targets: ['wings mesh'] }),
      face('Glasses_On'),
      face('帽子'),
      face('メガネ'),
    ])
    expect(outfit).toEqual(['Glasses_On', 'Wings', '帽子', 'メガネ'].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })))
    expect(faces).toEqual(['happy', 'Smile_A', 'blink'])
  })

  test('faces stay faces, even when marked on/off or on their own mesh', () => {
    const { faces, outfit } = sortExpressions([
      face('blink', { binary: true }),
      face('happy02', { binary: true }),
      face('Blush', { targets: ['cheek mesh'] }),
      face('Tears', { binary: true }),
      face('汗'),
    ])
    expect(outfit).toEqual([])
    expect(faces).toContain('Blush')
  })

  test('a model with only face expressions has no outfit', () => {
    expect(sortExpressions([face('happy'), face('angry'), face('Wink')]).outfit).toEqual([])
    expect(sortExpressions([]).outfit).toEqual([])
  })

  test('a profile’s list replaces the guesses', () => {
    const expressions = [face('hat01', { binary: true }), face('Smile_A'), face('blink')]
    expect(sortExpressions(expressions, ['smile_a']).outfit).toEqual(['Smile_A'])
    expect(sortExpressions(expressions, []).outfit).toEqual([])
    expect(sortExpressions(expressions, []).faces).toEqual(['hat01', 'Smile_A', 'blink'])
  })
})

describe('her lines, customised (lines.json and model profiles)', () => {
  test('known categories only, text only, trimmed and cut to her bubble', () => {
    const long = 'あ'.repeat(200)
    const block = customLines({ greetings: ['  Hi!  ', '', 3, long], musings: 'Just one', nonsense: ['x'], mode: 'whatever' })
    expect(block.mode).toBe('add')
    expect(block.lists.greetings).toEqual(['Hi!', 'あ'.repeat(140)])
    expect(block.lists.musings).toEqual(['Just one'])
    expect(block.lists.nonsense).toBeUndefined()
  })

  test('nothing usable is no customisation at all', () => {
    for (const nothing of [null, undefined, 'hi', [], {}, { nonsense: ['x'] }]) {
      expect(customLines(nothing), JSON.stringify(nothing)).toBeNull()
    }
  })

  test('add mixes in, replace swaps; the profile goes on top of the shared file', () => {
    const hers = ['Hi hi~']
    const shared = customLines({ greetings: ['Hello!'] })
    const profile = customLines({ mode: 'replace', greetings: ['Hmph. Fine.'], pat: [] })
    expect(layeredLines(hers, [shared], 'greetings')).toEqual(['Hi hi~', 'Hello!'])
    expect(layeredLines(hers, [shared, profile], 'greetings')).toEqual(['Hmph. Fine.'])
    expect(layeredLines(['Ehehe…'], [shared, profile], 'pat')).toEqual([])
    expect(layeredLines(hers, [shared, null, profile], 'musings')).toEqual(hers)
  })

  test('a model profile can carry lines', () => {
    expect(modelProfile({ lines: { cheer: ['Yatta!'] } }).lines).toEqual({ mode: 'add', lists: { cheer: ['Yatta!'] } })
  })
})

describe('model profiles', () => {
  test('defaults with no profile: no fixes, normal size', () => {
    expect(modelProfile()).toEqual({ name: null, credit: null, scale: 1, faces: {}, outfit: null, lines: null, motionFixes: {} })
  })

  test('keeps valid settings, drops the rest', () => {
    const profile = modelProfile({
      name: 'Aiko',
      scale: 99,
      faces: { angry: 'Angry_Custom', nonsense: 'x', happy: '' },
      motionFixes: { peace: { clearArms: { lift: 0.4 } }, bad: { other: 1 } },
    })
    expect(profile.name).toBe('Aiko')
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

  test('every moment has a face, and a name and something to say in every language', () => {
    for (const [id, moment] of Object.entries(MOMENTS)) {
      expect(moment.face).toBeTruthy()
      for (const table of Object.values(TABLES)) {
        expect(table[`moment.${id}`], id).toBeTruthy()
        expect(table[`moment.${id}.line`], id).toBeTruthy()
      }
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
