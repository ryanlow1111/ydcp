import { describe, expect, test } from 'vitest'
import { AFTER_CONTACT_MS, CHATTINESS, bubbleMs, createDirector } from '../src/director.js'

const MINUTE = 60 * 1000
const said = turn => turn?.line ?? null

describe('who gets to speak', () => {
  test('a bubble stays up longer for a longer line, or as long as asked', () => {
    expect(bubbleMs('Hi!')).toBe(2500 + 3 * 60)
    expect(bubbleMs('Hi!', 20000)).toBe(20000)
    expect(createDirector().offer({ line: 'Hi!', kind: 'answer' }, 0)).toEqual({ line: 'Hi!', ms: 2680, talk: true })
  })

  test('answers and asked-for lines are always shown at once, even over another bubble', () => {
    const director = createDirector()
    expect(said(director.offer({ line: 'Peace!', kind: 'answer' }, 0))).toBe('Peace!')
    expect(said(director.offer({ line: 'Time’s up!', kind: 'asked', hold: 20000 }, 100))).toBe('Time’s up!')
    expect(said(director.offer({ line: 'Ehehe…', kind: 'answer' }, 200))).toBe('Ehehe…')
  })

  test('her own ideas are rationed: one per stretch, by Chattiness', () => {
    const director = createDirector({ chattiness: 'calm' })
    expect(said(director.offer({ line: 'la la la', kind: 'own' }, 0))).toBe('la la la')
    expect(director.offer({ line: 'hm hm', kind: 'own' }, 2 * MINUTE)).toBeNull()
    expect(said(director.offer({ line: 'water!', kind: 'own' }, CHATTINESS.calm))).toBe('water!')

    const chatty = createDirector({ chattiness: 'chatty' })
    chatty.offer({ line: 'la la la', kind: 'own' }, 0)
    expect(said(chatty.offer({ line: 'hm hm', kind: 'own' }, 2 * MINUTE))).toBe('hm hm')
  })

  test('her own ideas never replace a bubble that is still up', () => {
    const director = createDirector()
    director.offer({ line: 'Time for a break?', kind: 'asked', hold: 20000 }, 0)
    expect(director.offer({ line: 'la la la', kind: 'own' }, 10000)).toBeNull()
    expect(said(director.offer({ line: 'la la la', kind: 'own' }, 21000))).toBe('la la la')
  })

  test('after you touch her she keeps her own ideas to herself for a while', () => {
    const director = createDirector()
    director.offer({ line: 'Peace!', kind: 'answer' }, 0)
    expect(director.offer({ line: 'la la la', kind: 'own' }, AFTER_CONTACT_MS - 1)).toBeNull()
    expect(said(director.offer({ line: 'la la la', kind: 'own' }, AFTER_CONTACT_MS))).toBe('la la la')

    const silent = createDirector()
    silent.contact(0)
    expect(silent.offer({ line: 'la la la', kind: 'own' }, 5000)).toBeNull()
  })

  test('a greeting is not rationed, but it waits for a bubble that is up', () => {
    const director = createDirector()
    director.offer({ line: 'la la la', kind: 'own' }, 0)
    // Straight after one of her own ideas: a hello still comes, once the bubble is down.
    expect(director.offer({ line: 'Welcome back~', kind: 'hello', wait: 8000 }, 1000)).toBeNull()
    expect(director.tick(2000)).toBeNull()
    expect(said(director.tick(4000))).toBe('Welcome back~')
    expect(director.tick(5000)).toBeNull()
    // And it counts as her having spoken: no musing right on its heels.
    expect(director.offer({ line: 'hm hm', kind: 'own' }, 60000)).toBeNull()
  })

  test('she knows when a waiting line gets its turn, so nothing depends on luck', () => {
    const director = createDirector()
    expect(director.nextTurn(0)).toBeNull()
    director.offer({ line: 'Time for a break?', kind: 'asked', hold: 6000 }, 0)
    director.offer({ line: 'Welcome back~', kind: 'hello', wait: 8000 }, 1000)
    // As soon as the reminder's bubble comes down.
    expect(director.nextTurn(1000)).toBe(6000)
    expect(said(director.tick(6000))).toBe('Welcome back~')
    expect(director.nextTurn(6000)).toBeNull()

    // Her own idea waits for the bubble, the stretch since she last spoke, and your last touch.
    const own = createDirector()
    own.offer({ line: 'la la la', kind: 'own' }, 0)
    own.offer({ line: 'Lunch time?', kind: 'own', wait: 10 * MINUTE }, MINUTE)
    expect(own.nextTurn(MINUTE)).toBe(CHATTINESS.calm)
    own.contact(CHATTINESS.calm - 1000)
    expect(own.nextTurn(CHATTINESS.calm - 1000)).toBe(CHATTINESS.calm - 1000 + AFTER_CONTACT_MS)

    // It would be stale by then: no point coming back.
    const stale = createDirector()
    stale.offer({ line: 'Time for a break?', kind: 'asked', hold: 20000 }, 0)
    stale.offer({ line: 'Welcome back~', kind: 'hello', wait: 8000 }, 1000)
    expect(stale.nextTurn(1000)).toBeNull()
  })

  test('a line that waited too long is dropped, not said late', () => {
    const director = createDirector()
    director.offer({ line: 'Time for a break?', kind: 'asked', hold: 20000 }, 0)
    director.offer({ line: 'Welcome back~', kind: 'hello', wait: 8000 }, 1000)
    expect(director.tick(25000)).toBeNull()
    expect(director.tick(26000)).toBeNull()
  })

  test('a line with no patience is simply dropped when it cannot be said', () => {
    const director = createDirector()
    director.offer({ line: 'la la la', kind: 'own' }, 0)
    director.offer({ line: 'hm hm', kind: 'own' }, MINUTE)
    expect(director.tick(CHATTINESS.calm + 1)).toBeNull()
  })

  test('a waiting line gives way only to one that matters as much', () => {
    const director = createDirector()
    director.offer({ line: 'Peace!', kind: 'answer' }, 0)
    director.offer({ line: 'Welcome back~', kind: 'hello', wait: 60000 }, 100)
    director.offer({ line: 'Lunch time?', kind: 'own', wait: 60000 }, 200)
    expect(said(director.tick(5000))).toBe('Welcome back~')
  })

  test('her own idea can wait for its turn (the time of day)', () => {
    const director = createDirector()
    director.offer({ line: 'la la la', kind: 'own' }, 0)
    expect(director.offer({ line: 'Lunch time?', kind: 'own', wait: 10 * MINUTE }, MINUTE)).toBeNull()
    expect(director.tick(4 * MINUTE)).toBeNull()
    expect(said(director.tick(CHATTINESS.calm))).toBe('Lunch time?')
  })
})

