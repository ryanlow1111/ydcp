// Who gets to speak, and when. Everything she says passes through here, so she never talks
// over herself and her unprompted chatter has an overall limit (Menu → Chattiness).
//
// Each line has a kind:
//   'answer'  you just did something to her (a poke, a pat, a menu pick): always shown at once.
//   'asked'   you asked for it earlier (a timer, a break reminder, the agent link, a problem):
//             always shown, and nothing unprompted may replace it while it's up.
//   'hello'   a greeting or goodnight (she appears, dozes off, wakes, welcomes you back):
//             unprompted, but not rationed. It waits for a bubble that's still up.
//   'own'     her own idea (a musing, the time of day): rationed. At most one per stretch,
//             never over another bubble, never right after you touched her.
// Quiet mutes the two unprompted kinds. Her body language is never rationed: only words are.
//
// Plain logic with the time passed in (ms), so it's easy to test; main.js shows what it returns.

/** Menu → Chattiness: the shortest time between two of her own ideas. */
export const CHATTINESS = {
  quiet: Infinity,
  calm: 5 * 60 * 1000,
  chatty: 90 * 1000,
}
export const DEFAULT_CHATTINESS = 'calm'
/** After you touch her, she keeps her own ideas to herself for this long. */
export const AFTER_CONTACT_MS = 20 * 1000

const UNPROMPTED = new Set(['hello', 'own'])
/** A waiting line gives way only to one that matters at least as much. */
const WEIGHT = { own: 0, hello: 1, answer: 2, asked: 3 }

/** How long a bubble stays up: longer for longer lines, or `hold` if that's more. */
export const bubbleMs = (line, hold = 0) => Math.max(hold, 2500 + line.length * 60)

/**
 * Her turns to speak over time. `offer` and `tick` return the line to show now as
 * { line, ms, talk } (ms: how long its bubble stays up), or null. `nextTurn` says when to
 * call `tick` again for a line that's waiting.
 */
export function createDirector({ chattiness = DEFAULT_CHATTINESS } = {}) {
  let gap = CHATTINESS[chattiness] ?? CHATTINESS[DEFAULT_CHATTINESS]
  let level = chattiness in CHATTINESS ? chattiness : DEFAULT_CHATTINESS
  /** When the bubble that's up comes down, and what kind it is. */
  let showing = { kind: null, until: -Infinity }
  let lastUnprompted = -Infinity
  let lastContact = -Infinity
  /** One unprompted line waiting for its turn: { line, kind, hold, talk, expires }. */
  let waiting = null

  const up = time => time < showing.until

  /** Whether a line of `kind` may be shown right now. */
  function free(kind, time) {
    if (!UNPROMPTED.has(kind)) {
      return true
    }
    if (gap === Infinity || up(time)) {
      return false
    }
    return kind === 'hello' || (time - lastUnprompted >= gap && time - lastContact >= AFTER_CONTACT_MS)
  }

  function show({ line, kind, hold = 0, talk = true }, time) {
    const ms = bubbleMs(line, hold)
    showing = { kind, until: time + ms }
    if (UNPROMPTED.has(kind)) {
      lastUnprompted = time
    } else if (kind === 'answer') {
      lastContact = time
    }
    return { line, ms, talk }
  }

  return {
    get chattiness() {
      return level
    },

    /** Menu → Chattiness: 'quiet', 'calm' or 'chatty' (anything else means calm). */
    setChattiness(name) {
      level = name in CHATTINESS ? name : DEFAULT_CHATTINESS
      gap = CHATTINESS[level]
      if (gap === Infinity) {
        waiting = null
      }
    },

    /** You touched her (a poke, a hold, a drag), whether or not she said anything. */
    contact(time) {
      lastContact = time
    },

    /**
     * She has `line` to say, of `kind`. Shown now if it may be. Otherwise an unprompted line
     * can wait up to `wait` ms for its turn (see `tick`); with no `wait` it's dropped.
     */
    offer({ line, kind = 'answer', hold = 0, talk = true, wait = 0 }, time) {
      if (!line) {
        return null
      }
      if (free(kind, time)) {
        return show({ line, kind, hold, talk }, time)
      }
      const muted = gap === Infinity
      if (wait > 0 && !muted && (waiting === null || WEIGHT[kind] >= WEIGHT[waiting.kind])) {
        waiting = { line, kind, hold, talk, expires: time + wait }
      }
      return null
    },

    /**
     * When the waiting line's turn comes (ms), so the caller can come back exactly then; null
     * if nothing is waiting, or it will have gone stale by then.
     */
    nextTurn(time) {
      if (waiting === null) {
        return null
      }
      const at = waiting.kind === 'hello' ? showing.until : Math.max(showing.until, lastUnprompted + gap, lastContact + AFTER_CONTACT_MS)
      return at <= waiting.expires ? Math.max(at, time) : null
    },

    /** A waiting line whose turn has come, if it hasn't gone stale. */
    tick(time) {
      if (waiting === null) {
        return null
      }
      if (time > waiting.expires) {
        waiting = null
        return null
      }
      if (!free(waiting.kind, time)) {
        return null
      }
      const line = waiting
      waiting = null
      return show(line, time)
    },
  }
}
