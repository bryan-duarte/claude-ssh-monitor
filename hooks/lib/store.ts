import type { EngineInterface as Engine } from 'claude-code'
import { atom, read, update } from 'claude-code'
import { dockerSignature, splitDocker } from './docker'
import { CHART_RANGE_SAMPLES, emptyHistory } from './history'
import type {
  BackendFailure,
  ConsoleChoices,
  DockerByHost,
  MonitorHistory,
  PortNotes,
  Snapshot,
  Tunnel,
  WorktreesByHost,
} from './schemas'
import { CONSOLE_TABS, DEFAULT_CHOICES, isRecord, PROCESS_SORTS, WORKTREE_FILTERS } from './schemas'
import { splitWorktrees, worktreesSignature } from './worktrees'

const SHAPE = 'v1'
const CHOICES_STORE_KEY = 'choices'

const snapshotAtom = atom({ plugin: 'ssh-monitor', key: 'snapshot' } as const, null, { shape: SHAPE })
const errorAtom = atom({ plugin: 'ssh-monitor', key: 'error' } as const, null)
const historyAtom = atom({ plugin: 'ssh-monitor', key: 'history' } as const, emptyHistory(), { shape: SHAPE })
const worktreesAtom = atom({ plugin: 'ssh-monitor', key: 'worktrees' } as const, {}, { shape: SHAPE })
const dockerAtom = atom({ plugin: 'ssh-monitor', key: 'docker' } as const, {}, { shape: SHAPE })
const tunnelsAtom = atom({ plugin: 'ssh-monitor', key: 'tunnels' } as const, [], { shape: SHAPE })
const choicesAtom = atom({ plugin: 'ssh-monitor', key: 'choices' } as const, DEFAULT_CHOICES, { shape: SHAPE })
const portNotesAtom = atom({ plugin: 'ssh-monitor', key: 'portNotes' } as const, {})
const checkingPruneOnAtom = atom({ plugin: 'ssh-monitor', key: 'checkingPruneOn' } as const, null)
const showAllWorktreesAtom = atom({ plugin: 'ssh-monitor', key: 'showAllWorktrees' } as const, false)
const isKeyboardOnAtom = atom({ plugin: 'ssh-monitor', key: 'isKeyboardOn' } as const, false)
const isConsoleOpenAtom = atom({ plugin: 'ssh-monitor', key: 'isConsoleOpen' } as const, false)
const clockKeyAtom = atom({ plugin: 'ssh-monitor', key: 'clockKey' } as const, '')
const seenAlertIdsAtom = atom({ plugin: 'ssh-monitor', key: 'seenAlertIds' } as const, [])
const ownerIdAtom = atom({ plugin: 'ssh-monitor', key: 'ownerId' } as const, '')
const startedAtAtom = atom({ plugin: 'ssh-monitor', key: 'startedAt' } as const, 0)

const publishedSignatures = { worktrees: '', docker: '' }

export async function publish($: Engine, snapshot: Snapshot, history: MonitorHistory): Promise<void> {
  const { lightSnapshot: withoutWorktrees, worktreesByHost } = splitWorktrees(snapshot)
  const { lightSnapshot, dockerByHost } = splitDocker(withoutWorktrees)
  const currentWorktreesSignature = worktreesSignature(worktreesByHost)
  if (currentWorktreesSignature !== publishedSignatures.worktrees) {
    publishedSignatures.worktrees = currentWorktreesSignature
    await update($, worktreesAtom, () => worktreesByHost)
  }
  const currentDockerSignature = dockerSignature(dockerByHost)
  if (currentDockerSignature !== publishedSignatures.docker) {
    publishedSignatures.docker = currentDockerSignature
    await update($, dockerAtom, () => dockerByHost)
  }
  await update($, historyAtom, () => history)
  await update($, snapshotAtom, () => lightSnapshot)
  await update($, errorAtom, () => null)
}

export async function publishError($: Engine, failure: BackendFailure): Promise<void> {
  await update($, errorAtom, () => failure)
}

