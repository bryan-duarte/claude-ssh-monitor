import type { HostHealth, PercentLevel } from './schemas'

export const TOKYO_NIGHT = {
  background: '#1a1b26',
  backgroundDark: '#16161e',
  highlight: '#292e42',
  border: '#3b4261',
  terminalBlack: '#414868',
  comment: '#565f89',
  dim: '#737aa2',
  foregroundDark: '#a9b1d6',
  foreground: '#c0caf5',
  blue: '#7aa2f7',
  cyan: '#7dcfff',
  teal: '#73daca',
  green: '#9ece6a',
  yellow: '#e0af68',
  orange: '#ff9e64',
  red: '#f7768e',
  magenta: '#bb9af7',
  purple: '#9d7cd8',
} as const

export type Gradient = readonly string[]

export const GRADIENTS = {
  cpu: [TOKYO_NIGHT.green, TOKYO_NIGHT.yellow, TOKYO_NIGHT.red],
  memory: [TOKYO_NIGHT.cyan, TOKYO_NIGHT.blue, TOKYO_NIGHT.magenta],
  swap: [TOKYO_NIGHT.purple, TOKYO_NIGHT.magenta, TOKYO_NIGHT.red],
  storage: [TOKYO_NIGHT.teal, TOKYO_NIGHT.orange, TOKYO_NIGHT.red],
} as const satisfies Record<string, Gradient>

const TOOL_COLORS: Record<string, string> = {
  claude: TOKYO_NIGHT.orange,
  codex: TOKYO_NIGHT.green,
  cursor: TOKYO_NIGHT.blue,
  conductor: TOKYO_NIGHT.magenta,
  herdr: TOKYO_NIGHT.cyan,
  omp: TOKYO_NIGHT.yellow,
  'vibe-kanban': TOKYO_NIGHT.teal,
  git: TOKYO_NIGHT.dim,
}

const TOOL_ACCENTS = [
  TOKYO_NIGHT.blue,
  TOKYO_NIGHT.cyan,
  TOKYO_NIGHT.teal,
  TOKYO_NIGHT.green,
  TOKYO_NIGHT.yellow,
  TOKYO_NIGHT.orange,
  TOKYO_NIGHT.magenta,
  TOKYO_NIGHT.purple,
] as const

export function toolColor(tool: string): string {
  const ownColor = TOOL_COLORS[tool]
  if (ownColor) return ownColor
  const nameSum = [...tool].reduce((sum, character) => sum + character.charCodeAt(0), 0)
  return TOOL_ACCENTS[nameSum % TOOL_ACCENTS.length] ?? TOKYO_NIGHT.blue
}

const HEALTH_COLORS: Record<HostHealth, string> = {
  down: TOKYO_NIGHT.red,
  auth: TOKYO_NIGHT.yellow,
  pending: TOKYO_NIGHT.comment,
  critical: TOKYO_NIGHT.red,
  warning: TOKYO_NIGHT.yellow,
  normal: TOKYO_NIGHT.green,
}

export const healthColor = (health: HostHealth): string => HEALTH_COLORS[health]

export const levelColor = (level: PercentLevel, normalColor: string = TOKYO_NIGHT.foreground): string =>
  level === 'normal' ? normalColor : HEALTH_COLORS[level]

const HEX_RADIX = 16
const CHANNEL_MAX = 255
const HEX_CHANNEL_WIDTH = 2
const CHANNEL_OFFSETS = [1, 3, 5] as const
const MAX_CACHED_POSITIONS = 512

type Channels = [number, number, number]

const channelsOfStops = new WeakMap<Gradient, Channels[]>()
const colorsOfGradient = new WeakMap<Gradient, Map<number, string>>()

const channelsOf = (hexColor: string): Channels =>
  CHANNEL_OFFSETS.map(offset => parseInt(hexColor.slice(offset, offset + HEX_CHANNEL_WIDTH), HEX_RADIX)) as Channels

const clampChannel = (channel: number): number => Math.round(Math.min(CHANNEL_MAX, Math.max(0, channel)))

const hexOf = (rgb: readonly number[]): string =>
  `#${rgb.map(channel => clampChannel(channel).toString(HEX_RADIX).padStart(HEX_CHANNEL_WIDTH, '0')).join('')}`

export const rgbNumberOf = (hexColor: string): number => {
  const [red, green, blue] = channelsOf(hexColor)
  return (red << 16) | (green << 8) | blue
}

export function mixColors(baseColor: string, topColor: string, topFraction: number): string {
  const base = channelsOf(baseColor)
  const top = channelsOf(topColor)
  return hexOf(base.map((channel, index) => channel + ((top[index] ?? channel) - channel) * topFraction))
}

function stopChannels(stops: Gradient): Channels[] {
  const known = channelsOfStops.get(stops)
  if (known) return known
  const parsed = stops.map(channelsOf)
  channelsOfStops.set(stops, parsed)
  return parsed
}

function mixedColor(stops: Gradient, clampedPosition: number): string {
  const parsed = stopChannels(stops)
  const scaled = clampedPosition * (stops.length - 1)
  const lowerIndex = Math.min(Math.floor(scaled), stops.length - 2)
  const fraction = scaled - lowerIndex
  const lower = parsed[lowerIndex]
  const upper = parsed[lowerIndex + 1]
  if (!lower || !upper) return stops[0] ?? TOKYO_NIGHT.foreground
  return hexOf(lower.map((channel, index) => channel + ((upper[index] ?? channel) - channel) * fraction))
}

function cachedColorsOf(stops: Gradient): Map<number, string> {
  const known = colorsOfGradient.get(stops)
  if (known) return known
  const colors = new Map<number, string>()
  colorsOfGradient.set(stops, colors)
  return colors
}

export function gradientAt(stops: Gradient, position: number): string {
  const clampedPosition = Math.min(1, Math.max(0, position))
  const colors = cachedColorsOf(stops)
  const known = colors.get(clampedPosition)
  if (known) return known
  if (colors.size >= MAX_CACHED_POSITIONS) colors.clear()
  const color = mixedColor(stops, clampedPosition)
  colors.set(clampedPosition, color)
  return color
}
