import { TOKYO_NIGHT as c, type Gradient, gradientAt } from '../palette'
import { type UiGlyphName, uiGlyph } from './glyphs'
import { uiIcon } from './icons'
import type { Tree, Ui } from './ui'

export { type UiGlyphName, uiGlyph } from './glyphs'

const PERCENT_SCALE = 100
const FILLED_CELL = '▮'
const EMPTY_CELL = '▯'
const DIVIDER_CELL = '─'
const DESKTOP_DIVIDER_OVERDRAW = 3
const SUPERSCRIPT_DIGITS = ['⁰', '¹', '²', '³', '⁴', '⁵', '⁶', '⁷', '⁸', '⁹'] as const
export const ROW_LABEL_COLUMNS = 8
export const AGENT_MARKER = '●'
export const SEPARATOR = '│'
export const TITLE_SIZE = 'footnote'
const ROW_ACTION_MARK = '›'

export const isTerminal = (ui: Ui): boolean => ui.surface === 'terminal'

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

export function meter(
  ui: Ui,
  key: string,
  percent: number | null,
  cellCount: number,
  gradient: Gradient,
  emptyColor: string = c.highlight,
): Tree {
  const { Box, Text } = ui.el
  const filledCells = filledCellCount(percent, cellCount)
  const lastCellIndex = Math.max(1, cellCount - 1)
  const cells = Array.from({ length: cellCount }, (_unused, index) => {
    const isFilled = index < filledCells
    return (
      <Text color={isFilled ? gradientAt(gradient, index / lastCellIndex) : emptyColor}>
        {isFilled ? FILLED_CELL : EMPTY_CELL}
      </Text>
    )
  })
  return (
    <Box key={key} flexShrink={0}>
      <Text>{cells}</Text>
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
    <Box key={key} flexShrink={1} minWidth={0}>
      <Text wrap="wrap">{blocks}</Text>
    </Box>
  )
}

type PanelProps = {
  key: string
  title: Tree
  rightTitle?: Tree
  actions?: Tree
  borderColor?: string
  children: Tree[]
}

