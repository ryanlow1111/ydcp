// What she remembers between launches: the last day she saw you, and how many days in a row.
// Two small values, kept in ~/.ydcp/settings.json by the app; nothing else is stored, and
// nothing leaves the computer. From them she knows the first time she sees you each day, and
// whether that day is an occasion: your birthday (if you told her, in lines.json), a long
// time apart, a run of days together, or a weekend.
//
// Plain logic with the date passed in, so it's easy to test; mood.js turns an occasion into
// her greeting, and main.js saves what `meet` returns.

/** Days in a row worth a word. */
export const STREAKS = [3, 7, 14, 30, 50, 100, 200, 365]
/** This many days apart (or more) and she says she missed you. */
export const MISSED_AFTER_DAYS = 3

const pad = number => String(number).padStart(2, '0')

/** A date's day in the user's own time zone, as 'YYYY-MM-DD'. */
export const dayKey = date => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`

const DAY_KEY = /^(\d{4})-(\d{2})-(\d{2})$/

/** Whole calendar days from day `from` to day `to` (both 'YYYY-MM-DD'); null if either is odd. */
export function daysBetween(from, to) {
  const a = DAY_KEY.exec(from ?? '')
  const b = DAY_KEY.exec(to ?? '')
  if (!a || !b) {
    return null
  }
  const utc = match => Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Math.round((utc(b) - utc(a)) / 86400000)
}

/**
 * A birthday as the user wrote it in lines.json ("11-13", "11/13", "1990-11-13"), as 'MM-DD';
 * null if it isn't a real month and day. The year, if given, is never kept.
 */
export function parseBirthday(text) {
  if (typeof text !== 'string') {
    return null
  }
  const match = /^(?:\d{4}[-/])?(\d{1,2})[-/](\d{1,2})$/.exec(text.trim())
  if (!match) {
    return null
  }
  const month = Number(match[1])
  const day = Number(match[2])
  // 2024 is a leap year, so 29 February is a real birthday.
  const real = new Date(Date.UTC(2024, month - 1, day))
  return real.getUTCMonth() === month - 1 && real.getUTCDate() === day ? `${pad(month)}-${pad(day)}` : null
}

/** What was saved, checked: { lastDay, streak }. Anything odd starts her memory afresh. */
export function validMemory(saved) {
  const lastDay = typeof saved?.lastDay === 'string' && DAY_KEY.test(saved.lastDay) ? saved.lastDay : null
  const streak = Number.isInteger(saved?.streak) && saved.streak > 0 && lastDay !== null ? saved.streak : 0
  return { lastDay, streak }
}

/**
 * She sees you at `date` (a Date). Returns { memory, occasion }: her memory afterwards (the
 * same object if she already saw you today: nothing to save), and what today is, if this is
 * the first time today and it's an occasion:
 *   { kind: 'birthday' } · { kind: 'missed', days } · { kind: 'streak', days } · { kind: 'weekend' }
 * `birthday` is 'MM-DD' or null.
 */
export function meet(memory, date, birthday = null) {
  const today = dayKey(date)
  if (memory.lastDay === today) {
    return { memory, occasion: null }
  }
  const apart = daysBetween(memory.lastDay, today)
  // The next day keeps the run going. Anything else (a gap, a first meeting, a clock set
  // back) starts it again.
  const streak = apart === 1 ? memory.streak + 1 : 1
  let occasion = null
  if (birthday !== null && today.endsWith(birthday)) {
    occasion = { kind: 'birthday' }
  } else if (apart !== null && apart >= MISSED_AFTER_DAYS) {
    occasion = { kind: 'missed', days: apart }
  } else if (STREAKS.includes(streak)) {
    occasion = { kind: 'streak', days: streak }
  } else if (date.getDay() === 0 || date.getDay() === 6) {
    occasion = { kind: 'weekend' }
  }
  return { memory: { lastDay: today, streak }, occasion }
}
