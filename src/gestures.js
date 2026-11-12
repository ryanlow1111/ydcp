// Pressing on her: a quick click pokes her; pressing and moving drags her around (and she
// feels it: see carry.js).
//
// Dragging moves the window with the pointer's screen position, so it works the same on macOS
// and Windows and never needs the OS's own window-drag (which only starts on a mouse-down).

/** Moving further than this (logical pixels) turns a press into a drag. */
export const DRAG_DISTANCE = 4
/** A press released sooner than this, without moving, is a poke. */
export const POKE_MS = 250

/** What a finished press was: 'drag', 'poke', or 'none' (a long press that didn't move). */
export function classifyPress({ moved, ms }) {
  if (moved) {
    return 'drag'
  }
  return ms < POKE_MS ? 'poke' : 'none'
}

/** Whether the pointer has gone far enough from where the press started to start a drag. */
export function passedDragDistance(dx, dy) {
  return Math.hypot(dx, dy) > DRAG_DISTANCE
}

/**
 * Wires pointer presses on `element`. `getWindowPosition()` gives the window's top-left in
 * physical pixels, `scale()` the window's scale factor, `moveWindowTo(x, y)` moves it
 * (physical pixels); `onPoke()` runs for a poke; `onPress(down)` tells whether a press is going on.
 * `onDrag(phase, x, y)` follows a drag: 'start', then 'move' with the pointer's screen position
 * (logical pixels), then 'end'.
 */
export function wireGestures({ element, getWindowPosition, scale, moveWindowTo, onPoke, onPress, onDrag = () => {} }) {
  let press = null
  let pendingMove = null
  let moving = false

  /** Moves the window to the latest target, one move at a time (no pile-up of calls). */
  async function flushMove() {
    if (moving || pendingMove === null) {
      return
    }
    moving = true
    const { x, y } = pendingMove
    pendingMove = null
    try {
      await moveWindowTo(x, y)
    } finally {
      moving = false
      if (pendingMove !== null) {
        flushMove()
      }
    }
  }

  element.addEventListener('pointerdown', async event => {
    if (event.button !== 0 || press !== null) {
      return
    }
    element.setPointerCapture(event.pointerId)
    onPress(true)
    press = {
      id: event.pointerId,
      startX: event.screenX,
      startY: event.screenY,
      at: performance.now(),
      moved: false,
      origin: null,
      ratio: 1,
    }
    const current = press
    const [origin, ratio] = await Promise.all([getWindowPosition(), scale()])
    current.origin = origin
    current.ratio = ratio
  })

  element.addEventListener('pointermove', event => {
    if (press === null || event.pointerId !== press.id) {
      return
    }
    const dx = event.screenX - press.startX
    const dy = event.screenY - press.startY
    if (!press.moved && passedDragDistance(dx, dy)) {
      press.moved = true
      onDrag('start', event.screenX, event.screenY)
    }
    if (press.moved) {
      onDrag('move', event.screenX, event.screenY)
    }
    if (press.moved && press.origin !== null) {
      pendingMove = {
        x: Math.round(press.origin.x + dx * press.ratio),
        y: Math.round(press.origin.y + dy * press.ratio),
      }
      flushMove()
    }
  })

  function finish(event) {
    if (press === null || event.pointerId !== press.id) {
      return
    }
    const kind = classifyPress({ moved: press.moved, ms: performance.now() - press.at })
    press = null
    element.releasePointerCapture?.(event.pointerId)
    onPress(false)
    if (kind === 'drag') {
      onDrag('end', event.screenX, event.screenY)
    }
    if (kind === 'poke') {
      onPoke()
    }
  }
  element.addEventListener('pointerup', finish)
  element.addEventListener('pointercancel', finish)
}
