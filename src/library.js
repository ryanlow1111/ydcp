// The user's motion files and model profiles: turning `motions.json` and `<model>.json` into
// plain, checked settings, with defaults for anything missing or wrong. No file access here.

export const FACES = ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'blink']

/** Expressions that aren't faces: mouth shapes, gaze, one-eyed blinks, the neutral reset. */
const NOT_FACES = new Set(['neutral', 'aa', 'ih', 'ou', 'ee', 'oh', 'lookUp', 'lookDown', 'lookLeft', 'lookRight', 'blinkLeft', 'blinkRight'])

/**
 * The faces a model really has, for the menu: standard ones first, then its custom ones, then
 * blink. `expressions` is [{ name, binds }]; an expression that moves nothing is left out.
 */
export function faceList(expressions) {
  const usable = expressions.filter(({ name, binds }) => binds > 0 && !NOT_FACES.has(name)).map(({ name }) => name)
  const rank = name => {
    const standard = FACES.indexOf(name)
    return name === 'blink' ? 1000 : standard >= 0 ? standard : 100
  }
  return [...new Set(usable)].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))
}

/**
 * The model's expression for a face: the profile's mapping if it has one, else the same name,
 * else the same name in other capitals (some models have a custom "Surprised"), else its first
 * numbered variant (some only have happy01, happy02, …). Null if none.
 */
export function resolveFace(face, available, mapping = {}) {
  if (!face) {
    return null
  }
  const wanted = mapping[face] ?? face
  if (available.includes(wanted)) {
    return wanted
  }
  const lower = wanted.toLowerCase()
  const numbered = available
    .filter(name => name.toLowerCase().startsWith(lower) && /^[\s_-]*\d+$/.test(name.slice(lower.length)))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return available.find(name => name.toLowerCase() === lower) ?? numbered[0] ?? null
}

const isText = value => typeof value === 'string' && value.trim() !== ''

/** "my_dance-02" → "My dance 02". */
export function tidyName(fileName) {
  const words = fileName
    .replace(/\.[^.]+$/, '')
    .replace(/[_-]+/g, ' ')
    .trim()
  return words.charAt(0).toUpperCase() + words.slice(1)
}

/** Parses JSON text, giving `fallback` for missing or broken text (never throws). */
export function parseJson(text, fallback = {}) {
  if (!isText(text)) {
    return fallback
  }
  try {
    const value = JSON.parse(text)
    return value && typeof value === 'object' && !Array.isArray(value) ? value : fallback
  } catch {
    return fallback
  }
}

/**
 * The motions to offer, from the `.vrma` files in the folder and `motions.json`'s settings
 * (keyed by file name). Hidden ones are left out; the rest are sorted by name.
 */
export function motionEntries(fileNames, settings = {}) {
  const used = new Set()
  return fileNames
    .map(file => {
      const own = settings[file] && typeof settings[file] === 'object' ? settings[file] : {}
      const stem = file.replace(/\.vrma$/i, '')
      let id = isText(own.id) ? own.id.trim() : stem
      while (used.has(id)) {
        id = `${id}+`
      }
      used.add(id)
      const trim = own.trim === 'crouch' || (own.trim && typeof own.trim === 'object') ? own.trim : null
      return {
        file,
        id,
        name: isText(own.name) ? own.name.trim() : tidyName(file),
        face: FACES.includes(own.face) ? own.face : 'happy',
        line: isText(own.line) ? own.line.trim() : null,
        credit: isText(own.credit) ? own.credit.trim() : null,
        random: own.random !== false,
        onDone: own.onDone === true,
        loop: own.loop === true,
        trim,
        speed: Number.isFinite(own.speed) && own.speed > 0 ? Math.min(own.speed, 4) : 1,
        hidden: own.hidden === true,
      }
    })
    .filter(entry => !entry.hidden)
    .sort((a, b) => a.name.localeCompare(b.name))
}

/** A model profile's settings, checked, with defaults. */
export function modelProfile(settings = {}) {
  const faces = {}
  if (settings.faces && typeof settings.faces === 'object') {
    for (const [ours, theirs] of Object.entries(settings.faces)) {
      if (FACES.includes(ours) && isText(theirs)) {
        faces[ours] = theirs
      }
    }
  }
  const motionFixes = {}
  if (settings.motionFixes && typeof settings.motionFixes === 'object') {
    for (const [id, fix] of Object.entries(settings.motionFixes)) {
      if (fix?.clearArms && typeof fix.clearArms === 'object') {
        motionFixes[id] = { clearArms: fix.clearArms }
      }
    }
  }
  return {
    name: isText(settings.name) ? settings.name.trim() : null,
    credit: isText(settings.credit) ? settings.credit.trim() : null,
    scale: Number.isFinite(settings.scale) && settings.scale > 0.2 && settings.scale < 5 ? settings.scale : 1,
    faces,
    motionFixes,
  }
}
