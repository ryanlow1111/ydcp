// The companion: draws a VRM model with three.js and keeps her alive — vibe loops that
// cross-fade, cute moments (built in, or from .vrma files), a head that follows the cursor,
// faces, blinks, and a little hop when poked.
// Everything here runs on the user's computer; nothing is fetched from the internet.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { makeLoops, VIBES } from './moves.js'
import { MOMENTS, MOMENT_IDS, makeMoments } from './moments.js'
import { applyTrim, clearArms } from './fixes.js'
import { FACES, modelProfile } from './library.js'

/**
 * At most this many frames a second: smooth on 60 Hz screens, and capped on 120 Hz ones to
 * spare the battery. Each frame costs about a millisecond.
 */
const MAX_FPS = 60
/** Seconds a loop takes to cross-fade into the next. */
const FADE = 0.6
/** How long her little hop takes when poked, in seconds. */
const POKE_HOP = 0.35
/** The vibe loops you can pick (sleepy too); `auto` lets her drift between VIBES. */
export const VIBE_CHOICES = ['idle', 'sway', 'bop', 'sleepy']
/** Her resting smile. */
const SOFT_SMILE = 0.35

/** Loads `.vrma` bytes into a VRM animation (independent of any model). */
export async function parseMotion(bytes) {
  const loader = new GLTFLoader()
  loader.register(parser => new VRMAnimationLoaderPlugin(parser))
  const gltf = await loader.parseAsync(bytes, '')
  const animation = gltf.userData.vrmAnimations?.[0]
  if (!animation) {
    throw new Error("This file isn't a VRM Animation (.vrma).")
  }
  return animation
}

/**
 * Creates the companion on `canvas`.
 * - `onFirstFrame()` runs once her first frame is drawn, so the window can be shown without a
 *   flash of nothing.
 * - `afterRender()` runs right after every frame, while its pixels can still be read.
 * - `onSay(line)` is called when she has something to say.
 */
