// Her own mood, with or without an AI agent: she gets sleepy when you've been away, wakes up
// when you're back, greets you, muses now and then (sometimes about the time of day), and —
// only if the agent link is on — cheers when an agent finishes.
//
// Plain logic with the time passed in, so it's easy to test; main.js acts on what it returns.

/** No cursor movement or poke for this long, and she dozes off. */
export const SLEEP_AFTER_MS = 10 * 60 * 1000
/** Musings come this often (a random time in between). */
export const MUSE_MIN_MS = 70 * 1000
export const MUSE_MAX_MS = 160 * 1000

export const GREETINGS = ['Hi hi~ I’ll keep you company ♪', 'Hello again~ 👋', 'Hehe~ I’m here!']
export const WAKE_LINES = ['Mm? Oh! Welcome back~', 'Ah—you’re back! ✨', '*stretches* …hi again~']
export const SLEEP_LINES = ['*yawn*… just resting my eyes…', 'Zzz… 💤', 'Mm… five more minutes…']
export const CHEER_LINES = ['Yay! All done~ ✨', 'You did it! Hehe~', 'Finished! Good job~']
export const MUSINGS = [
  '♪ la la la~',
  'Hmm hm hmm ♪',
  'Don’t forget to drink some water!',
  'I’m right here if you need me~',
  'You’re doing great, you know?',
  'Snack break soon? 🍡',
  'Stretch your shoulders a little~',
]

/** A line for the time of day, or null if there's nothing special to say. */
export function timeOfDayLine(hour) {
  if (hour >= 0 && hour < 5) {
    return 'It’s late… don’t stay up too long, okay?'
  }
  if (hour >= 5 && hour < 10) {
    return 'Good morning~ ☀️'
  }
  if (hour >= 12 && hour < 13) {
    return 'Lunch time? 🍙'
  }
  if (hour >= 18 && hour < 20) {
    return 'Evening already~ how was your day?'
  }
  return null
}

const pick = (list, random) => list[Math.floor(random() * list.length) % list.length]

/**
 * Her mood over time. Every method takes `now` (ms) and returns what to do, as a list of
 * actions: { do: 'sleep' | 'wake' | 'greet' | 'say' | 'cheer', line? }.
 */
export function createMood({ now, random = Math.random, hourAt = time => new Date(time).getHours() }) {
  let asleep = false
  let lastActivity = now
  let nextMusing = now + MUSE_MIN_MS
  let greeted = false
  let lastTimeLineHour = -1

  const scheduleMusing = time => {
    nextMusing = time + MUSE_MIN_MS + random() * (MUSE_MAX_MS - MUSE_MIN_MS)
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
      return [{ do: 'greet', line: special ?? pick(GREETINGS, random) }]
    },

    /** The cursor moved or she was poked: you're here. */
    activity(time) {
      lastActivity = time
      if (asleep) {
        asleep = false
        scheduleMusing(time)
        return [{ do: 'wake', line: pick(WAKE_LINES, random) }]
      }
      return []
    },

    /** Called every few seconds: dozing off, and musings. */
    tick(time) {
      if (!asleep && time - lastActivity >= SLEEP_AFTER_MS) {
        asleep = true
        return [{ do: 'sleep', line: pick(SLEEP_LINES, random) }]
      }
      if (!asleep && greeted && time >= nextMusing) {
        scheduleMusing(time)
        const hour = hourAt(time)
        const special = hour !== lastTimeLineHour ? timeOfDayLine(hour) : null
        if (special) {
          lastTimeLineHour = hour
          return [{ do: 'say', line: special }]
        }
        return [{ do: 'say', line: pick(MUSINGS, random) }]
      }
      return []
    },

    /**
     * The agent link reported `{ mood, line }` (only arrives while it's on). `done` cheers;
     * `sleepy` dozes off; anything else wakes her if asleep and passes on its line, if any.
     */
    agent({ mood, line }, time) {
      if (mood === 'done') {
        const wake = asleep ? [{ do: 'wake', line: null }] : []
        asleep = false
        lastActivity = time
        return [...wake, { do: 'cheer', line: line ?? pick(CHEER_LINES, random) }]
      }
      if (mood === 'sleepy') {
        if (asleep) {
          return line ? [{ do: 'say', line }] : []
        }
        asleep = true
        return [{ do: 'sleep', line: line ?? pick(SLEEP_LINES, random) }]
      }
      const actions = []
      if (asleep && (mood === 'working' || mood === 'failed')) {
        asleep = false
        lastActivity = time
        actions.push({ do: 'wake', line: null })
      }
      if (line) {
        actions.push({ do: 'say', line })
      }
      return actions
    },
  }
}
