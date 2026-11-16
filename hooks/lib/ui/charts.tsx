import { TOKYO_NIGHT as c, GRADIENTS, type Gradient, gradientAt, mixColors, rgbNumberOf } from '../palette'
import type { ChartMarker, HostEventKind, Sample } from '../schemas'
import { BrailleCanvas } from './braille'
import type { Tree, Ui } from './ui'

const PERCENT_SCALE = 100
export const MAX_RASTER_COLUMNS = 512
const GRID_LINE_PERCENTS = [25, 50, 75] as const
const AREA_OPACITY = 0.16
const MARKER_OPACITY = 0.55
const LINE_WIDTH_PX = 1.3
const SVG_CELL_WIDTH_PX = 7
const SVG_CELL_HEIGHT_PX = 10
const SVG_MARKER_HEAD_PX = 4
const SVG_END_DOT_RADIUS_PX = 2
const DASHED_DOT_STEP = 2
const GRID_GLYPH = '┈'
const MARKER_GLYPH = '┊'
const MARKER_HEAD_GLYPH = '●'
const END_DOT_GLYPH = '●'
const SPARK_GLYPHS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const

const MARKER_COLORS: Record<HostEventKind, string> = { start: c.blue, done: c.green, alert: c.red }

type HistoryChartProps = {
  key: string
  samples: Sample[]
  dashed?: Sample[]
  gradient: Gradient
  markers: ChartMarker[]
  columns: number
  rows: number
  alt: string
}

type SparklineProps = {
  key: string
  samples: Sample[]
  color: string
  columns: number
  maximum?: number
}

type Point = { x: number; y: number; value: number }

const isSample = (sample: Sample | undefined): sample is number => typeof sample === 'number' && Number.isFinite(sample)

const usableMaximum = (maximum: number | undefined): number =>
  maximum !== undefined && Number.isFinite(maximum) && maximum > 0 ? maximum : PERCENT_SCALE

const clampedRatio = (value: number, maximum: number): number => Math.min(Math.max(value, 0), maximum) / maximum

function pointsOf(samples: Sample[], width: number, height: number, maximum: number): (Point | null)[] {
  const lastIndex = Math.max(1, samples.length - 1)
  return samples.map((sample, index) => {
    if (!isSample(sample)) return null
    return {
      x: Math.round((index / lastIndex) * (width - 1)),
      y: Math.round((1 - clampedRatio(sample, maximum)) * (height - 1)),
      value: sample,
    }
  })
}

function lastPointOf(points: (Point | null)[]): Point | null {
  for (let index = points.length - 1; index >= 0; index--) {
    const point = points[index]
    if (point) return point
  }
  return null
}

function plotSeries(canvas: BrailleCanvas, points: (Point | null)[], colorOf: (value: number) => string, hasArea: boolean): void {
  points.forEach((point, index) => {
    if (!point) return
    const lineColor = rgbNumberOf(colorOf(point.value))
    if (hasArea) canvas.fillBelow(point.x, point.y, rgbNumberOf(mixColors(c.backgroundDark, colorOf(point.value), AREA_OPACITY)))
    const previous = index > 0 ? points[index - 1] : null
    if (previous) canvas.line(previous.x, previous.y, point.x, point.y, () => lineColor)
    else canvas.dot(point.x, point.y, lineColor)
  })
}

function plotDashed(canvas: BrailleCanvas, points: (Point | null)[], color: string): void {
  const dashColor = rgbNumberOf(color)
  points.forEach((point, index) => {
    if (point && index % DASHED_DOT_STEP === 0) canvas.dot(point.x, point.y, dashColor)
  })
}

function drawGrid(canvas: BrailleCanvas): void {
  const gridColor = rgbNumberOf(c.highlight)
  for (const percent of GRID_LINE_PERCENTS) {
    const row = Math.round((percent / PERCENT_SCALE) * canvas.rows)
    if (row <= 0 || row >= canvas.rows) continue
    for (let column = 0; column < canvas.columns; column++) {
      if (canvas.isEmpty(column, row)) canvas.glyph(column, row, GRID_GLYPH, gridColor)
    }
  }
}

function drawMarkers(canvas: BrailleCanvas, markers: ChartMarker[]): void {
  for (const marker of markers) {
    const column = Math.round(marker.position * (canvas.columns - 1))
    const color = MARKER_COLORS[marker.kind]
    const stemColor = rgbNumberOf(mixColors(c.backgroundDark, color, MARKER_OPACITY))
    for (let row = 1; row < canvas.rows; row++) {
      if (canvas.isEmpty(column, row)) canvas.glyph(column, row, MARKER_GLYPH, stemColor)
    }
    canvas.glyph(column, 0, MARKER_HEAD_GLYPH, rgbNumberOf(color))
  }
}

export function brailleHistory(props: HistoryChartProps): BrailleCanvas {
  const canvas = new BrailleCanvas(props.columns, props.rows, rgbNumberOf(c.backgroundDark))
  const colorOf = (value: number): string => gradientAt(props.gradient, value / PERCENT_SCALE)
  const points = pointsOf(props.samples, canvas.dotColumns, canvas.dotRows, PERCENT_SCALE)
  plotSeries(canvas, points, colorOf, true)
  if (props.dashed)
    plotDashed(canvas, pointsOf(props.dashed, canvas.dotColumns, canvas.dotRows, PERCENT_SCALE), GRADIENTS.swap[0])
  drawGrid(canvas)
  drawMarkers(canvas, props.markers)
  const lastPoint = lastPointOf(points)
  if (lastPoint) {
    canvas.glyph(Math.floor(lastPoint.x / 2), Math.floor(lastPoint.y / 4), END_DOT_GLYPH, rgbNumberOf(colorOf(lastPoint.value)))
  }
  return canvas
}

