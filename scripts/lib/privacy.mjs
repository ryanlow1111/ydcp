// The privacy promise, checked in CI (see README "Privacy"):
// - app code (src/, index.html) must not contain web addresses or network APIs, except
//   links on an allow-list that open in the user's browser only when clicked;
// - no networking, updater or shell plugin may be added on either side;
// - the content security policy must stay set.

/** Links the app may show (opened in the browser on click only). Keep this list short. */
export const ALLOWED_URLS = [
  'https://github.com/ryanlow1111/ydcp',
  'https://vroid.com/en/studio',
  'https://hub.vroid.com/en',
  'https://booth.pm/en/search/VRM',
  'https://vroid.booth.pm/items/5512385',
]

/** Code that talks to the network. */
const NETWORK_APIS = [
  /\bfetch\s*\(\s*['"`]https?:/,
  /\bnew\s+WebSocket\s*\(/,
  /\bnew\s+EventSource\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bnavigator\.sendBeacon\b/,
]

/** Plugins and crates that would break the promise. */
export const FORBIDDEN_JS_PACKAGES = ['@tauri-apps/plugin-http', '@tauri-apps/plugin-updater', '@tauri-apps/plugin-shell', '@tauri-apps/plugin-websocket', '@tauri-apps/plugin-upload']
export const FORBIDDEN_CRATES = ['tauri-plugin-http', 'tauri-plugin-updater', 'tauri-plugin-shell', 'tauri-plugin-websocket', 'tauri-plugin-upload', 'reqwest', 'ureq', 'hyper', 'isahc', 'surf']

const URL = /https?:\/\/[^\s'"`)<>]+/g
const COMMENT_LINE = /^\s*(\/\/|\/\*|\*|<!--)/

/** Problems in one source file's text: web addresses outside comments, and network APIs. */
export function sourceProblems(file, text) {
  const problems = []
  text.split('\n').forEach((line, index) => {
    const where = `${file}:${index + 1}`
    if (COMMENT_LINE.test(line)) {
      return
    }
    for (const [url] of line.matchAll(URL)) {
      if (!ALLOWED_URLS.some(allowed => url === allowed || url.startsWith(`${allowed}/`))) {
        problems.push(`${where}: web address "${url}" (add it to ALLOWED_URLS only if it's a click-to-open link)`)
      }
    }
    for (const api of NETWORK_APIS) {
      if (api.test(line)) {
        problems.push(`${where}: network API (${api.source})`)
      }
    }
  })
  return problems
}

/** Problems in the dependency lists and Tauri config. */
export function configProblems({ packageJson, cargoToml, tauriConf }) {
  const problems = []
  const jsDeps = { ...packageJson.dependencies, ...packageJson.devDependencies }
  for (const name of FORBIDDEN_JS_PACKAGES) {
    if (name in jsDeps) {
      problems.push(`package.json: "${name}" is not allowed (privacy promise).`)
    }
  }
  for (const name of FORBIDDEN_CRATES) {
    if (new RegExp(`^\\s*${name.replace(/-/g, '[-_]')}\\s*=`, 'm').test(cargoToml)) {
      problems.push(`src-tauri/Cargo.toml: crate "${name}" is not allowed (privacy promise).`)
    }
  }
  const csp = tauriConf.app?.security?.csp
  if (typeof csp !== 'string' || !csp.includes("default-src 'self'")) {
    problems.push(`src-tauri/tauri.conf.json: app.security.csp must be set and start from "default-src 'self'".`)
  }
  if (tauriConf.plugins?.updater !== undefined) {
    problems.push('src-tauri/tauri.conf.json: the updater is not allowed (no auto-updates).')
  }
  return problems
}
