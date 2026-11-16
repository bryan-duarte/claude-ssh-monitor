import type { EngineInterface as Engine, On } from 'claude-code'
import { dockerContainerPlan, killPlan, worktreeRemovePlan } from './action-dialogs'
import { choosePortAction, confirmAndRun, previewPrune } from './actions'
import { agentViews } from './agents'
import { dockerOfHost } from './docker'
import { hostHealth } from './health'
import { CHART_RANGE_SAMPLES, SECONDS_PER_SAMPLE } from './history'
import { BRAND, CONSOLE_PANE } from './mod'
import { TOKYO_NIGHT as c, healthColor } from './palette'
import type { ChartRange, ConsoleChoices, ConsoleTab, HostSnapshot, KeysMessage, Snapshot } from './schemas'
import { CONSOLE_TABS, isRecord, PROCESS_SORTS, WORKTREE_FILTERS } from './schemas'
import {
  choose,
  readCheckingPruneOn,
  readChoices,
  readClockKey,
  readDocker,
  readError,
  readHistory,
  readIsConsoleOpen,
  readIsKeyboardOn,
  readPortNotes,
  readShowAllWorktrees,
  readSnapshot,
  readTunnels,
  readWorktrees,
  updateIsConsoleOpen,
  updateIsKeyboardOn,
  updateShowAllWorktrees,
} from './store'
import { contentOfTab } from './tabs'
import { isWide, type TabActions, type TabView } from './tabs/view'
import { openPort, refreshTunnels, stopTunnel, togglePin } from './tunnels'
import { uiIcon } from './ui/icons'
import { hostNotesPanel, noticePanel, unreachablePanel, waitingPanel } from './ui/notices'
import { forSurface, type Tree, type Ui, uiOf } from './ui/ui'
import {
  AGENT_MARKER,
  type ChoiceOption,
  divider,
  dropdown,
  iconPicker,
  isTerminal,
  keycap,
  SEPARATOR,
  TITLE_SIZE,
  tabStrip,
  textButton,
  uiGlyph,
} from './ui/widgets'
import { worktreesOfHost } from './worktrees'

const KEYS_ELEMENT = 'keys'
const HOST_KEY_PATTERN = /^[1-9]$/
const SECONDS_PER_MINUTE = 60

const RANGE_OPTIONS: ChoiceOption<ChartRange>[] = CHART_RANGE_SAMPLES.map(samples => ({
  value: samples,
  label: `${(samples * SECONDS_PER_SAMPLE) / SECONDS_PER_MINUTE}m`,
}))

export async function toggleConsole($: Engine): Promise<void> {
  if (await readIsConsoleOpen($)) {
    await $.ui.close({ id: CONSOLE_PANE })
    await updateIsConsoleOpen($, () => false)
    await updateIsKeyboardOn($, () => false)
    return
  }
  const opened = await $.ui.open({ id: CONSOLE_PANE, title: BRAND, backgroundColor: c.background })
  if (!opened.isPlaced) $.ui.toast(`${BRAND}: the console waits for room: ${opened.reason}`)
  await updateIsConsoleOpen($, () => true)
  void refreshTunnels($).catch(() => undefined)
}

const shownHost = (snapshot: Snapshot | null, choices: ConsoleChoices): HostSnapshot | null =>
  snapshot?.hosts.find(host => host.label === choices.host) ?? snapshot?.hosts[0] ?? null

async function selectHost($: Engine, label: string): Promise<void> {
  await choose($, { host: label, filter: 'all' })
  await updateShowAllWorktrees($, () => false)
}

async function onKey($: Engine, key: string): Promise<void> {
  if (key === 'c') return choose($, { sort: 'cpu' })
  if (key === 'm') return choose($, { sort: 'mem' })
  if (!HOST_KEY_PATTERN.test(key)) return
  const hosts = (await readSnapshot($))?.hosts ?? []
  const host = hosts[Number(key) - 1]
  if (host) await selectHost($, host.label)
}

const TAB_CHROME_COLUMNS = 4
const FRAME_PADDING_COLUMNS = 2
const TERMINAL_SECTION_GAP = 1
const DESKTOP_SECTION_GAP = 2

