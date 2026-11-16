import type { ClientModule } from 'claude-code'

type DropdownOption = { value: string; label: string }

type DropdownProps = { options: DropdownOption[]; value: string; color: string }

type DropdownState = { isOpen: boolean; highlight: number }

const CLOSED: DropdownState = { isOpen: false, highlight: 0 }
const TRIGGER_ROW = 0
const CLOSED_ARROW = '▾'
const OPEN_ARROW = '▴'
const POINTER_MARK = '›'
const ARROW_COLOR = '#c0caf5'
const SELECTED_COLOR = '#7aa2f7'
const OPTION_COLOR = '#a9b1d6'
const TEXT_SIZE = 'caption'

const Dropdown: ClientModule<DropdownProps, DropdownState> = (props, surface) => {
  const { Box, Text } = surface.elements
  const state = surface.state ?? CLOSED
  const selectedIndex = Math.max(
    0,
    props.options.findIndex(option => option.value === props.value),
  )
  const selected = props.options[selectedIndex]

  const pick = (index: number) => {
    const option = props.options[index]
    if (option && option.value !== props.value) surface.post({ type: 'select', value: option.value })
    surface.setState(CLOSED)
  }
  const open = () => surface.setState({ isOpen: true, highlight: selectedIndex })

  surface.onPointer(event => {
    if (event.type !== 'down') return
    if (event.y === TRIGGER_ROW) return state.isOpen ? surface.setState(CLOSED) : open()
    if (state.isOpen) pick(event.y - 1)
  })
  surface.onKey(event => {
    if (!state.isOpen) {
      if (event.key === 'return' || event.key === ' ' || event.key === 'down') open()
      return
    }
    const lastIndex = props.options.length - 1
    if (event.key === 'down') surface.setState({ ...state, highlight: Math.min(lastIndex, state.highlight + 1) })
    if (event.key === 'up') surface.setState({ ...state, highlight: Math.max(0, state.highlight - 1) })
    if (event.key === 'return' || event.key === ' ') pick(state.highlight)
  })

  return (
    <Box flexDirection="column">
      <Text mono size={TEXT_SIZE}>
        <Text mono size={TEXT_SIZE} color={props.color}>
          {selected?.label ?? ''}
        </Text>
        <Text mono size={TEXT_SIZE} color={ARROW_COLOR}>
          {` ${state.isOpen ? OPEN_ARROW : CLOSED_ARROW}`}
        </Text>
      </Text>
      {state.isOpen
        ? props.options.map((option, index) => (
            <Text mono size={TEXT_SIZE} color={option.value === props.value ? SELECTED_COLOR : OPTION_COLOR}>
              {`${index === state.highlight ? POINTER_MARK : ' '} ${option.label}`}
            </Text>
          ))
        : null}
    </Box>
  )
}

export default Dropdown
