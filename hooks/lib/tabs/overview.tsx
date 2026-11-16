import { ageOrUnknown, ageSince, byteRate, kibAsGib, mibAsGib, minutesText, percentText, storageSize } from '../format'
import { isStale, percentLevel } from '../health'
import { eventMarkers, SECONDS_PER_SAMPLE, samplesInRange } from '../history'
import { TOKYO_NIGHT as c, GRADIENTS, type Gradient, levelColor } from '../palette'
import type { ChartMarker, HostSnapshot, MonitorSettings, Sample } from '../schemas'
import { historyChart, MAX_RASTER_COLUMNS, sparkline } from '../ui/charts'
import { uiIcon } from '../ui/icons'
import type { Tree, Ui } from '../ui/ui'
import { coreBlocks, hostTitle, meter, panel, ROW_LABEL_COLUMNS, rowLabel, type UiGlyphName } from '../ui/widgets'
import { worktreeFacts, worktreesOfHost } from '../worktrees'
import type { TabView } from './view'

const RESOURCE_METER_CELLS = 20
const CHART_ROWS = 4
const PANEL_CHROME_COLUMNS = 6
const MIN_METER_CELLS = 6
const METRIC_LABEL_COLUMNS = 9
const METRIC_READOUT_COLUMNS = 6
const NET_SPARKLINE_SAMPLES = 40
const NET_SPARKLINE_COLUMNS = 10
const MIN_CHART_COLUMNS = 10
const MIN_NET_SCALE_BYTES_PER_SECOND = 1

type MetricBoxProps = {
  key: string
  label: string
  glyph: UiGlyphName
  percent: number | null
  gradient: Gradient
  detail: string
  samples: Sample[]
  dashed?: Sample[]
  markers: ChartMarker[]
  rangeText: string
  columns: number
  settings: MonitorSettings
}

function percentCell(ui: Ui, percent: number | null, settings: MonitorSettings): Tree {
  const { Text } = ui.el
  return (
    <Text color={levelColor(percentLevel(percent, settings))} weight="semibold">
      {percentText(percent)}
    </Text>
  )
}

function resourceRow(ui: Ui, key: string, label: string, glyph: UiGlyphName, cells: Tree[]): Tree {
  const { Box } = ui.el
  return (
    <Box key={key} columnGap={1}>
      {rowLabel(ui, label, glyph)}
      {cells}
    </Box>
  )
}

function meterReading(
  ui: Ui,
  key: string,
  props: {
    label: string
    glyph: UiGlyphName
    percent: number | null
    gradient: Gradient
    detail: string
    settings: MonitorSettings
  },
): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key={key} flexDirection="column">
      {resourceRow(ui, `${key}-meter`, props.label, props.glyph, [
        meter(ui, `${key}-cells`, props.percent, RESOURCE_METER_CELLS, props.gradient),
      ])}
      <Box paddingLeft={ROW_LABEL_COLUMNS + 1} columnGap={1}>
        {percentCell(ui, props.percent, props.settings)}
        <Text color={c.dim} wrap="truncate-end">
          {props.detail}
        </Text>
      </Box>
    </Box>
  )
}

function timeAxis(ui: Ui, rangeText: string): Tree {
  const { Box, Text } = ui.el
  return (
    <Box justifyContent="space-between">
      <Text color={c.comment}>{`${rangeText} ago`}</Text>
      <Text color={c.comment}>now</Text>
    </Box>
  )
}

