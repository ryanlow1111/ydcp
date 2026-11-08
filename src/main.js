// YDCP front end: shows the chosen model from ~/.ydcp/models on the desktop, with the built-in
// moments and any motions from ~/.ydcp/anims. Clicks pass through everywhere except on her;
// drag her to move her, click to poke her. The menu (in the app) picks models, motions, vibes,
// faces and size. She has her own mood (mood.js): sleepy when you're away, a hello when you're
// back, musings; and, only if the agent link is on, a cheer when an agent finishes.
// With no model yet, a welcome card helps add one.

import { getVersion } from '@tauri-apps/api/app'
import { createPet, parseMotion } from './pet.js'
import { createHitTest } from './hit.js'
import { wireGestures } from './gestures.js'
import { setLanguage, t, translatePage } from './i18n.js'
import { isStandard, motionEntries, parseJson } from './library.js'
import { inspectModel, modelNotes } from './modelinfo.js'
import { createMood } from './mood.js'
import { createReminders, span } from './reminders.js'
import {
  addModel,
  appLanguage,
  breakEvery,
  setTimerLeft,
  showPet,
  currentModel,
  frameRate,
  savedOutfit,
  petScale,
  setPetScale,
  listAnims,
  modelsFolder,
  moveWindowTo,
  onAgent,
  onCursor,
  onLibraryChange,
  onPick,
  onProblem,
  readAnim,
  readModel,
  readMotions,
  readProfile,
  setCatalogue,
  setClickThrough,
  sortOutfit,
  showWindow,
  windowPosition,
  windowScale,
} from './bridge.js'

const canvas = document.getElementById('stage')
const bubble = document.getElementById('bubble')
const card = document.getElementById('card')
const cardText = document.getElementById('card-text')
const cardPath = document.getElementById('card-path')
const about = document.getElementById('about')
const modelCard = document.getElementById('model-card')

let pet = null
let hit = null
let model = null
/** Loaded library motions, kept for a pet created later. */
let library = []
/** What the current model's file says it has and lacks (modelinfo.js). */
let modelReport = null
/** The current model's outfit parts as the user sorted them in About this model, or null (YDCP decides). */
let outfitParts = null
/** Credits for the motions in use (from motions.json). */
let motionCredits = []
const mood = createMood({ now: Date.now() })
const reminders = createReminders({ now: Date.now() })

// ---- Speech bubble ---------------------------------------------------------------------------

let bubbleTimer = 0
/** Shows `line` in her bubble for a few seconds. */
function say(line, { talk = true, hold = 0 } = {}) {
  if (!line) {
    return
  }
  if (talk) {
    pet?.talk(line)
  }
  clearTimeout(bubbleTimer)
  bubble.textContent = line
  bubble.classList.remove('hidden')
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), Math.max(hold, 2500 + line.length * 60))
}

// ---- Her mood ----------------------------------------------------------------------------------

/** Carries out what the mood decided (see mood.js). */
function act(actions) {
  if (!pet || !model) {
    return
  }
  for (const action of actions) {
    switch (action.do) {
      case 'sleep':
        pet.setAsleep(true)
        say(action.line)
        break
      case 'wake':
        pet.setAsleep(false)
        if (action.line) {
          pet.playMoment('wave', { quiet: true })
          say(action.line)
        }
        break
      case 'greet':
        pet.playMoment('wave', { quiet: true })
        say(action.line)
        break
      case 'cheer':
        pet.setAsleep(false)
        pet.cheer()
        say(action.line)
        break
      case 'say':
        say(action.line)
        break
    }
  }
}

// ---- Reminders (Menu → Reminders): a break after a stretch of work, and a timer -----------------

/** A reminder is due: she waves and says so, and her bubble stays up a while. */
async function remind({ kind, line }) {
  if (!pet || !model) {
    return
  }
  if (kind === 'timer') {
    // You asked for this one, so she comes back if she was hidden.
    await showPet().catch(() => {})
  }
  if (mood.asleep) {
    act(mood.activity(Date.now()))
  }
  pet.playMoment('wave', { quiet: true })
  say(line, { hold: 20000 })
}

function tickReminders(time) {
  for (const action of reminders.tick(time)) {
    remind(action)
  }
  setTimerLeft(reminders.timerLeft(time)).catch(() => {})
}

setInterval(() => {
  const time = Date.now()
  act(mood.tick(time))
  tickReminders(time)
}, 5000)

