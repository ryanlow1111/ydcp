import { describe, expect, test } from 'vitest'
import { setCustomLines } from '../src/i18n.js'
import { customLines } from '../src/library.js'
import {
  BACK_AFTER_MS,
  BACK_LONG_MS,
  HELD_LINE_EVERY_MS,
  MUSE_MAX_MS,
  POKE_STREAK,
  POKE_STREAK_MS,
  SLEEP_AFTER_MS,
  SULK_MS,
  TIME_LINE_WAIT_MS,
  awaySpan,
  createMood,
  timeOfDayLine,
} from '../src/mood.js'

const kinds = actions => actions.map(action => action.do)
/** A mood at noon-ish (no special time line) with predictable picks. */
const make = (hour = 15) => createMood({ now: 0, random: () => 0, hourAt: () => hour })

describe('standalone mood (no agent needed)', () => {
  test('greets once when she first appears', () => {
    const mood = make()
    // The first time she sees you each day, her memory is saved too.
    expect(kinds(mood.start(0))).toEqual(['greet', 'remember'])
    expect(mood.start(10)).toEqual([])
  })

  test('the greeting mentions the time of day when there is something to say', () => {
    expect(make(7).start(0)[0].line).toBe('Good morning~ ☀️')
    expect(make(2).start(0)[0].line).toMatch(/late/)
  })

  test('dozes off after 10 quiet minutes and wakes when you are back', () => {
    const mood = make()
    mood.start(0)
    expect(kinds(mood.tick(SLEEP_AFTER_MS - 1000))).not.toContain('sleep')
    expect(kinds(mood.tick(SLEEP_AFTER_MS))).toEqual(['sleep'])
    expect(mood.asleep).toBe(true)
    expect(mood.tick(SLEEP_AFTER_MS + 60_000)).toEqual([])
    expect(kinds(mood.activity(SLEEP_AFTER_MS + 61_000))).toEqual(['wake'])
    expect(mood.asleep).toBe(false)
  })

  test('activity keeps her awake', () => {
    const mood = make()
    mood.start(0)
    mood.activity(SLEEP_AFTER_MS - 1)
    expect(kinds(mood.tick(SLEEP_AFTER_MS + 1000))).not.toContain('sleep')
  })

  test('muses now and then, but not while asleep', () => {
    const mood = make()
    mood.start(0)
    expect(kinds(mood.tick(MUSE_MAX_MS + 1))).toEqual(['say'])
    expect(mood.tick(MUSE_MAX_MS + 2)).toEqual([])
  })

  test('what she says on her own is marked as her own idea; the time of day may wait its turn', () => {
    const mood = make()
    mood.start(0)
    expect(mood.tick(MUSE_MAX_MS + 1)).toEqual([{ do: 'say', line: '♪ la la la~', kind: 'own' }])
    // She appeared in the afternoon; by the next musing it's lunch time somewhere else on the clock.
    const lunch = createMood({ now: 0, random: () => 0, hourAt: time => (time > 1000 ? 12 : 15) })
    lunch.start(0)
    expect(lunch.tick(MUSE_MAX_MS + 1)).toEqual([{ do: 'say', line: 'Lunch time? 🍙', kind: 'own', wait: TIME_LINE_WAIT_MS }])
  })

  test('time-of-day lines', () => {
    expect(timeOfDayLine(12)).toMatch(/Lunch/)
    expect(timeOfDayLine(15)).toBeNull()
  })
})

