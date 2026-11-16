import type { On, RenderElement } from 'claude-code'
import { toggleConsole } from './console'
import { percentText } from './format'
import { isStale, percentLevel } from './health'
import { BRAND } from './mod'
import { TOKYO_NIGHT as c, GRADIENTS, type Gradient, gradientAt, levelColor } from './palette'
import type { HostSnapshot, MonitorSettings, PercentLevel } from './schemas'
import { readError, readIsConsoleOpen, readSnapshot } from './store'
import { uiIcon } from './ui/icons'
import { forSurface, type Tree, type Ui, uiOf } from './ui/ui'
import { joinWith, meter, SEPARATOR, type UiGlyphName } from './ui/widgets'

const READING_CELLS = 4
const PERCENT_SCALE = 100
const TOGGLE_HOTKEY = 'm'
const TOGGLE_COLUMNS = 4
const OVERFLOW_COLUMNS = 4
const READING_COLUMNS = 1 + 1 + READING_CELLS + 1 + 6
const OPEN_GLYPH = '◧'
const CLOSED_GLYPH = '□'
const FAILED_POLL_MARK = '!'
const LEVEL_MARKS: Record<PercentLevel, string> = { critical: '!!', warning: '!', normal: '' }
const UNREACHABLE_MARKS = {
  pending: { mark: '…', color: c.comment },
  down: { mark: '✕', color: c.red },
  auth: { mark: 'auth', color: c.yellow },
} as const

function reading(
  ui: Ui,
  key: string,
  glyph: UiGlyphName,
  percent: number | null,
  gradient: Gradient,
  settings: MonitorSettings,
): Tree {
  const { Box, Text } = ui.el
  const level = percentLevel(percent, settings)
  const loadColor = gradientAt(gradient, (percent ?? 0) / PERCENT_SCALE)
  return (
    <Box key={key} columnGap={1} flexShrink={0} alignItems="center">
      {uiIcon(ui, glyph, loadColor)}
      {meter(ui, `${key}-meter`, percent, READING_CELLS, gradient, c.terminalBlack)}
      <Text color={levelColor(level)}>{`${percentText(percent)}${LEVEL_MARKS[level]}`}</Text>
    </Box>
  )
}

function hostSegment(ui: Ui, host: HostSnapshot, settings: MonitorSettings): Tree {
  const { Box, Text } = ui.el
  const key = `host-${host.label}`
  const label = (
    <Box columnGap={1} alignItems="center" flexShrink={0}>
      {uiIcon(ui, 'server', c.blue)}
      <Text color={c.blue} weight="semibold">
        {host.label}
      </Text>
    </Box>
  )
  if (host.state !== 'ok') {
    const { mark, color } = UNREACHABLE_MARKS[host.state]
    return (
      <Box key={key} columnGap={1} flexShrink={0} alignItems="center">
        {label}
        <Text color={color}>{mark}</Text>
      </Box>
    )
  }
  return (
    <Box key={key} columnGap={1} flexShrink={0} alignItems="center">
      {label}
      {reading(ui, `${key}-cpu`, 'cpu', host.cpu_pct, GRADIENTS.cpu, settings)}
      {reading(ui, `${key}-mem`, 'memory-stick', host.mem_pct, GRADIENTS.memory, settings)}
      {isStale(host, settings) ? <Text color={c.comment}>?</Text> : null}
    </Box>
  )
}

const segmentColumns = (host: HostSnapshot): number =>
  host.label.length + 3 + (host.state === 'ok' ? 2 * (READING_COLUMNS + 1) + 2 : UNREACHABLE_MARKS[host.state].mark.length + 1)

function hostsThatFit(hosts: HostSnapshot[], bodyColumns: number): HostSnapshot[] {
  let room = bodyColumns - TOGGLE_COLUMNS - OVERFLOW_COLUMNS - 2
  const shown: HostSnapshot[] = []
  for (const host of hosts) {
    const needed = segmentColumns(host) + 3
    if (shown.length > 0 && needed > room) break
    shown.push(host)
    room -= needed
  }
  return shown
}

export function wireBand(on: On): void {
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    const ui = uiOf($, e)
    const { Box, Button, Text } = ui.el
    const snapshot = await readSnapshot($)
    const error = await readError($)
    const isOpen = await readIsConsoleOpen($)
    const divider = (): Tree => <Text color={c.border}>{SEPARATOR}</Text>
    const toggle = (
      <Button key="toggle" plain hotkey={TOGGLE_HOTKEY} onPress={() => void toggleConsole($)}>
        <Text color={isOpen ? c.blue : c.dim}>{isOpen ? OPEN_GLYPH : CLOSED_GLYPH}</Text>
      </Button>
    )
    const failedPoll = error ? (
      <Text color={c.red} weight="semibold">
        {FAILED_POLL_MARK}
      </Text>
    ) : null
    const frame = (content: Tree[]): RenderElement =>
      forSurface(
        ui,
        <Box columnGap={1} justifyContent="flex-end" alignItems="center" width="100%" paddingX={1}>
          {content}
          {divider()}
          {toggle}
        </Box>,
      )
    if (!snapshot && error) return frame([<Text color={c.red}>{`${BRAND}: error`}</Text>, failedPoll])
    if (!snapshot) return frame([<Text color={c.comment}>{`${BRAND} …`}</Text>])
    if (snapshot.hosts.length === 0) return frame([<Text color={c.dim}>{`${BRAND}: add hosts`}</Text>])
    const shownHosts = hostsThatFit(snapshot.hosts, e.props.bodyColumns)
    const hiddenCount = snapshot.hosts.length - shownHosts.length
    const segments = shownHosts.map(host => hostSegment(ui, host, snapshot.settings))
    return frame([
      ...joinWith(segments, divider),
      hiddenCount > 0 ? <Text color={c.comment}>{`+${hiddenCount}`}</Text> : null,
      failedPoll,
    ])
  })
}
