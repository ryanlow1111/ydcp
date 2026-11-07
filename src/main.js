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
import { motionEntries, parseJson } from './library.js'
import { inspectModel } from './modelinfo.js'
import { createMood } from './mood.js'
import {
  addModel,
  currentModel,
  frameRate,
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
/** Credits for the motions in use (from motions.json). */
let motionCredits = []
const mood = createMood({ now: Date.now() })

// ---- Speech bubble ---------------------------------------------------------------------------

let bubbleTimer = 0
/** Shows `line` in her bubble for a few seconds. */
function say(line) {
  if (!line) {
    return
  }
  clearTimeout(bubbleTimer)
  bubble.textContent = line
  bubble.classList.remove('hidden')
  bubbleTimer = setTimeout(() => bubble.classList.add('hidden'), 2500 + line.length * 60)
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

setInterval(() => act(mood.tick(Date.now())), 5000)

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

/** The welcome / "add a model" card, with an optional problem to explain. */
async function showWelcome(problem) {
  cardText.textContent = problem ?? 'Add your VRM model to meet your companion.'
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
  const { summary, notes } = modelReport
  const megabytes = (summary.bytes / 1024 / 1024).toFixed(1)
  document.getElementById('model-name').textContent = summary.name || model
  document.getElementById('model-facts').textContent = [
    summary.author && `By ${summary.author}`,
    `VRM ${summary.version}`,
    `${megabytes} MB`,
    `${Math.round(summary.triangles / 1000)}k triangles`,
  ]
    .filter(Boolean)
    .join(' · ')
  const list = document.getElementById('model-notes')
  list.replaceChildren(
    ...notes.map(({ level, text }) => {
      const item = document.createElement('li')
      item.className = level
      item.textContent = text
      return item
    }),
  )
  const { allowedUser, redistribution } = summary.licence
  document.getElementById('model-licence').textContent = `Licence in the file: use ${allowedUser ?? 'not stated'}, redistribution ${redistribution ?? 'not stated'}.`
  closeCard(about)
  openCard(modelCard)
}

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
    add('Model', `${info.name ?? model} (VRM ${info.version})`)
    add('Credit', info.credit)
    const { allowedUser, redistribution, url } = info.licence
    add(
      'Model licence (from the file)',
      [allowedUser && `use: ${allowedUser}`, redistribution !== undefined && `redistribution: ${redistribution}`, url && url !== 'undefined' && url]
        .filter(Boolean)
        .join(' · '),
    )
  }
  add('Motions', motionCredits.join(' · '))
  add('Built with', 'Tauri, three.js, three-vrm (MIT)')
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
  return pet
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
    model = name
    closeCard(card)
    await setCatalogue(pet.catalogue())
    act(mood.start(Date.now()))
  } catch (error) {
    console.error(`[ydcp] ${error?.stack ?? error}`)
    await showWelcome(`Couldn't load "${name}": ${error?.message ?? error}`)
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
      case 'frameRate':
        pet?.setFrameRate(Number(id))
        break
      case 'about':
        showAbout()
        break
      case 'aboutModel':
        showModelCard()
        break
    }
  })
  await onLibraryChange(() => loadLibrary())
  await onProblem(message => say(`⚠️ ${message}`))
  await onAgent(state => act(mood.agent(state, Date.now())))

  await loadLibrary()
  await loadModel(await currentModel().catch(() => null))
}

start()
