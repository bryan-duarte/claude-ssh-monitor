import type { EngineInterface as Engine, On } from 'claude-code'
import { dockerContainerPlan, killPlan, worktreeRemovePlan } from './action-dialogs'
import { confirmAndRun, previewPrune } from './actions'
import { agentViews } from './agents'
import { dockerOfHost } from './docker'
import { hostHealth } from './health'
import { CHART_RANGE_SAMPLES, SECONDS_PER_SAMPLE } from './history'
import { BRAND, CONSOLE_PANE } from './mod'
import { TOKYO_NIGHT as c, healthColor } from './palette'
import type { ChartRange, ConsoleChoices, ConsoleTab, HostSnapshot, KeysMessage, Snapshot } from './schemas'
import { isRecord } from './schemas'
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
import { panelsOfTab } from './tabs'
import { isWide, type TabActions, type TabView } from './tabs/view'
import { openPort, refreshTunnels, stopTunnel, togglePin } from './tunnels'
import { hostNotesPanel, noticePanel, unreachablePanel, waitingPanel } from './ui/notices'
import { type Tree, type Ui, uiOf } from './ui/ui'
import { type ChoiceOption, keycap, SEPARATOR, segmentedControl, tabStrip, textButton, uiGlyph } from './ui/widgets'
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

function header($: Engine, ui: Ui, snapshot: Snapshot | null, host: HostSnapshot | null, choices: ConsoleChoices): Tree {
  const { Box, Text } = ui.el
  const hostOptions: ChoiceOption<string>[] = (snapshot?.hosts ?? []).map(candidate => ({
    value: candidate.label,
    label: candidate.label,
    dotColor: snapshot ? healthColor(hostHealth(candidate, snapshot.settings)) : undefined,
  }))
  return (
    <Box key="header" backgroundColor={c.backgroundDark} paddingX={1} columnGap={1} alignItems="center">
      <Text color={c.foreground} bold>
        {BRAND}
      </Text>
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        {host && hostOptions.length > 0
          ? tabStrip(ui, {
              key: 'hosts',
              options: hostOptions,
              selected: host.label,
              isCompact: false,
              onSelect: label => void selectHost($, label),
            })
          : null}
      </Box>
      <Text color={c.comment}>{uiGlyph('history')}</Text>
      {segmentedControl(ui, {
        key: 'range',
        options: RANGE_OPTIONS,
        selected: choices.range,
        onSelect: range => void choose($, { range }),
      })}
      {textButton(ui, 'close-console', uiGlyph('close'), c.dim, () => void toggleConsole($))}
    </Box>
  )
}

function tabBar(
  $: Engine,
  ui: Ui,
  view: {
    snapshot: Snapshot | null
    host: HostSnapshot | null
    choices: ConsoleChoices
    isWide: boolean
    worktreeCount: number
    containerCount: number | null
  },
): Tree {
  const { Box } = ui.el
  const { host } = view
  const options: ChoiceOption<ConsoleTab>[] = [
    { value: 'overview', label: 'overview', glyph: uiGlyph('gauge') },
    { value: 'agents', label: 'agents', glyph: uiGlyph('bot'), count: host?.agents.length ?? 0 },
    { value: 'ports', label: 'ports', glyph: uiGlyph('plug'), count: host?.ports.length ?? 0 },
    { value: 'worktrees', label: 'worktrees', glyph: uiGlyph('folder-git-2'), count: view.worktreeCount },
    { value: 'docker', label: 'docker', glyph: uiGlyph('container'), count: view.containerCount },
    { value: 'procs', label: 'procs', glyph: uiGlyph('activity'), count: view.snapshot?.settings.top_n ?? null },
  ]
  return (
    <Box key="tab-bar" backgroundColor={c.backgroundDark} paddingX={1}>
      {tabStrip(ui, {
        key: 'console-tabs',
        options,
        selected: view.choices.tab,
        isCompact: !view.isWide,
        onSelect: tab => void choose($, { tab }),
      })}
    </Box>
  )
}

function footerText(ui: Ui, isKeyboardOn: boolean): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key="footer" backgroundColor={c.backgroundDark} paddingX={1} columnGap={1}>
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
  if (ui.surface === 'terminal' || ui.surface === 'desktop') {
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
    sortBy: sort => void choose($, { sort }),
    filterWorktrees: filter => {
      void choose($, { filter })
      void updateShowAllWorktrees($, () => false)
    },
    showAllWorktrees: () => void updateShowAllWorktrees($, () => true),
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
    const tabBarView = {
      snapshot,
      host,
      choices,
      isWide: isWide(bodyColumns),
      worktreeCount: host ? worktreesOfHost(worktreesByHost, host).items.length : 0,
      containerCount: host ? dockerOfHost(dockerByHost, host).containers.length : null,
    }
    const body: Tree[] = [noticePanel(ui, snapshot, failure)]
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
        body.push(...(await panelsOfTab(view)))
      }
    }
    return (
      <Box flexDirection="column" backgroundColor={c.background} width="100%">
        {header($, ui, snapshot, host, choices)}
        {tabBar($, ui, tabBarView)}
        <Box key="body" flexDirection="column" paddingX={1} paddingTop={1} rowGap={1}>
          {body}
        </Box>
        {footer(ui, isKeyboardOn)}
      </Box>
    )
  })
}