function tabColumns(options: ChoiceOption<ConsoleTab>[]): number {
  return options.reduce((sum, option) => sum + option.label.length + String(option.count ?? '').length + TAB_CHROME_COLUMNS, 0)
}

type NavigationView = {
  snapshot: Snapshot | null
  host: HostSnapshot | null
  choices: ConsoleChoices
  bodyColumns: number
  worktreeCount: number
  containerCount: number | null
}

function viewOptions(view: NavigationView): ChoiceOption<ConsoleTab>[] {
  const { host } = view
  return [
    { value: 'overview', label: 'overview' },
    { value: 'agents', label: 'agents', count: host?.agents.length ?? 0 },
    { value: 'ports', label: 'ports', count: host?.ports.length ?? 0 },
    { value: 'worktrees', label: 'worktrees', count: view.worktreeCount },
    { value: 'docker', label: 'docker', count: view.containerCount },
    { value: 'procs', label: 'procs', count: view.snapshot?.settings.top_n ?? null },
  ]
}

function hostBadge(ui: Ui, host: HostSnapshot, snapshot: Snapshot | null): Tree {
  const { Box, Text } = ui.el
  const healthDot = snapshot ? healthColor(hostHealth(host, snapshot.settings)) : c.comment
  return (
    <Box columnGap={1} alignItems="center" flexShrink={0}>
      {uiIcon(ui, 'server', c.blue)}
      <Text color={c.blue} weight="semibold" size={TITLE_SIZE}>
        {host.label}
      </Text>
      <Text color={healthDot}>{AGENT_MARKER}</Text>
    </Box>
  )
}

function hostControl($: Engine, ui: Ui, view: NavigationView): Tree {
  const { snapshot, host } = view
  if (!snapshot || !host) return null
  const hostOptions: ChoiceOption<string>[] = snapshot.hosts.map(candidate => ({
    value: candidate.label,
    label: candidate.label,
    dotColor: healthColor(hostHealth(candidate, snapshot.settings)),
  }))
  if (hostOptions.length === 1) return hostBadge(ui, host, snapshot)
  const onHost = (label: string) => void selectHost($, label)
  return iconPicker(
    ui,
    'server',
    dropdown(ui, {
      key: 'host-picker',
      label: 'host',
      options: hostOptions,
      selected: host.label,
      onSelect: onHost,
      color: c.blue,
    }),
  )
}

function viewControl($: Engine, ui: Ui, view: NavigationView): Tree {
  const tabs = viewOptions(view)
  const onTab = (tab: ConsoleTab) => void choose($, { tab })
  const hasRoomForTabs = isTerminal(ui) && tabColumns(tabs) <= view.bodyColumns - FRAME_PADDING_COLUMNS
  if (hasRoomForTabs) return tabStrip(ui, { key: 'console-tabs', options: tabs, selected: view.choices.tab, onSelect: onTab })
  return iconPicker(
    ui,
    'layers',
    dropdown(ui, { key: 'view-picker', options: tabs, selected: view.choices.tab, onSelect: onTab, isNative: true }),
    true,
  )
}

function rangeControl($: Engine, ui: Ui, choices: ConsoleChoices): Tree {
  return iconPicker(
    ui,
    'history',
    dropdown(ui, { key: 'range', options: RANGE_OPTIONS, selected: choices.range, onSelect: range => void choose($, { range }) }),
  )
}

function header($: Engine, ui: Ui, view: NavigationView): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key="header" flexDirection="column" paddingX={1} rowGap={1}>
      <Box columnGap={2} alignItems="flex-start" justifyContent="space-between">
        <Box columnGap={1} alignItems="center" flexShrink={1} minWidth={0}>
          {uiIcon(ui, 'gauge', c.blue)}
          <Text color={c.foreground} weight="semibold" size={TITLE_SIZE} wrap="truncate-end">
            {BRAND}
          </Text>
        </Box>
        <Box columnGap={2} alignItems="flex-start" flexShrink={0}>
          {rangeControl($, ui, view.choices)}
          {hostControl($, ui, view)}
          {textButton(ui, 'close-console', uiGlyph('close'), c.dim, () => void toggleConsole($))}
        </Box>
      </Box>
      <Box alignItems="center">{viewControl($, ui, view)}</Box>
    </Box>
  )
}

