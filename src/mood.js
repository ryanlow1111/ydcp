// Her own mood, with or without an AI agent: she gets sleepy when you've been away, wakes up
// when you're back (also after the computer itself slept), greets you (with a word for the
// day when it's an occasion: memory.js), muses now and then
// (sometimes about the time of day), huffs when poked too much, snuggles in when held, and —
// only if the agent link is on — cheers when an agent finishes.
//
// Plain logic with the time passed in, so it's easy to test; main.js acts on what it returns.
// Her lines are in src/locales/*.json.

import { lines, t } from './i18n.js'
import { meet, parseBirthday, validMemory } from './memory.js'

/** Nothing from the keyboard or mouse for this long, and she dozes off. */
export const SLEEP_AFTER_MS = 10 * 60 * 1000
/** This many pokes within this long is too many: she huffs… */
export const POKE_STREAK = 4
export const POKE_STREAK_MS = 5 * 1000
/** …and ignores pokes for this long while she pouts. */
export const SULK_MS = 3 * 1000
/** The computer asleep (lid shut, sleep, shut down) for this long: she welcomes you back. */
export const BACK_AFTER_MS = 5 * 60 * 1000
/** Away this long, her welcome back says for how long. */
export const BACK_LONG_MS = 60 * 60 * 1000
/** Held, she says something at most this often. */
export const HELD_LINE_EVERY_MS = 30 * 1000
/** How often a poke on the face gets a word from her. */
const FACE_LINE_CHANCE = 0.6
/** Musings come this often (a random time in between). */
export const MUSE_MIN_MS = 70 * 1000
export const MUSE_MAX_MS = 160 * 1000
/** A line about the time of day may wait this long for its turn to be said (director.js). */
export const TIME_LINE_WAIT_MS = 10 * 60 * 1000

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

/** How long you were away, in words: "about an hour", "5 hours", "a day", "3 days". */
export function awaySpan(ms) {
  const hours = Math.round(ms / (60 * 60 * 1000))
  if (hours < 24) {
    return hours <= 1 ? t('away.hour') : t('away.hours', { n: hours })
  }
  const days = Math.round(hours / 24)
  return days <= 1 ? t('away.day') : t('away.days', { n: days })
}

/** A line with its `{n}` or `{span}` filled in; null if there's no line. */
const fill = (line, values) => line?.replace(/\{(\w+)\}/g, (whole, name) => (values[name] === undefined ? whole : String(values[name]))) ?? null

/** A random line from one of her lists (lines.greetings…), in the current language. */
const pick = (key, random) => {
  const list = lines(key)
  return list[Math.floor(random() * list.length) % list.length]
}

/**
 * Her mood over time. Every method takes `now` (ms) and returns what to do, as a list of
 * actions: { do: 'sleep' | 'wake' | 'greet' | 'say' | 'cheer' | 'poke' | 'huff' | 'hold', line? }.
 * A poke carries its `zone`; a wake after the computer slept has `linger` (keep her bubble up).
 * What she says on her own in `tick` is marked `kind: 'own'`, so it's rationed (director.js).
 * `{ do: 'remember', memory }` asks for her memory to be saved (the first time she sees you
 * each day).
 */
