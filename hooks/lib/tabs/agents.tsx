import { ageOrUnknown, compactSize, homeRelative, minutesText, storageSize } from '../format'
import { percentLevel } from '../health'
import { AGENT_HISTORY_SAMPLES, SECONDS_PER_SAMPLE, samplesInRange } from '../history'
import { TOKYO_NIGHT as c, GRADIENTS, gradientAt, levelColor } from '../palette'
import type { AgentProcess, AgentState, AgentView } from '../schemas'
import { sparkline } from '../ui/charts'
import { agentLabel } from '../ui/icons'
import type { Tree } from '../ui/ui'
import { AGENT_MARKER, fixedCell, killButton, panel, panelTitle } from '../ui/widgets'
import type { TabView } from './view'

const PERCENT_SCALE = 100
const KILL_COLUMNS = 2
const SPARKLINE_COLUMNS = 16
const SPARKLINE_TITLE = `cpu ${minutesText(AGENT_HISTORY_SAMPLES * SECONDS_PER_SAMPLE)}`
const COLUMNS = {
  wide: { app: 14, state: 11, cpu: 6, memory: 9, uptime: 5 },
  narrow: { app: 2, state: 1, cpu: 4, memory: 6, uptime: 4 },
} as const

const AGENT_STATE_LOOKS: Record<AgentState, { label: string; color: string }> = {
  working: { label: 'working', color: c.blue },
  blocked: { label: 'needs you', color: c.yellow },
  idle: { label: 'idle', color: c.comment },
  done: { label: 'done', color: c.green },
}

type AgentsPanelOptions = { showSparklines: boolean }

const treeCpu = (process: AgentProcess): number => process.tree_cpu ?? process.cpu ?? 0

function busiestAgentName(agents: AgentView[]): string | null {
  const busiest = agents.reduce<AgentView | null>(
    (best, agent) => (!best || treeCpu(agent.process) > treeCpu(best.process) ? agent : best),
    null,
  )
  return busiest && treeCpu(busiest.process) > 0 ? busiest.process.app : null
}

function stateCell(view: TabView, state: AgentState): Tree {
  const { Text } = view.ui.el
  const look = AGENT_STATE_LOOKS[state]
  const widths = view.isWide ? COLUMNS.wide : COLUMNS.narrow
  const labelColor = state === 'blocked' ? c.yellow : c.foregroundDark
  return fixedCell(
    view.ui,
    widths.state,
    <Text>
      <Text color={look.color}>{AGENT_MARKER}</Text>
      {view.isWide ? <Text color={labelColor}>{` ${look.label}`}</Text> : null}
    </Text>,
  )
}

function cpuSparkline(view: TabView, agent: AgentView): Tree {
  const cpu = agent.process.cpu ?? 0
  const peak = Math.max(PERCENT_SCALE, ...agent.cpuHistory.map(percent => percent ?? 0))
  return sparkline(view.ui, {
    key: `agent-spark-${view.host.label}-${agent.process.pid}`,
    samples: samplesInRange(agent.cpuHistory, AGENT_HISTORY_SAMPLES),
    color: gradientAt(GRADIENTS.cpu, Math.min(cpu, PERCENT_SCALE) / PERCENT_SCALE),
    columns: SPARKLINE_COLUMNS,
    maximum: peak,
  })
}

function killCell(view: TabView, process: AgentProcess): Tree {
  const { pid } = process
  if (pid === null || !Number.isFinite(pid)) return fixedCell(view.ui, KILL_COLUMNS, null)
  const onKill = () => view.act.kill(pid)
  return fixedCell(view.ui, KILL_COLUMNS, killButton(view.ui, `agent-kill-${view.host.label}-${pid}`, onKill), true)
}

function agentRow(view: TabView, agent: AgentView, hasSparkline: boolean): Tree {
  const { ui, host, snapshot } = view
  const { Box, Text } = ui.el
  const { process } = agent
  const widths = view.isWide ? COLUMNS.wide : COLUMNS.narrow
  const cpu = treeCpu(process)
  const folder = homeRelative(process.cwd, host.home)
  const cpuColor = levelColor(percentLevel(Math.min(cpu, PERCENT_SCALE), snapshot.settings))
  return (
    <Box key={`agent-${host.label}-${process.pid}`} columnGap={1}>
      {fixedCell(ui, widths.app, agentLabel(ui, `agent-app-${host.label}-${process.pid}`, process.app, view.isWide))}
      {stateCell(view, agent.state)}
      <Box flexGrow={1} flexShrink={1} minWidth={0} columnGap={1} overflow="hidden">
        {view.isWide ? (
          <Text color={c.blue} wrap="truncate-end">
            {process.repository || ''}
          </Text>
        ) : null}
        <Text color={c.foregroundDark} wrap="truncate-end">
          {process.branch || folder}
        </Text>
      </Box>
      {hasSparkline ? fixedCell(ui, SPARKLINE_COLUMNS, cpuSparkline(view, agent)) : null}
      {fixedCell(ui, widths.cpu, <Text color={cpuColor}>{cpu.toFixed(1)}</Text>, true)}
      {fixedCell(
        ui,
        widths.memory,
        <Text color={c.foregroundDark}>{view.isWide ? storageSize(process.tree_rss_kb) : compactSize(process.tree_rss_kb)}</Text>,
        true,
      )}
      {fixedCell(ui, widths.uptime, <Text color={c.comment}>{ageOrUnknown(process.elapsed_seconds)}</Text>, true)}
      {killCell(view, process)}
    </Box>
  )
}

function tableHeader(view: TabView, hasSparkline: boolean): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  const widths = view.isWide ? COLUMNS.wide : COLUMNS.narrow
  const heading = (label: string): Tree => <Text color={c.comment}>{label}</Text>
  return (
    <Box key="agents-header" columnGap={1}>
      {fixedCell(ui, widths.app, view.isWide ? heading('agent') : null)}
      {fixedCell(ui, widths.state, view.isWide ? heading('state') : null)}
      <Box flexGrow={1} flexShrink={1} minWidth={0}>
        {heading('branch')}
      </Box>
      {hasSparkline ? fixedCell(ui, SPARKLINE_COLUMNS, heading(SPARKLINE_TITLE)) : null}
      {fixedCell(ui, widths.cpu, heading('cpu'), true)}
      {fixedCell(ui, widths.memory, heading('mem'), true)}
      {fixedCell(ui, widths.uptime, heading('up'), true)}
      {fixedCell(ui, KILL_COLUMNS, null)}
    </Box>
  )
}

export function agentsPanel(view: TabView, options: AgentsPanelOptions): Tree {
  const { ui, host, agents } = view
  const { Text } = ui.el
  const hasSparkline = view.isWide && options.showSparklines
  const workingCount = agents.filter(agent => agent.state === 'working').length
  const busiestName = busiestAgentName(agents)
  const children =
    agents.length > 0
      ? [tableHeader(view, hasSparkline), ...agents.map(agent => agentRow(view, agent, hasSparkline))]
      : [<Text color={c.comment}>No coding agents are running on this host.</Text>]
  return panel(ui, {
    key: `agents-${host.label}`,
    title: panelTitle(ui, 'bot', 'agents', c.magenta),
    rightTitle: <Text color={c.comment}>{`${workingCount} working${busiestName ? ` · ${busiestName} uses most` : ''}`}</Text>,
    children,
  })
}
