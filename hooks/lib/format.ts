import { nowInSeconds } from './mod'

const SECONDS_PER_MINUTE = 60
const SECONDS_PER_HOUR = 3600
const SECONDS_PER_DAY = 86400
const KIB_PER_MIB = 1024
const KIB_PER_GIB = 1048576
const KIB_PER_TIB = 1073741824
const MIB_PER_GIB = 1024
const BYTES_PER_KIB = 1024
const BYTES_PER_MIB = 1048576
const BYTES_PER_GIB = 1073741824
const RATE_DECIMALS_BELOW = 100

const isKnown = (candidate: number | null | undefined): candidate is number =>
  typeof candidate === 'number' && Number.isFinite(candidate)

export const minutesText = (seconds: number): string => `${seconds / SECONDS_PER_MINUTE}m`

export function age(seconds: number): string {
  if (seconds < SECONDS_PER_MINUTE) return `${Math.round(seconds)}s`
  if (seconds < SECONDS_PER_HOUR) return `${Math.floor(seconds / SECONDS_PER_MINUTE)}m`
  if (seconds < SECONDS_PER_DAY) return `${Math.floor(seconds / SECONDS_PER_HOUR)}h`
  return `${Math.floor(seconds / SECONDS_PER_DAY)}d`
}

export const ageOrUnknown = (seconds: number | null): string => (isKnown(seconds) ? age(seconds) : '?')

export const ageSince = (epochSeconds: number | null, now: number = nowInSeconds()): string =>
  isKnown(epochSeconds) ? `${age(Math.max(0, now - epochSeconds))} ago` : 'never'

export function daysSince(epochSeconds: number | null, now: number = nowInSeconds()): number | null {
  const hasTime = isKnown(epochSeconds) && epochSeconds > 0
  return hasTime ? Math.floor((now - epochSeconds) / SECONDS_PER_DAY) : null
}

export function storageSize(kib: number | null): string {
  if (!isKnown(kib)) return '?'
  if (kib >= KIB_PER_TIB) return `${(kib / KIB_PER_TIB).toFixed(1)} TiB`
  if (kib >= KIB_PER_GIB) return `${(kib / KIB_PER_GIB).toFixed(1)} GiB`
  return `${Math.round(kib / KIB_PER_MIB)} MiB`
}

export function compactSize(kib: number | null): string {
  if (!isKnown(kib)) return '?'
  if (kib >= KIB_PER_TIB) return `${(kib / KIB_PER_TIB).toFixed(1)}T`
  if (kib >= KIB_PER_GIB) return `${(kib / KIB_PER_GIB).toFixed(1)}G`
  return `${Math.round(kib / KIB_PER_MIB)}M`
}

export const kibAsGib = (kib: number | null): string => (isKnown(kib) ? (kib / KIB_PER_GIB).toFixed(1) : '?')

export const mibAsGib = (mib: number | null): string => ((mib ?? 0) / MIB_PER_GIB).toFixed(1)

export function byteRate(bytesPerSecond: number | null): string {
  if (!isKnown(bytesPerSecond)) return '?'
  if (bytesPerSecond >= BYTES_PER_GIB) return `${(bytesPerSecond / BYTES_PER_GIB).toFixed(1)} GB/s`
  if (bytesPerSecond >= BYTES_PER_MIB) {
    const megabytes = bytesPerSecond / BYTES_PER_MIB
    return `${megabytes < RATE_DECIMALS_BELOW ? megabytes.toFixed(1) : Math.round(megabytes)} MB/s`
  }
  return `${Math.round(bytesPerSecond / BYTES_PER_KIB)} KB/s`
}

export const percentText = (percent: number | null): string => (isKnown(percent) ? `${Math.round(percent)}%` : '?')

export const hostNameOfTarget = (sshTarget: string): string =>
  sshTarget
    .replace(/^ssh:\/\//, '')
    .replace(/^[^@]*@/, '')
    .replace(/:\d+$/, '')

export function homeRelative(path: string, home: string): string {
  if (!path) return ''
  const isInHome = Boolean(home) && (path === home || path.startsWith(`${home}/`))
  return isInHome ? `~${path.slice(home.length)}` : path
}
