// The companion: draws a VRM model with three.js and keeps her alive, calmly: a gentle idle
// loop, a head that follows the cursor, faces and blinks. Cute moments (built in, or from .vrma
// files) only happen when asked: a click, the menu, a greeting, an agent finishing.
// Vibes → Auto (drift) brings back the livelier rhythm for those who want it.
// Everything here runs on the user's computer; nothing is fetched from the internet.

import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { VRMLoaderPlugin, VRMUtils } from '@pixiv/three-vrm'
import { VRMAnimationLoaderPlugin, VRMLookAtQuaternionProxy, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { defaultBody, measureBody } from './body.js'
import { makeLoops, VIBES } from './moves.js'
import { MOMENTS, MOMENT_IDS, makeMoments } from './moments.js'
import { applyTrim, clearArms } from './fixes.js'
// `text` (not `t`): in this file `t` is the animation clock.
import { lines, t as text } from './i18n.js'
import { modelProfile, resolveFace, sortExpressions } from './library.js'

/**
 * At most this many frames a second: smooth on 60 Hz screens, and capped on 120 Hz ones to
 * spare the battery. Each frame costs about a millisecond.
 */
const DEFAULT_FPS = 60
/** While she dozes, breathing slowly: this is plenty, and saves the battery. */
const SLEEPY_FPS = 15
/** Seconds a loop takes to cross-fade into the next. */
const FADE = 0.6
/** The vibe loops you can pick (sleepy too); `auto` lets her drift between VIBES. */
export const VIBE_CHOICES = ['idle', 'sway', 'bop', 'sleepy']
/** Her resting smile. */
const SOFT_SMILE = 0.35
/** Mouth shapes for talking, the open ones more often. */
const VOWELS = ['aa', 'oh', 'aa', 'ee', 'ih', 'ou', 'oh']
/** How long she moves her mouth for a line: about a syllable every three letters, within limits. */
const talkSeconds = line => Math.min(4, Math.max(0.6, line.length * 0.055))

/** Loads `.vrma` bytes into a VRM animation (independent of any model). */
export async function parseMotion(bytes) {
  const loader = new GLTFLoader()
  loader.register(parser => new VRMAnimationLoaderPlugin(parser))
  const gltf = await loader.parseAsync(bytes, '')
  const animation = gltf.userData.vrmAnimations?.[0]
  if (!animation) {
    throw new Error(text('error.notVrma'))
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
    feelPat(x, y)
  }

  // ---- Head pats: the cursor stroking back and forth over her head (no click needed) ------

  const pat = { lastX: null, direction: 0, turns: [], until: 0, amount: 0, saidAt: -Infinity }
  const headPoint = new THREE.Vector3()
  const headEdge = new THREE.Vector3()

  /** Her head on screen (window pixels): a circle over the top of her face. */
  function headCircle() {
    if (!vrm) {
      return null
    }
    const { eyeY, halfWidth } = figure.face
    const toScreen = point => {
      vrm.scene.localToWorld(point).project(camera)
      return { x: ((point.x + 1) / 2) * innerWidth, y: ((1 - point.y) / 2) * innerHeight }
    }
    const centre = toScreen(headPoint.set(0, eyeY + halfWidth * 0.7, 0))
    const edge = toScreen(headEdge.set(halfWidth * 1.6, eyeY + halfWidth * 0.7, 0))
    return { ...centre, r: Math.abs(edge.x - centre.x) }
  }

  /** Counts the cursor's turns over her head: three within 1.5 s is a pat. */
  function feelPat(x, y) {
    const t = timer.getElapsed()
    const head = headCircle()
    if (!head || asleep || Math.hypot(x - head.x, y - head.y) > head.r) {
      pat.lastX = null
      pat.direction = 0
      return
    }
    if (pat.lastX === null) {
      pat.lastX = x
    } else if (Math.abs(x - pat.lastX) > head.r * 0.08) {
      const direction = Math.sign(x - pat.lastX)
      if (pat.direction !== 0 && direction !== pat.direction) {
        pat.turns.push(t)
      }
      pat.direction = direction
      pat.lastX = x
    }
    pat.turns = pat.turns.filter(at => t - at < 1.5)
    if (pat.turns.length >= 3) {
      if (t > pat.until && t - pat.saidAt > 45 && Math.random() < 0.5) {
        pat.saidAt = t
        const patLines = lines('lines.pat')
        onSay(patLines[Math.floor(Math.random() * patLines.length)])
      }
      pat.until = t + 0.9
    }
  }

  // ---- Her model and its motions ----------------------------------------------------------

  let vrm = null
  let vrm0 = false
  let mixer = null
  let body = null
  /** Her measured proportions, which every built-in pose is fitted to. */
  let figure = defaultBody()
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
  /** Her vibe: a calm idle unless the menu picks another loop, or 'auto' to drift between them. */
  let vibeChoice = 'idle'

  /** Fits all of her in the window, feet near the bottom, room above her head for a bubble. */
  function frameBody() {
    if (body === null) {
      return
    }
    const size = body.getSize(new THREE.Vector3())
    const center = body.getCenter(new THREE.Vector3())
    const half = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const fitHeight = (size.y * 1.2) / 2 / half / profile.scale
    // She's measured in her T-pose: her arms won't really reach that wide.
    const fitWidth = (size.x * 0.78) / 2 / (half * camera.aspect) / profile.scale
    // Aim a little above her middle, so the spare room is above her head.
    const aimY = center.y + size.y * 0.07
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
    // The first loop starts at full weight: fading in from nothing would show her T-pose.
    if (!oneOff && base) {
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
      throw new Error(text('error.notVrm'))
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
    figure = measureBody(vrm)
    readFaces()
    for (const [name, clip] of Object.entries(makeLoops(vrm, vrm0, figure))) {
      loops[name] = mixer.clipAction(clip)
    }
    for (const [id, clip] of Object.entries(makeMoments(vrm, vrm0, figure))) {
      // Built-in moments' names and lines follow the language, even if it changes later.
      moments[id] = {
        id,
        face: MOMENTS[id].face,
        get name() {
          return text(`moment.${id}`)
        },
        // Her line for this moment, or one of the user's own lines for it (docs/lines.md).
        get line() {
          const options = lines(`moment.${id}.line`)
          return options[Math.floor(Math.random() * options.length)] ?? null
        },
        random: true,
        action: mixer.clipAction(clip),
      }
    }
    buildLibrary()
    setBase(vibeChoice === 'auto' || !loops[vibeChoice] ? 'sway' : vibeChoice)
    const t = timer.getElapsed()
    nextVibe = t + 20 + Math.random() * 15
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
      credit: profile.credit ?? (authors.length > 0 ? text('about.modelBy', { authors: authors.join(', ') }) : null),
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

  /** A random moment for a poke, different from the last one. */
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
    }
  }

  /**
   * Cheers (an agent finished): a file motion marked `onDone` if there is one, otherwise the
   * built-in Peace. Her line is said by the caller.
   */
  function cheer() {
    const own = Object.values(moments).find(moment => moment.library && moment.onDone)
    return playMoment(own?.id ?? 'peace', { quiet: true })
  }

  /** Holds one of the model's faces until released with null. */
  function holdFace(name) {
    heldFace = modelFaces.includes(name) ? name : null
  }

  /**
   * The model's faces and outfit parts, read fresh for each model; anything from the last model
   * is forgotten (main.js puts back the outfit and sorting saved for this model).
   */
  function readFaces() {
    const expressions = vrm.expressionManager?.expressions ?? []
    const has = name => expressions.some(expression => expression.expressionName === name && expression.binds.length > 0)
    // Some models set their resting face with Neutral (VSeeFace applies it too).
    neutralName = has('neutral') ? 'neutral' : null
    mouthShapes = [...new Set(VOWELS)].filter(has)
    mouthWeights = Object.fromEntries(mouthShapes.map(name => [name, 0]))
    talkUntil = 0
    ownOverrides = new Map(expressions.map(expression => [expression, [expression.overrideBlink, expression.overrideLookAt, expression.overrideMouth]]))
    outfitChoice = null
    wearing = new Set()
    faceWeights = {}
    sortFaces()
  }

  /** Sorts the expressions into faces and outfit parts: the user's choice, else the profile's, else YDCP's guess. */
  function sortFaces() {
    const expressions = vrm.expressionManager?.expressions ?? []
    const sorted = sortExpressions(
      expressions.map(expression => ({
        name: expression.expressionName,
        binds: expression.binds.length,
        binary: expression.isBinary,
        targets: expression.binds.flatMap(bind => [...(bind.primitives ?? []).map(mesh => mesh.uuid), ...(bind.material ? [bind.material.uuid] : [])]),
      })),
      outfitChoice ?? profile.outfit,
    )
    modelFaces = sorted.faces
    modelOutfit = sorted.outfit
    wearing = new Set([...wearing].filter(name => modelOutfit.includes(name)))
    faceWeights = Object.fromEntries(modelFaces.filter(name => name !== blinkName()).map(name => [name, faceWeights[name] ?? 0]))
    for (const expression of expressions) {
      // A hat or glasses mustn't stop her blinking or talking, as a face expression may.
      const [blink, lookAt, mouth] = modelOutfit.includes(expression.expressionName) ? ['none', 'none', 'none'] : ownOverrides.get(expression)
      expression.overrideBlink = blink
      expression.overrideLookAt = lookAt
      expression.overrideMouth = mouth
    }
    if (!modelFaces.includes(heldFace)) {
      heldFace = null
    }
  }

  /** Which expressions are outfit parts, as the user sorted them; null lets YDCP decide. */
  function setOutfitParts(names) {
    outfitChoice = Array.isArray(names) ? names : null
    sortFaces()
  }

  /** Moves her mouth as if saying `line` (not while she dozes). */
  function talk(line) {
    if (!asleep && line) {
      talkUntil = timer.getElapsed() + talkSeconds(line)
    }
  }

  /** Shows exactly these outfit parts (any the model doesn't have are ignored). */
  function setOutfit(names) {
    wearing = new Set(names.filter(name => modelOutfit.includes(name)))
  }

  /** Shows or hides one outfit part. */
  function toggleOutfit(name) {
    if (wearing.has(name)) {
      wearing.delete(name)
    } else if (modelOutfit.includes(name)) {
      wearing.add(name)
    }
  }

  const faceFor = face => resolveFace(face, modelFaces, profile.faces)
  /** The model's blink, which every model's blinking and dozing use. */
  const blinkName = () => faceFor('blink')

  /** A poke: a moment of surprise, then a cute moment. */
  function poke() {
    const t = timer.getElapsed()
    pokedAt = t
    pokeMomentAt = t + 0.35
  }

  /** The motions she can do, for the menu. */
  function catalogue() {
    const builtIn = MOMENT_IDS.map(id => ({ id, name: text(`moment.${id}`) }))
    const library = Object.values(moments)
      .filter(moment => moment.library)
      .map(({ id, name }) => ({ id, name }))
    const vibes = [...VIBE_CHOICES, ...Object.keys(loops).filter(name => !VIBE_CHOICES.includes(name))]
    const vibeNames = Object.fromEntries(libraryEntries.filter(entry => entry.loop).map(entry => [`lib:${entry.id}`, entry.name]))
    return {
      builtIn,
      library,
      vibes: vibes.map(id => ({ id, name: vibeNames[id] ?? (VIBE_CHOICES.includes(id) ? text(`vibe.${id}`) : id) })),
      vibe: vibeChoice,
      face: heldFace,
      faces: modelFaces,
      outfit: modelOutfit,
      wearing: modelOutfit.filter(name => wearing.has(name)),
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
  /** The faces this model has (from its own expressions). */
  let modelFaces = []
  /** How strongly each of them shows right now, eased. */
  let faceWeights = {}
  /** The user's own list of outfit parts (About this model), or null. */
  let outfitChoice = null
  /** Each expression's own blink, gaze and mouth settings, put back if it stops being an outfit part. */
  let ownOverrides = new Map()
  /** The model's Neutral expression, if it has one that does something. */
  let neutralName = null
  /** Talking: the mouth shapes the model has, how open each is, and the syllable she's on. */
  let mouthShapes = []
  let mouthWeights = {}
  let talkUntil = 0
  const syllable = { shape: null, start: 0, end: 0, open: 0 }
  /** The model's outfit parts (a hat, glasses…), and the ones she's wearing now. */
  let modelOutfit = []
  let wearing = new Set()

  /** The frame rate chosen in the menu. */
  let maxFps = DEFAULT_FPS
  /**
   * The frame rate she needs right now: slow only while she dozes because you're away, unless a
   * moment is playing. Picking the Sleepy vibe yourself keeps the full rate: you're watching her.
   */
  const fpsNow = () => (asleep && !oneOff ? Math.min(SLEEPY_FPS, maxFps) : maxFps)

  /**
   * Asks for the next frame only when one is due. Asking every display refresh and then
   * skipping would keep the browser's display timer running, which costs nearly as much as
   * drawing; so below full speed, a plain timer waits first.
   */
  function schedule() {
    const spare = 1000 / fpsNow() - 1000 / 60
    if (spare > 2) {
      setTimeout(() => requestAnimationFrame(frame), spare)
    } else {
      requestAnimationFrame(frame)
    }
  }

  function frame(timestamp) {
    schedule()
    timer.update(timestamp)
    sinceRender += timer.getDelta()
    // Screens faster than 60 Hz: skip refreshes to stay at the cap.
    if (sinceRender < 1 / fpsNow() - 0.002) {
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
    // Vibes → Auto (drift) only: now and then she drifts to another loop. Otherwise she stays
    // on her calm loop, and moments only come when asked (a poke, the menu, a greeting).
    if (vibeChoice === 'auto' && !asleep && !oneOff && t > nextVibe) {
      const others = VIBES.filter(name => loops[name] !== base)
      setBase(others[Math.floor(Math.random() * others.length)])
      nextVibe = t + 20 + Math.random() * 20
    }
    if (t >= pokeMomentAt) {
      pokeMomentAt = Infinity
      const id = randomMoment()
      if (id) {
        playMoment(id)
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

    // Being patted: she leans into it, and looks up at the cursor less.
    pat.amount += ((t < pat.until ? 1 : 0) - pat.amount) * Math.min(1, dt * 4)

    // Head, neck and chest turn toward the cursor, eased; less during a moment or a pat.
    const follow = (oneOff ? 0.35 : base === loops.sleepy ? 0 : 1) * (1 - pat.amount * 0.7)
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
    const head = vrm.humanoid.getNormalizedBoneNode('head')
    if (head && pat.amount > 0.01) {
      const side = vrm0 ? -1 : 1
      head.quaternion.multiply(extra.setFromEuler(tilt.set(0.14 * pat.amount * side, 0, 0.1 * pat.amount * side)))
    }
    holder.rotation.y = Math.sin(t * 0.3) * 0.05

    // A poke: a moment of surprise on her face (no hop: she stays where she stands).
    const sincePoke = t - pokedAt

    // Faces: a held face wins, then a surprised poke, then a pat's contented smile (eyes closed
    // if the model's relaxed face does that), then the moment's face, else a soft smile.
    // Her own pat face if the profile picks one (faces.pat), else relaxed, else happy.
    const patFace = profile.faces.pat && faceFor('pat') ? 'pat' : faceFor('relaxed') ? 'relaxed' : 'happy'
    const face = faceFor(heldFace ?? (sincePoke < 0.45 ? 'surprised' : pat.amount > 0.5 ? patFace : momentFace))
    const em = vrm.expressionManager
    if (em) {
      const smile = faceFor('happy')
      const blinkFace = blinkName()
      for (const name of Object.keys(faceWeights)) {
        const want = face ? (name === face ? 1 : 0) : name === smile && base !== loops.sleepy ? SOFT_SMILE : 0
        faceWeights[name] += (want - faceWeights[name]) * Math.min(1, dt * 8)
        em.setValue(name, faceWeights[name])
      }
      if (neutralName) {
        // Her resting face, fading out as another face shows.
        const shown = Object.values(faceWeights).reduce((sum, weight) => sum + weight, 0)
        em.setValue(neutralName, Math.max(0, 1 - shown))
      }

      // Talking: short syllables of random vowels, with the odd pause between words.
      if (t < talkUntil && t >= syllable.end) {
        const pause = Math.random() < 0.15
        syllable.shape = pause ? null : mouthShapes[Math.floor(Math.random() * mouthShapes.length)]
        syllable.start = t
        syllable.end = t + (pause ? 0.12 : 0.1 + Math.random() * 0.1)
        syllable.open = 0.35 + Math.random() * 0.35
      }
      const talking = t < talkUntil && syllable.shape
      for (const name of mouthShapes) {
        const progress = (t - syllable.start) / (syllable.end - syllable.start)
        const want = talking && name === syllable.shape ? Math.sin(Math.PI * Math.min(1, progress)) * syllable.open : 0
        mouthWeights[name] += (want - mouthWeights[name]) * Math.min(1, dt * 20)
        em.setValue(name, mouthWeights[name])
      }
      if (t > nextBlink) {
        blinkEnd = t + 0.13
        nextBlink = t + 2 + Math.random() * 4 + (Math.random() < 0.2 ? -1.6 : 0)
      }
      if (blinkFace) {
        em.setValue(blinkFace, (face && face === blinkFace) || base === loops.sleepy || t < blinkEnd ? 1 : 0)
      }
      for (const name of modelOutfit) {
        em.setValue(name, wearing.has(name) ? 1 : 0)
      }
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
    /** Sets the frame rate cap (the menu's 60 or 30). */
    setFrameRate(fps) {
      maxFps = fps > 0 ? fps : DEFAULT_FPS
    },
    setAsleep,
    cheer,
    holdFace,
    talk,
    setOutfitParts,
    setOutfit,
    toggleOutfit,
    poke,
    lookAt,
    catalogue,
    describe,
    /** For the dev page: the loaded model and camera. */
    debug: () => ({ vrm, camera, vrm0, figure }),
    /** For the dev page: tries `pose(t)` (right-arm style, see moments.js) for built-in moment `id`. */
    rebuildMoment(id, pose) {
      if (pose) {
        MOMENTS[id].pose = pose
      }
      const clip = makeMoments(vrm, vrm0, figure, [id])[id]
      moments[id].action.stop()
      mixer.uncacheAction(moments[id].action.getClip())
      moments[id].action = mixer.clipAction(clip)
    },
    /**
     * For the dev page: shows moment `id` frozen at `t` seconds (no other motion), drawn now.
     * Independent of frame rate, so poses can be measured even in a background tab.
     */
    freezeAt(id, t) {
      const action = moments[id]?.action ?? loops[id]
      if (!action) {
        return false
      }
      frozen = true
      mixer.stopAllAction()
      base = null
      oneOff = null
      action.reset().setEffectiveWeight(1).play()
      action.time = t
      mixer.update(0)
      vrm.update(0)
      renderer.render(scene, camera)
      return true
    },
  }
}