export function createPet({ canvas, onFirstFrame = () => {}, afterRender = () => {}, onSay = () => {} }) {
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

  const timer = new THREE.Timer()

  /** Where her eyes and head aim, -1..1 each way; eased toward the cursor. */
  const cursor = { x: 0, y: 0 }

  /**
   * The cursor is at window-local (x, y) logical pixels, possibly far outside the window.
   * She turns toward it: fully when it's a window-and-a-half away, from around her face.
   */
  function lookAt(x, y) {
    const clamp = value => Math.max(-1, Math.min(1, value))
    cursor.x = clamp((x - innerWidth / 2) / (innerWidth * 1.5))
    cursor.y = clamp((y - innerHeight * 0.3) / innerHeight)
  }

  // ---- Her model and its motions ----------------------------------------------------------

  let vrm = null
  let vrm0 = false
  let mixer = null
  let body = null
  let profile = modelProfile()
  /** Vibe loops by name, as actions. */
  let loops = {}
  /** One-off moments by id: { action, name, face, line, random, onDone }. */
  let moments = {}
  /** Library motions as given (kept so they can be rebuilt for another model). */
  let libraryEntries = []
  let base = null
  let oneOff = null
  let momentFace = null
  let heldFace = null
  let vibeChoice = 'auto'

  /** Fits all of her in the window, feet near the bottom, room above her head for a bubble. */
  function frameBody() {
    if (body === null) {
      return
    }
    const size = body.getSize(new THREE.Vector3())
    const center = body.getCenter(new THREE.Vector3())
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fitHeight = (size.y * 1.3) / 2 / half / profile.scale
    const fitWidth = (size.x * 1.2) / 2 / (half * camera.aspect) / profile.scale
    // Aim a little above her middle, so the spare room is above her head.
    const aimY = center.y + size.y * 0.1
    camera.position.set(0, aimY, Math.max(fitHeight, fitWidth) + size.z)
    camera.lookAt(0, aimY, 0)
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
    next.reset().setEffectiveWeight(oneOff ? 0 : 1)
    if (!oneOff) {
      next.fadeIn(FADE)
    }
    next.play()
    if (base) {
      if (oneOff) {
        base.stop()
      } else {
        base.fadeOut(FADE)
      }
    }
    base = next
  }

  function endMoment() {
    if (oneOff) {
      oneOff.fadeOut(FADE)
      oneOff = null
      momentFace = null
      base?.reset().setEffectiveWeight(1).fadeIn(FADE).play()
    }
  }

  /** Builds one library motion's clip for the current model, with its fixes. */
  function libraryClip(entry) {
    const clip = createVRMAnimationClip(entry.animation, vrm)
    applyTrim(clip, vrm, entry.trim)
    const fix = profile.motionFixes[entry.id]?.clearArms
    if (fix) {
      clearArms(clip, vrm, vrm0, fix)
    }
    return clip
  }

  /** (Re)builds every library motion for the current model. */
  function buildLibrary() {
    for (const [id, moment] of Object.entries(moments)) {
      if (moment.library) {
        moment.action.stop()
        delete moments[id]
      }
    }
    for (const name of Object.keys(loops)) {
      if (!VIBE_CHOICES.includes(name)) {
        delete loops[name]
      }
    }
    for (const entry of libraryEntries) {
      try {
        const action = mixer.clipAction(libraryClip(entry))
        action.timeScale = entry.speed
        // File motions live under "lib:", so a file called "peace" never replaces the built-in Peace.
        const key = `lib:${entry.id}`
        if (entry.loop) {
          loops[key] = action
        } else {
          moments[key] = { ...entry, id: key, action, library: true }
        }
      } catch (error) {
        console.error(`[ydcp] motion "${entry.file}": ${error?.message ?? error}`)
      }
    }
  }

  /** Removes the current model and everything built for it. */
  function unload() {
    if (!vrm) {
      return
    }
    mixer.stopAllAction()
    mixer.uncacheRoot(vrm.scene)
    holder.remove(vrm.scene)
    VRMUtils.deepDispose(vrm.scene)
    vrm = null
    mixer = null
    loops = {}
    moments = {}
    base = null
    oneOff = null
    momentFace = null
  }

  /**
   * Loads a model from its file's bytes (replacing any current one), with its optional
   * profile settings. Returns what the model says about itself (for About…).
   */
  async function load(bytes, profileSettings = {}) {
    const loader = new GLTFLoader()
    loader.register(parser => new VRMLoaderPlugin(parser))
    const gltf = await loader.parseAsync(bytes, '')
    const next = gltf.userData.vrm
    if (!next) {
      throw new Error("This file isn't a VRM model.")
    }
    unload()
    vrm = next
    profile = modelProfile(profileSettings)
    VRMUtils.removeUnnecessaryVertices(gltf.scene)
    VRMUtils.combineSkeletons(gltf.scene)
    vrm0 = vrm.meta?.metaVersion === '0'
    VRMUtils.rotateVRM0(vrm)
    holder.add(vrm.scene)
    if (vrm.lookAt) {
      vrm.lookAt.target = lookTarget
      // Lets .vrma motions that move the eyes drive her look-at (three-vrm-animation expects it).
      const proxy = new VRMLookAtQuaternionProxy(vrm.lookAt)
      proxy.name = 'lookAtQuaternionProxy'
      vrm.scene.add(proxy)
    }
    vrm.update(0)
    body = new THREE.Box3().setFromObject(vrm.scene)
    frameBody()

    mixer = new THREE.AnimationMixer(vrm.scene)
    mixer.addEventListener('finished', event => {
      if (event.action === oneOff) {
        endMoment()
      }
    })
    for (const [name, clip] of Object.entries(makeLoops(vrm, vrm0))) {
      loops[name] = mixer.clipAction(clip)
    }
    for (const [id, clip] of Object.entries(makeMoments(vrm, vrm0))) {
      const { name, face, line } = MOMENTS[id]
      moments[id] = { id, name, face, line, random: true, action: mixer.clipAction(clip) }
    }
    buildLibrary()
    setBase(vibeChoice === 'auto' || !loops[vibeChoice] ? 'sway' : vibeChoice)
    const t = timer.getElapsed()
    nextVibe = t + 20 + Math.random() * 15
    nextMoment = t + 12 + Math.random() * 10
    // Draw her once right away and say so: the window starts hidden, and a hidden web view
    // doesn't run animation frames, so the loop below only takes over once she's shown.
    step(0, t)
    onFirstFrame()
    return describe()
  }

  /** What the current model says about itself, for About… and the menu. */
  function describe() {
    const meta = vrm?.meta ?? {}
    const authors = meta.authors ?? (meta.author ? [meta.author] : [])
    return {
      name: profile.name ?? meta.name ?? meta.title ?? null,
      credit: profile.credit ?? (authors.length > 0 ? `Model by ${authors.join(', ')}` : null),
      version: vrm0 ? '0.x' : '1.0',
      licence: vrm0
        ? { allowedUser: meta.allowedUserName, redistribution: meta.licenseName, url: meta.otherLicenseUrl }
        : { allowedUser: meta.avatarPermission, redistribution: meta.allowRedistribution, url: meta.licenseUrl },
    }
  }

  /** Replaces the library motions (from the motions folder). Each entry has its `animation`. */
  function setLibrary(entries) {
    libraryEntries = entries
    if (vrm) {
      endMoment()
      buildLibrary()
      if (!loops[vibeChoice] && vibeChoice !== 'auto') {
        setVibe('auto')
      }
    }
  }

  // ---- What she does ----------------------------------------------------------------------

  let nextVibe = 0
  let nextMoment = 0
  let lastMoment = null
  let pokedAt = -Infinity
  let asleep = false
  let pokeMomentAt = -Infinity

  /** Plays a moment once over her vibe, then fades back. Says its line unless `quiet`. */
  function playMoment(id, { quiet = false } = {}) {
    const moment = moments[id]
    if (!moment || !mixer) {
      return false
    }
    if (oneOff && oneOff !== moment.action) {
      oneOff.fadeOut(0.3)
    }
    moment.action.reset().setLoop(THREE.LoopOnce, 1)
    moment.action.clampWhenFinished = true
    moment.action.setEffectiveWeight(1).fadeIn(0.4).play()
    base?.fadeOut(0.4)
    oneOff = moment.action
    momentFace = moment.face
    lastMoment = id
    if (!quiet && moment.line) {
      onSay(moment.line)
    }
    return true
  }

  /** A random moment she'd do on her own, different from the last one. */
  function randomMoment() {
    const choices = Object.keys(moments).filter(id => moments[id].random && id !== lastMoment)
    return choices[Math.floor(Math.random() * choices.length)] ?? null
  }

  /** Picks her vibe: a loop's name, or 'auto' to drift between them. */
  function setVibe(name) {
    vibeChoice = name === 'auto' || loops[name] ? name : 'auto'
    if (vibeChoice !== 'auto') {
      setBase(vibeChoice)
    } else if (base === loops.sleepy) {
      setBase('sway')
    }
  }

  /** Dozes off (sleepy loop, no moments or drifting) or wakes back up to her vibe. */
  function setAsleep(sleep) {
    if (sleep === asleep) {
      return
    }
    asleep = sleep
    if (asleep) {
      endMoment()
      setBase('sleepy')
    } else {
      setBase(vibeChoice === 'auto' || !loops[vibeChoice] ? 'sway' : vibeChoice)
      const t = timer.getElapsed()
      nextVibe = t + 20 + Math.random() * 15
      nextMoment = Math.max(nextMoment, t + 8)
    }
  }

  /**
   * Cheers (an agent finished): a file motion marked `onDone` if there is one, otherwise the
   * built-in Cheer. Her line is said by the caller.
   */
  function cheer() {
    const own = Object.values(moments).find(moment => moment.library && moment.onDone)
    return playMoment(own?.id ?? 'cheer', { quiet: true })
  }

  /** Holds a face (one of FACES) until released with null. */
  function holdFace(name) {
    heldFace = FACES.includes(name) ? name : null
  }

  /** A poke: she hops and looks surprised, then does a cute moment. */
  function poke() {
    const t = timer.getElapsed()
    pokedAt = t
    pokeMomentAt = t + 0.35
  }

  /** The motions she can do, for the menu. */
  function catalogue() {
    const builtIn = MOMENT_IDS.map(id => ({ id, name: MOMENTS[id].name }))
    const library = Object.values(moments)
      .filter(moment => moment.library)
      .map(({ id, name }) => ({ id, name }))
    const vibes = [...VIBE_CHOICES, ...Object.keys(loops).filter(name => !VIBE_CHOICES.includes(name))]
    const vibeNames = Object.fromEntries(libraryEntries.filter(entry => entry.loop).map(entry => [`lib:${entry.id}`, entry.name]))
    return {
      builtIn,
      library,
      vibes: vibes.map(id => ({ id, name: vibeNames[id] ?? id.charAt(0).toUpperCase() + id.slice(1) })),
      vibe: vibeChoice,
      face: heldFace,
      faces: FACES,
    }
  }

  // ---- Each frame: her rhythm, the motions, then the live layers on top -------------------

  let sinceRender = 0
  /** Set by the dev page's freezeAt: the frame loop leaves her as she is. */
  let frozen = false
  let nextBlink = 2
  let blinkEnd = 0
  const gaze = { x: 0, y: 0 }
  /** The bones the follow layer turns, each with the clip's own rotation from the last frame. */
  const FOLLOW_BASE = new Map(['head', 'neck', 'chest'].map(name => [name, new THREE.Quaternion()]))
  const extra = new THREE.Quaternion()
  const tilt = new THREE.Euler()
  const faceWeights = Object.fromEntries(FACES.filter(face => face !== 'blink').map(face => [face, 0]))
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
    if (vrm !== null && mixer !== null && !frozen) {
      step(dt, timer.getElapsed())
    }
  }

  /** Moves her on by `dt` seconds (`t` = seconds since start) and draws the frame. */
  function step(dt, t) {
    // Her own rhythm: drift to another vibe now and then, and do a cute moment.
    if (vibeChoice === 'auto' && !asleep && !oneOff && t > nextVibe) {
      const others = VIBES.filter(name => loops[name] !== base)
      setBase(others[Math.floor(Math.random() * others.length)])
      nextVibe = t + 20 + Math.random() * 20
    }
    if (!asleep && !oneOff && t > nextMoment && base !== loops.sleepy) {
      const id = randomMoment()
      if (id) {
        playMoment(id)
      }
      nextMoment = t + 18 + Math.random() * 22
    }
    if (t >= pokeMomentAt) {
      pokeMomentAt = Infinity
      const id = randomMoment()
      if (id) {
        playMoment(id)
        nextMoment = Math.max(nextMoment, t + 12)
      }
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

    // Head, neck and chest turn toward the cursor, eased; less during a moment.
    const follow = oneOff ? 0.35 : base === loops.sleepy ? 0 : 1
    gaze.x += (cursor.x * follow - gaze.x) * Math.min(1, dt * 4)
    gaze.y += (cursor.y * follow - gaze.y) * Math.min(1, dt * 4)
    lookTarget.position.set(cursor.x, -cursor.y * 0.7, -2)
    for (const [boneName, share] of [
      ['head', 0.55],
      ['neck', 0.25],
      ['chest', 0.2],
    ]) {
      const node = vrm.humanoid.getNormalizedBoneNode(boneName)
      if (node) {
        // Cursor below her (gaze.y > 0): she looks down (+x in VRM 1.0 space, -x in VRM 0.x).
        extra.setFromEuler(tilt.set(gaze.y * 0.35 * share * (vrm0 ? -1 : 1), gaze.x * 0.7 * share, 0))
        node.quaternion.multiply(extra)
      }
    }
    holder.rotation.y = Math.sin(t * 0.3) * 0.05

    // A poke: a little hop and a moment of surprise.
    const sincePoke = t - pokedAt
    const hop = sincePoke < POKE_HOP ? Math.sin((Math.PI * sincePoke) / POKE_HOP) : 0
    holder.position.y = hop * (body ? body.getSize(size).y : 1.5) * 0.03

    // Faces: a held face wins, then a surprised poke, then the moment's face, else a soft smile.
    const face = heldFace ?? (sincePoke < 0.45 ? 'surprised' : momentFace)
    const em = vrm.expressionManager
    if (em) {
      for (const name of Object.keys(faceWeights)) {
        const want = face ? (name === face ? 1 : 0) : name === 'happy' ? (base === loops.sleepy ? 0 : SOFT_SMILE) : 0
        faceWeights[name] += (want - faceWeights[name]) * Math.min(1, dt * 8)
        em.setValue(profile.faces[name] ?? name, faceWeights[name])
      }
      if (t > nextBlink) {
        blinkEnd = t + 0.13
        nextBlink = t + 2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.6 : 0)
      }
      const blink = face === 'blink' || base === loops.sleepy || t < blinkEnd ? 1 : 0
      em.setValue(profile.faces.blink ?? 'blink', blink)
    }

    vrm.update(dt)
    renderer.render(scene, camera)
    afterRender()
  }
  requestAnimationFrame(frame)

  return {
    renderer,
    load,
    setLibrary,
    playMoment,
    setVibe,
    setAsleep,
    cheer,
    holdFace,
    poke,
    lookAt,
    catalogue,
    describe,
    /** For the dev page: the loaded model and camera. */
    debug: () => ({ vrm, camera, vrm0 }),
    /** For the dev page: tries `pose(t)` (right-arm style, see moments.js) for built-in moment `id`. */
    rebuildMoment(id, pose) {
      if (pose) {
        MOMENTS[id].pose = pose
      }
      const clip = makeMoments(vrm, vrm0, [id])[id]
      moments[id].action.stop()
      mixer.uncacheAction(moments[id].action.getClip())
      moments[id].action = mixer.clipAction(clip)
    },
    /**
     * For the dev page: shows moment `id` frozen at `t` seconds (no other motion), drawn now.
     * Independent of frame rate, so poses can be measured even in a background tab.
     */
    freezeAt(id, t) {
      const moment = moments[id]
      if (!moment) {
        return false
      }
      frozen = true
      mixer.stopAllAction()
      base = null
      oneOff = null
      moment.action.reset().setEffectiveWeight(1).play()
      moment.action.time = t
      mixer.update(0)
      vrm.update(0)
      renderer.render(scene, camera)
      return true
    },
  }
}
