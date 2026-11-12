// Being carried: while you drag her she's lifted a little and hangs from your hand, swinging
// behind the way you move her and settling once you stop or let go. Shake her hard and she
// gets dizzy.
//
// Plain logic with the time passed in (seconds), so it's easy to test; pet.js turns `tilt`
// and `lift` into how she hangs, and gestures.js says where the pointer is.

/** The furthest she swings, in radians. */
export const MAX_TILT = 0.4
/** Radians of lean per pixel-a-second of sideways speed. */
const LEAN = 0.0003
/** The swing: a soft spring that takes a couple of swings to settle… */
const SWING_STIFFNESS = 60
const SWING_DAMPING = 5
/** …and the lift: quicker, with one small bounce as she lands. */
const LIFT_STIFFNESS = 140
const LIFT_DAMPING = 11
/** With no pointer news for this long, your hand has stopped. */
const STILL_AFTER_S = 0.08
/** Shaking: this many quick changes of direction… */
export const SHAKE_TURNS = 6
/** …each faster than this (pixels a second), within this long. */
const SHAKE_SPEED = 350
const SHAKE_WINDOW_S = 1.6
/** How long she stays dizzy, and how long before she can get dizzy again. */
export const DIZZY_S = 3
const DIZZY_AGAIN_S = 8

const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value))

/**
 * How she hangs over time. `move` returns 'dizzy' at the moment a shake makes her dizzy.
 * `step(dt, t)` returns { tilt, lift, dizzy }: her swing in radians (positive swings her feet
 * to the right of the screen), how lifted she is (0 on the ground, 1 held; it dips a touch
 * below 0 as she lands), and how dizzy (0..1).
 */
export function createCarry() {
  let held = false
  let last = null
  let speed = 0
  let tilt = 0
  let swing = 0
  let lift = 0
  let rise = 0
  let direction = 0
  let turns = []
  let dizzyUntil = -Infinity
  let dizzyAmount = 0

  return {
    get held() {
      return held
    },

    /** Picked up. */
    pickUp() {
      held = true
      last = null
      speed = 0
      direction = 0
      turns = []
    },

    /** The pointer is at screen (x, y) logical pixels while she's held. */
    move(t, x, y) {
      if (!held) {
        return null
      }
      if (last === null) {
        last = { t, x, y }
        return null
      }
      // Several pointer moves can share one frame's time: wait for the clock to move on.
      if (t <= last.t) {
        return null
      }
      const now = (x - last.x) / (t - last.t)
      last = { t, x, y }
      speed += (clamp(now, 4000) - speed) * 0.5
      const way = Math.abs(now) > SHAKE_SPEED ? Math.sign(now) : 0
      if (way !== 0) {
        if (direction !== 0 && way !== direction) {
          turns.push(t)
        }
        direction = way
      }
      turns = turns.filter(at => t - at < SHAKE_WINDOW_S)
      if (turns.length >= SHAKE_TURNS && t - dizzyUntil > DIZZY_AGAIN_S - DIZZY_S) {
        dizzyUntil = t + DIZZY_S
        turns = []
        return 'dizzy'
      }
      return null
    },

    /** Put down. */
    drop() {
      held = false
      last = null
      speed = 0
    },

    step(dt, t) {
      const step = Math.min(dt, 0.05)
      if (held && last !== null && t - last.t > STILL_AFTER_S) {
        speed *= Math.exp(-step * 12)
      }
      // Her feet trail behind the way she's moved.
      const lean = held ? clamp(-speed * LEAN, MAX_TILT) : 0
      swing += (SWING_STIFFNESS * (lean - tilt) - SWING_DAMPING * swing) * step
      tilt = clamp(tilt + swing * step, MAX_TILT)
      rise += (LIFT_STIFFNESS * ((held ? 1 : 0) - lift) - LIFT_DAMPING * rise) * step
      lift += rise * step
      dizzyAmount += ((t < dizzyUntil ? 1 : 0) - dizzyAmount) * Math.min(1, step * 5)
      return { tilt, lift, dizzy: dizzyAmount }
    },
  }
}