describe('pokes', () => {
  test('a poke is a poke; a poke while she dozes just wakes her', () => {
    const mood = make()
    mood.start(0)
    expect(mood.poke(1000)).toEqual([{ do: 'poke', zone: 'body', line: null }])
    mood.tick(1000 + SLEEP_AFTER_MS)
    expect(kinds(mood.poke(2000 + SLEEP_AFTER_MS))).toEqual(['wake'])
    expect(mood.asleep).toBe(false)
  })

  test('too many pokes in a row: she huffs, ignores pokes while she pouts, then forgives', () => {
    const mood = make()
    mood.start(0)
    for (let i = 0; i < POKE_STREAK - 1; i++) {
      expect(kinds(mood.poke(1000 + i * 500))).toEqual(['poke'])
    }
    const last = 1000 + (POKE_STREAK - 1) * 500
    expect(mood.poke(last)).toEqual([{ do: 'huff', line: 'Hey! One at a time…' }])
    expect(mood.poke(last + SULK_MS - 1)).toEqual([])
    expect(kinds(mood.poke(last + SULK_MS))).toEqual(['poke'])
  })

  test('pokes spread out over time never annoy her', () => {
    const mood = make()
    mood.start(0)
    for (let i = 0; i < POKE_STREAK * 3; i++) {
      expect(kinds(mood.poke(1000 + i * (POKE_STREAK_MS / 2)))).toEqual(['poke'])
    }
  })

  test('a poke counts as being here', () => {
    const mood = make()
    mood.start(0)
    mood.poke(SLEEP_AFTER_MS - 1)
    expect(kinds(mood.tick(SLEEP_AFTER_MS + 1000))).not.toContain('sleep')
  })
})

describe('where she is poked, and being held', () => {
  test('a poke passes on where it landed; one on the face often gets a word', () => {
    const mood = make()
    mood.start(0)
    expect(mood.poke(1000, 'hand:left')).toEqual([{ do: 'poke', zone: 'hand:left', line: null }])
    expect(mood.poke(9000, 'face:right')).toEqual([{ do: 'poke', zone: 'face:right', line: 'Puni?' }])
    const quiet = createMood({ now: 0, random: () => 0.99, hourAt: () => 15 })
    quiet.start(0)
    expect(quiet.poke(1000, 'face:right')).toEqual([{ do: 'poke', zone: 'face:right', line: null }])
  })

  test('clapping the hand she holds up never counts as one poke too many', () => {
    const mood = make()
    mood.start(0)
    for (let i = 0; i < POKE_STREAK * 2; i++) {
      expect(mood.poke(1000 + i * 200, 'clap:right')).toEqual([{ do: 'poke', zone: 'clap:right', line: null }])
    }
    expect(kinds(mood.poke(4000))).toEqual(['poke'])
  })

  test('held, she snuggles in, with a word only now and then', () => {
    const mood = make()
    mood.start(0)
    expect(mood.hold(1000)).toEqual([{ do: 'hold', line: 'Ehehe… warm~' }])
    expect(mood.hold(5000)).toEqual([{ do: 'hold', line: null }])
    expect(mood.hold(1000 + HELD_LINE_EVERY_MS)).toEqual([{ do: 'hold', line: 'Ehehe… warm~' }])
  })

  test('a hold wakes her if she dozed, and does nothing while she pouts', () => {
    const mood = make()
    mood.start(0)
    mood.tick(SLEEP_AFTER_MS)
    expect(kinds(mood.hold(SLEEP_AFTER_MS + 1000))).toEqual(['wake'])
    const from = SLEEP_AFTER_MS + 10_000
    for (let i = 0; i < POKE_STREAK; i++) {
      mood.poke(from + i * 300)
    }
    expect(mood.hold(from + POKE_STREAK * 300)).toEqual([])
  })
})

