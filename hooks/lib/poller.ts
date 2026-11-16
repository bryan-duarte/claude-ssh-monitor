import type { EngineInterface as Engine } from 'claude-code'
import { toastNewAlerts } from './alerts'
import { DOCKER_TIMEOUT_MS, measureTimeoutMs, runBackend, SNAPSHOT_TIMEOUT_MS } from './backend'
import { clockKey } from './health'
import { historyOrNull, nextHistory, SECONDS_PER_SAMPLE } from './history'
import { takeLease } from './lease'
import { MILLISECONDS_PER_SECOND, nowInSeconds } from './mod'
import { historyPath, readJsonOrNull, replaceFile } from './paths'
import type { BackendRunResult, MonitorHistory, Snapshot } from './schemas'
import { parseSnapshot } from './snapshot'
import {
  loadChoices,
  publish,
  publishError,
  readClockKey,
  readHistory,
  readIsConsoleOpen,
  readOwnerId,
  readSnapshot,
  updateClockKey,
  updateOwnerId,
  updateStartedAt,
} from './store'
import { refreshTunnels } from './tunnels'

const POLL_INTERVAL_MS = SECONDS_PER_SAMPLE * MILLISECONDS_PER_SECOND

const LEADER_SNAPSHOT = ['snapshot']
const FOLLOWER_SNAPSHOT = ['snapshot', '--cached']

let isPolling = false
const isMeasuring = { worktrees: false, docker: false }

async function readSharedHistory($: Engine): Promise<MonitorHistory> {
  const sharedHistory = historyOrNull(await readJsonOrNull($, await historyPath($)))
  return sharedHistory ?? (await readHistory($))
}

async function writeSharedHistory($: Engine, history: MonitorHistory): Promise<void> {
  const isWritten = await replaceFile($, await historyPath($), JSON.stringify(history))
  if (!isWritten) $.ui.log('ssh-monitor history_not_written', { to: 'debug' })
}

function logMeasureFailure($: Engine, measureName: string, measure: BackendRunResult): void {
  if (measure.ok) return
  const { reason, detail } = measure.failure
  $.ui.log(`ssh-monitor measure_failed ${measureName} ${reason}: ${detail}`, { to: 'debug' })
}

function startMeasure($: Engine, measureName: keyof typeof isMeasuring, backendArguments: string[], timeoutMs: number): void {
  if (isMeasuring[measureName]) return
  isMeasuring[measureName] = true
  void runBackend($, backendArguments, timeoutMs)
    .then(measure => logMeasureFailure($, measureName, measure))
    .finally(() => {
      isMeasuring[measureName] = false
    })
}

function startDueMeasures($: Engine, snapshot: Snapshot): void {
  if (snapshot.worktrees_due) startMeasure($, 'worktrees', ['worktrees'], measureTimeoutMs(snapshot.settings))
  if (snapshot.docker_due) startMeasure($, 'docker', ['docker'], DOCKER_TIMEOUT_MS)
}

async function refreshClock($: Engine): Promise<void> {
  const currentKey = clockKey(await readSnapshot($), nowInSeconds())
  if (currentKey !== (await readClockKey($))) await updateClockKey($, () => currentKey)
}

async function renewLease($: Engine): Promise<boolean> {
  try {
    return await takeLease($, await readOwnerId($), nowInSeconds())
  } catch (leaseError) {
    $.ui.log(`ssh-monitor lease_failed ${String(leaseError)}`, { to: 'debug' })
    return false
  }
}

async function pollOnce($: Engine, isLeader: boolean): Promise<void> {
  const run = await runBackend($, isLeader ? LEADER_SNAPSHOT : FOLLOWER_SNAPSHOT, SNAPSHOT_TIMEOUT_MS)
  if (!run.ok) return publishError($, run.failure)
  const parsed = parseSnapshot(run.stdout)
  if (!parsed.ok) return publishError($, parsed.failure)
  const sharedHistory = await readSharedHistory($)
  const history = isLeader ? nextHistory(sharedHistory, parsed.snapshot, nowInSeconds()) : sharedHistory
  if (isLeader) await writeSharedHistory($, history)
  await publish($, parsed.snapshot, history)
  await toastNewAlerts($, history)
  if (isLeader) startDueMeasures($, parsed.snapshot)
}

async function tick($: Engine): Promise<void> {
  const isLeader = await renewLease($)
  if (isPolling) return
  isPolling = true
  try {
    await pollOnce($, isLeader)
    if (await readIsConsoleOpen($)) await refreshTunnels($)
  } catch (pollError) {
    await publishError($, { reason: 'mod_bug', detail: String(pollError) })
  } finally {
    isPolling = false
    await refreshClock($)
  }
}

export async function startPoller($: Engine): Promise<void> {
  await updateOwnerId($, id => id || crypto.randomUUID())
  await updateStartedAt($, startedAt => startedAt || nowInSeconds())
  await loadChoices($)
  $.clock.every(POLL_INTERVAL_MS, () => void tick($))
  void tick($)
}
