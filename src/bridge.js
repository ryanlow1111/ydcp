// The front end's only ways to reach the app (see src-tauri/capabilities/default.json).

import { invoke } from '@tauri-apps/api/core'
import { listen } from '@tauri-apps/api/event'
import { PhysicalPosition, getCurrentWindow } from '@tauri-apps/api/window'

/** Where models go, as a path to show the user. */
export const modelsFolder = () => invoke('models_folder')

/** The `.vrm` file names in the models folder. */
export const listModels = () => invoke('list_models')

/** One model file's bytes. */
export const readModel = name => invoke('read_model', { name })

/** Shows the window (it starts hidden, so it never flashes empty). */
export const showWindow = () => getCurrentWindow().show()

/** Lets clicks pass through the window (true), or catches them (false). */
export const setClickThrough = on => invoke('set_click_through', { on })

/** Calls `handler({ x, y, inside })` whenever the cursor moves, wherever it is on screen. */
export const onCursor = handler => listen('cursor', event => handler(event.payload))

/** The window's top-left corner, in physical pixels. */
export const windowPosition = () => getCurrentWindow().outerPosition()

/** The window's scale factor (physical pixels per logical pixel). */
export const windowScale = () => getCurrentWindow().scaleFactor()

/** Moves the window's top-left corner to (x, y) physical pixels. */
export const moveWindowTo = (x, y) => getCurrentWindow().setPosition(new PhysicalPosition(x, y))