describe('Chattiness', () => {
  test('Quiet: nothing unprompted, but she still answers and reminds', () => {
    const director = createDirector({ chattiness: 'quiet' })
    expect(director.offer({ line: 'la la la', kind: 'own' }, 0)).toBeNull()
    expect(director.offer({ line: 'Hello~', kind: 'hello', wait: 8000 }, 0)).toBeNull()
    expect(director.tick(1000)).toBeNull()
    expect(said(director.offer({ line: 'Peace!', kind: 'answer' }, 2000))).toBe('Peace!')
    expect(said(director.offer({ line: 'Time’s up!', kind: 'asked' }, 3000))).toBe('Time’s up!')
  })

  test('switching to Quiet drops a line that was waiting; switching back lets her speak', () => {
    const director = createDirector()
    director.offer({ line: 'Peace!', kind: 'answer' }, 0)
    director.offer({ line: 'Welcome back~', kind: 'hello', wait: 60000 }, 100)
    director.setChattiness('quiet')
    expect(director.chattiness).toBe('quiet')
    director.setChattiness('chatty')
    expect(director.tick(10000)).toBeNull()
    expect(said(director.offer({ line: 'la la la', kind: 'own' }, AFTER_CONTACT_MS))).toBe('la la la')
  })

  test('an unknown choice means Calm', () => {
    const director = createDirector({ chattiness: 'shouty' })
    expect(director.chattiness).toBe('calm')
    director.setChattiness('nonsense')
    expect(director.chattiness).toBe('calm')
  })

  test('a silent line (a problem to report) keeps its mouth shut', () => {
    expect(createDirector().offer({ line: '⚠️ Oops', kind: 'asked', talk: false }, 0).talk).toBe(false)
  })
})
