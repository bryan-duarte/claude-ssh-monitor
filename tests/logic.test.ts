import { expect, test } from 'claude-code/testing'
import { killPlan, worktreeRemovePlan } from '../hooks/lib/action-dialogs'
import { markOf } from '../hooks/lib/agent-marks'
import { agentViews } from '../hooks/lib/agents'
import { isStale, percentLevel } from '../hooks/lib/health'
import { emptyHistory, nextHistory } from '../hooks/lib/history'
import { isLeaseFree } from '../hooks/lib/lease'
import { GRADIENTS, gradientAt } from '../hooks/lib/palette'
import { programMarkOf } from '../hooks/lib/program-marks'
import { parseSnapshot } from '../hooks/lib/snapshot'
import { BrailleCanvas } from '../hooks/lib/ui/braille'
import { brailleHistory, svgHistory } from '../hooks/lib/ui/charts'
import { worktreeFacts } from '../hooks/lib/worktrees'
import { agentProcess, hostSnapshot, SETTINGS, snapshot, worktreeItem } from './fixtures'

const SVG_SOURCE_LIMIT = 131_072
const DAY_SECONDS = 86400

test('the gradient middle is the herdwatch yellow', () => {
  expect(gradientAt(GRADIENTS.cpu, 0.5)).toBe('#e0af68')
})

test('percent levels keep the >= edges', () => {
  expect(percentLevel(70, SETTINGS)).toBe('warning')
  expect(percentLevel(90, SETTINGS)).toBe('critical')
  expect(percentLevel(69.9, SETTINGS)).toBe('normal')
})

test('a host is stale only past STALE_SECONDS', () => {
  const host = hostSnapshot({ updated_at: 1000 })
  expect(isStale(host, SETTINGS, 1030)).toBe(false)
  expect(isStale(host, SETTINGS, 1031)).toBe(true)
})

test('marks fall back to the sheep and find versioned programs', () => {
  expect(markOf('letta').isDefault).toBe(true)
  expect(markOf('cursor-agent').name).toBe('Cursor')
  expect(programMarkOf('python3.12')?.name).toBe('Python')
  expect(programMarkOf('unknown-thing')).toBeNull()
})

test('a claude agent takes the newest session state of its folder', () => {
  const host = hostSnapshot({
    agents: [agentProcess({ cpu: 0 })],
    sessions: [
      { cwd: '/home/dev/code/shop', state: 'working', updated_at: 10 },
      { cwd: '/home/dev/code/shop', state: 'blocked', updated_at: 20 },
    ],
  })
  expect(agentViews(host, emptyHistory())[0]?.state).toBe('blocked')
  const codexHost = hostSnapshot({ agents: [agentProcess({ app: 'codex', cpu: 5 })], sessions: host.sessions })
  expect(agentViews(codexHost, emptyHistory())[0]?.state).toBe('working')
})

test('parseSnapshot keeps good hosts and adds sessions', () => {
  const raw = JSON.parse(JSON.stringify(snapshot())) as Record<string, unknown>
  const hosts = raw.hosts as Record<string, unknown>[]
  const firstHost = hosts[0]
  if (firstHost) delete firstHost.sessions
  hosts.push({ label: 'broken' })
  const parsed = parseSnapshot(JSON.stringify(raw))
  expect(parsed.ok).toBe(true)
  if (!parsed.ok) return
  expect(parsed.snapshot.hosts.length).toBe(1)
  expect(parsed.snapshot.hosts[0]?.sessions).toEqual([])
  expect(parsed.snapshot.problems[0]?.reason).toBe('broken_host')
})

test('history adds swap and shares each alert once', () => {
  const alert = { kind: 'hot' as const, label: 'devbox', cpu_pct: 95, mem_pct: 40, top_process: 'node', port: null }
  const first = nextHistory(emptyHistory(), snapshot({ generated_at: 1000, alerts: [alert] }), 1000)
  const second = nextHistory(first, snapshot({ generated_at: 1005, alerts: [] }), 1005)
  expect(first.hosts.devbox?.swap.length).toBe(1)
  expect(second.alerts.length).toBe(1)
  expect(second.alerts[0]?.id).toBe('1000:hot:devbox:')
})

test('the stale chip counts old worktrees without agents', () => {
  const now = Math.floor(Date.now() / 1000)
  const items = [
    worktreeItem({ last_commit_at: now - 20 * DAY_SECONDS, absolute_path: '/a' }),
    worktreeItem({ last_commit_at: now - 20 * DAY_SECONDS, absolute_path: '/home/dev/code/shop' }),
    worktreeItem({ last_commit_at: now - DAY_SECONDS, absolute_path: '/b' }),
  ]
  const host = hostSnapshot()
  expect(worktreeFacts(items, agentViews(host, emptyHistory())).counts.stale).toBe(1)
})

