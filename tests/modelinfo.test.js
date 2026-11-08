import { describe, expect, test } from 'vitest'
import { inspectModel, modelNotes, readGlbJson, summarize } from '../src/modelinfo.js'

const BODY = ['hips', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand']
const FULL_BODY = [...BODY, 'leftEye', 'rightEye', 'rightIndexProximal']

/** A minimal VRM 0.x file's JSON, with these blend shape groups. */
const vrm0 = (groups, bones = FULL_BODY, spring = [{ bones: [1, 2] }]) => ({
  extensions: {
    VRM: {
      meta: { title: 'Zero', author: 'Maker', allowedUserName: 'Everyone', licenseName: 'Redistribution_Prohibited' },
      humanoid: { humanBones: bones.map((bone, node) => ({ bone, node })) },
      blendShapeMaster: { blendShapeGroups: groups },
      secondaryAnimation: { boneGroups: spring },
    },
  },
})
const group = (name, presetName = 'unknown', binds = 1, isBinary = false) => ({ name, presetName, isBinary, binds: Array(binds).fill({ mesh: 0 }) })
const levels = notes => notes.map(note => note.level)
const says = (notes, words) => notes.some(note => note.text.includes(words))

/** Wraps JSON in a real binary glTF container. */
function glb(json) {
  const text = new TextEncoder().encode(JSON.stringify(json))
  const buffer = new ArrayBuffer(20 + text.length)
  const view = new DataView(buffer)
  view.setUint32(0, 0x46546c67, true)
  view.setUint32(4, 2, true)
  view.setUint32(8, buffer.byteLength, true)
  view.setUint32(12, text.length, true)
  view.setUint32(16, 0x4e4f534a, true)
  new Uint8Array(buffer, 20).set(text)
  return buffer
}

describe('reading a .vrm file', () => {
  test('reads the JSON inside a binary glTF', () => {
    expect(readGlbJson(glb({ hello: 1 }))).toEqual({ hello: 1 })
  })

  test('refuses files that aren’t glTF, or are cut short', () => {
    expect(() => readGlbJson(new TextEncoder().encode('this is not a model at all').buffer)).toThrow(/Not a VRM/)
    expect(() => readGlbJson(new ArrayBuffer(4))).toThrow(/Not a VRM/)
    expect(() => readGlbJson(glb({ a: 1 }).slice(0, 24))).toThrow(/damaged/)
  })

  test('VRM 0.x: presets get YDCP’s names; custom ones keep theirs', () => {
    const summary = summarize(vrm0([group('Joy', 'joy'), group('Sorrow', 'sorrow'), group('happy01'), group('A', 'a')]))
    expect(summary.version).toBe('0.x')
    expect(summary.expressions.map(one => one.name)).toEqual(['happy', 'sad', 'happy01', 'aa'])
    expect(summary.springs).toBe(2)
    expect(summary.licence.redistribution).toBe('Redistribution_Prohibited')
  })

  test('VRM 1.0: expressions, physics and licence', () => {
    const summary = summarize({
      extensions: {
        VRMC_vrm: {
          meta: { name: 'One', authors: ['A', 'B'], avatarPermission: 'everyone', allowRedistribution: true, licenseUrl: 'x' },
          humanoid: { humanBones: { hips: { node: 0 }, head: { node: 1 } } },
          expressions: { preset: { happy: { morphTargetBinds: [{}] }, angry: {} }, custom: { wink: { materialColorBinds: [{}] } } },
        },
        VRMC_springBone: { springs: [{ joints: [{}, {}, {}] }] },
      },
    })
    expect(summary.version).toBe('1.0')
    expect(summary.author).toBe('A, B')
    expect(summary.bones).toEqual(['hips', 'head'])
    expect(summary.expressions.map(({ name, binds }) => ({ name, binds }))).toEqual([
      { name: 'happy', binds: 1 },
      { name: 'angry', binds: 0 },
      { name: 'wink', binds: 1 },
    ])
    expect(summary.springs).toBe(3)
  })

  test('counts triangles and texture size', () => {
    const summary = summarize({
      meshes: [{ primitives: [{ indices: 0 }, { attributes: { POSITION: 1 } }] }],
      accessors: [{ count: 30 }, { count: 9 }],
      images: [{ bufferView: 0 }],
      bufferViews: [{ byteLength: 500 }],
    })
    expect(summary.triangles).toBe(13)
    expect(summary.textureBytes).toBe(500)
    expect(summary.textures).toBe(1)
    expect(summary.version).toBeNull()
  })
})

describe('plain-language notes', () => {
  const standard = [group('Joy', 'joy'), group('Angry', 'angry'), group('Sorrow', 'sorrow'), group('Fun', 'fun'), group('surprised'), group('Blink', 'blink')]
  const notesFor = (...args) => modelNotes(summarize(vrm0(...args)))

  test('a complete model has nothing to warn about', () => {
    const notes = notesFor(standard)
    expect(levels(notes)).not.toContain('warn')
    expect(levels(notes)).not.toContain('bad')
    expect(says(notes, 'all the standard faces')).toBe(true)
  })

  test('the Lily case: only numbered custom faces still count as standard where they can', () => {
    const notes = notesFor([group('happy01'), group('happy02'), group('angry01'), group('sad01'), group('silly'), group('Blink', 'blink')])
    expect(says(notes, 'Standard faces found: happy, angry, sad')).toBe(true)
    expect(says(notes, 'Not in this model: relaxed, surprised')).toBe(true)
    expect(says(notes, '5 custom expressions')).toBe(true)
    expect(levels(notes)).not.toContain('warn')
  })

  test('the Lily case: on/off parts are listed as her outfit, not her faces', () => {
    const notes = notesFor([group('happy01'), group('sad01'), group('hat01', 'unknown', 1, true), group('tie', 'unknown', 1, true), group('Blink', 'blink')])
    expect(says(notes, '2 outfit parts to show or hide, in the Outfit menu: hat01, tie')).toBe(true)
    expect(says(notes, '2 custom expressions')).toBe(true)
  })

  test('face-tracking shapes are counted, not listed as faces', () => {
    const notes = notesFor([...standard, group('eyeBlinkLeft'), group('jawOpen'), group('mouthSmileLeft')])
    expect(says(notes, '3 face-tracking shapes for VTuber apps')).toBe(true)
    expect(says(notes, 'custom expression')).toBe(false)
  })

  test('the notes follow the user’s own sorting', () => {
    const groups = [group('happy01'), group('Smile_A'), group('hat01', 'unknown', 1, true), group('Blink', 'blink')]
    const summary = summarize(vrm0(groups))
    expect(says(modelNotes(summary), '1 outfit part to show or hide, in the Outfit menu: hat01')).toBe(true)
    const sorted = modelNotes(summary, ['Smile_A'])
    expect(says(sorted, '1 outfit part to show or hide, in the Outfit menu: Smile_A')).toBe(true)
    expect(says(sorted, 'hat01')).toBe(true)
  })

  test('only custom names that match nothing: says so', () => {
    const notes = notesFor([group('Smile_A'), group('Blink', 'blink')])
    expect(notes.some(note => note.level === 'warn' && note.text.includes('No standard faces'))).toBe(true)
    expect(says(notes, '1 custom expression in')).toBe(true)
  })

  test('warns when her face can’t change or she can’t blink', () => {
    const notes = notesFor([group('A', 'a')])
    expect(says(notes, 'No expressions')).toBe(true)
    expect(says(notes, 'No blink')).toBe(true)
  })

  test('empty expressions count as missing', () => {
    expect(says(notesFor([group('Joy', 'joy', 0), group('Blink', 'blink', 0)]), 'No expressions')).toBe(true)
  })

  test('warns about missing physics, fingers and eyes', () => {
    const notes = notesFor(standard, BODY, [])
    expect(says(notes, 'No hair or clothes physics')).toBe(true)
    expect(says(notes, 'No finger bones')).toBe(true)
    expect(says(notes, 'No eye bones')).toBe(true)
  })

  test('serious: missing body bones, too big, or not a VRM', () => {
    expect(levels(notesFor(standard, ['hips', 'head']))).toContain('bad')
    const tooBig = modelNotes(summarize(vrm0(standard), 150 * 1024 * 1024))
    expect(tooBig.some(note => note.level === 'bad' && note.text.includes('150 MB'))).toBe(true)
    expect(levels(modelNotes(summarize({})))).toEqual(['bad'])
  })

  test('heavy models get a note', () => {
    const summary = { ...summarize(vrm0(standard)), triangles: 200_000 }
    expect(says(modelNotes(summary), '200k triangles')).toBe(true)
  })

  test('inspects a whole file', () => {
    const { summary, notes } = inspectModel(glb(vrm0(standard)))
    expect(summary.name).toBe('Zero')
    expect(notes.length).toBeGreaterThan(0)
  })
})
