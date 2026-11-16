import type {
  ChartMarker,
  ChartRange,
  HostAlert,
  HostEvent,
  HostSeries,
  HostSnapshot,
  MonitorHistory,
  Sample,
  SharedAlert,
  Snapshot,
} from './schemas'
import { isRecord } from './schemas'

export const SECONDS_PER_SAMPLE = 5
export const CHART_RANGE_SAMPLES: readonly ChartRange[] = [24, 60, 120]
const HISTORY_SAMPLES = 120
const HISTORY_SECONDS = HISTORY_SAMPLES * SECONDS_PER_SAMPLE
const MAX_MISSED_SAMPLES_WITHOUT_GAP = 2
export const AGENT_HISTORY_SAMPLES = 30
const EVENT_WINDOW_SECONDS = 600
const MAX_EVENTS_PER_HOST = 40
const HISTORY_PARTS = ['hosts', 'agents', 'events', 'pids'] as const

export const emptyHistory = (): MonitorHistory => ({ hosts: {}, agents: {}, events: {}, pids: {}, alerts: [] })

export function historyOrNull(stored: unknown): MonitorHistory | null {
  if (!isRecord(stored)) return null
  const hasEveryPart = HISTORY_PARTS.every(part => isRecord(stored[part]))
  if (!hasEveryPart) return null
  const alerts = Array.isArray(stored.alerts) ? (stored.alerts as SharedAlert[]) : []
  return { ...(stored as MonitorHistory), alerts }
}

export const agentKey = (label: string, pid: number | null): string => `${label}:${pid}`

const appendLimited = <T>(list: readonly T[] | undefined, samples: readonly T[], limit: number): T[] =>
  [...(list ?? []), ...samples].slice(-limit)

function missedSampleTimes(previous: HostSeries | undefined, now: number): number[] {
  const lastAt = previous?.at[previous.at.length - 1]
  if (lastAt === undefined) return []
  const missedCount = Math.round((now - lastAt) / SECONDS_PER_SAMPLE) - 1
  if (missedCount <= MAX_MISSED_SAMPLES_WITHOUT_GAP) return []
  return Array.from({ length: missedCount }, (_unused, index) => lastAt + (index + 1) * SECONDS_PER_SAMPLE)
}

const appendReading = (series: Sample[] | undefined, gap: Sample[], reading: number | null): Sample[] =>
  appendLimited(series, [...gap, reading], HISTORY_SAMPLES)

function nextSeries(host: HostSnapshot, previous: HostSeries | undefined, now: number): HostSeries {
  const missedTimes = missedSampleTimes(previous, now)
  const gap: Sample[] = missedTimes.map(() => null)
  const isReachable = host.state === 'ok'
  return {
    at: appendLimited(previous?.at, [...missedTimes, now], HISTORY_SAMPLES),
    cpu: appendReading(previous?.cpu, gap, isReachable ? host.cpu_pct : null),
    mem: appendReading(previous?.mem, gap, isReachable ? host.mem_pct : null),
    swap: appendReading(previous?.swap, gap, isReachable ? host.swap_pct : null),
    rx: appendReading(previous?.rx, gap, isReachable ? host.net_rx_rate : null),
    tx: appendReading(previous?.tx, gap, isReachable ? host.net_tx_rate : null),
  }
}

function agentEvents(host: HostSnapshot, previousPids: (number | null)[] | undefined, now: number): HostEvent[] {
  if (!previousPids || host.state !== 'ok') return []
  const currentPids = host.agents.map(agent => agent.pid)
  const started: HostEvent[] = host.agents
    .filter(agent => !previousPids.includes(agent.pid))
    .map(agent => ({ at: now, kind: 'start', text: `${agent.app} started in ${agent.repository || agent.cwd}` }))
  const ended: HostEvent[] = previousPids
    .filter(pid => !currentPids.includes(pid))
    .map(pid => ({ at: now, kind: 'done', text: `agent ${pid} ended` }))
  return [...started, ...ended]
}

function alertEvents(snapshot: Snapshot, label: string, now: number): HostEvent[] {
  return snapshot.alerts
    .filter(alert => alert.label === label)
    .map(alert => ({
      at: now,
      kind: 'alert',
      text: `${label} at CPU ${alert.cpu_pct ?? '?'}% · MEM ${alert.mem_pct ?? '?'}%`,
    }))
}

const recentEvents = (events: HostEvent[], now: number): HostEvent[] =>
  events.filter(event => now - event.at <= EVENT_WINDOW_SECONDS).slice(-MAX_EVENTS_PER_HOST)

const alertId = (generatedAt: number, alert: HostAlert): string =>
  `${generatedAt}:${alert.kind}:${alert.label}:${alert.port ?? ''}`

function recentAlerts(previous: SharedAlert[], snapshot: Snapshot, now: number): SharedAlert[] {
  const fresh = snapshot.alerts.map(alert => ({ ...alert, id: alertId(snapshot.generated_at, alert), at: now }))
  const knownIds = new Set(previous.map(alert => alert.id))
  const added = fresh.filter(alert => !knownIds.has(alert.id))
  return [...previous, ...added].filter(alert => now - alert.at <= EVENT_WINDOW_SECONDS)
}

function isSeriesStale(series: HostSeries | undefined, now: number): boolean {
  const lastAt = series?.at[series.at.length - 1]
  return lastAt !== undefined && now - lastAt > HISTORY_SECONDS
}

export function nextHistory(previous: MonitorHistory, snapshot: Snapshot, now: number): MonitorHistory {
  const history = emptyHistory()
  for (const host of snapshot.hosts) {
    const { label } = host
    const isStale = isSeriesStale(previous.hosts[label], now)
    const previousSeries = isStale ? undefined : previous.hosts[label]
    const previousPids = isStale ? undefined : previous.pids[label]
    history.hosts[label] = nextSeries(host, previousSeries, now)
    const events = [
      ...(previous.events[label] ?? []),
      ...agentEvents(host, previousPids, now),
      ...alertEvents(snapshot, label, now),
    ]
    history.events[label] = recentEvents(events, now)
    history.pids[label] = host.state === 'ok' ? host.agents.map(agent => agent.pid) : (previousPids ?? [])
    for (const agent of host.agents) {
      const key = agentKey(label, agent.pid)
      const previousCpu = isStale ? undefined : previous.agents[key]
      history.agents[key] = appendLimited(previousCpu, [agent.cpu], AGENT_HISTORY_SAMPLES)
    }
  }
  history.alerts = recentAlerts(previous.alerts, snapshot, now)
  return history
}

export function samplesInRange(samples: readonly Sample[] | undefined, rangeSamples: number): Sample[] {
  const recent = (samples ?? []).slice(-rangeSamples)
  const missingCount = Math.max(0, rangeSamples - recent.length)
  return [...Array<Sample>(missingCount).fill(null), ...recent]
}

export function eventMarkers(history: MonitorHistory, label: string, rangeSamples: number): ChartMarker[] {
  const times = (history.hosts[label]?.at ?? []).slice(-rangeSamples)
  const start = times[0]
  const end = times[times.length - 1]
  if (times.length < 2 || start === undefined || end === undefined || end === start) return []
  const missingCount = rangeSamples - times.length
  const lastIndex = rangeSamples - 1
  return (history.events[label] ?? [])
    .filter(event => event.at >= start && event.at <= end)
    .map(event => {
      const sampleIndex = missingCount + ((event.at - start) / (end - start)) * (times.length - 1)
      return { position: sampleIndex / lastIndex, kind: event.kind, text: event.text }
    })
}
