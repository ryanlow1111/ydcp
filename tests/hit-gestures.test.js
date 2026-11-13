import { describe, expect, test } from 'vitest'
import { createHitTest, isSolidAt } from '../src/hit.js'
import { classifyPress, passedDragDistance } from '../src/gestures.js'

/** A fake renderer whose canvas is 100×100 logical px (ratio 2): solid inside `solidRect`. */
function fakeRenderer(solidRect = { x: 40, y: 40, w: 20, h: 20 }) {
  const ratio = 2
  const size = 100 * ratio
  const gl = {
    RGBA: 0,
    UNSIGNED_BYTE: 0,
    drawingBufferWidth: size,
    drawingBufferHeight: size,
    readPixels(px, py, w, h, format, type, out) {
      // WebGL's y runs bottom-up; turn it back into logical top-down.
      const x = px / ratio
      const y = (size - py) / ratio
      const inside = x >= solidRect.x && x < solidRect.x + solidRect.w && y >= solidRect.y && y < solidRect.y + solidRect.h
      out[3] = inside ? 255 : 0
    },
  }
  return { getContext: () => gl, getPixelRatio: () => ratio }
}

describe('click-through', () => {
  test('a pixel near the cursor counts, so thin parts are easy to grab', () => {
    const solidOnlyAt = (sx, sy) => (x, y) => (x === sx && y === sy ? 255 : 0)
    expect(isSolidAt(10, 10, solidOnlyAt(10, 10))).toBe(true)
    expect(isSolidAt(10, 10, solidOnlyAt(16, 10))).toBe(true)
    expect(isSolidAt(10, 10, solidOnlyAt(20, 10))).toBe(false)
    expect(isSolidAt(10, 10, () => -1)).toBe(false)
  })

  test('catches clicks over her, lets them through elsewhere, and only reports changes', () => {
    const calls = []
    const hit = createHitTest({ renderer: fakeRenderer(), setClickThrough: on => calls.push(on) })

    hit.aim(5, 5, true)
    hit.afterRender(1000)
    expect(calls).toEqual([true])

    hit.aim(50, 50, true)
    hit.afterRender(1010)
    expect(calls).toEqual([true], 'too soon after the last check: no new read')
    hit.afterRender(1100)
    hit.afterRender(1200)
    expect(calls).toEqual([true, false])

    hit.aim(-20, 50, false)
    expect(calls).toEqual([true, false, true])
  })

  test('holds clicks while a press is going on, even off her', () => {
    const calls = []
    const hit = createHitTest({ renderer: fakeRenderer(), setClickThrough: on => calls.push(on) })
    hit.aim(50, 50, true)
    hit.afterRender(1000)
    hit.hold()
    hit.aim(5, 5, true)
    hit.afterRender(1100)
    expect(calls.at(-1)).toBe(false)
    hit.release()
    expect(calls.at(-1)).toBe(true)
  })
})

describe('gestures', () => {
  test('a quick still press is a poke; a moving press is a drag; a long still press is a hold', () => {
    expect(classifyPress({ moved: false, ms: 120 })).toBe('poke')
    expect(classifyPress({ moved: true, ms: 120 })).toBe('drag')
    expect(classifyPress({ moved: true, ms: 900 })).toBe('drag')
    expect(classifyPress({ moved: false, ms: 900 })).toBe('hold')
    // Too slow for a poke, too short for a hold: nothing.
    expect(classifyPress({ moved: false, ms: 350 })).toBe('none')
  })

  test('small wobbles stay a poke', () => {
    expect(passedDragDistance(2, 2)).toBe(false)
    expect(passedDragDistance(5, 0)).toBe(true)
  })
})
