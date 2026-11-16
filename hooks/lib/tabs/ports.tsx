import { homeRelative } from '../format'
import { TOKYO_NIGHT as c, mixColors } from '../palette'
import type { AgentProcess, ListeningPort, Tunnel } from '../schemas'
import { OPENING_TUNNEL_NOTE, portNoteKey, tunnelOfPort } from '../tunnels'
import { agentLabel, programLabel } from '../ui/icons'
import type { Tree } from '../ui/ui'
import { fixedCell, killButton, panel, panelTitle, rowButton } from '../ui/widgets'
import type { TabView } from './view'

const FIRST_KILLABLE_PID = 2
const DOWN_ROW_TINT = 0.12
const COLUMNS = {
  pin: 2,
  port: 7,
  open: 16,
  kill: 2,
  wide: { process: 18, agent: 12 },
  narrow: { process: 13, agent: 2 },
} as const

type PortRowContext = { view: TabView; tunnel: Tunnel | null; note: string }

const agentProcessWithPid = (view: TabView, pid: number | null): AgentProcess | null =>
  pid === null ? null : (view.agents.find(({ process }) => process.pid === pid)?.process ?? null)

const portOrder = (first: ListeningPort, second: ListeningPort): number =>
  Number(second.pinned) - Number(first.pinned) ||
  Number(second.agent_pid !== null) - Number(first.agent_pid !== null) ||
  first.port - second.port

const isDown = (port: ListeningPort): boolean => port.pinned && !port.listening

const isFailureNote = (note: string): boolean => Boolean(note) && note !== OPENING_TUNNEL_NOTE

const columnsOf = (view: TabView) => (view.isWide ? COLUMNS.wide : COLUMNS.narrow)

function pinButton(view: TabView, port: ListeningPort): Tree {
  return rowButton(view.ui, {
    key: `port-pin-${view.host.label}-${port.port}`,
    glyph: 'pin',
    color: port.pinned ? c.blue : c.terminalBlack,
    onPress: () => view.act.togglePin(port),
  })
}

function processCell(view: TabView, port: ListeningPort): Tree {
  const { Text } = view.ui.el
  const width = columnsOf(view).process
  if (isDown(port)) return fixedCell(view.ui, width, <Text color={c.red}>down</Text>)
  if (!port.process) return fixedCell(view.ui, width, <Text color={c.comment}>other user</Text>)
  return fixedCell(
    view.ui,
    width,
    programLabel(view.ui, `port-process-${view.host.label}-${port.port}`, port.process, c.foregroundDark),
  )
}

function agentCell(view: TabView, owner: AgentProcess | null, port: ListeningPort): Tree {
  const { Text } = view.ui.el
  const width = columnsOf(view).agent
  if (owner)
    return fixedCell(view.ui, width, agentLabel(view.ui, `port-agent-${view.host.label}-${port.port}`, owner.app, view.isWide))
  return fixedCell(view.ui, width, <Text color={c.comment}>{view.isWide && port.listening ? 'system' : ''}</Text>)
}

function stopTunnelButton(view: TabView, port: ListeningPort): Tree {
  return rowButton(view.ui, {
    key: `port-stop-${view.host.label}-${port.port}`,
    glyph: 'square',
    onPress: () => view.act.stopTunnel(port),
  })
}

function openCell(context: PortRowContext, port: ListeningPort): Tree {
  const { view, tunnel, note } = context
  const { Box, Text } = view.ui.el
  const key = `port-open-${view.host.label}-${port.port}`
  const onOpen = () => view.act.openPort(port)
  if (!port.listening) return fixedCell(view.ui, COLUMNS.open, tunnel ? stopTunnelButton(view, port) : null, true)
  if (tunnel) {
    return (
      <Box width={COLUMNS.open} flexShrink={0} justifyContent="flex-end" columnGap={1}>
        {rowButton(view.ui, { key, glyph: 'external-link', color: c.green, onPress: onOpen })}
        <Text color={c.green}>{`forwarded :${tunnel.localPort}`}</Text>
        {stopTunnelButton(view, port)}
      </Box>
    )
  }
  const isOpening = note === OPENING_TUNNEL_NOTE
  return (
    <Box width={COLUMNS.open} flexShrink={0} justifyContent="flex-end" columnGap={1}>
      {isOpening ? <Text color={c.comment}>opening…</Text> : null}
      {rowButton(view.ui, {
        key,
        glyph: 'external-link',
        color: isFailureNote(note) ? c.red : c.dim,
        isDisabled: isOpening,
        onPress: onOpen,
      })}
    </Box>
  )
}

