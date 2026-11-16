import type { EngineInterface as Engine } from 'claude-code'
import { PLUGIN } from './mod'

const DEFAULT_STATE_FOLDER = '.local/state'

async function homeOf($: Engine): Promise<string> {
  return (await $.env.get('HOME')) ?? ''
}

async function stateDir($: Engine): Promise<string> {
  const override = await $.env.get('HERDWATCH_STATE_DIR')
  if (override) return override
  const xdgState = await $.env.get('XDG_STATE_HOME')
  const stateRoot = xdgState || `${await homeOf($)}/${DEFAULT_STATE_FOLDER}`
  return `${stateRoot}/${PLUGIN}`
}

export async function sessionsDir($: Engine): Promise<string> {
  return `${await homeOf($)}/${DEFAULT_STATE_FOLDER}/${PLUGIN}/sessions`
}

export async function leasePath($: Engine): Promise<string> {
  return `${await stateDir($)}/poller.lease`
}

export async function historyPath($: Engine): Promise<string> {
  return `${await stateDir($)}/history.json`
}

export async function replaceFile($: Engine, path: string, text: string): Promise<boolean> {
  const temporaryPath = `${path}.${crypto.randomUUID()}.tmp`
  await $.fs.write(temporaryPath, text)
  const moved = await $.process.run(['mv', '-f', temporaryPath, path])
  if (moved.exitCode === 0) return true
  await $.process.run(['rm', '-f', temporaryPath])
  return false
}

export async function readJsonOrNull($: Engine, path: string): Promise<unknown> {
  try {
    return JSON.parse(await $.fs.read(path))
  } catch {
    return null
  }
}
