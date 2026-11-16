import type { On } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { ConsoleTab } from '../types'
import { hostSnapshot, snapshot } from './fixtures'

const SHAPE = 'v1'
const SURFACES = ['terminal', 'desktop'] as const
const TABS: ConsoleTab[] = ['overview', 'agents', 'ports', 'worktrees', 'docker', 'procs']

const SITE_PROPS = { scroll: { offset: 0, bodyRows: 40 }, view: {} } as const

const PANE = {
  plugin: 'ssh-monitor',
  component: 'Pane',
  requestId: 'ssh-monitor',
  props: { title: 'ssh-monitor', isFocused: false, bodyColumns: 100, placement: 'dock', ...SITE_PROPS },
} as const

const BAND = {
  plugin: 'ssh-monitor',
  component: 'AbovePrompt',
  requestId: 'band',
  props: { hasSurvey: false, isCollapsed: false, isWorking: false, maxRows: 4, bodyColumns: 120, ...SITE_PROPS },
} as const

type Seed = Record<string, unknown>

const shaped = (value: unknown) => ({ shape: SHAPE, value })

function seedState(on: On, seed: Seed): void {
  on('state.get', (_unused, e) => {
    const key = (e as { key: string }).key
    return { value: { value: seed[key], version: key in seed ? 1 : 0 } }
  })
}

test('the band shows the pill states', async ($, on) => {
  seedState(on, {})
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /ssh-monitor …/ }))?.text).toBe('ssh-monitor …')
    await ui.unmount()
  }
})

test('the band shows meters and the warning mark', async ($, on) => {
  seedState(on, { snapshot: shaped(snapshot()) })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...BAND, surface })
    expect((await ui.find({ type: 'Text', text: /^72%!$/ }))?.text).toBe('72%!')
    expect(await ui.find({ type: 'Text', text: /devbox/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the band says add hosts with an empty hosts.conf', async ($, on) => {
  seedState(on, { snapshot: shaped(snapshot({ hosts: [] })) })
  const ui = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /add hosts/ }))?.text).toBe('ssh-monitor: add hosts')
  await ui.unmount()
})

for (const tab of TABS) {
  test(`the ${tab} tab draws on every surface that takes a Client`, async ($, on) => {
    const choices = { host: 'devbox', tab, range: 60, filter: 'all', sort: 'cpu' }
    seedState(on, { snapshot: shaped(snapshot()), choices: shaped(choices) })
    for (const surface of SURFACES) {
      const ui = await $.ui.mount({ ...PANE, surface })
      expect(await ui.find({ type: 'Text', text: /^ssh-monitor$/ })).toBeDefined()
      const viewPicker = await ui.find({ key: 'view-picker' })
      const tabButton = await ui.find({ key: `console-tabs-${tab}` })
      const pickedView = viewPicker?.props.value
      expect(pickedView === tab || tabButton?.type === 'Button').toBe(true)
      await ui.unmount()
    }
  })
}

test('the range dropdown shows 10m by default and opens its options on a click', async ($, on) => {
  seedState(on, { snapshot: shaped(snapshot()) })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, surface })
    const range = await ui.find({ key: 'range' })
    expect((range?.props.props as { value?: string } | undefined)?.value).toBe('120')
    expect(await ui.find({ type: 'Text', text: /^10m$/, in: 'range' })).toBeDefined()
    await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'range' })
    expect(await ui.find({ type: 'Text', text: /2m$/, in: 'range' })).toBeDefined()
    await ui.unmount()
  }
})

const NARROW_PANE = { ...PANE, props: { ...PANE.props, bodyColumns: 44 } } as const

test('a narrow desktop pane uses dropdowns and monospace text', async ($, on) => {
  const choices = { host: 'devbox', tab: 'procs', range: 60, filter: 'all', sort: 'cpu' }
  const hosts = [hostSnapshot(), hostSnapshot({ label: 'build-server-west' }), hostSnapshot({ label: 'gpu-box-east' })]
  seedState(on, { snapshot: shaped(snapshot({ hosts })), choices: shaped(choices) })
  const ui = await $.ui.mount({ ...NARROW_PANE, surface: 'desktop' })
  expect((await ui.find({ key: 'view-picker' }))?.type).toBe('Select')
  expect((await ui.find({ key: 'host-picker' }))?.type).toBe('Client')
  expect((await ui.find({ key: 'sort' }))?.type).toBe('Client')
  expect((await ui.find({ type: 'Text', text: /^ssh-monitor$/ }))?.props.mono).toBe(true)
  expect((await ui.find({ type: 'Text', text: /^ssh-monitor$/ }))?.props.size).toBe('footnote')
  await ui.unmount()
})

