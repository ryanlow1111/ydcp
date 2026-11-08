// Gentle reminders she gives: a break after a stretch of work, and a simple timer. Both are
// optional (Menu → Reminders), make no sound, and work fully offline.
//
// Plain logic with the time passed in, so it's easy to test; main.js acts on what it returns.

/** Being away this long (no cursor movement) counts as a break. */
export const AWAY_IS_A_BREAK_MS = 5 * 60 * 1000
/** A break reminder only comes while you're actually here (moved the cursor this recently). */
const HERE_MS = 60 * 1000
const MINUTE = 60 * 1000

export const BREAK_CHOICES = [30, 45, 60, 90]
export const TIMER_CHOICES = [5, 10, 15, 25, 45, 60]

/** 30 → "Half an hour", 60 → "An hour", 45 → "45 minutes". */
export function span(minutes) {
  const names = { 30: 'Half an hour', 60: 'An hour', 90: 'An hour and a half', 120: 'Two hours' }
  return names[minutes] ?? `${minutes} minutes`
}

export const breakLine = minutes => `${span(minutes)} already! Time to stretch and rest your eyes? ☕`
export const timerLine = minutes => `Time’s up! ⏰ (${span(minutes).toLowerCase()})`

/**
 * Reminders over time. `tick(now)` returns actions: { do: 'remind', kind: 'break' | 'timer', line }.
 */
export function createReminders({ now }) {
  let breakEvery = 0
  let workStart = now
  let lastActivity = now
  let timer = null

  return {
    /** Break reminders every `minutes` of work, or never (0). */
    setBreakEvery(minutes, time) {
      breakEvery = BREAK_CHOICES.includes(minutes) ? minutes : 0
      workStart = time
    },

    get breakEvery() {
      return breakEvery
    },

    /** The cursor moved: you're here. Being away a while counted as a break. */
    activity(time) {
      if (time - lastActivity >= AWAY_IS_A_BREAK_MS) {
        workStart = time
      }
      lastActivity = time
    },

    /** Starts (or restarts) a timer for `minutes`. */
    startTimer(minutes, time) {
      timer = minutes > 0 ? { minutes, end: time + minutes * MINUTE } : null
    },

    cancelTimer() {
      timer = null
    },

    /** Whole minutes left on the timer (rounded up), or null if none is running. */
    timerLeft(time) {
      return timer ? Math.max(1, Math.ceil((timer.end - time) / MINUTE)) : null
    },

    tick(time) {
      const actions = []
      if (timer && time >= timer.end) {
        actions.push({ do: 'remind', kind: 'timer', line: timerLine(timer.minutes) })
        timer = null
      }
      if (time - lastActivity >= AWAY_IS_A_BREAK_MS) {
        workStart = time
      } else if (breakEvery > 0 && time - workStart >= breakEvery * MINUTE && time - lastActivity < HERE_MS) {
        actions.push({ do: 'remind', kind: 'break', line: breakLine(breakEvery) })
        workStart = time
      }
      return actions
    },
  }
}
