import { markOf } from '../agent-marks'
import { percentLevel } from '../health'
import { TOKYO_NIGHT as c, GRADIENTS, gradientAt, levelColor } from '../palette'
import type { ProcessRow, ProcessSort } from '../schemas'
import { agentIcon, programLabel } from '../ui/icons'
import type { Tree } from '../ui/ui'
import {
  AGENT_MARKER,
  type ChoiceOption,
  dropdown,
  fixedCell,
  growCell,
  iconLabel,
  iconPicker,
  isTerminal,
  killButton,
  meter,
  panel,
  panelTitle,
  toolbar,
} from '../ui/widgets'
import type { TabView } from './view'

const PERCENT_SCALE = 100
const MEMORY_PERCENT_AT_TOP_COLOR = 25
const CPU_METER_CELLS = 10
const FIRST_KILLABLE_PID = 2
const SORT_MARKER = '▾'
const COLUMNS = { marker: 2, pid: 7, percent: 7, kill: 2 } as const
const PID_COLUMN_MIN_BODY = 60
const SORTS: Record<ProcessSort, { column: string; name: string }> = {
  cpu: { column: 'cpu%', name: 'cpu' },
  mem: { column: 'mem%', name: 'memory' },
}
const SORT_OPTIONS: ChoiceOption<ProcessSort>[] = (['cpu', 'mem'] as const).map(sort => ({
  value: sort,
  label: SORTS[sort].name,
}))

const hasPidColumn = (view: TabView): boolean => view.columns >= PID_COLUMN_MIN_BODY

const sortValue = (process: ProcessRow, sort: ProcessSort): number => (sort === 'mem' ? process.mem : process.cpu) ?? 0

function sortableHeader(view: TabView, sort: ProcessSort): Tree {
  const { Button, Text } = view.ui.el
  const isActive = view.choices.sort === sort
  const { column } = SORTS[sort]
  const label = isActive ? `${column} ${SORT_MARKER}` : column
  if (!isTerminal(view.ui))
    return fixedCell(view.ui, COLUMNS.percent, <Text color={isActive ? c.blue : c.comment}>{label}</Text>, true)
  return fixedCell(
    view.ui,
    COLUMNS.percent,
    <Button key={`column-${sort}`} plain onPress={() => view.act.sortBy(sort)}>
      <Text color={isActive ? c.blue : c.comment}>{isActive ? `${column} ${SORT_MARKER}` : column}</Text>
    </Button>,
    true,
  )
}

function tableHeader(view: TabView): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  return (
    <Box key="procs-header" columnGap={1}>
      {fixedCell(ui, COLUMNS.marker, null)}
      {hasPidColumn(view) ? fixedCell(ui, COLUMNS.pid, <Text color={c.comment}>pid</Text>, true) : null}
      {growCell(ui, <Text color={c.comment}>program</Text>)}
      {view.isWide ? fixedCell(ui, CPU_METER_CELLS, null) : null}
      {sortableHeader(view, 'cpu')}
      {sortableHeader(view, 'mem')}
      {fixedCell(ui, COLUMNS.kill, null)}
    </Box>
  )
}

function processMarker(view: TabView, process: ProcessRow): Tree {
  const { Text } = view.ui.el
  if (!process.agent) return null
  if (markOf(process.name).isDefault) return <Text color={c.green}>{AGENT_MARKER}</Text>
  return agentIcon(view.ui, `proc-mark-${view.host.label}-${process.pid}`, process.name)
}

function killCell(view: TabView, process: ProcessRow): Tree {
  const { pid } = process
  const canKill = pid !== null && Number.isFinite(pid) && pid >= FIRST_KILLABLE_PID
  if (!canKill) return fixedCell(view.ui, COLUMNS.kill, null)
  const onKill = () => view.act.kill(pid)
  return fixedCell(view.ui, COLUMNS.kill, killButton(view.ui, `proc-kill-${view.host.label}-${pid}`, onKill), true)
}

function processRow(view: TabView, process: ProcessRow): Tree {
  const { ui, host, snapshot } = view
  const { Box, Text } = ui.el
  const cpu = process.cpu ?? 0
  const memory = process.mem ?? 0
  const cpuShare = Math.min(cpu, PERCENT_SCALE) / PERCENT_SCALE
  const memoryShare = Math.min(memory, MEMORY_PERCENT_AT_TOP_COLOR) / MEMORY_PERCENT_AT_TOP_COLOR
  const cpuColor = levelColor(percentLevel(Math.floor(cpu), snapshot.settings), gradientAt(GRADIENTS.cpu, cpuShare))
  const rowKey = `proc-${host.label}-${process.pid}`
  return (
    <Box key={rowKey} columnGap={1}>
      {fixedCell(ui, COLUMNS.marker, processMarker(view, process))}
      {hasPidColumn(view) ? fixedCell(ui, COLUMNS.pid, <Text color={c.comment}>{String(process.pid ?? '?')}</Text>, true) : null}
      {growCell(ui, programLabel(ui, `${rowKey}-name`, process.name, process.agent ? c.foreground : c.foregroundDark))}
      {view.isWide ? meter(ui, `${rowKey}-meter`, Math.min(cpu, PERCENT_SCALE), CPU_METER_CELLS, GRADIENTS.cpu) : null}
      {fixedCell(ui, COLUMNS.percent, <Text color={cpuColor}>{cpu.toFixed(1)}</Text>, true)}
      {fixedCell(ui, COLUMNS.percent, <Text color={gradientAt(GRADIENTS.memory, memoryShare)}>{memory.toFixed(1)}</Text>, true)}
      {killCell(view, process)}
    </Box>
  )
}

function topProcesses(view: TabView): ProcessRow[] {
  return [...view.host.processes]
    .sort((first, second) => sortValue(second, view.choices.sort) - sortValue(first, view.choices.sort))
    .slice(0, view.snapshot.settings.top_n)
}

function sortPicker(view: TabView): Tree {
  return iconPicker(
    view.ui,
    'arrow-down-wide-narrow',
    dropdown(view.ui, {
      key: 'sort',
      label: 'sort by',
      options: SORT_OPTIONS,
      selected: view.choices.sort,
      onSelect: view.act.sortBy,
    }),
  )
}

export function procsToolbar(view: TabView): Tree {
  if (!isTerminal(view.ui)) return null
  return toolbar(
    view.ui,
    'procs-toolbar',
    [iconLabel(view.ui, 'activity', `top ${topProcesses(view).length} processes`, c.magenta)],
    [sortPicker(view)],
  )
}

export function procsPanel(view: TabView): Tree {
  const { ui, host, choices } = view
  const { Text } = ui.el
  const processes = topProcesses(view)
  return panel(ui, {
    key: `procs-${host.label}`,
    title: panelTitle(ui, 'activity', 'procs', c.magenta),
    rightTitle: <Text color={c.comment}>{`top ${processes.length} · by ${SORTS[choices.sort].name}`}</Text>,
    actions: isTerminal(ui) ? undefined : sortPicker(view),
    children: [tableHeader(view), ...processes.map(process => processRow(view, process))],
  })
}
