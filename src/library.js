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

/** Words in an expression's name that mean it changes her face, never her outfit. */
const FACE_WORDS = new Set(['smile', 'wink', 'blush', 'cheek', 'cheeks', 'tear', 'tears', 'cry', 'sweat', 'shy', 'joy', 'sorrow', 'fun', 'mouth', 'brow', 'eyebrow', 'tongue', 'teeth', 'pupil', 'highlight'])
const FACE_SIGNS = ['汗', '涙', '泪', '頬', '照れ', '脸红', '笑', '怒', '泣', '眉', '舌']
/** Words that mean it shows or hides something she wears (or a part like ears or a tail). */
const OUTFIT_WORDS = new Set([
  'hat', 'cap', 'beret', 'hood', 'helmet', 'crown', 'tiara', 'headband', 'headphone', 'headphones', 'headset',
  'glass', 'glasses', 'megane', 'sunglass', 'sunglasses', 'goggle', 'goggles', 'mask', 'eyepatch',
  'earring', 'earrings', 'piercing', 'ribbon', 'bow', 'tie', 'necktie', 'choker', 'necklace', 'collar', 'scarf', 'muffler',
  'cape', 'cloak', 'coat', 'jacket', 'hoodie', 'vest', 'shirt', 'sweater', 'skirt', 'pants', 'shorts', 'dress', 'apron', 'uniform',
  'outfit', 'cloth', 'clothes', 'costume', 'sock', 'socks', 'stocking', 'stockings', 'tights', 'shoe', 'shoes', 'boot', 'boots',
  'glove', 'gloves', 'bag', 'belt', 'wing', 'wings', 'tail', 'halo', 'ear', 'ears', 'horn', 'horns', 'hair', 'hairpin', 'hairclip',
  'accessory', 'accessories', 'acc', 'toggle', 'hide', 'hidden', 'show',
])
const OUTFIT_SIGNS = ['帽', '眼鏡', '眼镜', 'メガネ', 'めがね', 'リボン', 'ネクタイ', 'スカート', '服', '衣', '靴', '手袋', '尻尾', 'しっぽ', '羽', '髪飾', '发饰', 'アクセ', '耳', '表示', '隐藏', '隱藏', '显示', '上着', 'パーカー', 'マスク', 'ヘッドホン', '眼帯']

/** "Hat_01", "hatOn" → ["hat", "on"]. */
const wordsOf = name =>
  name
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter(Boolean)

const STANDARD = new Set([...FACES, ...NOT_FACES].map(name => name.toLowerCase()))
/** A standard expression, or a numbered one of them (happy01): always a face. */
const isStandard = name => STANDARD.has(name.toLowerCase().replace(/[\s_-]*\d+$/, ''))

/**
 * Splits a model's expressions into faces (she shows one at a time) and outfit parts (shown or
 * hidden, any number at once, alongside a face: a hat, glasses, a ribbon). `expressions` is
 * [{ name, binds, binary, targets }], `targets` being ids of the meshes and materials it changes.
 *
 * An expression is an outfit part if it isn't a face by name and either the model marks it as
 * on/off (binary), it changes only meshes and materials no standard face uses, or its name says
 * so (hat, glasses, 帽子…). A profile's `outfit` list replaces these guesses.
 */
export function sortExpressions(expressions, outfitNames = null) {
  const usable = expressions.filter(({ binds }) => binds > 0)
  let isOutfit
  if (Array.isArray(outfitNames)) {
    const wanted = new Set(outfitNames.map(name => name.toLowerCase()))
    isOutfit = ({ name }) => wanted.has(name.toLowerCase())
  } else {
    const faceTargets = new Set(usable.filter(({ name }) => isStandard(name)).flatMap(({ targets = [] }) => targets))
    isOutfit = ({ name, binary, targets = [] }) => {
      const words = wordsOf(name)
      if (isStandard(name) || words.some(word => FACE_WORDS.has(word)) || FACE_SIGNS.some(sign => name.includes(sign))) {
        return false
      }
      const elsewhere = faceTargets.size > 0 && targets.length > 0 && targets.every(target => !faceTargets.has(target))
      const named = words.some(word => OUTFIT_WORDS.has(word)) || OUTFIT_SIGNS.some(sign => name.includes(sign))
      return Boolean(binary) || elsewhere || named
    }
  }
  const outfit = [...new Set(usable.filter(isOutfit).map(({ name }) => name))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  return { faces: faceList(usable.filter(expression => !outfit.includes(expression.name))), outfit }
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
    // null: YDCP works out which expressions are outfit parts; a list says exactly which.
    outfit: Array.isArray(settings.outfit) ? settings.outfit.filter(isText) : null,
    motionFixes,
  }
}
