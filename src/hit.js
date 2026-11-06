// Click-through: clicks pass through the window everywhere except on her.
//
// Right after each frame is drawn, a few pixels under the cursor are read back: if any of them
// is part of her (not transparent), the window catches clicks; otherwise it lets them through
// to the app behind. A small ring of extra points makes thin parts (fingers, hair) easier to
// grab. While a press or drag is going on, or a card is showing, the window always catches.

/** Pixels around the cursor that count, in logical pixels. */
export const PROBE_OFFSETS = [
  [0, 0],
  [6, 0],
  [-6, 0],
  [0, 6],
  [0, -6],
]

/** Alpha (0–255) above which a pixel is part of her. */
export const SOLID_ALPHA = 25

/** Milliseconds between pixel checks (the cursor position itself arrives every 50 ms). */
export const PROBE_INTERVAL_MS = 45

/** Whether any probed pixel is solid. `alphaAt(x, y)` gives a pixel's alpha, or -1 if off-canvas. */
export function isSolidAt(x, y, alphaAt) {
  return PROBE_OFFSETS.some(([dx, dy]) => alphaAt(x + dx, y + dy) > SOLID_ALPHA)
}

/**
 * Keeps the window's click-through in step with the cursor. `setClickThrough(on)` is only
 * called when the answer changes.
 */
export function createHitTest({ renderer, setClickThrough }) {
  let target = null
  let overHer = false
  let held = 0
  let current = null
  let lastProbe = -Infinity
  const pixel = new Uint8Array(4)

  function update() {
    const catchClicks = held > 0 || overHer
    if (catchClicks !== current) {
      current = catchClicks
      setClickThrough(!catchClicks)
    }
  }

  /** A pixel's alpha at window-local logical (x, y), or -1 if it's outside the canvas. */
  function alphaAt(x, y) {
    const gl = renderer.getContext()
    const ratio = renderer.getPixelRatio()
    const px = Math.round(x * ratio)
    const py = Math.round(gl.drawingBufferHeight - y * ratio)
    if (px < 0 || py < 0 || px >= gl.drawingBufferWidth || py >= gl.drawingBufferHeight) {
      return -1
    }
    gl.readPixels(px, py, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel)
    return pixel[3]
  }

  return {
    /** The cursor moved (window-local logical pixels); `inside` = it's over the window. */
    aim(x, y, inside) {
      target = inside ? { x, y } : null
      if (!inside) {
        overHer = false
        update()
      }
    },
    /**
     * Call right after a frame is drawn: the frame's pixels are only readable until then.
     * Reading pixels makes the CPU wait for the GPU, so it's done at most ~20 times a second
     * (as often as the cursor position arrives), not every frame.
     */
    afterRender(now = performance.now()) {
      if (target !== null && now - lastProbe >= PROBE_INTERVAL_MS) {
        lastProbe = now
        overHer = isSolidAt(target.x, target.y, alphaAt)
        update()
      }
    },
    /** Catch every click while something needs it (a press, a drag, a card). Pair with release(). */
    hold() {
      held += 1
      update()
    },
    release() {
      held = Math.max(0, held - 1)
      update()
    },
  }
}
