// What she notices about the computer itself: a battery running low, the charger going in, a
// long stretch of heavy work, and the quiet after it. The app reads the battery and how busy
// the processor is every few seconds (src-tauri/src/senses.rs): machine facts only, nothing
// about what you're doing. This turns those readings into the few moments worth a reaction,
// each said once, never while she dozes.
//
// Plain logic with the time passed in (ms), so it's easy to test; main.js acts on what it returns.

import { fill, lines } from './i18n.js'

/** On battery at this level or below, she says it's getting low… */
export const BATTERY_LOW = 20
/** …and once more, more urgently, at this one. */
export const BATTERY_CRITICAL = 8
/** Plugging in is worth a word only if the battery was at this level or below. */
export const PLUG_MATTERS = 40
/** The processor this busy (0–1, all cores together)… */
export const BUSY = 0.75
/** …for this long is heavy work she notices. */
export const BUSY_AFTER_MS = 60 * 1000
/** Below this for this long, the work is over… */
export const CALM = 0.35
export const CALM_AFTER_MS = 15 * 1000
/** …and if it lasted at least this long, it's worth a "done?". */
export const DONE_WORTH_MS = 2 * 60 * 1000

/** How long each kind of notice may wait for its turn to be said (director.js). */
const WAIT_MS = { battery: 2 * 60 * 1000, cpu: 30 * 1000 }

/**
 * Her senses over time. `read(snapshot, time, awake)` takes what the app reports,
 * { battery: { percent, plugged, charging } | null, cpu: 0–1 | null }, and returns notices:
 * { event, line, wait } with event 'battery.low', 'battery.critical', 'power.plugged',
 * 'cpu.busy' or 'cpu.done'. While she isn't `awake` nothing is noticed, and nothing is used
 * up: a low battery is still mentioned when she wakes.
 */
export function createSenses({ random = Math.random } = {}) {
  let wasPlugged = null
  let toldLow = false
  let toldCritical = false
  let busySince = null
  let calmSince = null
  let toldBusy = false

  const pick = key => {
    const list = lines(key)
    return list[Math.floor(random() * list.length) % list.length] ?? null
  }
  const notice = (event, key, values = {}) => ({ event, line: fill(pick(key), values), wait: WAIT_MS[event.startsWith('cpu') ? 'cpu' : 'battery'] })

  function battery({ percent, plugged }, awake) {
    const notices = []
    if (plugged) {
      // The charger just went in: a relief, if she was running low. Either way, a later
      // low battery is news again.
      if (wasPlugged === false && percent <= PLUG_MATTERS && awake) {
        notices.push(notice('power.plugged', 'lines.plugged'))
      }
      toldLow = false
      toldCritical = false
    } else if (awake) {
      if (percent <= BATTERY_CRITICAL && !toldCritical) {
        toldCritical = true
        toldLow = true
        notices.push(notice('battery.critical', 'lines.batteryCritical', { n: percent }))
      } else if (percent <= BATTERY_LOW && !toldLow) {
        toldLow = true
        notices.push(notice('battery.low', 'lines.batteryLow', { n: percent }))
      }
    }
    wasPlugged = plugged
    return notices
  }

  function processor(cpu, time, awake) {
    if (cpu >= BUSY) {
      busySince ??= time
      calmSince = null
      if (!toldBusy && awake && time - busySince >= BUSY_AFTER_MS) {
        toldBusy = true
        return [notice('cpu.busy', 'lines.busy')]
      }
    } else if (cpu < CALM && busySince !== null) {
      calmSince ??= time
      if (time - calmSince >= CALM_AFTER_MS) {
        const lasted = calmSince - busySince
        busySince = null
        calmSince = null
        toldBusy = false
        if (awake && lasted >= DONE_WORTH_MS) {
          return [notice('cpu.done', 'lines.busyDone')]
        }
      }
    } else {
      // In between: not calm yet, and a dip like this doesn't end a busy stretch.
      calmSince = null
    }
    return []
  }

  return {
    read(snapshot, time, awake = true) {
      const notices = []
      if (snapshot?.battery && Number.isFinite(snapshot.battery.percent)) {
        notices.push(...battery(snapshot.battery, awake))
      }
      if (Number.isFinite(snapshot?.cpu)) {
        notices.push(...processor(snapshot.cpu, time, awake))
      }
      return notices
    },
  }
}