test('a 60-sample series packs into a 40x4 braille raster', () => {
  const samples = Array.from({ length: 60 }, (_unused, index) => (index * 7) % 100)
  const canvas = brailleHistory({
    key: 'k',
    samples,
    gradient: GRADIENTS.cpu,
    markers: [{ position: 0.5, kind: 'alert', text: 'x' }],
    columns: 40,
    rows: 4,
    alt: 'cpu',
  })
  expect(canvas.cells.length).toBe(160)
  expect(atob(canvas.pack()).length).toBe(160 * 12)
  expect(canvas.cells.some(cell => cell.codePoint >= 0x2800 && cell.codePoint < 0x2900)).toBe(true)
})

test('the desktop chart stays under the Svg source limit', () => {
  const samples = Array.from({ length: 120 }, (_unused, index) => (index * 13) % 100)
  const markers = Array.from({ length: 40 }, (_unused, index) => ({ position: index / 40, kind: 'start' as const, text: 'x' }))
  const chart = svgHistory({
    key: 'k',
    samples,
    dashed: samples,
    gradient: GRADIENTS.memory,
    markers,
    columns: 120,
    rows: 4,
    alt: 'mem',
  })
  expect(chart.source.length < SVG_SOURCE_LIMIT).toBe(true)
})

test('dialog plans keep 2 to 4 options with Cancel and short headers', () => {
  const host = hostSnapshot()
  const plans = [killPlan(host, 4100), worktreeRemovePlan(host, worktreeItem({ changed_files: 3 }))]
  for (const plan of plans) {
    expect(plan.header.length <= 12).toBe(true)
    expect(plan.options.length + 1 >= 2 && plan.options.length + 1 <= 4).toBe(true)
  }
  expect(worktreeRemovePlan(host, worktreeItem({ changed_files: 3 })).args).toEqual(['/home/dev/code/shop', '--force'])
})

test('a fresh lease of another session or an unreadable file is not free', () => {
  expect(isLeaseFree(null, 'me', 1000)).toBe(true)
  expect(isLeaseFree({ owner: 'me', at: 995 }, 'me', 1000)).toBe(true)
  expect(isLeaseFree({ owner: 'other', at: 995 }, 'me', 1000)).toBe(false)
  expect(isLeaseFree({ owner: 'unreadable', at: 995 }, 'me', 1000)).toBe(false)
  expect(isLeaseFree({ owner: 'other', at: 980 }, 'me', 1000)).toBe(true)
})

test('a stale stored series starts fresh without an event burst', () => {
  const first = nextHistory(emptyHistory(), snapshot(), 1000)
  const afterRestart = nextHistory(first, snapshot({ hosts: [hostSnapshot({ agents: [] })] }), 1000 + 3600)
  expect(afterRestart.hosts.devbox?.at).toEqual([4600])
  expect(afterRestart.events.devbox ?? []).toEqual([])
})

test('a short gap in polling becomes null samples', () => {
  const first = nextHistory(emptyHistory(), snapshot(), 1000)
  const second = nextHistory(first, snapshot(), 1030)
  expect(second.hosts.devbox?.at).toEqual([1000, 1005, 1010, 1015, 1020, 1025, 1030])
  expect(second.hosts.devbox?.cpu).toEqual([72, null, null, null, null, null, 72])
  const onTime = nextHistory(first, snapshot(), 1010)
  expect(onTime.hosts.devbox?.at).toEqual([1000, 1010])
})

test('a blocked session outranks a newer idle one in the same folder', () => {
  const host = hostSnapshot({
    agents: [agentProcess({ cpu: 0 })],
    sessions: [
      { cwd: '/home/dev/code/shop', state: 'blocked', updated_at: 10 },
      { cwd: '/home/dev/code/shop', state: 'idle', updated_at: 20 },
      { cwd: '/home/dev/code/shop', state: 'working', updated_at: 30 },
    ],
  })
  expect(agentViews(host, emptyHistory())[0]?.state).toBe('blocked')
})

test('charts treat NaN and Infinity samples as gaps', () => {
  const canvas = new BrailleCanvas(4, 1)
  canvas.line(0, 0, Number.NaN, 3, () => 0)
  expect(canvas.cells.every(cell => cell.codePoint === 0x20)).toBe(true)
  const samples = [10, Number.NaN, 50, Number.POSITIVE_INFINITY, 90]
  const chartProps = { key: 'k', samples, gradient: GRADIENTS.cpu, markers: [], columns: 20, rows: 4, alt: 'cpu' }
  expect(brailleHistory(chartProps).cells.length).toBe(80)
  expect(svgHistory(chartProps).source.includes('NaN')).toBe(false)
})
