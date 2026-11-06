import type { EngineInterface, Register } from 'claude-code'

/**
 * YDCP link — tells YDCP (Your Desktop Companion Project) what Claude is doing, by writing
 * one small local file: ~/.ydcp/state.json (Windows: %USERPROFILE%\.ydcp\state.json).
 *
 *   turn starts            → { "mood": "working" }
 *   reply finished         → { "mood": "done" }      (she cheers)
 *   turn ended with error  → { "mood": "failed" }
 *   stopped / refused      → { "mood": "idle" }
 *
 * Nothing is sent anywhere. YDCP only reacts if its "React to agent" setting is on, and if
 * YDCP has never run (no ~/.ydcp folder), nothing is written.
 *
 * YDCP is an independent project, not affiliated with, endorsed by, or sponsored by Anthropic.
 */

type Mood = 'working' | 'done' | 'failed' | 'idle'

/** Where the state file goes, from the home folder; undefined if there's no home folder. */
let statePath: string | undefined

async function findStatePath($: EngineInterface): Promise<string | undefined> {
  const home = (await $.env.get('HOME')) ?? (await $.env.get('USERPROFILE'))
  if (home === undefined || home === '') {
    return undefined
  }
  // A Windows home without forward slashes gets backslashes; everything else gets "/".
  const separator = home.includes('\\') && !home.includes('/') ? '\\' : '/'
  const base = home.endsWith(separator) ? home.slice(0, -1) : home
  return `${base}${separator}.ydcp${separator}state.json`
}

/** Writes the state; a failure (e.g. YDCP never installed) is silently ignored. */
async function write($: EngineInterface, mood: Mood) {
  if (statePath === undefined) {
    return
  }
  const at = await $.clock.now()
  await $.fs.write(statePath, `${JSON.stringify({ mood, at })}\n`).catch(() => undefined)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    statePath = await findStatePath($)
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await write($, 'working')
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    // Only the main conversation's turns, not helper agents'.
    if (e.agentId === undefined) {
      await write($, e.reason === 'answer' ? 'done' : e.reason === 'error' ? 'failed' : 'idle')
    }
    return next(e)
  })
}
