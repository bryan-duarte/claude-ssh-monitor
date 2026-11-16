import { TOKYO_NIGHT as c, type Gradient, gradientAt } from '../palette'
import type { Tree, Ui } from './ui'

const PERCENT_SCALE = 100
const FILLED_CELL = '▮'
const EMPTY_CELL = '▯'
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const
export const ROW_LABEL_COLUMNS = 8
export const AGENT_MARKER = '●'
export const SEPARATOR = '│'

const UI_GLYPHS = {
  gauge: '◔',
  bot: '◉',
  plug: '⏚',
  'folder-git-2': '⎇',
  container: '⬡',
  activity: '∿',
  cpu: '▣',
  'memory-stick': '▤',
  'hard-drive': '▭',
  'arrow-down-up': '⇅',
  'git-branch': '⎇',
  microchip: '▦',
  server: '▣',
  history: '↺',
  pin: '⊙',
  'external-link': '↗',
  square: '■',
  'trash-2': '⌫',
  'square-x': '⊠',
  'triangle-alert': '⚠',
  keyboard: '⌨',
  archive: '▤',
  layers: '≡',
  'git-merge': '⑂',
  'file-diff': '±',
  'arrow-down-to-line': '⤓',
  'arrow-down-wide-narrow': '⇣',
  check: '✓',
  close: '✕',
} as const

export type UiGlyphName = keyof typeof UI_GLYPHS

export const uiGlyph = (name: UiGlyphName): string => UI_GLYPHS[name]

const superscript = (number: number): string =>
  String(number)
    .split('')
    .map(digit => SUPERSCRIPT_DIGITS[Number(digit)] ?? '')
    .join('')

function filledCellCount(percent: number | null, cellCount: number): number {
  const hasLoad = percent !== null && Number.isFinite(percent) && percent > 0
  if (!hasLoad) return 0
  return Math.max(1, Math.round((Math.min(percent, PERCENT_SCALE) / PERCENT_SCALE) * cellCount))
}

export function meter(ui: Ui, key: string, percent: number | null, cellCount: number, gradient: Gradient): Tree {
  const { Text } = ui.el
  const filledCells = filledCellCount(percent, cellCount)
  const lastCellIndex = Math.max(1, cellCount - 1)
  const cells = Array.from({ length: cellCount }, (_unused, index) => {
    const isFilled = index < filledCells
    return (
      <Text color={isFilled ? gradientAt(gradient, index / lastCellIndex) : c.highlight}>
        {isFilled ? FILLED_CELL : EMPTY_CELL}
      </Text>
    )
  })
  const { Box } = ui.el
  return (
    <Box key={key} flexShrink={0}>
      {cells}
    </Box>
  )
}

export function coreBlocks(ui: Ui, key: string, cores: (number | null)[], gradient: Gradient): Tree {
  const { Box, Text } = ui.el
  const blocks = cores.map(percent => {
    const hasValue = percent !== null && Number.isFinite(percent)
    return (
      <Text color={hasValue ? gradientAt(gradient, percent / PERCENT_SCALE) : c.highlight}>
        {hasValue ? FILLED_CELL : EMPTY_CELL}
      </Text>
    )
  })
  return (
    <Box key={key} flexWrap="wrap">
      {blocks}
    </Box>
  )
}

type PanelProps = {
  key: string
  title: Tree
  rightTitle?: Tree
  borderColor?: string
  children: Tree[]
}

export function panel(ui: Ui, props: PanelProps): Tree {
  const { Box, Text } = ui.el
  const borderColor = props.borderColor ?? c.border
  return (
    <Box key={props.key} flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1} rowGap={0}>
      <Box position="absolute" top={-1} left={1}>
        <Text> </Text>
        {props.title}
        <Text> </Text>
      </Box>
      {props.rightTitle ? (
        <Box position="absolute" top={-1} right={1}>
          <Text> </Text>
          {props.rightTitle}
          <Text> </Text>
        </Box>
      ) : null}
      {props.children}
    </Box>
  )
}

export function panelTitle(ui: Ui, glyph: UiGlyphName, label: string, color: string): Tree {
  const { Text } = ui.el
  return <Text color={color} bold>{`${uiGlyph(glyph)} ${label}`}</Text>
}

export function hostTitle(ui: Ui, label: string, number: number, color: string): Tree {
  const { Text } = ui.el
  return (
    <Text>
      <Text color={c.comment}>{superscript(number)}</Text>
      <Text color={color}>{` ${uiGlyph('server')} `}</Text>
      <Text color={color} bold>
        {label}
      </Text>
    </Text>
  )
}

export function rowLabel(ui: Ui, label: string, glyph: UiGlyphName): Tree {
  const { Box, Text } = ui.el
  return (
    <Box width={ROW_LABEL_COLUMNS} flexShrink={0}>
      <Text color={c.comment}>{`${uiGlyph(glyph)} ${label}`}</Text>
    </Box>
  )
}