test('a wide terminal keeps tab buttons, desktop uses dropdowns', async ($, on) => {
  const choices = { host: 'devbox', tab: 'procs', range: 60, filter: 'all', sort: 'cpu' }
  seedState(on, { snapshot: shaped(snapshot()), choices: shaped(choices) })
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ key: 'console-tabs-procs' }))?.type).toBe('Button')
  expect((await terminal.find({ key: 'range' }))?.type).toBe('Client')
  expect((await terminal.find({ key: 'sort' }))?.type).toBe('Client')
  await terminal.unmount()
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ key: 'view-picker' }))?.type).toBe('Select')
  expect((await desktop.find({ key: 'range' }))?.type).toBe('Client')
  expect(await desktop.find({ key: 'console-tabs-procs' })).toBeUndefined()
  await desktop.unmount()
})

test('desktop sections have no border, terminal boxes keep theirs', async ($, on) => {
  const choices = { host: 'devbox', tab: 'procs', range: 60, filter: 'all', sort: 'cpu' }
  seedState(on, { snapshot: shaped(snapshot()), choices: shaped(choices) })
  const desktop = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect((await desktop.find({ key: 'procs-devbox' }))?.props.borderStyle).toBeUndefined()
  expect(await desktop.find({ key: 'procs-toolbar' })).toBeUndefined()
  expect(await desktop.find({ key: 'navigation-divider' })).toBeDefined()
  expect((await desktop.find({ key: 'sort' }))?.type).toBe('Client')
  await desktop.unmount()
  const terminal = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await terminal.find({ key: 'procs-devbox' }))?.props.borderStyle).toBe('round')
  await terminal.unmount()
})

test('a narrow ports tab keeps one actions control per row', async ($, on) => {
  const choices = { host: 'devbox', tab: 'ports', range: 60, filter: 'all', sort: 'cpu' }
  seedState(on, { snapshot: shaped(snapshot()), choices: shaped(choices) })
  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...NARROW_PANE, surface })
    expect((await ui.find({ key: 'port-menu-devbox-3000' }))?.type).toBe('Button')
    expect(await ui.find({ key: 'port-pin-devbox-3000' })).toBeUndefined()
    await ui.unmount()
  }
})

test('the worktrees filter is a dropdown above the list', async ($, on) => {
  const choices = { host: 'devbox', tab: 'worktrees', range: 60, filter: 'all', sort: 'cpu' }
  seedState(on, { snapshot: shaped(snapshot()), choices: shaped(choices) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ key: 'worktree-filter-devbox' }))?.type).toBe('Client')
  await ui.pointer({ type: 'down', x: 1, y: 0, button: 'left', in: 'worktree-filter-devbox' })
  expect((await ui.find({ type: 'Text', text: /behind upstream \(0\)$/, in: 'worktree-filter-devbox' }))?.text).toContain(
    'behind upstream (0)',
  )
  await ui.unmount()
})

test('a down host shows the failure box', async ($, on) => {
  const now = Math.floor(Date.now() / 1000)
  const downHost = hostSnapshot({
    state: 'down',
    reason: 'timeout',
    detail: 'Connection timed out',
    updated_at: now - 240,
    down_since: now - 240,
  })
  seedState(on, { snapshot: shaped(snapshot({ hosts: [downHost] })) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await ui.find({ type: 'Text', text: /^✕ / }))?.text).toBe('✕ devbox did not answer within SSH_TIMEOUT (3 s).')
  expect((await ui.find({ type: 'Text', text: /^ssh: / }))?.text).toBe('ssh: Connection timed out')
  expect((await ui.find({ type: 'Text', text: /^Values below/ }))?.text).toBe('Values below are from 4m ago.')
  await ui.unmount()
})

test('the docker tab says when Docker is off', async ($, on) => {
  const host = hostSnapshot({
    docker: {
      state: 'off',
      measured_at: null,
      reason: '',
      error: '',
      total_kb: 0,
      reclaimable_kb: 0,
      containers: [],
      images: [],
      volumes: [],
    },
  })
  const choices = { host: 'devbox', tab: 'docker', range: 60, filter: 'all', sort: 'cpu' }
  seedState(on, { snapshot: shaped(snapshot({ hosts: [host] })), choices: shaped(choices) })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const notice = await ui.find({ type: 'Text', text: /Docker tab is off/ })
  expect(notice?.text).toBe('The Docker tab is off. Set DOCKER=on in settings.conf to turn it on.')
  await ui.unmount()
})
