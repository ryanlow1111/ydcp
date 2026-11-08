// Pose lab: runs the companion in a normal browser tab (via `npm run dev`, then
// http://localhost:1420/dev/pose.html) to try and tune motions. Dev only — not part of the app.
// Models and motions come from the git-ignored dev/models and dev/anims folders.

import * as THREE from 'three'
import { createPet, parseMotion } from '../src/pet.js'
import { motionEntries, parseJson } from '../src/library.js'

const params = new URLSearchParams(location.search)
const modelName = params.get('model') ?? 'vrm1-sample'
// ?raf=timer keeps her animating in a hidden tab (browsers pause animation frames there).
if (params.get('raf') === 'timer') {
  window.requestAnimationFrame = callback => setTimeout(() => callback(performance.now()), 16)
}
const canvas = document.getElementById('stage')
// The canvas is 320×480 in a bigger page: make the pet think the window is that size.
Object.defineProperty(window, 'innerWidth', { get: () => 320 })
Object.defineProperty(window, 'innerHeight', { get: () => 480 })

const pet = createPet({ canvas, onSay: line => (document.getElementById('bubble').textContent = line) })

async function bytes(url) {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`${url}: ${response.status}`)
  }
  return response.arrayBuffer()
}

// A missing profile comes back as Vite's HTML fallback page, which parseJson turns into {}.
const profileText = await fetch(`./models/${modelName}.json`).then(r => (r.ok ? r.text() : '{}'))
const meta = await pet.load(await bytes(`./models/${modelName}.vrm`), parseJson(profileText))

const motionFiles = params.get('anims') === 'none' ? [] : ['VRMA_01.vrma', 'VRMA_02.vrma', 'VRMA_03.vrma', 'VRMA_04.vrma', 'VRMA_07.vrma']
const settings = await fetch('../docs/presets/vroid-motion-pack.motions.json').then(r => r.json())
const entries = []
for (const entry of motionEntries(motionFiles, settings)) {
  entries.push({ ...entry, animation: await parseMotion(await bytes(`./anims/${entry.file}`)) })
}
pet.setLibrary(entries)

/** Where bones are on the 320×480 canvas, in pixels from its top-left. */
function bones(names) {
  const { vrm, camera } = pet.debug()
  return Object.fromEntries(
    names.map(name => {
      const node = vrm.humanoid.getRawBoneNode(name)
      const at = node.getWorldPosition(new THREE.Vector3()).project(camera)
      return [name, { x: Math.round(((at.x + 1) / 2) * 320), y: Math.round(((1 - at.y) / 2) * 480) }]
    }),
  )
}

/** Freezes moment `id` at `t` seconds and measures `names` (canvas pixels). */
function at(id, t, names = ['rightHand', 'leftHand', 'rightLowerArm', 'head']) {
  pet.freezeAt(id, t)
  return bones(names)
}

window.__lab = { pet, meta, bones, at, play: id => pet.playMoment(id), ready: true }