// ---- Cards (they catch every click while shown) ------------------------------------------------

/** Shows a card; while any card is up, the window catches clicks so its buttons work. */
function openCard(element) {
  if (element.hidden) {
    element.hidden = false
    if (hit) {
      hit.hold()
    } else {
      setClickThrough(false).catch(() => {})
    }
  }
}

function closeCard(element) {
  if (!element.hidden) {
    element.hidden = true
    hit?.release()
  }
}

/** The problem the welcome card explains, if any (kept so a language change can redraw it). */
let welcomeProblem = null

/** The welcome / "add a model" card, with an optional problem to explain. */
async function showWelcome(problem) {
  welcomeProblem = problem ?? null
  cardText.textContent = problem ?? t('page.welcome')
  try {
    cardPath.textContent = await modelsFolder()
  } catch {
    cardPath.textContent = '~/.ydcp/models'
  }
  openCard(card)
  await showWindow()
}

document.getElementById('add-model').addEventListener('click', () => addModel())
document.getElementById('about-close').addEventListener('click', () => closeCard(about))
document.getElementById('model-close').addEventListener('click', () => closeCard(modelCard))

/** About this model: what it has and lacks, in plain words. */
function showModelCard() {
  if (!modelReport) {
    return
  }
  const { summary } = modelReport
  const megabytes = (summary.bytes / 1024 / 1024).toFixed(1)
  document.getElementById('model-name').textContent = summary.name || model
  document.getElementById('model-facts').textContent = [
    summary.author && t('card.by', { author: summary.author }),
    `VRM ${summary.version}`,
    t('card.megabytes', { n: megabytes }),
    t('card.triangles', { n: Math.round(summary.triangles / 1000) }),
  ]
    .filter(Boolean)
    .join(' · ')
  const { faces, outfit } = pet.catalogue()
  const list = document.getElementById('model-notes')
  // The notes follow how the expressions are sorted now (the user's choice, the profile, or the guess).
  list.replaceChildren(
    ...modelNotes(summary, outfit).map(({ level, text }) => {
      const item = document.createElement('li')
      item.className = level
      item.textContent = text
      return item
    }),
  )
  showSorting(faces, outfit)
  const { allowedUser, redistribution } = summary.licence
  document.getElementById('model-licence').textContent = t('card.licence', { use: allowedUser ?? t('card.notStated'), redistribution: redistribution ?? t('card.notStated') })
  closeCard(about)
  openCard(modelCard)
}

/**
 * About this model's "Faces and outfit" chips: the model's own expressions (not the standard
 * ones), in two groups. Clicking one moves it to the other group, for models YDCP sorts wrong.
 */
function showSorting(faces, outfit) {
  const section = document.getElementById('model-sort')
  const custom = faces.filter(name => !isStandard(name))
  section.hidden = custom.length + outfit.length === 0
  const group = (label, names) => {
    const row = document.createElement('div')
    row.className = 'chips'
    const title = document.createElement('span')
    title.textContent = label
    row.append(title)
    for (const name of names) {
      const chip = document.createElement('button')
      chip.type = 'button'
      chip.className = 'chip'
      chip.textContent = name
      chip.title = outfit.includes(name) ? t('card.moveToFaces') : t('card.moveToOutfit')
      chip.addEventListener('click', () => resortOutfit(outfit.includes(name) ? outfit.filter(part => part !== name) : [...outfit, name]))
      row.append(chip)
    }
    if (names.length === 0) {
      const none = document.createElement('span')
      none.className = 'none'
      none.textContent = t('card.none')
      row.append(none)
    }
    return row
  }
  document.getElementById('model-sort-groups').replaceChildren(group(t('card.faces'), custom), group(t('card.outfit'), outfit))
  document.getElementById('model-sort-reset').hidden = outfitParts === null
}

/** Saves the user's sorting (null: YDCP decides again) and shows it everywhere. */
async function resortOutfit(parts) {
  if (!pet || !model) {
    return
  }
  outfitParts = parts
  pet.setOutfitParts(parts)
  showModelCard()
  await sortOutfit(model, parts, pet.catalogue().wearing).catch(error => console.error(`[ydcp] ${error}`))
  await setCatalogue(pet.catalogue()).catch(() => {})
}

document.getElementById('model-sort-reset').addEventListener('click', () => resortOutfit(null))

