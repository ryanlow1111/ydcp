import { expect, mock, test } from 'claude-code/testing'
import type { On } from 'claude-code'

const START = Date.UTC(2026, 10, 7, 9, 0, 0)

/** The engine beneath: a clock, a home folder, files written by path. */
function world(on: On, files: Map<string, string>, env: Record<string, string>) {
  mock.clock(on, { now: START })
  mock.env(on, env)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  on('fs.write', ($, e) => {
    files.set(e.path, e.text)
    return { value: undefined }
  })
}

const finish = (turnId: string, reason: 'answer' | 'aborted' | 'refusal' | 'error' = 'answer') =>
  ({ answer: 'ok', durationMs: 1, isAborted: reason === 'aborted', turnId, reason }) as const

const state = (files: Map<string, string>, path: string) =>
  JSON.parse(files.get(path) ?? '{}') as { mood?: string; at?: number }

test('writes working, then done, to ~/.ydcp/state.json', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files, { HOME: '/Users/tester' })
  const path = '/Users/tester/.ydcp/state.json'

  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  expect(files.size).toBe(0)

  await $.turn.start({ text: 'hi', turnId: 't1' })
  expect(state(files, path)).toEqual({ mood: 'working', at: START })

  await $.turn.complete(finish('t1'))
  expect(state(files, path).mood).toBe('done')
})

test('an error is "failed"; a stopped turn is "idle"', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files, { HOME: '/home/tester' })
  const path = '/home/tester/.ydcp/state.json'
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })

  await $.turn.start({ text: 'a', turnId: 't1' })
  await $.turn.complete(finish('t1', 'error'))
  expect(state(files, path).mood).toBe('failed')

  await $.turn.start({ text: 'b', turnId: 't2' })
  await $.turn.complete(finish('t2', 'aborted'))
  expect(state(files, path).mood).toBe('idle')
})

test('Windows: uses USERPROFILE with backslashes', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files, { USERPROFILE: 'C:\\Users\\tester' })
  await $.session.start({ cwd: 'C:\\work', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  // The test kit runs on macOS, where "C:\…" isn't absolute, so it prefixes the plugin folder;
  // what matters is the Windows path the module asked for.
  const written = [...files.keys()]
  expect(written).toHaveLength(1)
  expect(written[0]?.endsWith('C:\\Users\\tester\\.ydcp\\state.json')).toBe(true)
})

test('no home folder: nothing is written', async ($, on) => {
  const files = new Map<string, string>()
  world(on, files, {})
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.turn.start({ text: 'hi', turnId: 't1' })
  await $.turn.complete(finish('t1'))
  expect(files.size).toBe(0)
})
