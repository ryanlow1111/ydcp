import { describe, expect, test } from 'vitest'
import { FLINCH_SPEED, STARE_AGAIN_S, STARE_S, createCursorPlay, zoneOf } from '../src/touch.js'

const face = { x: 160, y: 120, r: 40 }
const hands = { right: { x: 90, y: 300, r: 15 }, left: { x: 230, y: 300, r: 15 } }

describe('where a poke lands', () => {
  test('her face (and which side of it), a hand, or her body', () => {
    expect(zoneOf({ x: 140, y: 125 }, { face, hands })).toBe('face:left')
    expect(zoneOf({ x: 175, y: 110 }, { face, hands })).toBe('face:right')
    expect(zoneOf({ x: 92, y: 305 }, { face, hands })).toBe('hand:right')
    expect(zoneOf({ x: 232, y: 290 }, { face, hands })).toBe('hand:left')
    expect(zoneOf({ x: 160, y: 250 }, { face, hands })).toBe('body')
  })

  test('a hand held up in front of her face is still the hand', () => {
    const waving = { right: { x: 130, y: 110, r: 15 }, left: null }
    expect(zoneOf({ x: 132, y: 112 }, { face, hands: waving })).toBe('hand:right')
  })

  test('a model that could not be measured is all body', () => {
    expect(zoneOf({ x: 160, y: 120 })).toBe('body')
    expect(zoneOf({ x: 160, y: 120 }, { face: null, hands: { right: null, left: null } })).toBe('body')
  })
})

describe('the cursor around her face', () => {
  test('rushing onto her face makes her flinch, from the side it came', () => {
    const play = createCursorPlay()
    expect(play.cursor(0, 400, 120, face)).toBeNull()
    expect(play.cursor(0.05, 170, 120, face)).toBe('flinch:right')
    const other = createCursorPlay()
    other.cursor(0, 0, 120, face)
    expect(other.cursor(0.05, 150, 120, face)).toBe('flinch:left')
  })

  test('drifting onto her face does not', () => {
    const play = createCursorPlay()
    play.cursor(0, 220, 120, face)
    const slow = (FLINCH_SPEED / 2) * 0.05
    expect(play.cursor(0.05, 220 - slow, 120, face)).toBeNull()
  })

  test('she does not flinch again straight away, or while she cannot react', () => {
    const play = createCursorPlay()
    play.cursor(0, 400, 120, face)
    expect(play.cursor(0.05, 170, 120, face)).toBe('flinch:right')
    play.cursor(0.1, 400, 120, face)
    expect(play.cursor(0.15, 170, 120, face)).toBeNull()
    play.cursor(10, 400, 120, null)
    expect(play.cursor(10.05, 170, 120, null)).toBeNull()
  })

  test('a cursor resting on her face is a stare: she gets shy, once per visit', () => {
    const play = createCursorPlay()
    play.cursor(0, 165, 120, face)
    expect(play.stare(STARE_S - 0.1, true)).toBe(false)
    expect(play.stare(STARE_S, true)).toBe(true)
    expect(play.stare(STARE_S + 100, true)).toBe(false)
    // Away and back: she can be shy again, but not too soon after the last time.
    play.cursor(STARE_S + 1, 400, 300, face)
    play.cursor(STARE_S + 2, 165, 120, face)
    expect(play.stare(STARE_S * 2 + 2, true)).toBe(false)
    expect(play.stare(STARE_S + STARE_AGAIN_S, true)).toBe(true)
  })

  test('a poke or a pat is not staring: the count starts again', () => {
    const play = createCursorPlay()
    play.cursor(0, 165, 120, face)
    play.touched(2)
    expect(play.stare(STARE_S, true)).toBe(false)
    expect(play.stare(2 + STARE_S, true)).toBe(true)
  })

  test('while she is busy the stare waits, and starts again once she is free', () => {
    const play = createCursorPlay()
    play.cursor(0, 165, 120, face)
    expect(play.stare(STARE_S, false)).toBe(false)
    expect(play.stare(STARE_S + 1, true)).toBe(false)
    expect(play.stare(STARE_S * 2, true)).toBe(true)
  })

  test('a cursor elsewhere is never a stare', () => {
    const play = createCursorPlay()
    play.cursor(0, 400, 300, face)
    expect(play.stare(100, true)).toBe(false)
  })
})
