import type { EngineInterface as Engine } from 'claude-code'
import { runAction, runActionCommand } from './action-run'
import { BRAND } from './mod'
import type { HostSnapshot, PortNotes, Tunnel } from './schemas'
import { isFiniteNumber, isRecord } from './schemas'
import { readTunnels, updatePortNotes, updateTunnels } from './store'

export const OPENING_TUNNEL_NOTE = 'Opening a tunnel…'
const MAC_KERNEL = 'Darwin'
const URL_OPENER_TIMEOUT_MS = 5000

let urlOpener: string | null = null

export const portNoteKey = (label: string, port: number): string => `${label}:${port}`

export const tunnelOfPort = (tunnels: Tunnel[], label: string, remotePort: number): Tunnel | null =>
  tunnels.find(tunnel => tunnel.label === label && tunnel.remotePort === remotePort && tunnel.state === 'running') ?? null

const localUrl = (localPort: number): string => `http://127.0.0.1:${localPort}`

function tunnelOrNull(candidate: unknown): Tunnel | null {
  if (!isRecord(candidate)) return null
  const isTunnel =
    typeof candidate.label === 'string' &&
    isFiniteNumber(candidate.remotePort) &&
    isFiniteNumber(candidate.localPort) &&
    (candidate.state === 'running' || candidate.state === 'exited')
  return isTunnel ? (candidate as Tunnel) : null
}

export async function refreshTunnels($: Engine): Promise<void> {
  const listed = await runActionCommand($, ['tunnel-list'])
  if (!listed.ok) return
  const rows = Array.isArray(listed.data.tunnels) ? listed.data.tunnels : []
  const tunnels = rows.map(tunnelOrNull).filter((tunnel): tunnel is Tunnel => tunnel !== null)
  const current = await readTunnels($)
  if (JSON.stringify(current) !== JSON.stringify(tunnels)) await updateTunnels($, () => tunnels)
}

async function setPortNote($: Engine, key: string, note: string | null): Promise<void> {
  await updatePortNotes($, notes => {
    const { [key]: _previous, ...otherNotes }: PortNotes = notes
    return note === null ? otherNotes : { ...otherNotes, [key]: note }
  })
}

async function openerOf($: Engine): Promise<string> {
  if (urlOpener) return urlOpener
  const kernel = await $.process.run(['uname', '-s'], { timeoutMs: URL_OPENER_TIMEOUT_MS })
  urlOpener = kernel.stdout.trim() === MAC_KERNEL ? 'open' : 'xdg-open'
  return urlOpener
}

async function openUrl($: Engine, url: string): Promise<void> {
  const opened = await openerOf($)
    .then(opener => $.process.run([opener, url], { timeoutMs: URL_OPENER_TIMEOUT_MS }))
    .catch(() => null)
  if (opened?.exitCode !== 0) $.ui.toast(`${BRAND}: The tunnel is open at ${url}`)
}

export async function openPort($: Engine, host: HostSnapshot, port: number): Promise<void> {
  const key = portNoteKey(host.label, port)
  const tunnel = tunnelOfPort(await readTunnels($), host.label, port)
  if (tunnel) return openUrl($, localUrl(tunnel.localPort))
  await setPortNote($, key, OPENING_TUNNEL_NOTE)
  const started = await runAction($, 'tunnel-open', host.label, [String(port)])
  if (!started.ok) return setPortNote($, key, started.message)
  await setPortNote($, key, null)
  await refreshTunnels($)
  const localPort = Number(started.data.local_port)
  if (Number.isInteger(localPort) && localPort > 0) await openUrl($, localUrl(localPort))
}

export async function stopTunnel($: Engine, host: HostSnapshot, port: number): Promise<void> {
  const stopped = await runAction($, 'tunnel-stop', host.label, [String(port)])
  await setPortNote($, portNoteKey(host.label, port), stopped.ok ? null : stopped.message)
  await refreshTunnels($)
}

export async function togglePin($: Engine, host: HostSnapshot, port: number, isPinned: boolean): Promise<void> {
  const pinResult = await runAction($, isPinned ? 'unpin' : 'pin', host.label, [String(port)])
  await setPortNote($, portNoteKey(host.label, port), pinResult.ok ? null : pinResult.message)
}
