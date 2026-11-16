import type { ClientModule } from 'claude-code'

type KeysProps = { isOn: boolean }

const ACCEPTED_KEY = /^[cm1-9]$/
const NARROW_FOOTER_COLUMNS = 56
const BLUE = '#7aa2f7'
const DIM = '#737aa2'
const COMMENT = '#565f89'
const BORDER = '#3b4261'
const GREEN = '#9ece6a'

const Keys: ClientModule<KeysProps, boolean> = (props, surface) => {
  const { Box, Text } = surface.elements
  if (surface.state === undefined) {
    surface.onPointer(event => {
      if (event.type === 'down') surface.post({ type: 'focus' })
    })
    surface.onKey(event => {
      if (event.ctrl || event.meta) return
      if (ACCEPTED_KEY.test(event.key)) surface.post({ type: 'key', key: event.key })
    })
    surface.setState(true)
  }
  const isNarrow = surface.columns > 0 && surface.columns < NARROW_FOOTER_COLUMNS
  const capColor = props.isOn ? BLUE : DIM
  const hint = (key: string, action: string) => (
    <Text mono>
      <Text mono color={capColor}>
        {isNarrow ? key : `[${key}]`}
      </Text>
      <Text mono color={COMMENT}>{` ${action}`}</Text>
    </Text>
  )
  const status = props.isOn ? 'keys on' : isNarrow ? 'click for keys' : 'click here for keys'
  return (
    <Box justifyContent="space-between" width="100%" paddingX={1} columnGap={2}>
      <Box columnGap={2} flexShrink={0}>
        {isNarrow ? null : (
          <Text mono>
            <Text mono color={GREEN}>
              ●
            </Text>
            <Text mono color={COMMENT}>
              {' '}
              agent{' '}
            </Text>
            <Text mono color={BORDER}>
              │
            </Text>
          </Text>
        )}
        {hint('c', 'cpu')}
        {hint('m', 'mem')}
        {hint('1-9', 'host')}
      </Box>
      <Text mono color={props.isOn ? BLUE : COMMENT} wrap="truncate-end">
        {`⌨ ${status}`}
      </Text>
    </Box>
  )
}

export default Keys