function unbrokenRuns(points: (Point | null)[]): Point[][] {
  const runs: Point[][] = []
  let currentRun: Point[] = []
  for (const point of points) {
    if (point) {
      currentRun.push(point)
      continue
    }
    if (currentRun.length > 0) runs.push(currentRun)
    currentRun = []
  }
  if (currentRun.length > 0) runs.push(currentRun)
  return runs
}

const pathOf = (run: Point[]): string => run.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x} ${point.y}`).join(' ')

function svgGradient(id: string, gradient: Gradient, height: number): string {
  const lastStop = Math.max(1, gradient.length - 1)
  const stops = gradient.map((color, index) => `<stop offset="${index / lastStop}" stop-color="${color}"/>`).join('')
  return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="0" y1="${height}" x2="0" y2="0">${stops}</linearGradient>`
}

export function svgHistory(props: HistoryChartProps): { source: string; width: number; height: number } {
  const width = props.columns * SVG_CELL_WIDTH_PX
  const height = props.rows * SVG_CELL_HEIGHT_PX
  const points = pointsOf(props.samples, width, height, PERCENT_SCALE)
  const runs = unbrokenRuns(points).filter(run => run.length > 1)
  const gradientId = `${props.key}-line`
  const areas = runs.map(run => {
    const first = run[0] ?? { x: 0 }
    const last = run[run.length - 1] ?? first
    return `<path d="${pathOf(run)} L${last.x} ${height} L${first.x} ${height} Z" fill="url(#${gradientId})" opacity="${AREA_OPACITY}"/>`
  })
  const lines = runs.map(
    run =>
      `<path d="${pathOf(run)}" fill="none" stroke="url(#${gradientId})" stroke-width="${LINE_WIDTH_PX}" stroke-linejoin="round"/>`,
  )
  const dashedRuns = props.dashed ? unbrokenRuns(pointsOf(props.dashed, width, height, PERCENT_SCALE)) : []
  const dashes = dashedRuns.map(
    run => `<path d="${pathOf(run)}" fill="none" stroke="${GRADIENTS.swap[0]}" stroke-width="1" stroke-dasharray="2 2"/>`,
  )
  const grid = GRID_LINE_PERCENTS.map(percent => {
    const y = (percent / PERCENT_SCALE) * height
    return `<line x1="0" y1="${y}" x2="${width}" y2="${y}" stroke="${c.highlight}" stroke-width="1"/>`
  })
  const markers = props.markers.map(marker => {
    const x = marker.position * (width - 1)
    const color = MARKER_COLORS[marker.kind]
    const head = `<rect x="${x - SVG_MARKER_HEAD_PX / 2}" y="0" width="${SVG_MARKER_HEAD_PX}" height="${SVG_MARKER_HEAD_PX}" rx="1" fill="${color}"/>`
    return `<line x1="${x}" y1="0" x2="${x}" y2="${height}" stroke="${color}" stroke-dasharray="1 2" opacity="${MARKER_OPACITY}"/>${head}`
  })
  const lastPoint = lastPointOf(points)
  const endDot = lastPoint
    ? `<circle cx="${lastPoint.x}" cy="${lastPoint.y}" r="${SVG_END_DOT_RADIUS_PX}" fill="${gradientAt(props.gradient, lastPoint.value / PERCENT_SCALE)}"/>`
    : ''
  const source = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<defs>${svgGradient(gradientId, props.gradient, height)}</defs>`,
    `<rect width="${width}" height="${height}" rx="3" fill="${c.backgroundDark}"/>`,
    ...grid,
    ...areas,
    ...lines,
    ...dashes,
    ...markers,
    endDot,
    '</svg>',
  ].join('')
  return { source, width, height }
}

function sparkText(samples: Sample[], columns: number, maximum?: number): string {
  const scaleMaximum = usableMaximum(maximum)
  return samples
    .slice(-columns)
    .map(sample => {
      if (!isSample(sample)) return ' '
      const index = Math.min(SPARK_GLYPHS.length - 1, Math.floor(clampedRatio(sample, scaleMaximum) * SPARK_GLYPHS.length))
      return SPARK_GLYPHS[index]
    })
    .join('')
}

export function historyChart(ui: Ui, props: HistoryChartProps): Tree {
  if (ui.surface === 'terminal') {
    const { Raster } = ui.el
    return <Raster key={props.key} columns={props.columns} rows={props.rows} cells={brailleHistory(props).pack()} />
  }
  if (ui.surface === 'desktop') {
    const { Svg } = ui.el
    const chart = svgHistory(props)
    return <Svg source={chart.source} alt={props.alt} width={chart.width} height={chart.height} />
  }
  const { Text } = ui.el
  const lastSample = [...props.samples].reverse().find(isSample)
  const color = lastSample === undefined ? c.comment : gradientAt(props.gradient, lastSample / PERCENT_SCALE)
  return <Text color={color}>{sparkText(props.samples, props.columns)}</Text>
}

export function sparkline(ui: Ui, props: SparklineProps): Tree {
  const maximum = usableMaximum(props.maximum)
  if (ui.surface === 'terminal') {
    const { Raster } = ui.el
    const canvas = new BrailleCanvas(props.columns, 1)
    const points = pointsOf(props.samples, canvas.dotColumns, canvas.dotRows, maximum)
    plotSeries(canvas, points, () => props.color, false)
    return <Raster key={props.key} columns={props.columns} rows={1} cells={canvas.pack()} />
  }
  const { Text } = ui.el
  return <Text color={props.color}>{sparkText(props.samples, props.columns, maximum)}</Text>
}
