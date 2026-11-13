// Where she's touched, and how the cursor plays with her without a click: a poke lands on her
// face, a hand or her body; a cursor rushing at her face makes her flinch; a cursor resting on
// her face is a stare, and she gets shy.
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
 * (the side it came from, as you see her) when it rushes onto her face; `stare` says when
 * she's been looked at long enough to get shy.
 */
export function createCursorPlay() {
  let last = null
  let inside = false
  let since = null
  let armed = true
  let shyAt = -Infinity
  let flinchAt = -Infinity

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
