import type { EngineInterface as Engine } from 'claude-code'
import { BRAND } from './mod'
import type { MonitorHistory, SharedAlert } from './schemas'
import { readSeenAlertIds, readStartedAt, updateSeenAlertIds } from './store'

const ALERT_TOAST_MS = 8000

function alertText(alert: SharedAlert): string {
  if (alert.kind === 'port_down') {
    return `${BRAND}: :${alert.port} on ${alert.label} is down · The pinned port stopped listening.`
  }
  const top = alert.top_process || '?'
  return `${BRAND}: ${alert.label} is hot · CPU ${alert.cpu_pct ?? '?'}% · MEM ${alert.mem_pct ?? '?'}% · top: ${top}`
}

export async function toastNewAlerts($: Engine, history: MonitorHistory): Promise<void> {
  const startedAt = await readStartedAt($)
  const seenIds = new Set(await readSeenAlertIds($))
  const newAlerts = history.alerts.filter(alert => alert.at >= startedAt && !seenIds.has(alert.id))
  if (newAlerts.length === 0) return
  for (const alert of newAlerts) $.ui.toast(alertText(alert), { timeoutMs: ALERT_TOAST_MS })
  const liveIds = new Set(history.alerts.map(alert => alert.id))
  await updateSeenAlertIds($, seen => [...seen.filter(id => liveIds.has(id)), ...newAlerts.map(alert => alert.id)])
}