describe('back after the computer slept', () => {
  test('she welcomes you back at the next sign of you, not before', () => {
    const mood = make()
    mood.start(0)
    mood.slept(BACK_AFTER_MS)
    expect(mood.tick(1000)).toEqual([])
    expect(mood.activity(2000)).toEqual([{ do: 'wake', line: 'Oh, you’re back! ✨', linger: true }])
    expect(mood.activity(3000)).toEqual([])
  })

  test('a short nap of the computer is not worth a word', () => {
    const mood = make()
    mood.start(0)
    mood.slept(BACK_AFTER_MS - 1)
    expect(mood.activity(2000)).toEqual([])
  })

  test('in the morning it is a good morning; if she had dozed off, a sleepier hello', () => {
    // She appeared in the afternoon; you open the computer again the next morning.
    const later = createMood({ now: 0, random: () => 0, hourAt: time => (time > 1000 ? 8 : 15) })
    later.start(0)
    later.slept(8 * 60 * 60 * 1000)
    expect(later.activity(2000)).toEqual([{ do: 'wake', line: 'Good morning~ ☀️', linger: true }])

    const dozed = make()
    dozed.start(0)
    dozed.tick(SLEEP_AFTER_MS)
    dozed.slept(BACK_AFTER_MS)
    expect(dozed.activity(SLEEP_AFTER_MS + 1000)).toEqual([{ do: 'wake', line: 'Mm? Oh! Welcome back~', linger: true }])
    expect(dozed.asleep).toBe(false)
  })

  test('before she has appeared, there is nobody to welcome', () => {
    const mood = make()
    mood.slept(BACK_AFTER_MS * 2)
    expect(kinds(mood.start(1000))).toEqual(['greet', 'remember'])
    expect(mood.activity(2000)).toEqual([])
  })
})

describe('what she remembers (the first time she sees you each day)', () => {
  const HOUR = 60 * 60 * 1000
  /** A mood whose clock starts on `start` (a local Date), at three in the afternoon unless told. */
  const from = (start, saved, birthday) => {
    const mood = createMood({ now: 0, random: () => 0, hourAt: () => 15, dateAt: time => new Date(start.getTime() + time) })
    mood.setMemory(saved)
    mood.setBirthday(birthday)
    return mood
  }
  // 9 November 2026 is a Monday.
  const monday = new Date(2026, 10, 9, 15)

  test('an ordinary day: her usual greeting, and her memory moves on', () => {
    const mood = from(monday, { lastDay: '2026-11-08', streak: 1 })
    expect(mood.start(0)).toEqual([
      { do: 'greet', line: 'Hi hi~ I’ll keep you company ♪' },
      { do: 'remember', memory: { lastDay: '2026-11-09', streak: 2 } },
    ])
  })

  test('the same day again: nothing to save', () => {
    const mood = from(monday, { lastDay: '2026-11-09', streak: 4 })
    expect(kinds(mood.start(0))).toEqual(['greet'])
  })

  test('a long time apart, a run of days, a weekend and your birthday each get a word', () => {
    expect(from(monday, { lastDay: '2026-11-02', streak: 9 }).start(0)[0].line).toBe('It’s been 7 days! I missed you~')
    expect(from(monday, { lastDay: '2026-11-08', streak: 2 }).start(0)[0].line).toBe('3 days in a row! ✨')
    const saturday = new Date(2026, 10, 14, 15)
    expect(from(saturday, { lastDay: '2026-11-13', streak: 1 }).start(0)[0].line).toBe('It’s the weekend~ taking it easy today?')
    expect(from(monday, { lastDay: '2026-11-08', streak: 2 }, '11-09').start(0)[0].line).toBe('Happy birthday!! 🎂✨')
  })

  test('an occasion comes before the time of day; the time of day before a plain hello', () => {
    const morning = createMood({ now: 0, random: () => 0, hourAt: () => 7, dateAt: time => new Date(monday.getTime() + time) })
    morning.setMemory({ lastDay: '2026-11-02', streak: 1 })
    expect(morning.start(0)[0].line).toBe('It’s been 7 days! I missed you~')
    const plain = createMood({ now: 0, random: () => 0, hourAt: () => 7, dateAt: time => new Date(monday.getTime() + time) })
    plain.setMemory({ lastDay: '2026-11-08', streak: 1 })
    expect(plain.start(0)[0].line).toBe('Good morning~ ☀️')
  })

  test('the day can turn while she runs: waking her the next morning counts', () => {
    const mood = from(monday, { lastDay: '2026-11-09', streak: 2 })
    mood.start(0)
    mood.tick(SLEEP_AFTER_MS)
    expect(mood.activity(18 * HOUR)).toEqual([
      { do: 'wake', line: '3 days in a row! ✨' },
      { do: 'remember', memory: { lastDay: '2026-11-10', streak: 3 } },
    ])
  })

  test('a broken memory file just starts afresh', () => {
    const mood = from(monday, { lastDay: 'someday', streak: 'lots' })
    expect(mood.start(0)[1]).toEqual({ do: 'remember', memory: { lastDay: '2026-11-09', streak: 1 } })
  })

  test('back after an hour or more: she says for how long', () => {
    const mood = from(monday, { lastDay: '2026-11-09', streak: 1 })
    mood.start(0)
    mood.slept(BACK_LONG_MS * 2)
    expect(mood.activity(3 * HOUR)).toEqual([{ do: 'wake', line: 'Welcome back~ that was 2 hours.', linger: true }])
    // Several sleeps in a row (the computer stirs in its sleep) add up.
    mood.slept(2 * HOUR)
    mood.slept(3 * HOUR)
    expect(mood.activity(9 * HOUR)[0].line).toBe('Welcome back~ that was 5 hours.')
    // A short one: no need to say.
    mood.slept(BACK_AFTER_MS)
    expect(mood.activity(9.5 * HOUR)[0].line).toBe('Oh, you’re back! ✨')
  })

  test('how long, in words', () => {
    expect(awaySpan(HOUR)).toBe('about an hour')
    expect(awaySpan(5.4 * HOUR)).toBe('5 hours')
    expect(awaySpan(26 * HOUR)).toBe('a day')
    expect(awaySpan(70 * HOUR)).toBe('3 days')
  })
})

