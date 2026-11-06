// YDCP front end: loads the first model in ~/.ydcp/models and shows her on the desktop.
// Clicks pass through everywhere except on her; drag her to move her, click to poke her.
// With no model yet, a small card explains where to put one.
// (M3 adds the Models menu, Add model…, and remembering your choice.)

import { createPet } from './pet.js'
import { createHitTest } from './hit.js'
import { wireGestures } from './gestures.js'
import {
  listModels,
  modelsFolder,
  moveWindowTo,
  onCursor,
  readModel,
  setClickThrough,
  showWindow,
  windowPosition,
  windowScale,
} from './bridge.js'

const canvas = document.getElementById('stage')
const card = document.getElementById('card')
const cardText = document.getElementById('card-text')
const cardPath = document.getElementById('card-path')
const reload = document.getElementById('reload')

let pet = null
let hit = null

/** Shows the "add a model" card, with an optional problem to explain. The card takes clicks. */
async function showCard(problem) {
  cardText.textContent = problem ?? 'Put a VRM model (.vrm) in your models folder, then click Reload.'
  try {
    cardPath.textContent = await modelsFolder()
  } catch {
    cardPath.textContent = '~/.ydcp/models'
  }
  card.hidden = false
  await setClickThrough(false).catch(() => {})
  await showWindow()
}

async function start() {
  card.hidden = true
  let models
  try {
    models = await listModels()
  } catch (error) {
    return showCard(`Couldn't look in the models folder: ${error}`)
  }
  if (models.length === 0) {
    return showCard()
  }
  const name = models[0]
  try {
    const bytes = await readModel(name)
    pet = createPet({
      canvas,
      onFirstFrame: () => showWindow().catch(error => console.error(`[ydcp] couldn't show the window: ${error}`)),
      afterRender: () => hit?.afterRender(),
    })
    hit = createHitTest({
      renderer: pet.renderer,
      setClickThrough: on => setClickThrough(on).catch(error => console.error(`[ydcp] click-through: ${error}`)),
    })
    await pet.load(bytes)
  } catch (error) {
    console.error(`[ydcp] ${error?.stack ?? error}`)
    return showCard(`Couldn't load "${name}": ${error?.message ?? error}`)
  }

  await onCursor(({ x, y, inside }) => {
    pet.lookAt(x, y)
    hit.aim(x, y, inside)
  })
  wireGestures({
    element: canvas,
    getWindowPosition: windowPosition,
    scale: windowScale,
    moveWindowTo,
    onPoke: () => pet.poke(),
    onPress: down => (down ? hit.hold() : hit.release()),
  })
}

reload.addEventListener('click', () => location.reload())

start()
