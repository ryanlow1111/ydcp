// YDCP front end entry point.
// M0: a placeholder card that proves the app builds and runs on macOS and Windows.
// The companion itself (three.js + three-vrm) arrives in M1; see docs/PLAN.md.

import { getVersion } from '@tauri-apps/api/app'

const status = document.getElementById('status')

/** Shows the app version once Tauri answers; in a plain browser (npm run dev) it says so. */
async function showVersion() {
  try {
    status.textContent = `Version ${await getVersion()} · the companion arrives in the next milestone.`
  } catch {
    status.textContent = 'Running outside the YDCP app (browser preview).'
  }
}

showVersion()