function choicesOrDefault(stored: unknown): ConsoleChoices {
  if (!isRecord(stored)) return DEFAULT_CHOICES
  const has = <T>(list: readonly T[], candidate: unknown): candidate is T => list.includes(candidate as T)
  return {
    host: typeof stored.host === 'string' ? stored.host : null,
    tab: has(CONSOLE_TABS, stored.tab) ? stored.tab : DEFAULT_CHOICES.tab,
    range: has(CHART_RANGE_SAMPLES, stored.range) ? stored.range : DEFAULT_CHOICES.range,
    filter: has(WORKTREE_FILTERS, stored.filter) ? stored.filter : DEFAULT_CHOICES.filter,
    sort: has(PROCESS_SORTS, stored.sort) ? stored.sort : DEFAULT_CHOICES.sort,
  }
}

export async function loadChoices($: Engine): Promise<void> {
  const stored = await $.store.get(CHOICES_STORE_KEY)
  await update($, choicesAtom, () => choicesOrDefault(stored))
}

export async function choose($: Engine, patch: Partial<ConsoleChoices>): Promise<void> {
  const choices = await update($, choicesAtom, current => ({ ...current, ...patch }))
  await $.store.set(CHOICES_STORE_KEY, choices)
}

export async function readSnapshot($: Engine): Promise<Snapshot | null> {
  return read($, snapshotAtom)
}

export async function readError($: Engine): Promise<BackendFailure | null> {
  return read($, errorAtom)
}

export async function readHistory($: Engine): Promise<MonitorHistory> {
  return read($, historyAtom)
}

export async function readWorktrees($: Engine): Promise<WorktreesByHost> {
  return read($, worktreesAtom)
}

export async function readDocker($: Engine): Promise<DockerByHost> {
  return read($, dockerAtom)
}

export async function readTunnels($: Engine): Promise<Tunnel[]> {
  return read($, tunnelsAtom)
}

export async function updateTunnels($: Engine, change: (current: Tunnel[]) => Tunnel[]): Promise<Tunnel[]> {
  return update($, tunnelsAtom, change)
}

export async function readChoices($: Engine): Promise<ConsoleChoices> {
  return read($, choicesAtom)
}

export async function readPortNotes($: Engine): Promise<PortNotes> {
  return read($, portNotesAtom)
}

export async function updatePortNotes($: Engine, change: (current: PortNotes) => PortNotes): Promise<PortNotes> {
  return update($, portNotesAtom, change)
}

export async function readCheckingPruneOn($: Engine): Promise<string | null> {
  return read($, checkingPruneOnAtom)
}

export async function updateCheckingPruneOn(
  $: Engine,
  change: (current: string | null) => string | null,
): Promise<string | null> {
  return update($, checkingPruneOnAtom, change)
}

export async function readShowAllWorktrees($: Engine): Promise<boolean> {
  return read($, showAllWorktreesAtom)
}

export async function updateShowAllWorktrees($: Engine, change: (current: boolean) => boolean): Promise<boolean> {
  return update($, showAllWorktreesAtom, change)
}

export async function readIsKeyboardOn($: Engine): Promise<boolean> {
  return read($, isKeyboardOnAtom)
}

export async function updateIsKeyboardOn($: Engine, change: (current: boolean) => boolean): Promise<boolean> {
  return update($, isKeyboardOnAtom, change)
}

export async function readIsConsoleOpen($: Engine): Promise<boolean> {
  return read($, isConsoleOpenAtom)
}

export async function updateIsConsoleOpen($: Engine, change: (current: boolean) => boolean): Promise<boolean> {
  return update($, isConsoleOpenAtom, change)
}

export async function readClockKey($: Engine): Promise<string> {
  return read($, clockKeyAtom)
}

export async function updateClockKey($: Engine, change: (current: string) => string): Promise<string> {
  return update($, clockKeyAtom, change)
}

export async function readSeenAlertIds($: Engine): Promise<string[]> {
  return read($, seenAlertIdsAtom)
}

export async function updateSeenAlertIds($: Engine, change: (current: string[]) => string[]): Promise<string[]> {
  return update($, seenAlertIdsAtom, change)
}

export async function readOwnerId($: Engine): Promise<string> {
  return read($, ownerIdAtom)
}

export async function updateOwnerId($: Engine, change: (current: string) => string): Promise<string> {
  return update($, ownerIdAtom, change)
}

export async function readStartedAt($: Engine): Promise<number> {
  return read($, startedAtAtom)
}

export async function updateStartedAt($: Engine, change: (current: number) => number): Promise<number> {
  return update($, startedAtAtom, change)
}
