import { describe, expect, test } from 'vitest'
import { DIZZY_S, MAX_TILT, SHAKE_TURNS, createCarry } from '../src/carry.js'
import { GLANCE_MAX_S, NOTICE_PX, WATCH_S, createGaze } from '../src/gaze.js'

describe('where she looks', () => {
  test('she watches the cursor while it moves, then looks back at you', () => {
    const gaze = createGaze({ random: () => 0.9 })
    gaze.cursor(1, 400, 100, 0.6, -0.2)
    expect(gaze.aim(1.5)).toEqual({ x: 0.6, y: -0.2, head: 1 })
    expect(gaze.watching(1.5)).toBe(true)
    expect(gaze.aim(1 + WATCH_S + 0.1)).toEqual({ x: 0, y: 0, head: 1 })
    expect(gaze.watching(1 + WATCH_S + 0.1)).toBe(false)
  })

  test('a few pixels of jitter does not catch her eye again', () => {
    const gaze = createGaze({ random: () => 0.9 })
    gaze.cursor(0, 400, 100, 0.6, -0.2)
    gaze.cursor(WATCH_S + 1, 400 + NOTICE_PX - 1, 100, 0.6, -0.2)
    expect(gaze.watching(WATCH_S + 1)).toBe(false)
    gaze.cursor(WATCH_S + 2, 400 + NOTICE_PX * 3, 100, 0.65, -0.2)
    expect(gaze.aim(WATCH_S + 2)).toEqual({ x: 0.65, y: -0.2, head: 1 })
  })

  test('once she is looking at you, she glances away now and then, mostly with her eyes', () => {
    const gaze = createGaze({ random: () => 0.9 })
    gaze.cursor(0, 400, 100, 0.6, -0.2)
    const start = WATCH_S + 0.1
    expect(gaze.aim(start)).toEqual({ x: 0, y: 0, head: 1 })
    const glance = gaze.aim(start + GLANCE_MAX_S)
    expect(Math.abs(glance.x)).toBeGreaterThan(0.2)
    expect(glance.head).toBeLessThan(1)
    // …and comes back.
    expect(gaze.aim(start + GLANCE_MAX_S + 3)).toEqual({ x: 0, y: 0, head: 1 })
  })

  test('some glances are a peek at where the cursor rests', () => {
    const gaze = createGaze({ random: () => 0.1 })
    gaze.cursor(0, 400, 100, 0.6, -0.2)
    gaze.aim(WATCH_S + 0.1)
    expect(gaze.aim(WATCH_S + 0.1 + GLANCE_MAX_S)).toMatchObject({ x: 0.6, y: -0.2 })
  })

  test('in a huff she looks away from the cursor’s side, until it passes', () => {
    const gaze = createGaze({ random: () => 0.9 })
    gaze.cursor(0, 400, 100, 0.6, -0.2)
    gaze.lookAway(1, 2)
    expect(gaze.aim(2).x).toBeLessThan(-0.5)
    expect(gaze.aim(3.5).x).toBeGreaterThanOrEqual(0)
    gaze.lookAway(4, 2)
    gaze.lookAway(4.5, 0)
    expect(gaze.aim(4.6).x).toBeGreaterThanOrEqual(0)
  })
})

describe('being carried', () => {
  /** Runs `seconds` of frames at 60 a second from `from`, calling `each(t)` first; returns the last frame. */
  const run = (carry, from, seconds, each = () => {}) => {
    let last = null
    for (let t = from; t < from + seconds; t += 1 / 60) {
      each(t)
      last = carry.step(1 / 60, t)
    }
    return last
  }

  test('standing, nothing moves', () => {
    const carry = createCarry()
    expect(run(carry, 0, 1)).toEqual({ tilt: 0, lift: 0, dizzy: 0 })
    expect(carry.move(1, 10, 10)).toBeNull()
  })

  test('picked up she is lifted; moved right, her feet trail to the left', () => {
    const carry = createCarry()
    carry.pickUp()
    const moving = run(carry, 0, 1, t => carry.move(t, t * 900, 0))
    expect(moving.lift).toBeGreaterThan(0.8)
    expect(moving.tilt).toBeLessThan(-0.1)
    expect(moving.tilt).toBeGreaterThanOrEqual(-MAX_TILT)
  })

  test('she never swings past the limit, however fast she is flung', () => {
    const carry = createCarry()
    carry.pickUp()
    let furthest = 0
    run(carry, 0, 2, t => {
      carry.move(t, Math.sin(t * 9) * 5000, 0)
      furthest = Math.max(furthest, Math.abs(carry.step(0, t).tilt))
    })
    expect(furthest).toBeLessThanOrEqual(MAX_TILT)
  })

  test('held still, and after being put down, she settles', () => {
    const carry = createCarry()
    carry.pickUp()
    run(carry, 0, 1, t => carry.move(t, t * 900, 0))
    const still = run(carry, 1, 4)
    expect(Math.abs(still.tilt)).toBeLessThan(0.01)
    expect(still.lift).toBeCloseTo(1, 1)
    carry.drop()
    const down = run(carry, 5, 3)
    expect(Math.abs(down.tilt)).toBeLessThan(0.01)
    expect(Math.abs(down.lift)).toBeLessThan(0.01)
  })

  test('several pointer moves in one frame still count as one movement', () => {
    const carry = createCarry()
    carry.pickUp()
    carry.move(0, 0, 0)
    carry.move(0, 5, 0)
    carry.move(0, 10, 0)
    carry.move(0.1, 100, 0)
    // 100 pixels in 0.1 s, moving right: her feet start to trail left.
    expect(carry.step(0.016, 0.1).tilt).toBeLessThan(0)
  })

  test('shaking her makes her dizzy, once, for a while', () => {
    const carry = createCarry()
    carry.pickUp()
    const events = []
    // Back and forth four times a second, 120 pixels each way.
    run(carry, 0, 3, t => events.push(carry.move(t, Math.sin(t * Math.PI * 8) * 120, 0)))
    expect(events.filter(Boolean)).toEqual(['dizzy'])
    const at = events.indexOf('dizzy') / 60
    expect(at).toBeGreaterThan((SHAKE_TURNS - 2) / 8)
    expect(carry.step(1 / 60, at + 1).dizzy).toBeGreaterThan(0)
    expect(run(carry, at + DIZZY_S, 2).dizzy).toBeLessThan(0.01)
  })

  test('a gentle drag never makes her dizzy', () => {
    const carry = createCarry()
    carry.pickUp()
    const events = []
    run(carry, 0, 4, t => events.push(carry.move(t, Math.sin(t * 2) * 200, 0)))
    expect(events.filter(Boolean)).toEqual([])
  })
})
