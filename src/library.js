// The user's motion files and model profiles: turning `motions.json` and `<model>.json` into
// plain, checked settings, with defaults for anything missing or wrong. No file access here.

export const FACES = ['happy', 'angry', 'sad', 'surprised', 'relaxed', 'blink']

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
