import { ageSince } from './format'
import { nowInSeconds } from './mod'
import type { HostHealth, HostSnapshot, MonitorSettings, PercentLevel, Snapshot } from './schemas'

const SECONDS_PER_MINUTE = 60

export function percentLevel(percent: number | null, settings: MonitorSettings): PercentLevel {
  if (percent === null || !Number.isFinite(percent)) return 'normal'
  if (percent >= settings.crit) return 'critical'
  if (percent >= settings.warn) return 'warning'
  return 'normal'
}

export function hostHealth(host: HostSnapshot, settings: MonitorSettings): HostHealth {
  if (host.state !== 'ok') return host.state
  const busierPercent = Math.max(host.cpu_pct ?? 0, host.mem_pct ?? 0)
  return percentLevel(busierPercent, settings)
}

export function isStale(host: HostSnapshot, settings: MonitorSettings, now: number = nowInSeconds()): boolean {
  if (host.updated_at === null || !Number.isFinite(host.updated_at)) return true
  return now - host.updated_at > settings.stale_seconds
}

export const isPollLate = (snapshot: Snapshot, now: number): boolean =>
  now - snapshot.generated_at > snapshot.settings.stale_seconds

export function clockKey(snapshot: Snapshot | null, now: number): string {
  const minute = Math.floor(now / SECONDS_PER_MINUTE)
  if (!snapshot) return `none:${minute}`
  const staleHostCount = snapshot.hosts.filter(host => isStale(host, snapshot.settings, now)).length
  const lateAge = isPollLate(snapshot, now) ? ageSince(snapshot.generated_at, now) : 'on time'
  return `${lateAge}:${staleHostCount}:${minute}`
}
