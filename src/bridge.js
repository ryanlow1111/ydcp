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

/** The chosen frame rate (60 or 30). */
export const frameRate = () => invoke('frame_rate')

/** The language in use: 'en', 'ja', 'zh-Hans' or 'zh-Hant' (the system's, or Menu → Language). */
export const appLanguage = () => invoke('app_language')

/** Her size as a factor of 320 × 480. */
export const petScale = () => invoke('pet_scale')

/** Resizes her (kept within limits and the screen); returns the size she got. */
export const setPetScale = scale => invoke('set_pet_scale', { scale })

/** Break reminders every so many minutes (0: off). */
export const breakEvery = () => invoke('break_every')

/** Tells the menu how many minutes are left on the timer (null: none running). */
export const setTimerLeft = minutes => invoke('set_timer_left', { minutes })

/** Shows her if she's hidden (a timer went off). */
export const showPet = () => invoke('show_pet')

/** What's remembered about model `model`'s outfit: { wearing, parts } (parts null: YDCP decides). */
export const savedOutfit = model => invoke('saved_outfit', { model })

/** Saves the user's sorting of `model`'s outfit parts (null: YDCP decides) and what she wears. */
export const sortOutfit = (model, parts, wearing) => invoke('sort_outfit', { model, parts, wearing })

/** Tells the menu which motions, vibes, faces and outfit parts she has. */
export const setCatalogue = catalogue => invoke('set_catalogue', { catalogue })

/** Opens the "Add a model" file picker (the app copies the file in and switches to it). */
export const addModel = () => invoke('add_model')

/** Shows the window (it starts hidden, so it never flashes empty). */
export const showWindow = () => getCurrentWindow().show()

/** Lets clicks pass through the window (true), or catches them (false). */
export const setClickThrough = on => invoke('set_click_through', { on })

/** Calls `handler({ x, y, inside })` whenever the cursor moves, wherever it is on screen. */
export const onCursor = handler => listen('cursor', event => handler(event.payload))

/** Calls `handler({ kind, id })` when a menu item for her is picked (moment, vibe, face, outfit, model, about). */
export const onPick = handler => listen('pick', event => handler(event.payload))

/** Calls `handler()` when the motions folder changed. */
export const onLibraryChange = handler => listen('library', () => handler())

/** Calls `handler({ mood, line })` when the agent link reports a new state (only while it's on). */
export const onAgent = handler => listen('agent', event => handler(event.payload))

/** Calls `handler(message)` when the app has a problem to report (e.g. a file it couldn't add). */
export const onProblem = handler => listen('problem', event => handler(event.payload))

/** The window's top-left corner, in physical pixels. */
export const windowPosition = () => getCurrentWindow().outerPosition()

/** The window's scale factor (physical pixels per logical pixel). */
export const windowScale = () => getCurrentWindow().scaleFactor()

/** Moves the window's top-left corner to (x, y) physical pixels. */
export const moveWindowTo = (x, y) => getCurrentWindow().setPosition(new PhysicalPosition(x, y))