function footerText(ui: Ui, isKeyboardOn: boolean): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key="footer" paddingX={1} columnGap={1}>
      <Text color={c.green}>●</Text>
      <Text color={c.comment}>agent</Text>
      <Text color={c.border}>{SEPARATOR}</Text>
      {keycap(ui, 'c', isKeyboardOn)}
      <Text color={c.comment}>cpu</Text>
      {keycap(ui, 'm', isKeyboardOn)}
      <Text color={c.comment}>mem</Text>
      {keycap(ui, '1-9', isKeyboardOn)}
      <Text color={c.comment}>host</Text>
    </Box>
  )
}

function footer(ui: Ui, isKeyboardOn: boolean): Tree {
  if (ui.surface === 'desktop') return null
  if (ui.surface === 'terminal') {
    const { Client } = ui.el
    return <Client key={KEYS_ELEMENT} module="../client/keys.tsx" props={{ isOn: isKeyboardOn }} width="100%" />
  }
  return footerText(ui, isKeyboardOn)
}

function tabActions($: Engine, host: HostSnapshot): TabActions {
  return {
    kill: pid => void confirmAndRun($, killPlan(host, pid)),
    removeWorktree: worktree => void confirmAndRun($, worktreeRemovePlan(host, worktree)),
    changeContainer: (container, name) => void confirmAndRun($, dockerContainerPlan(host, container, name)),
    prune: () => void previewPrune($, host),
    togglePin: port => void togglePin($, host, port.port, port.pinned),
    openPort: port => void openPort($, host, port.port),
    stopTunnel: port => void stopTunnel($, host, port.port),
    portMenu: (port, hasTunnel) => void choosePortAction($, host, port, hasTunnel),
    sortBy: sort => void choose($, { sort }),
    filterWorktrees: filter => {
      void choose($, { filter })
      void updateShowAllWorktrees($, () => false)
    },
    showAllWorktrees: () => void updateShowAllWorktrees($, () => true),
  }
}

type DropdownMessage = { type: 'select'; value: string }

const WORKTREE_FILTER_PREFIX = 'worktree-filter-'

const isDropdownMessage = (data: unknown): data is DropdownMessage =>
  isRecord(data) && data.type === 'select' && typeof data.value === 'string'

const isOneOf = <T extends string | number>(list: readonly T[], candidate: unknown): candidate is T =>
  list.includes(candidate as T)

async function applyDropdownChoice($: Engine, element: string, value: string): Promise<void> {
  if (element === 'range') {
    const range = Number(value)
    if (isOneOf(CHART_RANGE_SAMPLES, range)) await choose($, { range })
    return
  }
  if (element === 'view-picker' && isOneOf(CONSOLE_TABS, value)) return choose($, { tab: value })
  if (element === 'sort' && isOneOf(PROCESS_SORTS, value)) return choose($, { sort: value })
  if (element === 'host-picker') {
    const hosts = (await readSnapshot($))?.hosts ?? []
    if (hosts.some(host => host.label === value)) await selectHost($, value)
    return
  }
  if (element.startsWith(WORKTREE_FILTER_PREFIX) && isOneOf(WORKTREE_FILTERS, value)) {
    await choose($, { filter: value })
    await updateShowAllWorktrees($, () => false)
  }
}

const isKeysMessage = (data: unknown): data is KeysMessage =>
  isRecord(data) && (data.type === 'focus' || (data.type === 'key' && typeof data.key === 'string'))

export async function startConsole($: Engine): Promise<void> {
  await $.command.register({ name: 'ssh-monitor', description: 'Show or hide the SSH host monitor' })
  const isConsoleOpen = (await $.ui.panes()).some(pane => pane.id === CONSOLE_PANE)
  await updateIsConsoleOpen($, () => isConsoleOpen)
  await updateIsKeyboardOn($, () => false)
}

