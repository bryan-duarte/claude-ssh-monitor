import type { ConsoleChoices, ConsoleTab, ProcessSort, WorktreeFilter } from '../../types'

export type * from '../../types'

export const CONSOLE_TABS: readonly ConsoleTab[] = ['overview', 'agents', 'ports', 'worktrees', 'docker', 'procs']
export const WORKTREE_FILTERS: readonly WorktreeFilter[] = ['all', 'stale', 'merged', 'changed', 'agent', 'behind']
export const PROCESS_SORTS: readonly ProcessSort[] = ['cpu', 'mem']

export const DEFAULT_CHOICES: ConsoleChoices = {
  host: null,
  tab: 'overview',
  range: 120,
  filter: 'all',
  sort: 'cpu',
}

export const isRecord = (candidate: unknown): candidate is Record<string, unknown> =>
  candidate !== null && typeof candidate === 'object' && !Array.isArray(candidate)

export const isFiniteNumber = (candidate: unknown): candidate is number =>
  typeof candidate === 'number' && Number.isFinite(candidate)
