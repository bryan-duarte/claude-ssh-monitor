import type { EngineInterface as Engine } from 'claude-code'
import { MILLISECONDS_PER_SECOND } from './mod'
import { leasePath, readJsonOrNull, replaceFile } from './paths'
import { isFiniteNumber, isRecord } from './schemas'

const LEASE_SECONDS = 12
const UNREADABLE_LEASE_OWNER = 'unreadable'

export type PollLease = { owner: string; at: number }

const isPollLease = (stored: unknown): stored is PollLease =>
  isRecord(stored) && typeof stored.owner === 'string' && isFiniteNumber(stored.at)

async function readLease($: Engine, path: string): Promise<PollLease | null> {
  const stored = await readJsonOrNull($, path)
  if (isPollLease(stored)) return stored
  const unreadableFile = await $.fs.stat(path).catch(() => null)
  if (!unreadableFile) return null
  return { owner: UNREADABLE_LEASE_OWNER, at: Math.floor(unreadableFile.mtimeMs / MILLISECONDS_PER_SECOND) }
}

export const isLeaseFree = (held: PollLease | null, owner: string, nowSeconds: number): boolean =>
  !held || held.owner === owner || nowSeconds - held.at > LEASE_SECONDS

export async function takeLease($: Engine, owner: string, nowSeconds: number): Promise<boolean> {
  const path = await leasePath($)
  if (!isLeaseFree(await readLease($, path), owner, nowSeconds)) return false
  await replaceFile($, path, JSON.stringify({ owner, at: nowSeconds }))
  const written = await readLease($, path)
  return written?.owner === owner
}

export async function releaseLease($: Engine, owner: string): Promise<void> {
  const path = await leasePath($)
  const held = await readLease($, path)
  if (held?.owner === owner) await $.process.run(['rm', '-f', path])
}
