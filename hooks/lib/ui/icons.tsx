import type { EngineInterface as Engine } from 'claude-code'
import { AGENT_MARKS, type Mark, markOf } from '../agent-marks'
import { TOKYO_NIGHT as c, toolColor } from '../palette'
import { allProgramMarks, programMarkOf } from '../program-marks'
import type { Tree, Ui } from './ui'

const MARK_COLUMNS = 2
const MARK_ROWS = 1
const DESKTOP_MARK_PX = 14
const DEFAULT_MARK_SVG = 'assets/agents/default.svg'

const svgTextOf = new Map<string, string>()

async function readSvg($: Engine, relativePath: string): Promise<void> {
  try {
    svgTextOf.set(relativePath, await $.fs.read(`${$.plugin.root}/${relativePath}`))
  } catch {
    svgTextOf.delete(relativePath)
  }
}

export async function loadIcons($: Engine): Promise<void> {
  const markFiles = [...Object.values(AGENT_MARKS), ...allProgramMarks()]
    .map(mark => mark.svg)
    .filter((file): file is string => file !== null)
  await Promise.all([...new Set([...markFiles, DEFAULT_MARK_SVG])].map(file => readSvg($, file)))
}

function tintedSvg(source: string, color: string): string {
  const withoutOwnFill = source.replace(/<svg([^>]*?) fill="[^"]*"/, '<svg$1')
  return withoutOwnFill.replace(/currentColor/g, color).replace(/<svg /, `<svg fill="${color}" `)
}

function markIcon(ui: Ui, key: string, mark: Mark, tintColor: string, glyphColor: string): Tree {
  if (ui.surface === 'terminal' && mark.png && !mark.isDefault) {
    const { Image } = ui.el
    return (
      <Image
        key={key}
        source={{ file: `${ui.root}/${mark.png}`, format: 'png' }}
        columns={MARK_COLUMNS}
        rows={MARK_ROWS}
        alt={mark.glyph}
      />
    )
  }
  const svgSource = mark.svg ? svgTextOf.get(mark.svg) : undefined
  if (ui.surface === 'desktop' && svgSource) {
    const { Svg } = ui.el
    const source = mark.tint ? tintedSvg(svgSource, tintColor) : svgSource
    return <Svg source={source} alt={mark.name} width={DESKTOP_MARK_PX} height={DESKTOP_MARK_PX} />
  }
  const { Text } = ui.el
  return <Text color={glyphColor}>{mark.glyph.padEnd(MARK_COLUMNS)}</Text>
}

export function agentIcon(ui: Ui, key: string, agentName: string): Tree {
  const mark = markOf(agentName)
  const sheepColor = toolColor(agentName)
  return markIcon(ui, key, mark, mark.isDefault ? sheepColor : c.foreground, mark.isDefault ? sheepColor : mark.color)
}

export function agentLabel(ui: Ui, key: string, agentName: string, showName: boolean): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key={key} columnGap={1} overflow="hidden">
      {agentIcon(ui, `${key}-mark`, agentName)}
      {showName ? (
        <Text color={c.foreground} wrap="truncate-end">
          {agentName}
        </Text>
      ) : null}
    </Box>
  )
}

export function programLabel(ui: Ui, key: string, processName: string, color: string): Tree {
  const { Box, Text } = ui.el
  const mark = programMarkOf(processName)
  return (
    <Box key={key} columnGap={1} overflow="hidden">
      {mark ? markIcon(ui, `${key}-mark`, mark, c.foreground, mark.color) : null}
      <Text color={color} wrap="truncate-end">
        {processName}
      </Text>
    </Box>
  )
}
