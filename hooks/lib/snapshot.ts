import type {
  ConfigProblem,
  HostDocker,
  HostSnapshot,
  HostWorktrees,
  SessionRow,
  SessionState,
  Snapshot,
  SnapshotResult,
} from './schemas'
import { isFiniteNumber, isRecord } from './schemas'

const SNAPSHOT_FORMAT_VERSION = 3

const HOST_STATES = new Set(['ok', 'down', 'auth', 'pending'])
const MEASURE_STATES = new Set(['ok', 'failed', 'pending'])
const DOCKER_STATES = new Set(['ok', 'failed', 'pending', 'missing', 'denied', 'off'])
const SESSION_STATES = new Set<string>(['working', 'blocked', 'idle'] satisfies SessionState[])
const SETTING_KEYS = [
  'warn',
  'crit',
  'top_n',
  'ssh_timeout',
  'pane_refresh',
  'stale_seconds',
  'worktree_interval',
  'worktree_timeout',
  'docker_interval',
] as const
const HOST_LISTS = ['processes', 'agents', 'ports', 'cores', 'problems'] as const
const DOCKER_LISTS = ['containers', 'images', 'volumes'] as const
const SNAPSHOT_LISTS = ['hosts', 'alerts', 'problems'] as const

const isHostWorktrees = (worktrees: unknown): worktrees is HostWorktrees =>
  isRecord(worktrees) && MEASURE_STATES.has(String(worktrees.state)) && Array.isArray(worktrees.items)

const isHostDocker = (docker: unknown): docker is HostDocker =>
  isRecord(docker) && DOCKER_STATES.has(String(docker.state)) && DOCKER_LISTS.every(list => Array.isArray(docker[list]))

function hostError(host: unknown, index: number): string | null {
  if (!isRecord(host)) return `host ${index} is not an object`
  if (typeof host.label !== 'string') return `host ${index} has no label`
  if (!HOST_STATES.has(String(host.state))) return `host ${host.label} has an unknown state`
  const missingList = HOST_LISTS.find(key => !Array.isArray(host[key]))
  if (missingList) return `host ${host.label} has no ${missingList} list`
  if (!isHostWorktrees(host.worktrees)) return `host ${host.label} has no worktree data`
  if (!isHostDocker(host.docker)) return `host ${host.label} has no Docker data`
  return null
}

function settingsError(settings: unknown): string | null {
  if (!isRecord(settings)) return 'settings are missing'
  const badKey = SETTING_KEYS.find(key => !isFiniteNumber(settings[key]))
  return badKey ? `setting ${badKey} is not a number` : null
}

function snapshotError(snapshot: Record<string, unknown>): string | null {
  if (snapshot.version !== SNAPSHOT_FORMAT_VERSION) return `snapshot version ${String(snapshot.version)} is not supported`
  if (!isFiniteNumber(snapshot.generated_at)) return 'snapshot has no time'
  if (!SNAPSHOT_LISTS.every(list => Array.isArray(snapshot[list]))) return 'snapshot lists are missing'
  return settingsError(snapshot.settings)
}

const isSessionRow = (row: unknown): row is SessionRow =>
  isRecord(row) && typeof row.cwd === 'string' && SESSION_STATES.has(String(row.state)) && isFiniteNumber(row.updated_at)

function withSessions(host: Record<string, unknown>): HostSnapshot {
  const rows = Array.isArray(host.sessions) ? host.sessions.filter(isSessionRow) : []
  return { ...host, sessions: rows } as HostSnapshot
}

function withoutBrokenHosts(snapshot: Record<string, unknown> & { hosts: unknown[]; problems: ConfigProblem[] }): Snapshot {
  const hosts: HostSnapshot[] = []
  const brokenHostProblems: ConfigProblem[] = []
  snapshot.hosts.forEach((host, index) => {
    const brokenReason = hostError(host, index)
    if (!brokenReason && isRecord(host)) {
      hosts.push(withSessions(host))
      return
    }
    const hostName = isRecord(host) && typeof host.label === 'string' ? host.label : `host ${index + 1}`
    brokenHostProblems.push({ file: 'snapshot', line: null, key: hostName, value: brokenReason ?? '', reason: 'broken_host' })
  })
  return { ...snapshot, hosts, problems: [...snapshot.problems, ...brokenHostProblems] } as unknown as Snapshot
}

const badOutput = (detail: string): SnapshotResult => ({ ok: false, failure: { reason: 'bad_output', detail } })

export function parseSnapshot(backendOutput: string): SnapshotResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(backendOutput)
  } catch (parseError) {
    return badOutput(`snapshot is not JSON: ${String(parseError)}`)
  }
  if (!isRecord(parsed)) return badOutput('snapshot is not an object')
  const error = snapshotError(parsed)
  if (error) return badOutput(error)
  return { ok: true, snapshot: withoutBrokenHosts(parsed as Parameters<typeof withoutBrokenHosts>[0]) }
}
