import { describe, expect, test } from 'vitest'
import { BATTERY_CRITICAL, BATTERY_LOW, BUSY, BUSY_AFTER_MS, CALM, CALM_AFTER_MS, DONE_WORTH_MS, PLUG_MATTERS, createSenses } from '../src/senses.js'

const make = () => createSenses({ random: () => 0 })
const events = notices => notices.map(notice => notice.event)
const onBattery = percent => ({ battery: { percent, plugged: false, charging: false }, cpu: null })
const pluggedIn = percent => ({ battery: { percent, plugged: true, charging: true }, cpu: null })
const load = cpu => ({ battery: null, cpu })
/** Feeds `cpu` every 5 s from `from` for `ms`; returns every notice, with the time after. */
const run = (senses, cpu, from, ms, awake = true) => {
  const notices = []
  let time = from
  for (; time <= from + ms; time += 5000) {
    notices.push(...senses.read(load(cpu), time, awake))
  }
  return { notices, time }
}

describe('the battery', () => {
  test('running low is said once, with the level; critical once more', () => {
    const senses = make()
    expect(senses.read(onBattery(BATTERY_LOW + 1), 0)).toEqual([])
    expect(senses.read(onBattery(BATTERY_LOW), 1000)).toEqual([{ event: 'battery.low', line: 'Battery’s at 20%… plug in soon?', wait: 120000 }])
    expect(senses.read(onBattery(15), 2000)).toEqual([])
    expect(senses.read(onBattery(BATTERY_CRITICAL), 3000)).toEqual([{ event: 'battery.critical', line: '8%! Please plug in, quick…', wait: 120000 }])
    expect(senses.read(onBattery(3), 4000)).toEqual([])
  })

  test('already critical when she first looks: just the urgent one', () => {
    expect(events(make().read(onBattery(5), 0))).toEqual(['battery.critical'])
  })

  test('plugging in when it was low is a relief; after that, low is news again', () => {
    const senses = make()
    senses.read(onBattery(18), 0)
    expect(senses.read(pluggedIn(18), 1000)).toEqual([{ event: 'power.plugged', line: 'Ahh, power~ ✨', wait: 120000 }])
    expect(senses.read(pluggedIn(19), 2000)).toEqual([])
    expect(events(senses.read(onBattery(19), 3000))).toEqual(['battery.low'])
  })

  test('plugging in with plenty left, or already plugged at launch, is not worth a word', () => {
    const senses = make()
    senses.read(onBattery(PLUG_MATTERS + 1), 0)
    expect(senses.read(pluggedIn(PLUG_MATTERS + 1), 1000)).toEqual([])
    expect(make().read(pluggedIn(10), 0)).toEqual([])
  })

  test('while she dozes nothing is said or used up: a low battery waits for her to wake', () => {
    const senses = make()
    expect(senses.read(onBattery(12), 0, false)).toEqual([])
    expect(events(senses.read(onBattery(11), 5000, true))).toEqual(['battery.low'])
  })

  test('a computer with no battery, or an odd report, says nothing', () => {
    const senses = make()
    expect(senses.read({ battery: null, cpu: null }, 0)).toEqual([])
    expect(senses.read({ battery: { percent: 'low', plugged: false }, cpu: 'busy' }, 0)).toEqual([])
    expect(senses.read(null, 0)).toEqual([])
    expect(senses.read(undefined, 0)).toEqual([])
  })
})

describe('heavy work', () => {
  test('busy for a minute: she notices, once', () => {
    const senses = make()
    const early = run(senses, BUSY, 0, BUSY_AFTER_MS - 5000)
    expect(early.notices).toEqual([])
    const later = run(senses, 0.9, early.time, 5 * 60 * 1000)
    expect(later.notices).toEqual([{ event: 'cpu.busy', line: 'It’s getting warm in here…', wait: 30000 }])
  })

  test('a short burst is nothing; a dip in the middle does not end a busy stretch', () => {
    const burst = make()
    const first = run(burst, 0.95, 0, 30000)
    expect(run(burst, 0.1, first.time, 60000).notices).toEqual([])

    const dipping = make()
    const a = run(dipping, 0.9, 0, 30000)
    const b = run(dipping, 0.55, a.time, 10000)
    expect(events(run(dipping, 0.9, b.time, 30000).notices)).toEqual(['cpu.busy'])
  })

  test('quiet after a long job: a "done?"; after a short one, nothing', () => {
    const long = make()
    const busy = run(long, 0.9, 0, DONE_WORTH_MS + 10000)
    const quiet = run(long, 0.05, busy.time, CALM_AFTER_MS + 10000)
    expect(quiet.notices).toEqual([{ event: 'cpu.done', line: 'Phew, all done?', wait: 30000 }])
    // And only once.
    expect(run(long, 0.05, quiet.time, 60000).notices).toEqual([])

    const short = make()
    const brief = run(short, 0.9, 0, BUSY_AFTER_MS + 10000)
    expect(events(brief.notices)).toEqual(['cpu.busy'])
    expect(run(short, 0.05, brief.time, CALM_AFTER_MS + 10000).notices).toEqual([])
  })

  test('after one job ends, the next is noticed afresh', () => {
    const senses = make()
    const one = run(senses, 0.9, 0, DONE_WORTH_MS + 10000)
    const rest = run(senses, 0.05, one.time, CALM_AFTER_MS + 10000)
    const two = run(senses, 0.9, rest.time, BUSY_AFTER_MS + 10000)
    expect(events(two.notices)).toEqual(['cpu.busy'])
  })

  test('middling load is neither busy nor done', () => {
    const senses = make()
    expect(run(senses, (BUSY + CALM) / 2, 0, 10 * 60 * 1000).notices).toEqual([])
  })

  test('while she dozes she says nothing about it', () => {
    const senses = make()
    const busy = run(senses, 0.9, 0, DONE_WORTH_MS + 10000, false)
    expect(busy.notices).toEqual([])
    expect(run(senses, 0.05, busy.time, CALM_AFTER_MS + 10000, false).notices).toEqual([])
  })
})