/** About YDCP: version, the model's credit and licence, motion credits, privacy. */
async function showAbout() {
  document.getElementById('about-version').textContent = await getVersion().catch(() => '')
  const details = document.getElementById('about-details')
  details.replaceChildren()
  const add = (term, text) => {
    if (!text) {
      return
    }
    const dt = document.createElement('dt')
    dt.textContent = term
    const dd = document.createElement('dd')
    dd.textContent = text
    details.append(dt, dd)
  }
  const info = model ? pet?.describe() : null
  if (info) {
    add(t('about.model'), `${info.name ?? model} (VRM ${info.version})`)
    add(t('about.credit'), info.credit)
    const { allowedUser, redistribution, url } = info.licence
    add(
      t('about.licence'),
      [allowedUser && t('about.use', { value: allowedUser }), redistribution !== undefined && t('about.redistribution', { value: redistribution }), url && url !== 'undefined' && url]
        .filter(Boolean)
        .join(' · '),
    )
  }
  add(t('about.motions'), motionCredits.join(' · '))
  add(t('about.builtWith'), 'Tauri, three.js, three-vrm (MIT)')
  closeCard(modelCard)
  openCard(about)
  await showWindow()
}

// ---- Her model and motions ----------------------------------------------------------------

/** Creates the companion the first time it's needed, and wires her inputs. */
async function ensurePet() {
  if (pet) {
    return pet
  }
  pet = createPet({
    canvas,
    onFirstFrame: () => showWindow().catch(error => console.error(`[ydcp] couldn't show the window: ${error}`)),
    afterRender: () => hit?.afterRender(),
    onSay: say,
  })
  hit = createHitTest({
    renderer: pet.renderer,
    setClickThrough: on => setClickThrough(on).catch(error => console.error(`[ydcp] click-through: ${error}`)),
  })
  // Any card already showing keeps catching clicks.
  for (const element of [card, about, modelCard]) {
    if (!element.hidden) {
      hit.hold()
    }
  }
  pet.setLibrary(library)
  await onCursor(({ x, y, inside }) => {
    pet.lookAt(x, y)
    hit.aim(x, y, inside)
    act(mood.activity(Date.now()))
    reminders.activity(Date.now())
  })
  wireGestures({
    element: canvas,
    getWindowPosition: windowPosition,
    scale: windowScale,
    moveWindowTo,
    onPoke: () => {
      const wasAsleep = mood.asleep
      act(mood.activity(Date.now()))
      if (!wasAsleep) {
        pet.poke()
      }
    },
    onPress: down => (down ? hit.hold() : hit.release()),
  })
  wireResizing()
  return pet
}

/**
 * Any size: pinch on a trackpad, or ⌘/Ctrl + scroll, while over her. A plain scroll does
 * nothing, so scrolling past her never resizes her. Window resizes are sent one at a time.
 */
function wireResizing() {
  let scale = 1
  let wanted = null
  let sending = false
  let pinchStart = null
  petScale()
    .then(now => (scale = now))
    .catch(() => {})
  const send = async () => {
    if (sending || wanted === null) {
      return
    }
    sending = true
    const target = wanted
    wanted = null
    scale = await setPetScale(target).catch(() => scale)
    sending = false
    send()
  }
  const resizeTo = target => {
    wanted = Math.min(2, Math.max(0.5, target))
    send()
  }
  canvas.addEventListener(
    'wheel',
    event => {
      if (!(event.ctrlKey || event.metaKey) || pinchStart !== null) {
        return
      }
      event.preventDefault()
      const step = Math.max(-40, Math.min(40, event.deltaY))
      resizeTo((wanted ?? scale) * Math.exp(-step * 0.005))
    },
    { passive: false },
  )
  // Safari's pinch events (macOS); other WebViews send pinches as Ctrl + wheel.
  canvas.addEventListener('gesturestart', event => {
    event.preventDefault()
    pinchStart = wanted ?? scale
  })
  canvas.addEventListener('gesturechange', event => {
    event.preventDefault()
    if (pinchStart !== null) {
      resizeTo(pinchStart * event.scale)
    }
  })
  canvas.addEventListener('gestureend', event => {
    event.preventDefault()
    pinchStart = null
  })
}

