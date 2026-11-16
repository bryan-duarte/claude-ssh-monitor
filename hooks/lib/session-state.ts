import type { EngineInterface as Engine, On } from 'claude-code'
import { releaseLease } from './lease'
import { nowInSeconds } from './mod'
import { sessionsDir } from './paths'
import type { SessionState } from './schemas'
import { readOwnerId } from './store'

const REFRESH_INTERVAL_MS = 60_000
const UNSAFE_FOR_FLAT_JSON = /["\\\n\r\t]/

let currentState: SessionState | null = null
let sessionFileChanges: Promise<void> = Promise.resolve()

async function sessionFilePath($: Engine): Promise<string | null> {
  const owner = await readOwnerId($)
  return owner ? `${await sessionsDir($)}/${owner}.json` : null
}

async function realCwd($: Engine): Promise<string> {
  const cwd = await $.session.cwd()
  const resolved = await $.fs.stat(cwd, { resolve: true }).catch(() => null)
  return resolved?.realPath ?? cwd
}

async function writeSessionFile($: Engine, state: SessionState): Promise<void> {
  const path = await sessionFilePath($)
  const cwd = await realCwd($)
  const canAwkReadCwd = !UNSAFE_FOR_FLAT_JSON.test(cwd)
  if (!path || !canAwkReadCwd) return
  await $.fs.write(path, `{"cwd":"${cwd}","state":"${state}","updated_at":${nowInSeconds()}}\n`)
}

async function removeSessionFile($: Engine): Promise<void> {
  const path = await sessionFilePath($)
  if (path) await $.process.run(['rm', '-f', path])
}

function logWriteFailure($: Engine, writeError: unknown): void {
  $.ui.log(`ssh-monitor session_state_not_written ${String(writeError)}`, { to: 'debug' })
}

function queueSessionFileChange($: Engine, change: () => Promise<void>): Promise<void> {
  sessionFileChanges = sessionFileChanges.then(change).catch(changeError => logWriteFailure($, changeError))
  return sessionFileChanges
}

function changeState($: Engine, state: SessionState): void {
  if (state === currentState) return
  currentState = state
  void queueSessionFileChange($, () => writeSessionFile($, state))
}

function refreshSessionFile($: Engine): void {
  const state = currentState
  if (state) void queueSessionFileChange($, () => writeSessionFile($, state))
}

export function startSessionState($: Engine): void {
  currentState = null
  changeState($, 'idle')
  $.clock.every(REFRESH_INTERVAL_MS, () => refreshSessionFile($))
}

export function wireSessionState(on: On): void {
  on('prompt.submit', ($, e, next) => {
    changeState($, 'working')
    return next(e)
  })

  on('turn.complete', ($, e, next) => {
    changeState($, 'idle')
    return next(e)
  })

  on('classic.PermissionRequest', ($, e, next) => {
    changeState($, 'blocked')
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    if (currentState === 'blocked') changeState($, 'working')
    return result
  }).catch((_engine, e, next) => next(e))

  on('session.end', async ($, e, next) => {
    await queueSessionFileChange($, () => removeSessionFile($))
    await releaseLease($, await readOwnerId($)).catch(() => undefined)
    return next(e)
  })
}