export function createMood({ now, random = Math.random, hourAt = time => new Date(time).getHours(), dateAt = time => new Date(time) }) {
  let asleep = false
  let lastActivity = now
  let nextMusing = now + MUSE_MIN_MS
  let greeted = false
  let lastTimeLineHour = -1
  let pokes = []
  let sulkUntil = -Infinity
  let heldSaidAt = -Infinity
  /** The computer slept a while: she'll welcome you back at the next sign of you. */
  let back = false
  /** How long the computer has slept since she last saw you, all told. */
  let awayMs = 0
  /** The last day she saw you and the run of days (memory.js), and your birthday if she knows it. */
  let memory = validMemory(null)
  let birthday = null

  /**
   * She sees you. The first time each day her memory moves on (to be saved), and if the day
   * is an occasion she has a line for it. Returns { line, save }.
   */
  const today = time => {
    const met = meet(memory, dateAt(time), birthday)
    if (met.memory === memory) {
      return { line: null, save: [] }
    }
    memory = met.memory
    const { occasion } = met
    const line = occasion === null ? null : fill(pick(`lines.${occasion.kind}`, random), { n: occasion.days })
    return { line, save: [{ do: 'remember', memory }] }
  }

  const scheduleMusing = time => {
    nextMusing = time + MUSE_MIN_MS + random() * (MUSE_MAX_MS - MUSE_MIN_MS)
  }

  /** The keyboard or mouse was touched, or she was pressed: you're here. */
  const activity = time => {
    lastActivity = time
    const away = awayMs
    awayMs = 0
    if (back) {
      // Back after the computer slept: a word for the day if it's an occasion, else a hello
      // for the time of day, else a welcome back (saying how long, after an hour or more;
      // sleepier if she had dozed off herself).
      back = false
      const day = today(time)
      const hour = hourAt(time)
      const special = day.line === null && hour !== lastTimeLineHour ? timeOfDayLine(hour) : null
      if (special) {
        lastTimeLineHour = hour
      }
      const long = away >= BACK_LONG_MS ? fill(pick('lines.backLong', random), { span: awaySpan(away) }) : null
      const line = day.line ?? special ?? long ?? pick(asleep ? 'lines.wake' : 'lines.back', random)
      asleep = false
      scheduleMusing(time)
      return [{ do: 'wake', line, linger: true }, ...day.save]
    }
    if (asleep) {
      asleep = false
      scheduleMusing(time)
      const day = today(time)
      return [{ do: 'wake', line: day.line ?? pick('lines.wake', random) }, ...day.save]
    }
    return []
  }

  return {
    get asleep() {
      return asleep
    },

    /** What was saved of her memory (see memory.js); anything odd starts it afresh. */
    setMemory(saved) {
      memory = validMemory(saved)
    },

    /** Your birthday as written in lines.json ("11-13"), or nothing. */
    setBirthday(text) {
      birthday = parseBirthday(text)
    },

    /**
     * She's on screen for the first time: say hello (once). A word for the day if it's an
     * occasion, else for the time of day, else one of her greetings.
     */
    start(time) {
      if (greeted) {
        return []
      }
      greeted = true
      lastActivity = time
      scheduleMusing(time)
      const day = today(time)
      const special = day.line === null ? timeOfDayLine(hourAt(time)) : null
      if (special) {
        lastTimeLineHour = hourAt(time)
      }
      return [{ do: 'greet', line: day.line ?? special ?? pick('lines.greetings', random) }, ...day.save]
    },

    activity,

    /**
     * The computer was asleep (or off) for `ms`. Nothing happens yet: nobody may be
     * looking. She welcomes you back at the next sign of you, if it was long enough.
     */
    slept(ms) {
      awayMs += ms
      if (greeted && ms >= BACK_AFTER_MS) {
        back = true
      }
    },

    /**
     * A still press on her that lasts: she snuggles into it (pet.js), with a word now and then.
     * It wakes her if she was dozing, and does nothing while she pouts.
     */
    hold(time) {
      const woke = activity(time)
      if (woke.length > 0) {
        return woke
      }
      if (time < sulkUntil) {
        return []
      }
      const speaks = time - heldSaidAt >= HELD_LINE_EVERY_MS
      if (speaks) {
        heldSaidAt = time
      }
      return [{ do: 'hold', line: speaks ? pick('lines.held', random) : null }]
    },

    /**
     * A quick click on her, on `zone` (pet.js: 'body', 'face:left', 'hand:right', 'clap:right'…). It wakes
     * her if she was dozing; otherwise it's a poke, and the fourth in a few seconds is one too
     * many: she huffs, and ignores pokes while she pouts.
     */
    poke(time, zone = 'body') {
      const woke = activity(time)
      if (woke.length > 0) {
        pokes = []
        return woke
      }
      if (time < sulkUntil) {
        return []
      }
      // Clapping the hand she holds up is what she asked for: never one poke too many.
      if (zone.startsWith('clap')) {
        return [{ do: 'poke', zone, line: null }]
      }
      pokes = [...pokes.filter(at => time - at < POKE_STREAK_MS), time]
      if (pokes.length >= POKE_STREAK) {
        pokes = []
        sulkUntil = time + SULK_MS
        return [{ do: 'huff', line: pick('lines.annoyed', random) }]
      }
      // A poke on the face often gets a word; elsewhere her moment speaks for itself.
      const line = zone.startsWith('face') && random() < FACE_LINE_CHANCE ? pick('lines.face', random) : null
      return [{ do: 'poke', zone, line }]
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
          return [{ do: 'say', line: special, kind: 'own', wait: TIME_LINE_WAIT_MS }]
        }
        // The user may have silenced her musings (an empty list in their lines.json).
        const musing = pick('lines.musings', random)
        return musing ? [{ do: 'say', line: musing, kind: 'own' }] : []
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
