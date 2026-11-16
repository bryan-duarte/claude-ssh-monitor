import type { ClientModule } from 'claude-code'

type KeysProps = { isOn: boolean }

const ACCEPTED_KEY = /^[cm1-9]$/
const BLUE = '#7aa2f7'
const DIM = '#737aa2'
const COMMENT = '#565f89'
const BORDER = '#3b4261'
const GREEN = '#9ece6a'
const FOOTER_BACKGROUND = '#16161e'

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
  const keycap = (key: string) => <Text color={props.isOn ? BLUE : DIM}>{`[${key}]`}</Text>
  return (
    <Box backgroundColor={FOOTER_BACKGROUND} justifyContent="space-between" width="100%" paddingX={1}>
      <Box columnGap={1}>
        <Text color={GREEN}>●</Text>
        <Text color={COMMENT}>agent</Text>
        <Text color={BORDER}>│</Text>
        {keycap('c')}
        <Text color={COMMENT}>cpu</Text>
        {keycap('m')}
        <Text color={COMMENT}>mem</Text>
        {keycap('1-9')}
        <Text color={COMMENT}>host</Text>
      </Box>
      {props.isOn ? <Text color={BLUE}>⌨ keys on</Text> : <Text color={COMMENT}>⌨ click here for keys</Text>}
    </Box>
  )
}

export default Keys
