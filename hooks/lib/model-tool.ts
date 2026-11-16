import type { EngineInterface as Engine, On } from 'claude-code'
import { agentViews } from './agents'
import { dockerOfHost } from './docker'
import { downForText, hostFailureGuidance } from './failure-guidance'
import { ageSince, homeRelative, kibAsGib, percentText, storageSize } from './format'
import type { DockerByHost, HostSnapshot, MonitorHistory, MonitorSettings, WorktreesByHost } from './schemas'
import { readDocker, readHistory, readSnapshot, readWorktrees } from './store'
import { worktreeFacts, worktreesOfHost } from './worktrees'

const TOOL_NAME = 'hosts'
const MAX_RESULT_CHARACTERS = 20_000
const SECTIONS = ['summary', 'agents', 'ports', 'procs', 'worktrees', 'docker'] as const
const AGENT_STATE_WORDS = { working: 'working', blocked: 'needs you', idle: 'idle', done: 'done' } as const

type Section = (typeof SECTIONS)[number]

type HostData = {
  settings: MonitorSettings
  history: MonitorHistory
  worktrees: WorktreesByHost
  docker: DockerByHost
}

const isSection = (candidate: unknown): candidate is Section => SECTIONS.includes(candidate as Section)

function summaryLine(host: HostSnapshot, data: HostData): string {
  if (host.state === 'pending') return `${host.label}  pending  waiting for the first poll`
  if (host.state !== 'ok') {
    return `${host.label}  ${host.state}${downForText(host)}  ${hostFailureGuidance(host, data.settings).summary}`
  }
  const views = agentViews(host, data.history)
  const workingCount = views.filter(view => view.state === 'working').length
  const memory = `${kibAsGib(host.mem_used_kb)}/${kibAsGib(host.mem_total_kb)} GiB`
  const rtt = host.rtt_ms === null ? '' : `  rtt ${host.rtt_ms} ms`
  return `${host.label}  ok  cpu ${percentText(host.cpu_pct)}  mem ${percentText(host.mem_pct)} (${memory})  disk ${percentText(host.disk_pct)}  agents ${workingCount} working of ${views.length}  ports ${host.ports.length}${rtt}`
}

function agentsText(host: HostSnapshot, data: HostData): string {
  const views = agentViews(host, data.history)
  if (views.length === 0) return 'no coding agents'
  return views
    .map(
      ({ process, state }) =>
        `pid ${process.pid}  ${process.app}  ${AGENT_STATE_WORDS[state]}  cpu ${(process.tree_cpu ?? process.cpu ?? 0).toFixed(1)}%  mem ${storageSize(process.tree_rss_kb)}  ${process.repository} ${process.branch || homeRelative(process.cwd, host.home)}`,
    )
    .join('\n')
}

function portsText(host: HostSnapshot): string {
  if (host.ports.length === 0) return 'no listening ports'
  return host.ports
    .map(port => {
      const state = port.listening ? 'listening' : 'down'
      const pinned = port.pinned ? ' pinned' : ''
      return `:${port.port}  ${state}${pinned}  ${port.process || 'other user'}${port.pid === null ? '' : ` (pid ${port.pid})`}`
    })
    .join('\n')
}

function procsText(host: HostSnapshot, data: HostData): string {
  return [...host.processes]
    .sort((first, second) => (second.cpu ?? 0) - (first.cpu ?? 0))
    .slice(0, data.settings.top_n)
    .map(
      process =>
        `pid ${process.pid}  cpu ${(process.cpu ?? 0).toFixed(1)}%  mem ${(process.mem ?? 0).toFixed(1)}%  ${process.name}`,
    )
    .join('\n')
}

function worktreesText(host: HostSnapshot, data: HostData): string {
  const worktrees = worktreesOfHost(data.worktrees, host)
  if (worktrees.state === 'pending' && worktrees.items.length === 0) return 'worktrees: measuring'
  const facts = worktreeFacts(worktrees.items, agentViews(host, data.history))
  const header = `${storageSize(worktrees.total_kb)} in ${worktrees.items.length} worktrees · ${facts.counts.stale} stale · measured ${ageSince(worktrees.measured_at)}`
  const rows = worktrees.items.map(
    item =>
      `${storageSize(item.size_kb)}  ${item.repository}  ${item.branch}  ${item.changed_files ? `±${item.changed_files}` : 'clean'}${item.merged_into ? `  merged into ${item.merged_into}` : ''}  ${item.path}`,
  )
  return [header, ...rows].join('\n')
}

function dockerText(host: HostSnapshot, data: HostData): string {
  const docker = dockerOfHost(data.docker, host)
  if (docker.state !== 'ok') return `docker: ${docker.state}${docker.error ? ` (${docker.error})` : ''}`
  const header = `docker ${storageSize(docker.total_kb)} · ${storageSize(docker.reclaimable_kb)} can be freed`
  const rows = docker.containers.map(
    container => `${container.state}  ${container.name}  ${container.image}  ${storageSize(container.size_kb)}`,
  )
  return [header, ...rows].join('\n')
}

function sectionText(host: HostSnapshot, section: Section, data: HostData): string {
  const body = {
    summary: () => '',
    agents: () => agentsText(host, data),
    ports: () => portsText(host),
    procs: () => procsText(host, data),
    worktrees: () => worktreesText(host, data),
    docker: () => dockerText(host, data),
  }[section]()
  return section === 'summary' ? summaryLine(host, data) : `${summaryLine(host, data)}\n${body}`
}

export async function registerModelTool($: Engine): Promise<void> {
  await $.tool.register({
    name: TOOL_NAME,
    isDeferred: true,
    description:
      'Read the SSH hosts that ssh-monitor watches: health, CPU, memory, disk, coding agents, ' +
      'listening ports, top processes, git worktrees and Docker. Read-only: it runs no action.',
    inputSchema: {
      type: 'object',
      properties: {
        host: { type: 'string', description: 'A host label from hosts.conf. Omit for all hosts.' },
        section: { type: 'string', enum: [...SECTIONS], description: 'What to show. Omit for summary.' },
      },
    },
  })
}

export function wireModelTool(on: On): void {
  on('tool.call', { tool: 'mcp__ssh-monitor__hosts' }, async ($, e) => {
    const requestedHost = typeof e.host === 'string' ? e.host : undefined
    const section: Section = isSection(e.section) ? e.section : 'summary'
    const snapshot = await readSnapshot($)
    if (!snapshot) return { result: 'No poll has finished yet. Try again in a few seconds.' }
    const hosts = requestedHost ? snapshot.hosts.filter(host => host.label === requestedHost) : snapshot.hosts
    if (hosts.length === 0) {
      const message = requestedHost
        ? `No host named ${requestedHost} in hosts.conf.`
        : `No hosts. Add them to ${snapshot.hosts_file}.`
      return { result: message }
    }
    const data: HostData = {
      settings: snapshot.settings,
      history: await readHistory($),
      worktrees: await readWorktrees($),
      docker: await readDocker($),
    }
    const text = hosts.map(host => sectionText(host, section, data)).join('\n\n')
    return { result: text.slice(0, MAX_RESULT_CHARACTERS) }
  })
}