function metricSection(ui: Ui, props: MetricBoxProps): Tree {
  const { Box, Text } = ui.el
  const accent = props.gradient[0] ?? c.foreground
  const meterCells = Math.max(
    MIN_METER_CELLS,
    Math.min(RESOURCE_METER_CELLS, props.columns - METRIC_LABEL_COLUMNS - METRIC_READOUT_COLUMNS),
  )
  return (
    <Box key={props.key} flexDirection="column" paddingTop={1}>
      <Box columnGap={1} alignItems="center">
        <Box width={ROW_LABEL_COLUMNS} flexShrink={0} columnGap={1} alignItems="center">
          {uiIcon(ui, props.glyph, accent)}
          <Text color={accent} weight="semibold">
            {props.label}
          </Text>
        </Box>
        {meter(ui, `${props.key}-meter`, props.percent, meterCells, props.gradient, c.terminalBlack)}
        {percentCell(ui, props.percent, props.settings)}
      </Box>
      <Box paddingLeft={ROW_LABEL_COLUMNS + 1}>
        <Text color={c.dim} wrap="truncate-end">
          {props.detail}
        </Text>
      </Box>
      {historyChart(ui, {
        key: `${props.key}-chart`,
        samples: props.samples,
        dashed: props.dashed,
        gradient: props.gradient,
        markers: props.markers,
        columns: props.columns,
        rows: CHART_ROWS,
        alt: `${props.label} history`,
      })}
      {timeAxis(ui, props.rangeText)}
    </Box>
  )
}

function memoryDetail(host: HostSnapshot): string {
  const hasSwap = host.swap_pct !== null && Number.isFinite(host.swap_pct) && host.swap_pct > 0
  const swap = hasSwap ? ` · swap ${percentText(host.swap_pct)}` : ''
  return `${kibAsGib(host.mem_used_kb)} / ${kibAsGib(host.mem_total_kb)} GiB${swap}`
}

function hostCharts(view: TabView): Tree[] {
  const { ui, host, history, choices, snapshot } = view
  const series = history.hosts[host.label]
  const rangeText = minutesText(choices.range * SECONDS_PER_SAMPLE)
  const roomColumns = view.columns - PANEL_CHROME_COLUMNS
  const columns = Math.min(MAX_RASTER_COLUMNS, Math.max(MIN_CHART_COLUMNS, roomColumns))
  return [
    metricSection(ui, {
      key: `cpu-box-${host.label}`,
      label: 'cpu',
      glyph: 'cpu',
      percent: host.cpu_pct,
      gradient: GRADIENTS.cpu,
      detail: host.ncpu ? `${host.ncpu} cores` : '',
      samples: samplesInRange(series?.cpu, choices.range),
      markers: eventMarkers(history, host.label, choices.range),
      rangeText,
      columns,
      settings: snapshot.settings,
    }),
    metricSection(ui, {
      key: `mem-box-${host.label}`,
      label: 'mem',
      glyph: 'memory-stick',
      percent: host.mem_pct,
      gradient: GRADIENTS.memory,
      detail: memoryDetail(host),
      samples: samplesInRange(series?.mem, choices.range),
      dashed: samplesInRange(series?.swap, choices.range),
      markers: [],
      rangeText,
      columns,
      settings: snapshot.settings,
    }),
  ]
}

function diskDetail(host: HostSnapshot): string {
  const hasDiskSize = host.disk_total_kb !== null && host.disk_used_kb !== null
  const free = hasDiskSize ? storageSize((host.disk_total_kb ?? 0) - (host.disk_used_kb ?? 0)) : '?'
  const hasReadWriteRates = host.disk_read_rate !== null || host.disk_write_rate !== null
  if (hasReadWriteRates) return `${free} free · r ${byteRate(host.disk_read_rate)} w ${byteRate(host.disk_write_rate)}`
  if (host.disk_io_rate !== null) return `${free} free · io ${byteRate(host.disk_io_rate)}`
  return `${free} free`
}

function worktreeSummary(view: TabView): string {
  const worktrees = worktreesOfHost(view.worktrees, view.host)
  if (worktrees.state === 'pending') return 'measuring worktrees…'
  const staleCount = worktreeFacts(worktrees.items, view.agents).counts.stale
  return `${storageSize(worktrees.total_kb)} in ${worktrees.items.length} worktrees · ${staleCount} stale`
}

