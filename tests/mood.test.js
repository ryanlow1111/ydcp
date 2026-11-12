import { describe, expect, test } from 'vitest'
import { setCustomLines } from '../src/i18n.js'
import { customLines } from '../src/library.js'
import { MUSE_MAX_MS, POKE_STREAK, POKE_STREAK_MS, SLEEP_AFTER_MS, SULK_MS, createMood, timeOfDayLine } from '../src/mood.js'

const kinds = actions => actions.map(action => action.do)
/** A mood at noon-ish (no special time line) with predictable picks. */
const make = (hour = 15) => createMood({ now: 0, random: () => 0, hourAt: () => hour })

describe('standalone mood (no agent needed)', () => {
  test('greets once when she first appears', () => {
    const mood = make()
    expect(kinds(mood.start(0))).toEqual(['greet'])
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

  test('time-of-day lines', () => {
    expect(timeOfDayLine(12)).toMatch(/Lunch/)
    expect(timeOfDayLine(15)).toBeNull()
  })
})

describe('pokes', () => {
  test('a poke is a poke; a poke while she dozes just wakes her', () => {
    const mood = make()
    mood.start(0)
    expect(mood.poke(1000)).toEqual([{ do: 'poke' }])
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
      expect(mood.start(0)).toEqual([{ do: 'greet', line: 'Ohayo, master~' }])
      expect(mood.tick(MUSE_MAX_MS + 1)).toEqual([])
    } finally {
      setCustomLines([])
    }
  })
})