function terminalPanel(ui: Ui, props: PanelProps, borderColor: string): Tree {
  const { Box, Text } = ui.el
  return (
    <Box key={props.key} flexDirection="column" borderStyle="round" borderColor={borderColor} paddingX={1}>
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

function sectionPanel(ui: Ui, props: PanelProps): Tree {
  const { Box } = ui.el
  const headerRight = props.actions ?? props.rightTitle
  const subtitle = props.actions ? props.rightTitle : null
  return (
    <Box key={props.key} flexDirection="column">
      <Box justifyContent="space-between" alignItems="flex-start" columnGap={2}>
        <Box flexShrink={0}>{props.title}</Box>
        {!props.actions && headerRight ? (
          <Box flexShrink={1} minWidth={0} overflow="hidden" justifyContent="flex-end">
            {truncated(headerRight)}
          </Box>
        ) : null}
      </Box>
      {props.actions ? (
        <Box justifyContent="space-between" alignItems="flex-start" columnGap={2}>
          <Box flexShrink={1} minWidth={0} overflow="hidden">
            {subtitle ? truncated(subtitle) : null}
          </Box>
          <Box flexShrink={0}>{props.actions}</Box>
        </Box>
      ) : null}
      <Box flexDirection="column" paddingTop={1}>
        {props.children}
      </Box>
    </Box>
  )
}

export function panel(ui: Ui, props: PanelProps): Tree {
  if (isTerminal(ui)) return terminalPanel(ui, props, props.borderColor ?? c.border)
  return sectionPanel(ui, props)
}

export function panelTitle(ui: Ui, glyph: UiGlyphName, label: string, color: string, detail?: string): Tree {
  const { Box, Text } = ui.el
  return (
    <Box columnGap={1} alignItems="center" flexShrink={0}>
      {uiIcon(ui, glyph, color)}
      <Text color={color} weight="semibold" size={TITLE_SIZE}>
        {label}
      </Text>
      {detail ? <Text color={c.comment}>{detail}</Text> : null}
    </Box>
  )
}

export function hostTitle(ui: Ui, label: string, number: number, color: string): Tree {
  const { Box, Text } = ui.el
  return (
    <Box columnGap={1} alignItems="center" flexShrink={0}>
      {uiIcon(ui, 'server', color)}
      <Text color={color} weight="semibold" size={TITLE_SIZE}>
        {label}
      </Text>
      <Text color={c.comment}>{superscript(number)}</Text>
    </Box>
  )
}

export function rowLabel(ui: Ui, label: string, glyph: UiGlyphName): Tree {
  const { Box, Text } = ui.el
  return (
    <Box width={ROW_LABEL_COLUMNS} flexShrink={0} columnGap={1} alignItems="center">
      {uiIcon(ui, glyph, c.comment)}
      <Text color={c.comment}>{label}</Text>
    </Box>
  )
}

function truncated(content: Tree): Tree {
  if (!content || typeof content !== 'object' || content.type !== 'Text') return content
  return { ...content, props: { wrap: 'truncate-end', ...content.props } } as Tree
}

export function fixedCell(ui: Ui, columns: number, content: Tree, isRightAligned = false): Tree {
  const { Box } = ui.el
  return (
    <Box width={columns} flexShrink={0} justifyContent={isRightAligned ? 'flex-end' : 'flex-start'} overflow="hidden">
      {truncated(content)}
    </Box>
  )
}

export function growCell(ui: Ui, content: Tree): Tree {
  const { Box } = ui.el
  return (
    <Box flexGrow={1} flexShrink={1} minWidth={0} columnGap={1} overflow="hidden">
      {truncated(content)}
    </Box>
  )
}

export function iconLabel(ui: Ui, glyph: UiGlyphName, label: string, iconColor: string, labelColor: string = c.comment): Tree {
  const { Box, Text } = ui.el
  return (
    <Box columnGap={1} alignItems="center" flexShrink={0}>
      {uiIcon(ui, glyph, iconColor)}
      <Text color={labelColor}>{label}</Text>
    </Box>
  )
}

export function iconPicker(ui: Ui, glyph: UiGlyphName, picker: Tree, isCentered = false): Tree {
  const { Box } = ui.el
  return (
    <Box columnGap={1} alignItems={isCentered ? 'center' : 'flex-start'} flexShrink={0}>
      {uiIcon(ui, glyph, c.blue)}
      {picker}
    </Box>
  )
}

export function glyphButton(ui: Ui, key: string, glyph: UiGlyphName, label: string, color: string, onPress: () => void): Tree {
  const { Button, Text } = ui.el
  return (
    <Button key={key} plain onPress={onPress}>
      <Text color={color}>{`${uiGlyph(glyph)} ${label}`}</Text>
    </Button>
  )
}

export function keycap(ui: Ui, label: string, isLive: boolean): Tree {
  const { Text } = ui.el
  return <Text color={isLive ? c.blue : c.dim}>{`[${label}]`}</Text>
}

export type ChoiceOption<T extends string | number> = {
  value: T
  label: string
  count?: number | null
  dotColor?: string
}

type ChoiceProps<T extends string | number> = {
  key: string
  options: ChoiceOption<T>[]
  selected: T
  onSelect: (value: T) => void
}

const hasCount = (count: number | null | undefined): count is number =>
  count !== undefined && count !== null && Number.isFinite(count)

export function tabStrip<T extends string>(ui: Ui, props: ChoiceProps<T>): Tree {
  const { Box, Button, Text } = ui.el
  const tabs = props.options.map(option => {
    const isSelected = option.value === props.selected
    const background = isSelected ? c.highlight : undefined
    return (
      <Button key={`${props.key}-${option.value}`} plain onPress={() => props.onSelect(option.value)}>
        <Text backgroundColor={background}> </Text>
        {option.dotColor ? <Text color={option.dotColor} backgroundColor={background}>{`${AGENT_MARKER} `}</Text> : null}
        <Text color={isSelected ? c.foreground : c.dim} backgroundColor={background} weight={isSelected ? 'semibold' : 'regular'}>
          {option.label}
        </Text>
        {hasCount(option.count) ? <Text color={c.comment} backgroundColor={background}>{` ${option.count}`}</Text> : null}
        <Text backgroundColor={background}> </Text>
      </Button>
    )
  })
  return (
    <Box key={props.key} columnGap={1} flexWrap="wrap">
      {tabs}
    </Box>
  )
}

const choiceLabel = (option: ChoiceOption<string | number>): string =>
  hasCount(option.count) ? `${option.label} (${option.count})` : option.label

const DROPDOWN_CHROME_COLUMNS = 3

type DropdownProps<T extends string | number> = ChoiceProps<T> & { label?: string; color?: string; isNative?: boolean }

export function dropdown<T extends string | number>(ui: Ui, props: DropdownProps<T>): Tree {
  const options = props.options.map(option => ({ value: String(option.value), label: choiceLabel(option) }))
  if (!props.isNative && (ui.surface === 'terminal' || ui.surface === 'desktop')) {
    const { Client } = ui.el
    const widest = Math.max(...options.map(option => option.label.length))
    return (
      <Client
        key={props.key}
        module="../../client/dropdown.tsx"
        props={{ options, value: String(props.selected), color: props.color ?? c.foreground }}
        width={widest + DROPDOWN_CHROME_COLUMNS}
      />
    )
  }
  const { Select } = ui.el
  const optionValueOf = new Map(props.options.map(option => [String(option.value), option.value]))
  return (
    <Select
      key={props.key}
      label={props.label}
      options={options}
      value={String(props.selected)}
      onSelect={value => {
        const picked = optionValueOf.get(value)
        if (picked !== undefined) props.onSelect(picked)
      }}
    />
  )
}

export function toolbar(ui: Ui, key: string, left: Tree[], right: Tree[]): Tree {
  const { Box } = ui.el
  return (
    <Box key={key} paddingX={1} columnGap={2} justifyContent="space-between" alignItems="center" flexWrap="wrap">
      <Box columnGap={2} alignItems="center" flexWrap="wrap">
        {left}
      </Box>
      <Box columnGap={2} alignItems="center">
        {right}
      </Box>
    </Box>
  )
}

export function divider(ui: Ui, key: string, columns: number): Tree {
  const { Box, Text } = ui.el
  const lineCells = isTerminal(ui) ? columns : columns * DESKTOP_DIVIDER_OVERDRAW
  return (
    <Box key={key} height={1} overflow="hidden">
      <Text color={c.border}>{DIVIDER_CELL.repeat(Math.max(1, lineCells))}</Text>
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
  if (!isTerminal(ui)) {
    if (props.isDisabled) return null
    return (
      <Button key={props.key} plain onPress={props.onPress}>
        <Text>{ROW_ACTION_MARK}</Text>
      </Button>
    )
  }
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
