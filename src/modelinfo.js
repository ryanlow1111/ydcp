// What a model has and lacks, read straight from its .vrm file: bones, expressions, hair physics,
// size and licence. Shared by the app (Models → About this model…) and the folder checker
// (npm run check:models), so they always agree. Plain data only: no drawing, no file access.

import { faceList, resolveFace } from './library.js'

const GLB_MAGIC = 0x46546c67 // "glTF"
const JSON_CHUNK = 0x4e4f534a // "JSON"

/** A .vrm is a binary glTF file; this reads its JSON part. Throws if it isn't one. */
export function readGlbJson(buffer) {
  const view = new DataView(buffer)
  if (buffer.byteLength < 20 || view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a VRM file (no glTF data inside).')
  }
  const length = view.getUint32(12, true)
  if (view.getUint32(16, true) !== JSON_CHUNK || 20 + length > buffer.byteLength) {
    throw new Error('This VRM file looks damaged.')
  }
  return JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 20, length)))
}

/** VRM 0.x expression presets, under the names YDCP (and VRM 1.0) use. */
const VRM0_PRESETS = {
  neutral: 'neutral',
  a: 'aa',
  i: 'ih',
  u: 'ou',
  e: 'ee',
  o: 'oh',
  blink: 'blink',
  joy: 'happy',
  angry: 'angry',
  sorrow: 'sad',
  fun: 'relaxed',
  lookup: 'lookUp',
  lookdown: 'lookDown',
  lookleft: 'lookLeft',
  lookright: 'lookRight',
  blink_l: 'blinkLeft',
  blink_r: 'blinkRight',
}

const count = list => (Array.isArray(list) ? list.length : 0)

/** The model's parts from its glTF JSON. `bytes` is the file's size. */
export function summarize(json, bytes = 0) {
  const vrm0 = json.extensions?.VRM
  const vrm1 = json.extensions?.VRMC_vrm
  const summary = { version: null, name: null, author: null, bytes, bones: [], expressions: [], springs: 0, licence: {} }

  if (vrm1) {
    const meta = vrm1.meta ?? {}
    summary.version = '1.0'
    summary.name = meta.name ?? null
    summary.author = count(meta.authors) > 0 ? meta.authors.join(', ') : null
    summary.bones = Object.keys(vrm1.humanoid?.humanBones ?? {})
    for (const group of [vrm1.expressions?.preset, vrm1.expressions?.custom]) {
      for (const [name, expression] of Object.entries(group ?? {})) {
        const binds = count(expression.morphTargetBinds) + count(expression.materialColorBinds) + count(expression.textureTransformBinds)
        summary.expressions.push({ name, binds })
      }
    }
    summary.springs = (json.extensions?.VRMC_springBone?.springs ?? []).reduce((sum, spring) => sum + count(spring.joints), 0)
    summary.licence = { allowedUser: meta.avatarPermission ?? null, redistribution: meta.allowRedistribution ?? null, url: meta.licenseUrl ?? null }
  } else if (vrm0) {
    const meta = vrm0.meta ?? {}
    summary.version = '0.x'
    summary.name = meta.title ?? null
    summary.author = meta.author ?? null
    summary.bones = (vrm0.humanoid?.humanBones ?? []).map(entry => entry.bone)
    for (const group of vrm0.blendShapeMaster?.blendShapeGroups ?? []) {
      const preset = (group.presetName ?? 'unknown').toLowerCase()
      summary.expressions.push({
        name: VRM0_PRESETS[preset] ?? group.name,
        binds: count(group.binds) + count(group.materialValues),
      })
    }
    summary.springs = (vrm0.secondaryAnimation?.boneGroups ?? []).reduce((sum, group) => sum + count(group.bones), 0)
    summary.licence = { allowedUser: meta.allowedUserName ?? null, redistribution: meta.licenseName ?? null, url: meta.otherLicenseUrl || meta.licenseUrl || null }
  }

  const accessors = json.accessors ?? []
  summary.triangles = (json.meshes ?? []).reduce(
    (sum, mesh) =>
      sum +
      (mesh.primitives ?? []).reduce((part, primitive) => {
        const accessor = accessors[primitive.indices ?? primitive.attributes?.POSITION]
        return part + Math.floor((accessor?.count ?? 0) / 3)
      }, 0),
    0,
  )
  summary.textureBytes = (json.images ?? []).reduce((sum, image) => sum + (json.bufferViews?.[image.bufferView]?.byteLength ?? 0), 0)
  summary.textures = count(json.images)
  return summary
}

