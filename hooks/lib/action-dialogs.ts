import { homeRelative, storageSize } from './format'
import { BRAND } from './mod'
import type { ActionFailureReason, ActionName, DockerContainer, HostSnapshot, WorktreeItem } from './schemas'

export type AskOption = { label: string; flags: string[] }

type AskEscalation = { reason: ActionFailureReason; label: string; flag: string }

export type AskPlan = {
  header: string
  question: string
  name: ActionName
  label: string
  args: string[]
  options: AskOption[]
  escalation: AskEscalation | null
}

type PrunePreview = { imagesKib: number; volumesKib: number }

const UNNAMED_BRANCH = /^(detached |\?$)/
const WARNING_GLYPH = '⚠'

const countText = (count: number, singular: string, plural: string): string => `${count} ${count === 1 ? singular : plural}`

const questionOf = (details: string[], warnings: string[], title: string): string =>
  [...details, ...warnings.map(warning => `${WARNING_GLYPH} ${warning}`), `${title}?`].join('\n')

function processName(host: HostSnapshot, pid: number): string {
  const topProcess = host.processes.find(process => process.pid === pid)
  const agent = host.agents.find(agentProcess => agentProcess.pid === pid)
  const portOwner = host.ports.find(port => port.pid === pid)
  return topProcess?.name || agent?.app || portOwner?.process || 'process'
}

export function killPlan(host: HostSnapshot, pid: number): AskPlan {
  const agent = host.agents.find(agentProcess => agentProcess.pid === pid)
  const heldPorts = host.ports.filter(port => port.pid === pid && port.listening).map(port => `:${port.port}`)
  const details = [`${processName(host, pid)} (pid ${pid}) on ${host.label}.`]
  if (agent) {
    const treeCount = agent.tree_count
    const treeSize =
      treeCount !== null && Number.isFinite(treeCount) ? ` ${countText(treeCount, 'process', 'processes')} in its tree.` : ''
    details.push(`This is the ${agent.app} agent in ${homeRelative(agent.cwd, host.home)}.${treeSize}`)
  }
  if (heldPorts.length > 0) details.push(`It holds ${heldPorts.length === 1 ? 'port' : 'ports'} ${heldPorts.join(', ')}.`)
  details.push(`${BRAND} sends TERM to the process and every process under it.`)
  return {
    header: 'Kill',
    question: questionOf(details, [], 'Kill process'),
    name: 'kill',
    label: host.label,
    args: [String(pid)],
    options: [{ label: 'Kill', flags: [] }],
    escalation: { reason: 'still_running', label: 'Force kill', flag: '--force' },
  }
}

export function worktreeRemovePlan(host: HostSnapshot, worktree: WorktreeItem): AskPlan {
  const changedFiles = worktree.changed_files ?? 0
  const hasChanges = changedFiles > 0
  const hasNamedBranch = !UNNAMED_BRANCH.test(worktree.branch)
  const mergedText = worktree.merged_into ? `merged into ${worktree.merged_into}` : 'not merged'
  const details = [
    worktree.path,
    `branch ${worktree.branch} · ${mergedText}`,
    `Frees ${storageSize(worktree.size_kb)} on ${host.label}.`,
  ]
  const warnings = hasChanges
    ? [`${countText(changedFiles, 'file has', 'files have')} uncommitted changes. They will be lost.`]
    : []
  const deleteBranchOption: AskOption = { label: 'Remove + delete branch', flags: ['--delete-branch'] }
  return {
    header: 'Worktree',
    question: questionOf(details, warnings, 'Remove worktree'),
    name: 'worktree-remove',
    label: host.label,
    args: [worktree.absolute_path, ...(hasChanges ? ['--force'] : [])],
    options: [{ label: 'Remove', flags: [] }, ...(hasNamedBranch ? [deleteBranchOption] : [])],
    escalation: null,
  }
}

export function dockerContainerPlan(host: HostSnapshot, container: DockerContainer, name: 'docker-stop' | 'docker-rm'): AskPlan {
  const isStop = name === 'docker-stop'
  const warnings = isStop ? [] : ['Docker deletes the files that the container wrote. The image stays.']
  const title = isStop ? 'Stop container' : 'Remove container'
  return {
    header: 'Container',
    question: questionOf([`${container.name} (${container.image}) on ${host.label}.`], warnings, title),
    name,
    label: host.label,
    args: [container.id],
    options: [{ label: isStop ? 'Stop' : 'Remove', flags: [] }],
    escalation: null,
  }
}

export function dockerPrunePlan(host: HostSnapshot, preview: PrunePreview): AskPlan {
  const details = [
    `Frees ${storageSize(preview.imagesKib)} of unused images on ${host.label}.`,
    `Unused volumes hold ${storageSize(preview.volumesKib)}. Their data is lost for good if you prune them.`,
  ]
  return {
    header: 'Docker',
    question: questionOf(details, ['Docker downloads a deleted image again when a container needs it.'], 'Prune Docker data'),
    name: 'docker-prune',
    label: host.label,
    args: [],
    options: [
      { label: 'Prune images', flags: [] },
      { label: 'Prune images + volumes', flags: ['--volumes'] },
    ],
    escalation: null,
  }
}