export function fixedCell(ui: Ui, columns: number, content: Tree, isRightAligned = false): Tree {
  const { Box } = ui.el
  return (
    <Box width={columns} flexShrink={0} justifyContent={isRightAligned ? 'flex-end' : 'flex-start'} overflow="hidden">
      {content}
    </Box>
  )
}

export function keycap(ui: Ui, label: string, isLive: boolean): Tree {
  const { Text } = ui.el
  return <Text color={isLive ? c.blue : c.dim}>{`[${label}]`}</Text>
}

export type ChoiceOption<T extends string | number> = {
  value: T
  label: string
  glyph?: string
  count?: number | null
  dotColor?: string
}

type TabStripProps<T extends string> = {
  key: string
  options: ChoiceOption<T>[]
  selected: T
  isCompact: boolean
  onSelect: (value: T) => void
}

export function tabStrip<T extends string>(ui: Ui, props: TabStripProps<T>): Tree {
  const { Box, Button, Text } = ui.el
  const tabs = props.options.map(option => {
    const isSelected = option.value === props.selected
    const showLabel = isSelected || !props.isCompact || !option.glyph
    const background = isSelected ? c.highlight : undefined
    const textColor = isSelected ? c.foreground : c.dim
    const hasCount = option.count !== undefined && option.count !== null && Number.isFinite(option.count)
    return (
      <Button key={`${props.key}-${option.value}`} plain onPress={() => props.onSelect(option.value)}>
        <Text backgroundColor={background}> </Text>
        {option.dotColor ? <Text color={option.dotColor} backgroundColor={background}>{`${AGENT_MARKER} `}</Text> : null}
        {option.glyph ? <Text color={textColor} backgroundColor={background}>{`${option.glyph} `}</Text> : null}
        {showLabel ? (
          <Text color={textColor} backgroundColor={background}>
            {option.label}
          </Text>
        ) : null}
        {hasCount ? <Text color={c.comment} backgroundColor={background}>{` ${option.count}`}</Text> : null}
        <Text backgroundColor={background}> </Text>
      </Button>
    )
  })
  return (
    <Box key={props.key} flexWrap="wrap">
      {tabs}
    </Box>
  )
}

type SegmentedProps<T extends string | number> = {
  key: string
  options: ChoiceOption<T>[]
  selected: T
  onSelect: (value: T) => void
}

export function segmentedControl<T extends string | number>(ui: Ui, props: SegmentedProps<T>): Tree {
  const { Box, Button, Text } = ui.el
  const segments = props.options.map(option => {
    const isSelected = option.value === props.selected
    return (
      <Button key={`${props.key}-${option.value}`} plain onPress={() => props.onSelect(option.value)}>
        <Text
          color={isSelected ? c.background : c.dim}
          backgroundColor={isSelected ? c.blue : c.backgroundDark}
          bold={isSelected}
        >
          {` ${option.label} `}
        </Text>
      </Button>
    )
  })
  return (
    <Box key={props.key} flexShrink={0}>
      {segments}
    </Box>
  )
}

export function filterChips<T extends string>(ui: Ui, props: SegmentedProps<T>): Tree {
  const { Box, Button, Text } = ui.el
  const chips = props.options.map(option => {
    const isSelected = option.value === props.selected
    const count = option.count !== undefined && option.count !== null ? ` ${option.count}` : ''
    const glyph = option.glyph ? `${option.glyph} ` : ''
    return (
      <Button key={`${props.key}-${option.value}`} plain onPress={() => props.onSelect(option.value)}>
        <Text color={isSelected ? c.background : c.dim} backgroundColor={isSelected ? c.blue : c.backgroundDark}>
          {` ${glyph}${option.label}${count} `}
        </Text>
      </Button>
    )
  })
  return (
    <Box key={props.key} flexWrap="wrap" columnGap={1}>
      {chips}
    </Box>
  )
}

type RowButtonProps = {
  key: string
  glyph: UiGlyphName
  color?: string
  isDisabled?: boolean
  onPress: () => void
}

export function rowButton(ui: Ui, props: RowButtonProps): Tree {
  const { Button, Text } = ui.el
  if (props.isDisabled) return <Text color={c.terminalBlack}>{uiGlyph(props.glyph)}</Text>
  return (
    <Button key={props.key} plain onPress={props.onPress}>
      <Text color={props.color ?? c.dim}>{uiGlyph(props.glyph)}</Text>
    </Button>
  )
}

export const killButton = (ui: Ui, key: string, onPress: () => void): Tree => rowButton(ui, { key, glyph: 'square-x', onPress })

export function textButton(ui: Ui, key: string, label: string, color: string, onPress: () => void): Tree {
  const { Button, Text } = ui.el
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={color}>{label}</Text>
    </Button>
  )
}

export function joinWith(items: Tree[], separator: () => Tree): Tree[] {
  return items.flatMap((item, index) => (index === 0 ? [item] : [separator(), item]))
}
