import { backendGuidance, configProblemLine, downForText, hostFailureGuidance, hostProblemGuidance } from '../failure-guidance'
import { ageSince } from '../format'
import { isPollLate } from '../health'
import { nowInSeconds } from '../mod'
import { TOKYO_NIGHT as c } from '../palette'
import type { BackendFailure, HostSnapshot, MonitorSettings, Snapshot } from '../schemas'
import type { Tree, Ui } from './ui'
import { hostTitle, panel, panelTitle } from './widgets'

type Banner = { color: string; lines: string[] }

function lateLine(snapshot: Snapshot): string | null {
  if (!isPollLate(snapshot, nowInSeconds())) return null
  const isPreviousPollBusy = snapshot.collector.state === 'busy'
  const reason = isPreviousPollBusy ? ' The previous poll still runs: a host answers slowly.' : ' The next poll is late.'
  return `No fresh data since ${ageSince(snapshot.generated_at)}.${reason}`
}

function bannerOf(snapshot: Snapshot | null, failure: BackendFailure | null): Banner | null {
  if (failure) {
    const { summary, nextStep } = backendGuidance(failure)
    return { color: c.red, lines: [summary, ...(failure.detail ? [failure.detail] : []), `Next: ${nextStep}`] }
  }
  if (!snapshot) return { color: c.yellow, lines: ['Waiting for the first poll of your hosts.'] }
  const problemLines = snapshot.problems.map(problem => configProblemLine(problem, snapshot.settings))
  const latePollLine = lateLine(snapshot)
  const warningLines = [...(latePollLine ? [latePollLine] : []), ...problemLines]
  if (snapshot.hosts.length === 0) {
    return { color: c.dim, lines: [`No hosts. Add "label  ssh-target" lines to ${snapshot.hosts_file}`, ...warningLines] }
  }
  return warningLines.length > 0 ? { color: c.yellow, lines: warningLines } : null
}

export function noticePanel(ui: Ui, snapshot: Snapshot | null, failure: BackendFailure | null): Tree {
  const banner = bannerOf(snapshot, failure)
  if (!banner) return null
  const { Text } = ui.el
  return panel(ui, {
    key: 'notice',
    title: panelTitle(ui, 'triangle-alert', 'notice', banner.color),
    borderColor: banner.color,
    children: banner.lines.map(line => <Text color={banner.color}>{line}</Text>),
  })
}

export function unreachablePanel(ui: Ui, host: HostSnapshot, hostNumber: number, settings: MonitorSettings): Tree {
  const { Text } = ui.el
  const isLoginRefused = host.state === 'auth'
  const color = isLoginRefused ? c.yellow : c.red
  const { summary, nextStep } = hostFailureGuidance(host, settings)
  return panel(ui, {
    key: `state-${host.label}`,
    title: hostTitle(ui, host.label, hostNumber, color),
    rightTitle: <Text color={color}>{`${isLoginRefused ? 'login needed' : 'down'}${downForText(host)}`}</Text>,
    borderColor: color,
    children: [
      <Text color={color}>{`✕ ${summary}`}</Text>,
      host.detail ? <Text color={c.comment}>{`ssh: ${host.detail}`}</Text> : null,
      <Text color={c.foregroundDark}>{`Next: ${nextStep}`}</Text>,
      <Text color={c.comment}>{`Values below are from ${ageSince(host.updated_at)}.`}</Text>,
    ],
  })
}

export function hostNotesPanel(ui: Ui, host: HostSnapshot): Tree {
  const { Text } = ui.el
  const lines = host.problems.map(hostProblemGuidance).map(({ summary, nextStep }) => `${summary} ${nextStep}`)
  return panel(ui, {
    key: `notes-${host.label}`,
    title: panelTitle(ui, 'triangle-alert', 'host notes', c.yellow),
    borderColor: c.yellow,
    children: lines.map(line => <Text color={c.yellow}>{line}</Text>),
  })
}

export function waitingPanel(ui: Ui, host: HostSnapshot, hostNumber: number): Tree {
  const { Text } = ui.el
  return panel(ui, {
    key: `state-${host.label}`,
    title: hostTitle(ui, host.label, hostNumber, c.blue),
    children: [<Text color={c.comment}>… waiting for the first poll</Text>],
  })
}
