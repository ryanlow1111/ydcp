// Where she looks. She watches the cursor while it moves and for a moment after it stops; then
// her eyes come back to you, with a glance away now and then (sometimes at where the cursor
// rests), like someone keeping you company rather than a head on a string. After too many
// pokes she pointedly looks away for a while.
//
// Plain logic with the time passed in (seconds), so it's easy to test; pet.js eases her head
// and eyes toward what `aim` returns.

/** The cursor must move this far (logical pixels) to catch her eye; smaller is just jitter. */
export const NOTICE_PX = 8
/** She keeps watching the spot this long after the cursor stops. */
export const WATCH_S = 3
/** Glances away come this often once she's looking at you (a random time in between)… */
export const GLANCE_MIN_S = 5
export const GLANCE_MAX_S = 12
/** …and last about this long. */
const GLANCE_FOR_MIN_S = 0.8
const GLANCE_FOR_MAX_S = 2.2
/** How much her head joins in: all the way for the cursor, mostly eyes for a glance. */
const GLANCE_HEAD = 0.35
/** How far to the side she turns when she looks away in a huff. */
const AVERT = 0.75

/**
 * Her gaze over time. Positions are -1..1 each way, 0 being straight at you (see pet.js).
 * `aim(t)` returns { x, y, head }: where to look, and how much the head joins the eyes (0..1).
 */
export function createGaze({ random = Math.random } = {}) {
  /** The cursor, as last told (-1..1), and where it was when it last caught her eye (pixels). */
  const cursor = { x: 0, y: 0 }
  let noticedAt = null
  let movedAt = -Infinity
  let glance = null
  let nextGlance = null
  let avert = null

  const between = (low, high) => low + random() * (high - low)

  return {
    /**
     * The cursor is at (px, py) logical pixels, which is (x, y) in her -1..1 view. Real
     * movement catches her eye; a few pixels of jitter doesn't.
     */
    cursor(t, px, py, x, y) {
      cursor.x = x
      cursor.y = y
      if (noticedAt === null || Math.hypot(px - noticedAt.px, py - noticedAt.py) > NOTICE_PX) {
        noticedAt = { px, py }
        movedAt = t
        glance = null
        nextGlance = null
      }
    },

    /** She looks away from the cursor's side for `seconds` (a huff). */
    lookAway(t, seconds) {
      avert = { until: t + seconds, x: cursor.x > 0 ? -AVERT : AVERT }
      glance = null
      nextGlance = null
    },

    /** Whether she's watching the cursor right now. */
    watching(t) {
      return t - movedAt < WATCH_S
    },

    aim(t) {
      if (avert) {
        if (t < avert.until) {
          return { x: avert.x, y: 0.12, head: 1 }
        }
        avert = null
      }
      if (t - movedAt < WATCH_S) {
        return { x: cursor.x, y: cursor.y, head: 1 }
      }
      // Looking at you; now and then, a glance somewhere else.
      if (nextGlance === null) {
        nextGlance = t + between(GLANCE_MIN_S, GLANCE_MAX_S)
      }
      if (glance === null && t >= nextGlance) {
        // Fairly often it's a peek at where the cursor rests; otherwise off to one side.
        const peek = random() < 0.4
        const side = random() < 0.5 ? -1 : 1
        glance = {
          until: t + between(GLANCE_FOR_MIN_S, GLANCE_FOR_MAX_S),
          x: peek ? cursor.x : side * between(0.25, 0.6),
          y: peek ? cursor.y : between(-0.15, 0.2),
        }
      }
      if (glance) {
        if (t < glance.until) {
          return { x: glance.x, y: glance.y, head: GLANCE_HEAD }
        }
        glance = null
        nextGlance = t + between(GLANCE_MIN_S, GLANCE_MAX_S)
      }
      return { x: 0, y: 0, head: 1 }
    },
  }
}