/** Loads model `name` (with its profile) and shows her; no name shows the welcome card. */
async function loadModel(name) {
  if (!name) {
    model = null
    modelReport = null
    closeCard(modelCard)
    canvas.hidden = true
    return showWelcome()
  }
  try {
    const [bytes, profileText] = await Promise.all([readModel(name), readProfile(name).catch(() => null)])
    // A file we can't read this way still goes to the loader, which gives the real error.
    try {
      modelReport = inspectModel(bytes)
    } catch {
      modelReport = null
    }
    await ensurePet()
    pet.setFrameRate(await frameRate().catch(() => 60))
    canvas.hidden = false
    await pet.load(bytes, parseJson(profileText))
    const saved = await savedOutfit(name).catch(() => ({ wearing: [], parts: null }))
    outfitParts = saved.parts ?? null
    pet.setOutfitParts(outfitParts)
    pet.setOutfit(saved.wearing ?? [])
    model = name
    closeCard(card)
    await setCatalogue(pet.catalogue())
    act(mood.start(Date.now()))
  } catch (error) {
    console.error(`[ydcp] ${error?.stack ?? error}`)
    await showWelcome(t('page.couldntLoad', { name, error: error?.message ?? error }))
  }
}

/** (Re)loads the motions folder: every .vrma, with motions.json's settings. */
async function loadLibrary() {
  let files = []
  let settings = {}
  try {
    ;[files, settings] = await Promise.all([listAnims(), readMotions().then(text => parseJson(text))])
  } catch (error) {
    console.error(`[ydcp] motions folder: ${error}`)
  }
  const loaded = []
  for (const entry of motionEntries(files, settings)) {
    try {
      loaded.push({ ...entry, animation: await parseMotion(await readAnim(entry.file)) })
    } catch (error) {
      console.error(`[ydcp] motion "${entry.file}": ${error?.message ?? error}`)
    }
  }
  library = loaded
  motionCredits = [...new Set(loaded.map(entry => entry.credit).filter(Boolean))]
  if (pet) {
    pet.setLibrary(loaded)
    await setCatalogue(pet.catalogue()).catch(() => {})
  }
}

// ---- Language ---------------------------------------------------------------------------------

/** Shows everything in `code` ('en', 'ja', 'zh-Hans', 'zh-Hant'), redrawing whatever is open. */
function applyLanguage(code) {
  setLanguage(code)
  translatePage()
  if (!card.hidden) {
    cardText.textContent = welcomeProblem ?? t('page.welcome')
  }
  if (!modelCard.hidden) {
    showModelCard()
  }
  if (!about.hidden) {
    showAbout()
  }
  if (pet && model) {
    setCatalogue(pet.catalogue()).catch(() => {})
  }
}

// ---- Menu picks and app events ------------------------------------------------------------

async function start() {
  await onPick(({ kind, id }) => {
    switch (kind) {
      case 'model':
        loadModel(id)
        break
      case 'moment':
        pet?.playMoment(id)
        break
      case 'vibe':
        pet?.setVibe(id)
        break
      case 'face':
        pet?.holdFace(id ?? null)
        break
      case 'outfit':
        // The app has already saved the change and ticked the menu.
        if (id) {
          pet?.toggleOutfit(id)
        } else {
          pet?.setOutfit([])
        }
        break
      case 'frameRate':
        pet?.setFrameRate(Number(id))
        break
      case 'breakEvery':
        reminders.setBreakEvery(Number(id), Date.now())
        if (reminders.breakEvery > 0) {
          say(t('reminder.breakSet', { span: span(reminders.breakEvery).toLowerCase() }))
        }
        break
      case 'timer':
        reminders.startTimer(Number(id), Date.now())
        say(t('reminder.timerSet', { span: span(Number(id)).toLowerCase() }))
        tickReminders(Date.now())
        break
      case 'cancelTimer':
        reminders.cancelTimer()
        say(t('reminder.timerCancelled'))
        tickReminders(Date.now())
        break
      case 'about':
        showAbout()
        break
      case 'aboutModel':
        showModelCard()
        break
      case 'language':
        applyLanguage(id)
        break
    }
  })
  await onLibraryChange(() => loadLibrary())
  await onProblem(message => say(`⚠️ ${message}`, { talk: false }))
  await onAgent(state => act(mood.agent(state, Date.now())))

  applyLanguage(await appLanguage().catch(() => 'en'))
  reminders.setBreakEvery(await breakEvery().catch(() => 0), Date.now())
  await loadLibrary()
  await loadModel(await currentModel().catch(() => null))
}

start()
