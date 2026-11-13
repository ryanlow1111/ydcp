import { describe, expect, test } from 'vitest'
import { MISSED_AFTER_DAYS, STREAKS, dayKey, daysBetween, meet, parseBirthday, validMemory } from '../src/memory.js'

/** A local date: year, month (1–12), day, hour. */
const on = (year, month, day, hour = 10) => new Date(year, month - 1, day, hour)
// 9 November 2026 is a Monday.
const MONDAY = on(2026, 11, 9)

describe('days', () => {
  test('a day is the user’s own calendar day', () => {
    expect(dayKey(on(2026, 3, 5, 23))).toBe('2026-03-05')
    expect(dayKey(on(2026, 12, 31, 0))).toBe('2026-12-31')
  })

  test('days between two days, across months, years and leap days', () => {
    expect(daysBetween('2026-11-09', '2026-11-10')).toBe(1)
    expect(daysBetween('2026-11-09', '2026-11-09')).toBe(0)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
    expect(daysBetween('2026-11-10', '2026-11-09')).toBe(-1)
    expect(daysBetween(null, '2026-11-09')).toBeNull()
    expect(daysBetween('yesterday', '2026-11-09')).toBeNull()
  })
})

describe('your birthday, as you wrote it', () => {
  test('month and day, with or without a year (which is never kept)', () => {
    expect(parseBirthday('11-13')).toBe('11-13')
    expect(parseBirthday('3/7')).toBe('03-07')
    expect(parseBirthday(' 1990-11-13 ')).toBe('11-13')
    expect(parseBirthday('02-29')).toBe('02-29')
  })

  test('anything that is not a real day is ignored', () => {
    for (const odd of ['13-40', '02-30', '0-5', 'November 13', '', null, 1113, {}]) {
      expect(parseBirthday(odd), String(odd)).toBeNull()
    }
  })
})

describe('what was saved', () => {
  test('a sensible memory is kept; anything odd starts afresh', () => {
    expect(validMemory({ lastDay: '2026-11-09', streak: 4 })).toEqual({ lastDay: '2026-11-09', streak: 4 })
    expect(validMemory({ lastDay: '2026-11-09', streak: 4, extra: true })).toEqual({ lastDay: '2026-11-09', streak: 4 })
    for (const odd of [null, undefined, 'yes', {}, { lastDay: 'soon', streak: 4 }, { streak: 4 }]) {
      expect(validMemory(odd), JSON.stringify(odd)).toEqual({ lastDay: null, streak: 0 })
    }
    expect(validMemory({ lastDay: '2026-11-09', streak: -2 })).toEqual({ lastDay: '2026-11-09', streak: 0 })
    expect(validMemory({ lastDay: '2026-11-09', streak: 1.5 })).toEqual({ lastDay: '2026-11-09', streak: 0 })
  })
})

describe('seeing you', () => {
  const fresh = validMemory(null)

  test('the first meeting starts her memory, with nothing special to say', () => {
    expect(meet(fresh, MONDAY)).toEqual({ memory: { lastDay: '2026-11-09', streak: 1 }, occasion: null })
  })

  test('again the same day: nothing changes, so there is nothing to save', () => {
    const { memory } = meet(fresh, MONDAY)
    const again = meet(memory, on(2026, 11, 9, 22))
    expect(again.memory).toBe(memory)
    expect(again.occasion).toBeNull()
  })

  test('the next day keeps the run going; a missed day starts it again', () => {
    let memory = meet(fresh, MONDAY).memory
    memory = meet(memory, on(2026, 11, 10)).memory
    expect(memory).toEqual({ lastDay: '2026-11-10', streak: 2 })
    const skipped = meet(memory, on(2026, 11, 12))
    expect(skipped.memory).toEqual({ lastDay: '2026-11-12', streak: 1 })
    expect(skipped.occasion).toBeNull()
  })

  test('a run of days is worth a word on some days only', () => {
    let memory = fresh
    const occasions = []
    // Weekdays only would be simpler, but a run crosses weekends: note what each day brings.
    for (let day = 0; day < 8; day++) {
      const met = meet(memory, new Date(2026, 10, 9 + day, 10))
      memory = met.memory
      occasions.push(met.occasion?.kind ?? null)
    }
    // Mon 9 … Mon 16: day 3 is Wednesday (a run of 3), the 6th and 7th days are the weekend, and
    // the run of 7 falls on that Sunday, where it wins over the weekend.
    expect(occasions).toEqual([null, null, 'streak', null, null, 'weekend', 'streak', null])
    expect(memory.streak).toBe(8)
    expect(STREAKS).toContain(3)
    expect(STREAKS).toContain(7)
  })

  test('a long time apart: she says so, and the run starts again', () => {
    const memory = { lastDay: '2026-11-02', streak: 12 }
    expect(meet(memory, MONDAY)).toEqual({ memory: { lastDay: '2026-11-09', streak: 1 }, occasion: { kind: 'missed', days: 7 } })
    const justShort = { lastDay: dayKey(on(2026, 11, 9 - (MISSED_AFTER_DAYS - 1))), streak: 2 }
    expect(meet(justShort, MONDAY).occasion).toBeNull()
  })

  test('your birthday comes before everything else, once that day', () => {
    const memory = { lastDay: '2026-11-01', streak: 3 }
    const birthday = meet(memory, MONDAY, '11-09')
    expect(birthday.occasion).toEqual({ kind: 'birthday' })
    expect(meet(birthday.memory, on(2026, 11, 9, 20), '11-09').occasion).toBeNull()
    expect(meet(memory, MONDAY, '11-10').occasion).toEqual({ kind: 'missed', days: 8 })
  })

  test('the first time on a Saturday or Sunday is a weekend hello', () => {
    const friday = { lastDay: '2026-11-13', streak: 1 }
    expect(meet(friday, on(2026, 11, 14)).occasion).toEqual({ kind: 'weekend' })
    expect(meet({ lastDay: '2026-11-14', streak: 4 }, on(2026, 11, 15)).occasion).toEqual({ kind: 'weekend' })
    expect(meet({ lastDay: '2026-11-15', streak: 5 }, on(2026, 11, 16)).occasion).toBeNull()
  })

  test('a clock set back does no harm: the run just starts again', () => {
    const memory = { lastDay: '2026-11-20', streak: 9 }
    expect(meet(memory, MONDAY)).toEqual({ memory: { lastDay: '2026-11-09', streak: 1 }, occasion: null })
  })
})
