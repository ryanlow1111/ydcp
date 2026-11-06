// The front end's only ways to reach the app (see src-tauri/capabilities/default.json).

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { PhysicalPosition, getCurrentWindow } from '@tauri-apps/api/window'

/** Where models go, as a path to show the user. */
export const modelsFolder = () => invoke('models_folder')

/** The `.vrm` file names in the models folder. */
export const listModels = () => invoke('list_models')

/** The chosen model's file name, or null if there are no models. */
export const currentModel = () => invoke('current_model')

/** One model file's bytes. */
export const readModel = name => invoke('read_model', { name })

/** A model's optional profile (`<model>.json`), as text or null. */
export const readProfile = model => invoke('read_profile', { model })

/** The `.vrma` file names in the motions folder. */
export const listAnims = () => invoke('list_anims')

/** One motion file's bytes. */
export const readAnim = name => invoke('read_anim', { name })

/** The motions folder's optional `motions.json`, as text or null. */
export const readMotions = () => invoke('read_motions')

/** Tells the menu which motions, vibes and faces she has. */
export const setCatalogue = catalogue => invoke('set_catalogue', { catalogue })

/** Opens the "Add a model" file picker (the app copies the file in and switches to it). */
export const addModel = () => invoke('add_model')

/** Shows the window (it starts hidden, so it never flashes empty). */
export const showWindow = () => getCurrentWindow().show()

/** Lets clicks pass through the window (true), or catches them (false). */
export const setClickThrough = on => invoke('set_click_through', { on })

/** Calls `handler({ x, y, inside })` whenever the cursor moves, wherever it is on screen. */
export const onCursor = handler => listen('cursor', event => handler(event.payload))

/** Calls `handler({ kind, id })` when a menu item for her is picked (moment, vibe, face, model, about). */
export const onPick = handler => listen('pick', event => handler(event.payload))

/** Calls `handler()` when the motions folder changed. */
export const onLibraryChange = handler => listen('library', () => handler())

/** Calls `handler(message)` when the app has a problem to report (e.g. a file it couldn't add). */
export const onProblem = handler => listen('problem', event => handler(event.payload))

/** The window's top-left corner, in physical pixels. */
export const windowPosition = () => getCurrentWindow().outerPosition()

/** The window's scale factor (physical pixels per logical pixel). */
export const windowScale = () => getCurrentWindow().scaleFactor()

/** Moves the window's top-left corner to (x, y) physical pixels. */
export const moveWindowTo = (x, y) => getCurrentWindow().setPosition(new PhysicalPosition(x, y))