function killCell(view: TabView, port: ListeningPort): Tree {
  const { pid } = port
  const canKill = port.listening && pid !== null && Number.isFinite(pid) && pid >= FIRST_KILLABLE_PID
  if (!canKill) return fixedCell(view.ui, COLUMNS.kill, null)
  const onKill = () => view.act.kill(pid)
  return fixedCell(view.ui, COLUMNS.kill, killButton(view.ui, `port-kill-${view.host.label}-${port.port}`, onKill), true)
}

function portRow(view: TabView, port: ListeningPort): Tree {
  const { ui, host } = view
  const { Box, Text } = ui.el
  const owner = agentProcessWithPid(view, port.agent_pid)
  const context: PortRowContext = {
    view,
    tunnel: tunnelOfPort(view.tunnels, host.label, port.port),
    note: view.portNotes[portNoteKey(host.label, port.port)] ?? '',
  }
  const rowBackground = isDown(port) ? mixColors(c.background, c.red, DOWN_ROW_TINT) : undefined
  return (
    <Box key={`port-${host.label}-${port.port}`} flexDirection="column">
      <Box columnGap={1} backgroundColor={rowBackground}>
        {pinButton(view, port)}
        {fixedCell(ui, COLUMNS.port, <Text color={isDown(port) ? c.red : c.cyan}>{`:${port.port}`}</Text>, true)}
        {processCell(view, port)}
        {agentCell(view, owner, port)}
        <Box flexGrow={1} flexShrink={1} overflow="hidden">
          <Text color={c.comment} wrap="truncate-end">
            {owner ? homeRelative(owner.cwd, host.home) : ''}
          </Text>
        </Box>
        {openCell(context, port)}
        {killCell(view, port)}
      </Box>
      {isFailureNote(context.note) ? <Text color={c.red}>{`  ${context.note}`}</Text> : null}
    </Box>
  )
}

function tableHeader(view: TabView): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  const widths = columnsOf(view)
  const heading = (label: string): Tree => <Text color={c.comment}>{label}</Text>
  return (
    <Box key="ports-header" columnGap={1}>
      {fixedCell(ui, COLUMNS.pin, null)}
      {fixedCell(ui, COLUMNS.port, heading('port'), true)}
      {fixedCell(ui, widths.process, heading('process'))}
      {fixedCell(ui, widths.agent, view.isWide ? heading('agent') : null)}
      <Box flexGrow={1} flexShrink={1}>
        {heading('worktree')}
      </Box>
      {fixedCell(ui, COLUMNS.open, null)}
      {fixedCell(ui, COLUMNS.kill, null)}
    </Box>
  )
}

function rightTitle(view: TabView, ports: ListeningPort[]): Tree {
  const { Text } = view.ui.el
  const pinnedCount = ports.filter(port => port.pinned).length
  const downCount = ports.filter(isDown).length
  if (downCount > 0) return <Text color={c.red}>{`${pinnedCount} pinned · ${downCount} down`}</Text>
  if (pinnedCount > 0) return <Text color={c.comment}>{`${pinnedCount} pinned`}</Text>
  return <Text color={c.comment}>listening</Text>
}

export function portsPanel(view: TabView): Tree {
  const { ui, host } = view
  const { Text } = ui.el
  const ports = [...host.ports].sort(portOrder)
  const children =
    ports.length > 0
      ? [tableHeader(view), ...ports.map(port => portRow(view, port))]
      : [<Text color={c.comment}>No listening TCP ports, or the host does not show them to this user.</Text>]
  return panel(ui, {
    key: `ports-${host.label}`,
    title: panelTitle(ui, 'plug', 'ports', c.cyan),
    rightTitle: rightTitle(view, ports),
    children,
  })
}
