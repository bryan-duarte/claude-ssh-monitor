import { daysSince } from './format'
import type { AgentView, HostSnapshot, HostWorktrees, Snapshot, WorktreeFilter, WorktreeItem, WorktreesByHost } from './schemas'
import { WORKTREE_FILTERS as WORKTREE_FILTER_NAMES } from './schemas'

const STALE_WORKTREE_DAYS = 14

type WorktreeFlags = { hasAgent: boolean; isStale: boolean; filters: Set<WorktreeFilter> }

export type WorktreeFacts = {
  flagsOfWorktree: Map<WorktreeItem, WorktreeFlags>
  counts: Record<WorktreeFilter, number>
  reclaimableKib: number
  largestKib: number
}

type WorktreeFilterSpec = {
  label: string
  tooltip: string
  matches: (worktree: WorktreeItem, agents: AgentView[]) => boolean
}

function isAgentInside(worktree: WorktreeItem, agent: AgentView): boolean {
  const folder = worktree.absolute_path
  return agent.process.cwd === folder || agent.process.cwd.startsWith(`${folder}/`)
}

const hasAgentIn = (worktree: WorktreeItem, agents: AgentView[]): boolean => agents.some(agent => isAgentInside(worktree, agent))

function isStaleWorktree(worktree: WorktreeItem, agents: AgentView[]): boolean {
  const hasOldLastCommit = (daysSince(worktree.last_commit_at) ?? 0) > STALE_WORKTREE_DAYS
  return hasOldLastCommit && !hasAgentIn(worktree, agents)
}

const hasUncommittedChanges = (worktree: WorktreeItem): boolean => (worktree.changed_files ?? 0) > 0

const isBehindUpstream = (worktree: WorktreeItem): boolean => (worktree.behind ?? 0) > 0

export const isMergedWorktree = (worktree: WorktreeItem): boolean =>
  Boolean(worktree.merged_into) && !hasUncommittedChanges(worktree)

export function deleteCheckFor(hasAgent: boolean): { canDelete: boolean; reason: string } {
  if (hasAgent) return { canDelete: false, reason: 'An agent works here. Stop it first.' }
  return { canDelete: true, reason: 'Remove this worktree' }
}

export const WORKTREE_FILTER_SPECS: Record<WorktreeFilter, WorktreeFilterSpec> = {
  all: { label: 'all', tooltip: 'Show every worktree', matches: () => true },
  stale: {
    label: `stale > ${STALE_WORKTREE_DAYS}d`,
    tooltip: `No commit for ${STALE_WORKTREE_DAYS} days and no agent in it`,
    matches: isStaleWorktree,
  },
  merged: {
    label: 'merged',
    tooltip: 'Every commit is in a main branch, so the worktree is safe to remove',
    matches: isMergedWorktree,
  },
  changed: { label: 'uncommitted', tooltip: 'Worktrees with uncommitted changes', matches: hasUncommittedChanges },
  agent: { label: 'agent running', tooltip: 'Worktrees where an agent works now', matches: hasAgentIn },
  behind: { label: 'behind upstream', tooltip: 'Worktrees behind their upstream branch', matches: isBehindUpstream },
}

const zeroCounts = (): Record<WorktreeFilter, number> => ({ all: 0, stale: 0, merged: 0, changed: 0, agent: 0, behind: 0 })

export function worktreeFacts(worktrees: WorktreeItem[], agents: AgentView[]): WorktreeFacts {
  const flagsOfWorktree = new Map<WorktreeItem, WorktreeFlags>()
  const counts = zeroCounts()
  let reclaimableKib = 0
  let largestKib = 0
  for (const worktree of worktrees) {
    const agentsInside = agents.filter(agent => isAgentInside(worktree, agent))
    const filters = new Set(WORKTREE_FILTER_NAMES.filter(name => WORKTREE_FILTER_SPECS[name].matches(worktree, agentsInside)))
    filters.forEach(name => {
      counts[name] += 1
    })
    const isStale = filters.has('stale')
    flagsOfWorktree.set(worktree, { hasAgent: agentsInside.length > 0, isStale, filters })
    largestKib = Math.max(largestKib, worktree.size_kb ?? 0)
    if (isStale) reclaimableKib += worktree.size_kb ?? 0
  }
  return { flagsOfWorktree, counts, reclaimableKib, largestKib }
}

export const worktreesOfHost = (worktreesByHost: WorktreesByHost, host: HostSnapshot): HostWorktrees =>
  worktreesByHost[host.label] ?? host.worktrees

export function splitWorktrees(snapshot: Snapshot): { lightSnapshot: Snapshot; worktreesByHost: WorktreesByHost } {
  const worktreesByHost = Object.fromEntries(snapshot.hosts.map(host => [host.label, host.worktrees]))
  const hosts = snapshot.hosts.map(host => ({ ...host, worktrees: { ...host.worktrees, items: [] } }))
  return { lightSnapshot: { ...snapshot, hosts }, worktreesByHost }
}

export function worktreesSignature(worktreesByHost: WorktreesByHost): string {
  return Object.entries(worktreesByHost)
    .map(([label, worktrees]) => `${label}:${worktrees.state}:${worktrees.measured_at}:${worktrees.items.length}`)
    .sort()
    .join('|')
}
