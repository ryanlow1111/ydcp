// The real front end (index.html + src/main.js) in a normal browser tab, with the app's Rust
// side faked: via `npm run dev`, then http://localhost:1420/dev/app.html?model=lily. For trying
// cards and menus without the tray. Dev only — not part of the app. Models come from the
// git-ignored dev/models folder; settings live in this tab only.
//
// Console: __app.pick('aboutModel'), __app.pick('outfit', 'hat01'), __app.pick('face', 'happy01'),
// __app.pick('chattiness', 'quiet'),
// __app.emit('agent', { mood: 'done' }), __app.emit('cursor', { x: 300, y: 100, inside: true }),
// __app.emit('input'), __app.emit('woke', 3600), __app.settings, __app.catalogue,
// __pet.zoneAt(160, 120) (what a click there would land on)

const params = new URLSearchParams(location.search)
const modelName = `${params.get('model') ?? 'vrm1-sample'}.vrm`
// ?raf=timer keeps her animating in a hidden tab (browsers pause animation frames there).
if (params.get('raf') === 'timer') {
  window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16)
}

// The page itself: index.html's body, so this never drifts from the app.
const page = new DOMParser().parseFromString(await fetch('/index.html').then(r => r.text()), 'text/html')
document.body.prepend(...page.body.children)
const panel = Object.assign(document.createElement('div'), { id: 'dev-panel' })
panel.textContent = 'Dev only — the app with its Rust side faked.\n?model=lily (from dev/models)\nConsole: __app.pick(kind, id), __app.settings, __app.catalogue'
document.body.append(panel)

const callbacks = new Map()
const listeners = new Map()
let nextId = 1
// ?memory={"lastDay":"2026-11-01","streak":5} starts her with that memory; ?birthday=11-13 tells her yours.
const settings = { outfits: {}, outfitParts: {}, memory: params.get('memory') ? JSON.parse(params.get('memory')) : null }
const fake = {
  catalogue: null,
  settings,
  /** Fires an app event at the front end, as Rust's emit would. */
  emit(event, payload) {
    for (const id of listeners.get(event) ?? []) {
      callbacks.get(id)?.({ event, id, payload })
    }
  },
  /** A menu pick, as the tray menu sends it (outfit toggles are saved first, as in lib.rs). */
  pick(kind, id = null) {
    if (kind === 'outfit') {
      const wearing = fake.catalogue?.wearing ?? []
      settings.outfits[modelName] = id === null ? [] : wearing.includes(id) ? wearing.filter(name => name !== id) : [...wearing, id]
    }
    fake.emit('pick', { kind, id })
  },
}
window.__app = fake

const commands = {
  models_folder: () => '~/.ydcp/models (faked)',
  list_models: () => [modelName],
  current_model: () => modelName,
  read_model: async () => fetch(`./models/${modelName}`).then(r => r.arrayBuffer()),
  read_profile: async () => {
    const response = await fetch(`./models/${modelName.replace(/\.vrm$/, '.json')}`)
    const text = response.ok ? await response.text() : null
    return text?.trim().startsWith('{') ? text : null
  },
  list_anims: () => [],
  read_anim: () => {
    throw new Error('no motions in the dev page')
  },
  read_motions: () => null,
  read_lines: async () => {
    const response = await fetch('./models/lines.json')
    const text = response.ok ? await response.text() : null
    const own = text?.trim().startsWith('{') ? text : null
    return params.get('birthday') ? JSON.stringify({ ...JSON.parse(own ?? '{}'), birthday: params.get('birthday') }) : own
  },
  frame_rate: () => 60,
  app_language: () => params.get('lang') ?? 'en',
  pet_scale: () => 1,
  set_pet_scale: ({ scale }) => Math.min(2, Math.max(0.5, scale)),
  break_every: () => settings.breakEvery ?? 0,
  chattiness: () => settings.chattiness ?? 'calm',
  memory: () => settings.memory,
  remember: ({ memory }) => {
    settings.memory = memory
  },
  set_timer_left: ({ minutes }) => {
    fake.timerLeft = minutes
  },
  show_pet: () => {},
  saved_outfit: ({ model }) => ({ wearing: settings.outfits[model] ?? [], parts: settings.outfitParts[model] ?? null }),
  sort_outfit: ({ model, parts, wearing }) => {
    if (parts === null) {
      delete settings.outfitParts[model]
    } else {
      settings.outfitParts[model] = parts
    }
    settings.outfits[model] = wearing
  },
  set_catalogue: ({ catalogue }) => {
    fake.catalogue = catalogue
  },
  set_click_through: () => {},
  add_model: () => {},
  'plugin:app|version': () => 'dev',
  'plugin:event|listen': ({ event, handler }) => {
    listeners.set(event, [...(listeners.get(event) ?? []), handler])
    return handler
  },
  'plugin:event|unlisten': () => {},
  'plugin:window|show': () => {},
  'plugin:window|outer_position': () => ({ x: 0, y: 0 }),
  'plugin:window|scale_factor': () => 1,
  'plugin:window|set_position': () => {},
}

window.__TAURI_INTERNALS__ = {
  metadata: { currentWindow: { label: 'main' }, currentWebview: { windowLabel: 'main', label: 'main' } },
  transformCallback(callback, once) {
    const id = nextId++
    callbacks.set(id, payload => {
      if (once) {
        callbacks.delete(id)
      }
      callback(payload)
    })
    return id
  },
  unregisterCallback: id => callbacks.delete(id),
  async invoke(command, args = {}) {
    if (!(command in commands)) {
      throw new Error(`dev page: no fake for "${command}"`)
    }
    return commands[command](args)
  },
}
window.__TAURI_EVENT_PLUGIN_INTERNALS__ = { unregisterListener() {} }

// The canvas fills a 320×480 "window", like the app's Medium size.
Object.defineProperty(window, 'innerWidth', { get: () => 320 })
Object.defineProperty(window, 'innerHeight', { get: () => 480 })

await import('../src/main.js')