describe('agent link (only reaches the mood while it is on)', () => {
  test('done: she cheers, with the agent’s line if it gave one', () => {
    const mood = make()
    mood.start(0)
    expect(mood.agent({ mood: 'done' }, 1000)).toEqual([{ do: 'cheer', line: expect.any(String) }])
    expect(mood.agent({ mood: 'done', line: 'Build finished!' }, 2000)).toEqual([{ do: 'cheer', line: 'Build finished!' }])
  })

  test('done while asleep: she wakes up and cheers', () => {
    const mood = make()
    mood.start(0)
    mood.tick(SLEEP_AFTER_MS)
    expect(kinds(mood.agent({ mood: 'done' }, SLEEP_AFTER_MS + 1))).toEqual(['wake', 'cheer'])
  })

  test('sleepy dozes off; working wakes her; idle just passes its line on', () => {
    const mood = make()
    mood.start(0)
    expect(kinds(mood.agent({ mood: 'sleepy' }, 1))).toEqual(['sleep'])
    expect(kinds(mood.agent({ mood: 'working' }, 2))).toEqual(['wake'])
    expect(mood.agent({ mood: 'idle' }, 3)).toEqual([])
    expect(mood.agent({ mood: 'idle', line: 'Hi!' }, 4)).toEqual([{ do: 'say', line: 'Hi!' }])
  })

  test('failed: an encouraging line of her own, unless the agent sent one', () => {
    const mood = make()
    mood.start(0)
    expect(mood.agent({ mood: 'failed' }, 1)).toEqual([{ do: 'say', line: 'Hmm… something went wrong? You’ve got this!' }])
    expect(mood.agent({ mood: 'failed', line: 'Tests failed (3)' }, 2)).toEqual([{ do: 'say', line: 'Tests failed (3)' }])
  })
})

describe('her own lines, as the user wants them', () => {
  test('replaced greetings are what she says; an empty list silences musings', () => {
    try {
      setCustomLines([customLines({ mode: 'replace', greetings: ['Ohayo, master~'], musings: [] })])
      const mood = make()
      expect(mood.start(0)[0]).toEqual({ do: 'greet', line: 'Ohayo, master~' })
      expect(mood.tick(MUSE_MAX_MS + 1)).toEqual([])
    } finally {
      setCustomLines([])
    }
  })
})
