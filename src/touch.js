// Where she's touched, and how the cursor plays with her without a click: a poke lands on her
// face, a hand or her body; a cursor rushing at her face makes her flinch; a cursor resting on
// her face is a stare, and she gets shy; a cursor wiggled near her makes her curious.
//
// Plain logic with positions in window pixels and the time passed in (seconds), so it's easy
// to test; pet.js measures where her face and hands are on screen and acts on the answers.

/** A cursor arriving on her face faster than this (pixels a second) makes her flinch… */
export const FLINCH_SPEED = 1400
/** …at most this often. */
const FLINCH_AGAIN_S = 4
/** The cursor resting on her face this long is a stare… */
export const STARE_S = 3
/** …and she gets shy about it at most this often (and only once per visit). */
export const STARE_AGAIN_S = 45
/** A wiggle: the cursor changing direction this many times… */
export const WIGGLE_TURNS = 4
/** …within this long, travelling at least this far (pixels) between turns… */
const WIGGLE_WINDOW_S = 1.5
const WIGGLE_PX = 10
/** …near her: within this many face-widths of her face, but not on it (that's a pat or a stare). */
const WIGGLE_REACH = 5

const within = (point, circle) => circle !== null && circle !== undefined && Math.hypot(point.x - circle.x, point.y - circle.y) <= circle.r

/**
 * What a poke at `point` landed on. `face` and each of `hands` are circles { x, y, r } on
 * screen, or null. A hand in front of her face counts as the hand.
 * Returns 'hand:right' or 'hand:left' (hers), 'face:left' or 'face:right' (the side of her
 * face as you see it), or 'body'.
 */
export function zoneOf(point, { face = null, hands = {} } = {}) {
  for (const side of ['right', 'left']) {
    if (within(point, hands[side])) {
      return `hand:${side}`
    }
  }
  if (within(point, face)) {
    return point.x < face.x ? 'face:left' : 'face:right'
  }
  return 'body'
}

/**
 * The cursor around her face, over time. `cursor` returns 'flinch:left' or 'flinch:right'
 * (the side it came from, as you see her) when it rushes onto her face, and 'curious:left' or
 * 'curious:right' (the side it's on) for as long as it's being wiggled near her; `stare` says
 * when she's been looked at long enough to get shy.
 */
export function createCursorPlay() {
  let last = null
  let inside = false
  let since = null
  let armed = true
  let shyAt = -Infinity
  let flinchAt = -Infinity
  /** The wiggle so far: where the cursor last turned or set off, which way it's going, and its turns. */
  let wiggleFrom = null
  let wiggleWay = 0
  let turns = []

  return {
    /** The cursor is at (x, y); `face` is her face's circle, or null while she can't react. */
    cursor(t, x, y, face) {
      const now = within({ x, y }, face)
      let event = null
      if (now && !inside && last !== null && t > last.t) {
        const speed = Math.hypot(x - last.x, y - last.y) / (t - last.t)
        if (speed >= FLINCH_SPEED && t - flinchAt >= FLINCH_AGAIN_S) {
          flinchAt = t
          event = last.x < face.x ? 'flinch:left' : 'flinch:right'
        }
      }
      // A wiggle near her (not on her face): back and forth, a few times, quickly.
      const near = !now && face !== null && face !== undefined && Math.hypot(x - face.x, y - face.y) <= face.r * WIGGLE_REACH
      if (!near) {
        wiggleFrom = null
        wiggleWay = 0
        turns = []
      } else if (wiggleFrom === null) {
        wiggleFrom = x
      } else if (Math.abs(x - wiggleFrom) > WIGGLE_PX) {
        const way = Math.sign(x - wiggleFrom)
        if (wiggleWay !== 0 && way !== wiggleWay) {
          turns.push(t)
        }
        wiggleWay = way
        wiggleFrom = x
      }
      turns = turns.filter(at => t - at < WIGGLE_WINDOW_S)
      if (event === null && turns.length >= WIGGLE_TURNS) {
        event = x < face.x ? 'curious:left' : 'curious:right'
      }
      if (now && since === null) {
        since = t
      } else if (!now) {
        // Gone from her face: the next visit can make her shy again.
        since = null
        armed = true
      }
      inside = now
      // Several cursor reports can share one frame's time: keep the first for measuring speed.
      if (last === null || t > last.t) {
        last = { t, x, y }
      }
      return event
    },

    /** She was poked, patted or held: that's not staring, so the count starts again. */
    touched(t) {
      if (since !== null) {
        since = t
      }
    },

    /**
     * Whether she gets shy now: the cursor has rested on her face long enough. `free` is
     * false while she's busy (asleep, mid-moment, carried, cross); the count then starts again.
     */
    stare(t, free) {
      if (since === null || !armed || t - since < STARE_S || t - shyAt < STARE_AGAIN_S) {
        return false
      }
      if (!free) {
        since = t
        return false
      }
      armed = false
      shyAt = t
      return true
    },
  }
}
