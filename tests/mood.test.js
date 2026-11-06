import { describe, expect, test } from 'vitest'
import { MUSE_MAX_MS, SLEEP_AFTER_MS, createMood, timeOfDayLine } from '../src/mood.js'

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
})