function networkRow(view: TabView): Tree {
  const { ui, host, history } = view
  const { Text } = ui.el
  const series = history.hosts[host.label]
  const received = (series?.rx ?? []).slice(-NET_SPARKLINE_SAMPLES)
  const sent = (series?.tx ?? []).slice(-NET_SPARKLINE_SAMPLES)
  const finiteRates = [...received, ...sent].filter((rate): rate is number => Number.isFinite(rate))
  const sharedMaximum = Math.max(MIN_NET_SCALE_BYTES_PER_SECOND, ...finiteRates)
  return resourceRow(ui, `net-${host.label}`, 'net', 'arrow-down-up', [
    sparkline(ui, {
      key: `rx-${host.label}`,
      samples: received,
      color: c.teal,
      columns: NET_SPARKLINE_COLUMNS,
      maximum: sharedMaximum,
    }),
    sparkline(ui, {
      key: `tx-${host.label}`,
      samples: sent,
      color: c.cyan,
      columns: NET_SPARKLINE_COLUMNS,
      maximum: sharedMaximum,
    }),
    <Text color={c.dim} wrap="truncate-end">{`↓ ${byteRate(host.net_rx_rate)} ↑ ${byteRate(host.net_tx_rate)}`}</Text>,
  ])
}

function coresRow(view: TabView): Tree {
  const { ui, host } = view
  const { Text } = ui.el
  const coreCount = host.ncpu ?? host.cores.length
  const blocks =
    host.cores.length > 0 ? (
      coreBlocks(ui, `cores-${host.label}-blocks`, host.cores, GRADIENTS.cpu)
    ) : (
      <Text color={c.foreground} weight="semibold">
        {String(coreCount)}
      </Text>
    )
  return resourceRow(ui, `cores-${host.label}`, 'cores', 'cpu', [blocks])
}

function resourceRows(view: TabView): Tree[] {
  const { ui, host, snapshot } = view
  const { Text } = ui.el
  const rows: Tree[] = [
    meterReading(ui, `disk-${host.label}`, {
      label: 'disk',
      glyph: 'hard-drive',
      percent: host.disk_pct,
      gradient: GRADIENTS.storage,
      detail: diskDetail(host),
      settings: snapshot.settings,
    }),
    networkRow(view),
  ]
  if (host.gpu) {
    const videoMemory = `${mibAsGib(host.gpu.mem_used_mib)} / ${mibAsGib(host.gpu.mem_total_mib)} GiB`
    rows.push(
      meterReading(ui, `gpu-${host.label}`, {
        label: 'gpu',
        glyph: 'microchip',
        percent: host.gpu.pct,
        gradient: GRADIENTS.swap,
        detail: `${host.gpu.name} · vram ${videoMemory}`,
        settings: snapshot.settings,
      }),
    )
  }
  rows.push(
    resourceRow(ui, `wt-${host.label}`, 'wt', 'git-branch', [
      <Text color={c.teal} wrap="truncate-end">
        {worktreeSummary(view)}
      </Text>,
    ]),
  )
  return rows
}

export function overviewPanel(view: TabView): Tree {
  const { ui, host, snapshot } = view
  const { Text } = ui.el
  const stale = isStale(host, snapshot.settings)
  const uptime = `${host.os} · up ${ageOrUnknown(host.uptime_seconds)}`
  const rightTitle = stale ? `${uptime} · stale ${ageSince(host.updated_at)}` : uptime
  const hasCores = Boolean(host.ncpu ?? host.cores.length)
  return panel(ui, {
    key: `system-${host.label}`,
    title: hostTitle(ui, host.label, view.hostNumber, c.blue),
    rightTitle: <Text color={stale ? c.yellow : c.comment}>{rightTitle}</Text>,
    children: [hasCores ? coresRow(view) : null, ...hostCharts(view), ...resourceRows(view)],
  })
}