export function wireConsole(on: On): void {
  on('command.run', { command: 'ssh-monitor' }, async $ => {
    await toggleConsole($)
    const isOpen = await readIsConsoleOpen($)
    return { text: isOpen ? `${BRAND} console opened.` : `${BRAND} console closed.`, isTextDisplayOnly: true }
  })

  on('ui.close', async ($, e, next) => {
    if (e.id === CONSOLE_PANE) {
      await updateIsConsoleOpen($, () => false)
      await updateIsKeyboardOn($, () => false)
    }
    return next(e)
  })

  on('ui.focus', async ($, e, next) => {
    const isConsoleFocus = e.component === 'Pane' && e.requestId === CONSOLE_PANE
    if (isConsoleFocus && e.element !== KEYS_ELEMENT && (await readIsKeyboardOn($))) {
      await updateIsKeyboardOn($, () => false)
    }
    return next(e)
  })

  on('ui.message', async ($, e, next) => {
    if (e.requestId === CONSOLE_PANE && isDropdownMessage(e.data)) {
      await applyDropdownChoice($, e.element, e.data.value)
      return {}
    }
    if (e.requestId !== CONSOLE_PANE || e.element !== KEYS_ELEMENT || !isKeysMessage(e.data)) return next(e)
    if (e.data.type === 'focus') await updateIsKeyboardOn($, () => true)
    else await onKey($, e.data.key)
    return {}
  })

  on('ui.render', { component: 'Pane', requestId: CONSOLE_PANE }, async ($, e) => {
    const ui = uiOf($, e)
    const { Box } = ui.el
    const snapshot = await readSnapshot($)
    const failure = await readError($)
    const choices = await readChoices($)
    const isKeyboardOn = await readIsKeyboardOn($)
    await readClockKey($)
    const host = shownHost(snapshot, choices)
    const bodyColumns = e.props.bodyColumns
    const hostNumber = snapshot && host ? snapshot.hosts.indexOf(host) + 1 : 0
    const worktreesByHost = await readWorktrees($)
    const dockerByHost = await readDocker($)
    const navigationView: NavigationView = {
      snapshot,
      host,
      choices,
      bodyColumns,
      worktreeCount: host ? worktreesOfHost(worktreesByHost, host).items.length : 0,
      containerCount: host ? dockerOfHost(dockerByHost, host).containers.length : null,
    }
    const body: Tree[] = [noticePanel(ui, snapshot, failure)]
    let tabToolbar: Tree = null
    if (snapshot && host) {
      const isPending = host.state === 'pending'
      if (isPending) body.push(waitingPanel(ui, host, hostNumber))
      if (!isPending && host.state !== 'ok') body.push(unreachablePanel(ui, host, hostNumber, snapshot.settings))
      if (!isPending && host.problems.length > 0) body.push(hostNotesPanel(ui, host))
      if (!isPending) {
        const history = await readHistory($)
        const view: TabView = {
          act: tabActions($, host),
          ui,
          host,
          hostNumber,
          snapshot,
          history,
          choices,
          agents: agentViews(host, history),
          columns: bodyColumns,
          isWide: isWide(bodyColumns),
          worktrees: worktreesByHost,
          docker: dockerByHost,
          tunnels: await readTunnels($),
          portNotes: await readPortNotes($),
          checkingPruneOn: await readCheckingPruneOn($),
          showAllWorktrees: await readShowAllWorktrees($),
        }
        const content = contentOfTab(view)
        tabToolbar = content.toolbar
        body.push(...content.panels)
      }
    }
    return forSurface(
      ui,
      <Box flexDirection="column" width="100%" paddingTop={1} rowGap={1}>
        {header($, ui, navigationView)}
        {divider(ui, 'navigation-divider', bodyColumns)}
        {tabToolbar ? (
          <Box key="tab-toolbar" flexDirection="column">
            {tabToolbar}
            {divider(ui, 'toolbar-divider', bodyColumns)}
          </Box>
        ) : null}
        <Box key="body" flexDirection="column" paddingX={1} rowGap={isTerminal(ui) ? TERMINAL_SECTION_GAP : DESKTOP_SECTION_GAP}>
          {body}
        </Box>
        {footer(ui, isKeyboardOn)}
      </Box>,
    )
  })
}
