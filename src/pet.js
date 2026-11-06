// The companion: draws a VRM model with three.js and keeps her alive — vibe loops that
// cross-fade, a head that follows the cursor, a soft smile and blinks.
// Everything here runs on the user's computer; nothing is fetched from the internet.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { makeLoops, VIBES } from './moves.js'

/**
 * At most this many frames a second: smooth on 60 Hz screens, and capped on 120 Hz ones to
 * spare the battery. Each frame costs about a millisecond.
 */
const MAX_FPS = 60
/** Seconds a loop takes to cross-fade into the next. */
const FADE = 0.6
/** How long her little hop takes when poked, in seconds. */
const POKE_HOP = 0.35

/**
 * Creates the companion on `canvas`. `onFirstFrame` runs once her first frame is drawn, so the
 * window can be shown without a flash of nothing. `afterRender` runs right after every frame,
 * while that frame's pixels can still be read (for click-through).
 */
export function createPet({ canvas, onFirstFrame = () => {}, afterRender = () => {} }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, premultipliedAlpha: true })
  renderer.setPixelRatio(Math.min(2, devicePixelRatio))
  renderer.setClearColor(0x000000, 0)
  renderer.outputColorSpace = THREE.SRGBColorSpace

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(26, 1, 0.1, 20)
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6b5a50, 1.6))
  const key = new THREE.DirectionalLight(0xffffff, 2.2)
  key.position.set(0.6, 1.6, 2.2)
  scene.add(key)

  const lookTarget = new THREE.Object3D()
  camera.add(lookTarget)
  scene.add(camera)

  // Her gentle turn rides on this holder, so the model's own turn (VRM 0.x) is never overwritten.
  const holder = new THREE.Group()
  scene.add(holder)

  /** Where her eyes and head aim, -1..1 each way; eased toward the cursor. */
  const cursor = { x: 0, y: 0 }

  /**
   * The cursor is at window-local (x, y) logical pixels, possibly far outside the window.
   * She turns toward it: fully when it's a window-and-a-half away, from around her face.
   */
  function lookAt(x, y) {
    const clamp = value => Math.max(-1, Math.min(1, value))
    cursor.x = clamp((x - innerWidth / 2) / (innerWidth * 1.5))
    cursor.y = clamp((y - innerHeight * 0.22) / innerHeight)
  }

  /** When she was last poked (seconds on the timer), or -Infinity. */
  let pokedAt = -Infinity

  let vrm = null
  let mixer = null
  let pitchSign = 1
  let body = null
  const loops = {}
  let base = null
  let nextVibe = 0

  /** Fits all of her in the window, feet near the bottom, a little air above her head. */
  function frameBody() {
    if (body === null) {
      return
    }
    const size = body.getSize(new THREE.Vector3())
    const center = body.getCenter(new THREE.Vector3())
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fitHeight = (size.y * 1.08) / 2 / half
    const fitWidth = (size.x * 1.2) / 2 / (half * camera.aspect)
    camera.position.set(0, center.y, Math.max(fitHeight, fitWidth) + size.z)
    camera.lookAt(0, center.y, 0)
  }

  function resize() {
    renderer.setSize(innerWidth, innerHeight, false)
    camera.aspect = innerWidth / innerHeight
    camera.updateProjectionMatrix()
    frameBody()
  }
  addEventListener('resize', resize)
  resize()

  function setBase(name) {
    const next = loops[name]
    if (!next || next === base) {
      return
    }
    next.reset().setEffectiveWeight(1).fadeIn(FADE).play()
    base?.fadeOut(FADE)
    base = next
  }

  /** Loads a model from its file's bytes, replacing nothing (M1 loads one model per launch). */
  async function load(bytes) {
    const loader = new GLTFLoader()
    loader.register(parser => new VRMLoaderPlugin(parser))
    const gltf = await loader.parseAsync(bytes, '')
    vrm = gltf.userData.vrm
    if (!vrm) {
      throw new Error("This file isn't a VRM model.")
    }
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    pitchSign = vrm.meta?.metaVersion === '0' ? -1 : 1
    VRMUtils.rotateVRM0(vrm)
    holder.add(vrm.scene)
    if (vrm.lookAt) {
      vrm.lookAt.target = lookTarget
    }
    vrm.update(0)
    body = new THREE.Box3().setFromObject(vrm.scene)
    frameBody()

    mixer = new THREE.AnimationMixer(vrm.scene)
    for (const [name, clip] of Object.entries(makeLoops(vrm, pitchSign))) {
      loops[name] = mixer.clipAction(clip)
    }
    setBase('sway')
    nextVibe = timer.getElapsed() + 20 + Math.random() * 15
    // Draw her once right away and say so: the window starts hidden, and a hidden web view
    // doesn't run animation frames, so the loop below only takes over once she's shown.
    step(0, timer.getElapsed())
    onFirstFrame()
    return { name: vrm.meta?.name ?? vrm.meta?.title ?? null }
  }

  // ---- Each frame: her rhythm, the loops, then the live layers on top --------------------

  const timer = new THREE.Timer()
  let sinceRender = 0
  let nextBlink = 2
  let blinkEnd = 0
  const gaze = { x: 0, y: 0 }
  /** The bones the follow layer turns, each with the clip's own rotation from the last frame. */
  const FOLLOW_BASE = new Map(['head', 'neck', 'chest'].map(name => [name, new THREE.Quaternion()]))
  const extra = new THREE.Quaternion()
  const tilt = new THREE.Euler()
  let smile = 0
  let surprised = 0
  const size = new THREE.Vector3()

  function frame(timestamp) {
    requestAnimationFrame(frame)
    timer.update(timestamp)
    sinceRender += timer.getDelta()
    if (sinceRender < 1 / MAX_FPS - 0.002) {
      return
    }
    const dt = Math.min(sinceRender, 0.1)
    sinceRender = 0
    if (vrm !== null && mixer !== null) {
      step(dt, timer.getElapsed())
    }
  }

  /** Moves her on by `dt` seconds (`t` = seconds since start) and draws the frame. */
  function step(dt, t) {

    // Now and then she drifts to another vibe.
    if (t > nextVibe) {
      const others = VIBES.filter(name => loops[name] !== base)
      setBase(others[Math.floor(Math.random() * others.length)])
      nextVibe = t + 20 + Math.random() * 20
    }

    // The follow layer starts each frame from the clip's last pose, so its turn never piles up.
    for (const [boneName, saved] of FOLLOW_BASE) {
      vrm.humanoid.getNormalizedBoneNode(boneName)?.quaternion.copy(saved)
    }
    mixer.update(dt)
    for (const [boneName, saved] of FOLLOW_BASE) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName)
      if (node) {
        saved.copy(node.quaternion)
      }
    }

    // Head, neck and chest turn toward the cursor, eased.
    gaze.x += (cursor.x - gaze.x) * Math.min(1, dt * 4)
    gaze.y += (cursor.y - gaze.y) * Math.min(1, dt * 4)
    lookTarget.position.set(cursor.x, -cursor.y * 0.7, -2)
    for (const [boneName, share] of [
      ['head', 0.55],
      ['neck', 0.25],
      ['chest', 0.2],
    ]) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName)
      if (node) {
        // Cursor below her (gaze.y > 0): she looks down, which is +x as poses are written.
        extra.setFromEuler(tilt.set(gaze.y * 0.35 * share * pitchSign, gaze.x * 0.7 * share, 0))
        node.quaternion.multiply(extra)
      }
    }
    holder.rotation.y = Math.sin(t * 0.3) * 0.05

    // A poke: a little hop, a moment of surprise, then a bigger smile that fades back.
    const sincePoke = t - pokedAt
    const hop = sincePoke < POKE_HOP ? Math.sin((Math.PI * sincePoke) / POKE_HOP) : 0
    holder.position.y = hop * (body ? body.getSize(size).y : 1.5) * 0.03
    const surprisedWant = sincePoke < 0.45 ? 0.9 : 0
    const smileWant = sincePoke < 0.45 ? 0 : sincePoke < 2.5 ? 0.85 : 0.35

    // A soft smile, eased in; random blinks, sometimes a quick double blink.
    const em = vrm.expressionManager
    if (em) {
      smile += (smileWant - smile) * Math.min(1, dt * 6)
      surprised += (surprisedWant - surprised) * Math.min(1, dt * 10)
      em.setValue('happy', smile)
      em.setValue('surprised', surprised)
      if (t > nextBlink) {
        blinkEnd = t + 0.13
        nextBlink = t + 2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.6 : 0)
      }
      em.setValue('blink', t < blinkEnd ? 1 : 0)
    }

    vrm.update(dt)
    renderer.render(scene, camera)
    afterRender()
  }
  requestAnimationFrame(frame)

  /** A poke: she hops and looks surprised, then happy. */
  function poke() {
    pokedAt = timer.getElapsed()
  }

  return { renderer, load, setBase, lookAt, poke }
}
