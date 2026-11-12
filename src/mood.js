// Her own mood, with or without an AI agent: she gets sleepy when you've been away, wakes up
// when you're back, greets you, muses now and then (sometimes about the time of day), huffs
// when poked too much, and — only if the agent link is on — cheers when an agent finishes.
//
// Plain logic with the time passed in, so it's easy to test; main.js acts on what it returns.
// Her lines are in src/locales/*.json.

import { lines, t } from './i18n.js'

/** Nothing from the keyboard or mouse for this long, and she dozes off. */
export const SLEEP_AFTER_MS = 10 * 60 * 1000
/** This many pokes within this long is too many: she huffs… */
export const POKE_STREAK = 4
export const POKE_STREAK_MS = 5 * 1000
/** …and ignores pokes for this long while she pouts. */
export const SULK_MS = 3 * 1000
/** Musings come this often (a random time in between). */
export const MUSE_MIN_MS = 70 * 1000
export const MUSE_MAX_MS = 160 * 1000

/** A line for the time of day, or null if there's nothing special to say. */
export function timeOfDayLine(hour) {
  if (hour >= 0 && hour < 5) {
    return t('time.late')
  }
  if (hour >= 5 && hour < 10) {
    return t('time.morning')
  }
  if (hour >= 12 && hour < 13) {
    return t('time.lunch')
  }
  if (hour >= 18 && hour < 20) {
    return t('time.evening')
  }
  return null
}

/** A random line from one of her lists (lines.greetings…), in the current language. */
const pick = (key, random) => {
  const list = lines(key)
  return list[Math.floor(random() * list.length) % list.length]
}

/**
 * Her mood over time. Every method takes `now` (ms) and returns what to do, as a list of
 * actions: { do: 'sleep' | 'wake' | 'greet' | 'say' | 'cheer' | 'poke' | 'huff', line? }.
 */
export function createMood({ now, random = Math.random, hourAt = time => new Date(time).getHours() }) {
  let asleep = false
  let lastActivity = now
  let nextMusing = now + MUSE_MIN_MS
  let greeted = false
  let lastTimeLineHour = -1
  let pokes = []
  let sulkUntil = -Infinity

  const scheduleMusing = time => {
    nextMusing = time + MUSE_MIN_MS + random() * (MUSE_MAX_MS - MUSE_MIN_MS)
  }

  /** The keyboard or mouse was touched, or she was pressed: you're here. */
  const activity = time => {
    lastActivity = time
    if (asleep) {
      asleep = false
      scheduleMusing(time)
      return [{ do: 'wake', line: pick('lines.wake', random) }]
    }
    return []
  }

  return {
    get asleep() {
      return asleep
    },

    /** She's on screen for the first time: say hello (once). */
    start(time) {
      if (greeted) {
        return []
      }
      greeted = true
      lastActivity = time
      scheduleMusing(time)
      const special = timeOfDayLine(hourAt(time))
      if (special) {
        lastTimeLineHour = hourAt(time)
      }
      return [{ do: 'greet', line: special ?? pick('lines.greetings', random) }]
    },

    activity,

    /**
     * A quick click on her. It wakes her if she was dozing; otherwise it's a poke, and the
     * fourth in a few seconds is one too many: she huffs, and ignores pokes while she pouts.
     */
    poke(time) {
      const woke = activity(time)
      if (woke.length > 0) {
        pokes = []
        return woke
      }
      if (time < sulkUntil) {
        return []
      }
      pokes = [...pokes.filter(at => time - at < POKE_STREAK_MS), time]
      if (pokes.length >= POKE_STREAK) {
        pokes = []
        sulkUntil = time + SULK_MS
        return [{ do: 'huff', line: pick('lines.annoyed', random) }]
      }
      return [{ do: 'poke' }]
    },

    /** Called every few seconds: dozing off, and musings. */
    tick(time) {
      if (!asleep && time - lastActivity >= SLEEP_AFTER_MS) {
        asleep = true
        return [{ do: 'sleep', line: pick('lines.sleep', random) }]
      }
      if (!asleep && greeted && time >= nextMusing) {
        scheduleMusing(time)
        const hour = hourAt(time)
        const special = hour !== lastTimeLineHour ? timeOfDayLine(hour) : null
        if (special) {
          lastTimeLineHour = hour
          return [{ do: 'say', line: special }]
        }
        // The user may have silenced her musings (an empty list in their lines.json).
        const musing = pick('lines.musings', random)
        return musing ? [{ do: 'say', line: musing }] : []
      }
      return []
    },

    /**
     * The agent link reported `{ mood, line }` (only arrives while it's on). `done` cheers;
     * `sleepy` dozes off; anything else wakes her if asleep and passes on its line, if any
     * (`failed` without one gets an encouraging line of her own).
     */
    agent({ mood, line }, time) {
      if (mood === 'done') {
        const wake = asleep ? [{ do: 'wake', line: null }] : []
        asleep = false
        lastActivity = time
        return [...wake, { do: 'cheer', line: line ?? pick('lines.cheer', random) }]
      }
      if (mood === 'sleepy') {
        if (asleep) {
          return line ? [{ do: 'say', line }] : []
        }
        asleep = true
        return [{ do: 'sleep', line: line ?? pick('lines.sleep', random) }]
      }
      const actions = []
      if (asleep && (mood === 'working' || mood === 'failed')) {
        asleep = false
        lastActivity = time
        actions.push({ do: 'wake', line: null })
      }
      // A failure gets a gentle word even when the agent sends none.
      const said = line ?? (mood === 'failed' ? pick('lines.failed', random) : null)
      if (said) {
        actions.push({ do: 'say', line: said })
      }
      return actions
    },
  }
}
