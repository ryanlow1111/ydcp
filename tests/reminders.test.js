import { describe, expect, test } from 'vitest'
import { AWAY_IS_A_BREAK_MS, breakLine, createReminders, span, timerLine } from '../src/reminders.js'

const MIN = 60 * 1000

/** Moves the cursor every 30 s from `from` to `to`, ticking every 5 s; returns the actions. */
function work(reminders, from, to) {
  const actions = []
  for (let time = from; time <= to; time += 5000) {
    if ((time - from) % 30000 === 0) {
      reminders.activity(time)
    }
    actions.push(...reminders.tick(time))
  }
  return actions
}

describe('break reminders', () => {
  test('off by default', () => {
    const reminders = createReminders({ now: 0 })
    expect(work(reminders, 0, 120 * MIN)).toEqual([])
  })

  test('every so many minutes of work, then again after the same again', () => {
    const reminders = createReminders({ now: 0 })
    reminders.setBreakEvery(45, 0)
    const actions = work(reminders, 0, 100 * MIN)
    expect(actions).toEqual([
      { do: 'remind', kind: 'break', line: breakLine(45) },
      { do: 'remind', kind: 'break', line: breakLine(45) },
    ])
  })

  test('time away counts as a break, so the count starts over', () => {
    const reminders = createReminders({ now: 0 })
    reminders.setBreakEvery(30, 0)
    expect(work(reminders, 0, 25 * MIN)).toEqual([])
    // Away for 10 minutes (no activity), then back for 25 more: still no reminder.
    for (let time = 25 * MIN; time < 35 * MIN; time += 5000) {
      expect(reminders.tick(time)).toEqual([])
    }
    expect(work(reminders, 35 * MIN, 60 * MIN)).toEqual([])
    expect(work(reminders, 60 * MIN + 5000, 66 * MIN)).toHaveLength(1)
  })

  test('never while you’re away from the computer', () => {
    const reminders = createReminders({ now: 0 })
    reminders.setBreakEvery(30, 0)
    reminders.activity(29 * MIN)
    // Last seen at 29 min; at 31 min you've been gone 2 minutes: no reminder to an empty room.
    for (let time = 29 * MIN; time < 29 * MIN + AWAY_IS_A_BREAK_MS; time += 5000) {
      if (time > 30 * MIN + 60 * 1000) {
        expect(reminders.tick(time)).toEqual([])
      } else {
        reminders.tick(time)
      }
    }
  })

  test('only the menu’s choices; anything else turns it off', () => {
    const reminders = createReminders({ now: 0 })
    reminders.setBreakEvery(7, 0)
    expect(reminders.breakEvery).toBe(0)
    reminders.setBreakEvery(60, 0)
    expect(reminders.breakEvery).toBe(60)
  })
})

describe('timer', () => {
  test('says so once when time’s up, and counts down in whole minutes', () => {
    const reminders = createReminders({ now: 0 })
    reminders.startTimer(25, 0)
    expect(reminders.timerLeft(0)).toBe(25)
    expect(reminders.timerLeft(24.5 * MIN)).toBe(1)
    expect(reminders.tick(24 * MIN)).toEqual([])
    expect(reminders.tick(25 * MIN)).toEqual([{ do: 'remind', kind: 'timer', line: timerLine(25) }])
    expect(reminders.tick(26 * MIN)).toEqual([])
    expect(reminders.timerLeft(26 * MIN)).toBeNull()
  })

  test('works while you’re away, and can be cancelled', () => {
    const reminders = createReminders({ now: 0 })
    reminders.startTimer(10, 0)
    expect(reminders.tick(10 * MIN)).toHaveLength(1)
    reminders.startTimer(5, 20 * MIN)
    reminders.cancelTimer()
    expect(reminders.tick(30 * MIN)).toEqual([])
    expect(reminders.timerLeft(30 * MIN)).toBeNull()
  })

  test('friendly spans', () => {
    expect(span(30)).toBe('Half an hour')
    expect(span(60)).toBe('An hour')
    expect(span(25)).toBe('25 minutes')
    expect(timerLine(60)).toContain('an hour')
  })
})
