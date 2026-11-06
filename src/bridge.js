// The front end's only ways to reach the app (see src-tauri/capabilities/default.json).

import { invoke } from '@tauri-apps/api/core'
import { getCurrentWindow } from '@tauri-apps/api/window'

/** Where models go, as a path to show the user. */
export const modelsFolder = () => invoke('models_folder')

/** The `.vrm` file names in the models folder. */
export const listModels = () => invoke('list_models')

/** One model file's bytes. */
export const readModel = name => invoke('read_model', { name })

/** Shows the window (it starts hidden, so it never flashes empty). */
export const showWindow = () => getCurrentWindow().show()