const MB = 1024 * 1024
/** YDCP refuses bigger models (the same limit as the app's file reader). */
const MAX_MODEL_BYTES = 100 * MB
const REQUIRED_BONES = ['hips', 'head', 'leftUpperArm', 'rightUpperArm', 'leftLowerArm', 'rightLowerArm', 'leftHand', 'rightHand']
const STANDARD_FACES = ['happy', 'angry', 'sad', 'relaxed', 'surprised']

const listOf = (names, most = 10) => (names.length > most ? `${names.slice(0, most).join(', ')} and ${names.length - most} more` : names.join(', '))

/**
 * Plain-language notes about a model: { level, text }. `good` works as expected, `info` is worth
 * knowing, `warn` means something won't work on this model, `bad` means she can't be shown properly.
 */
export function modelNotes(summary) {
  const notes = []
  const add = (level, text) => notes.push({ level, text })
  if (!summary.version) {
    add('bad', 'This file has no VRM data, so YDCP can’t show it.')
    return notes
  }
  if (summary.bytes > MAX_MODEL_BYTES) {
    add('bad', `The file is ${Math.round(summary.bytes / MB)} MB, over YDCP’s 100 MB limit, so it won’t load.`)
  }

  const missing = REQUIRED_BONES.filter(bone => !summary.bones.includes(bone))
  if (missing.length > 0) {
    add('bad', `Missing body bones (${listOf(missing)}), so built-in motions can’t pose her properly.`)
  }

  const faces = faceList(summary.expressions)
  const custom = faces.filter(name => name !== 'blink' && !STANDARD_FACES.includes(name))
  const found = STANDARD_FACES.filter(face => resolveFace(face, faces))
  if (faces.filter(name => name !== 'blink').length === 0) {
    add('warn', 'No expressions: her face won’t change.')
  } else if (found.length === STANDARD_FACES.length) {
    add('good', 'Has all the standard faces, so moments and pokes change her expression.')
  } else if (found.length === 0) {
    add('warn', 'No standard faces, so moments and pokes won’t change her expression. Pick one from Motions → Expressions, or map them in a model profile.')
  } else {
    const lacking = STANDARD_FACES.filter(face => !found.includes(face))
    add('info', `Standard faces found: ${listOf(found)}. Not in this model: ${listOf(lacking)}.`)
  }
  if (custom.length > 0) {
    add('info', `${custom.length} custom expression${custom.length === 1 ? '' : 's'} in Motions → Expressions: ${listOf(custom)}.`)
  }
  if (!resolveFace('blink', faces)) {
    add('warn', 'No blink, so she won’t blink.')
  }

  if (summary.springs === 0) {
    add('warn', 'No hair or clothes physics, so her hair and skirt won’t move.')
  } else {
    add('good', 'Hair and clothes physics included.')
  }
  if (!summary.bones.some(bone => /(Index|Middle)Proximal$/.test(bone))) {
    add('info', 'No finger bones, so her fingers stay still and the Peace sign won’t show a V.')
  }
  if (!summary.bones.includes('leftEye') || !summary.bones.includes('rightEye')) {
    add('info', 'No eye bones, so her hands are placed using an estimate of where her face is.')
  }

  if (summary.triangles > 150_000 || summary.textureBytes > 40 * MB) {
    const details = [`${Math.round(summary.triangles / 1000)}k triangles`, `${Math.round(summary.textureBytes / MB)} MB of textures`].join(', ')
    add('info', `A heavy model (${details}), so she may load slowly and use more memory.`)
  }
  return notes
}

/** Reads a model file's bytes into its summary and notes. */
export function inspectModel(buffer) {
  const summary = summarize(readGlbJson(buffer), buffer.byteLength)
  return { summary, notes: modelNotes(summary) }
}
