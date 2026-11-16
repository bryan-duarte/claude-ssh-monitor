import { measureGuidance } from '../failure-guidance'
import { age, ageSince, compactSize, daysSince, storageSize } from '../format'
import { TOKYO_NIGHT as c, GRADIENTS, gradientAt, mixColors } from '../palette'
import type { HostWorktrees, WorktreeFilter, WorktreeItem } from '../schemas'
import { WORKTREE_FILTERS } from '../schemas'
import { agentLabel } from '../ui/icons'
import type { Tree } from '../ui/ui'
import {
  AGENT_MARKER,
  type ChoiceOption,
  dropdown,
  fixedCell,
  growCell,
  iconLabel,
  iconPicker,
  isTerminal,
  meter,
  panel,
  panelTitle,
  rowButton,
  textButton,
  toolbar,
  uiGlyph,
} from '../ui/widgets'
import {
  deleteCheckFor,
  isMergedWorktree,
  WORKTREE_FILTER_SPECS,
  type WorktreeFacts,
  worktreeFacts,
  worktreesOfHost,
} from '../worktrees'
import type { TabView } from './view'

const PERCENT_SCALE = 100
const SIZE_METER_CELLS = 5
const ROWS_BEFORE_MORE = 40
const MERGED_TAG_TINT = 0.18
const COLUMNS = {
  size: 8,
  compactSize: 5,
  mark: 1,
  changes: 4,
  age: 5,
  delete: 2,
  repository: 14,
  wide: { tool: 12 },
  narrow: { tool: 2 },
} as const

function deleteButton(view: TabView, worktree: WorktreeItem, hasAgent: boolean): Tree {
  const { canDelete } = deleteCheckFor(hasAgent)
  return rowButton(view.ui, {
    key: `wt-delete-${worktree.absolute_path}`,
    glyph: 'trash-2',
    isDisabled: !canDelete,
    onPress: () => view.act.removeWorktree(worktree),
  })
}

function mergedMark(view: TabView): Tree {
  const { Text } = view.ui.el
  const isTagRoomy = view.isWide && view.ui.surface === 'terminal'
  if (!isTagRoomy) return <Text color={c.green}>{uiGlyph('check')}</Text>
  return (
    <Text color={c.green} backgroundColor={mixColors(c.backgroundDark, c.green, MERGED_TAG_TINT)}>
      {' merged '}
    </Text>
  )
}

function worktreeRow(view: TabView, worktree: WorktreeItem, facts: WorktreeFacts): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  const widths = view.isWide ? COLUMNS.wide : COLUMNS.narrow
  const flags = facts.flagsOfWorktree.get(worktree)
  const hasAgent = flags?.hasAgent ?? false
  const isStale = flags?.isStale ?? false
  const sizePercent = facts.largestKib > 0 ? ((worktree.size_kb ?? 0) / facts.largestKib) * PERCENT_SCALE : 0
  const days = daysSince(worktree.last_commit_at)
  const changedFiles = worktree.changed_files ?? 0
  const hasChanges = changedFiles > 0
  const key = `wt-${worktree.absolute_path}`
  return (
    <Box key={key} columnGap={1}>
      {fixedCell(
        ui,
        view.isWide ? COLUMNS.size : COLUMNS.compactSize,
        <Text color={gradientAt(GRADIENTS.storage, sizePercent / PERCENT_SCALE)}>
          {view.isWide ? storageSize(worktree.size_kb) : compactSize(worktree.size_kb)}
        </Text>,
        view.isWide,
      )}
      {view.isWide ? meter(ui, `${key}-meter`, sizePercent, SIZE_METER_CELLS, GRADIENTS.storage) : null}
      {fixedCell(ui, widths.tool, agentLabel(ui, `${key}-tool`, worktree.tool, view.isWide))}
      {view.isWide ? fixedCell(ui, COLUMNS.repository, <Text color={c.blue}>{worktree.repository}</Text>) : null}
      {fixedCell(ui, COLUMNS.mark, hasAgent ? <Text color={c.green}>{AGENT_MARKER}</Text> : null)}
      {growCell(ui, <Text color={c.foreground}>{worktree.branch}</Text>)}
      {view.isWide ? null : fixedCell(ui, COLUMNS.mark, isMergedWorktree(worktree) ? mergedMark(view) : null)}
      {view.isWide && isMergedWorktree(worktree) ? mergedMark(view) : null}
      {fixedCell(ui, COLUMNS.changes, <Text color={c.yellow}>{hasChanges ? `±${changedFiles}` : ''}</Text>, true)}
      {fixedCell(ui, COLUMNS.age, <Text color={isStale ? c.orange : c.comment}>{days === null ? '?' : `${days}d`}</Text>, true)}
      {fixedCell(ui, COLUMNS.delete, deleteButton(view, worktree, hasAgent), true)}
    </Box>
  )
}

function worktreeList(view: TabView, shownWorktrees: WorktreeItem[], facts: WorktreeFacts): Tree[] {
  const { Text } = view.ui.el
  if (shownWorktrees.length === 0) return [<Text color={c.comment}>No worktree matches this filter.</Text>]
  const drawnWorktrees = view.showAllWorktrees ? shownWorktrees : shownWorktrees.slice(0, ROWS_BEFORE_MORE)
  const hiddenCount = shownWorktrees.length - drawnWorktrees.length
  const rows = drawnWorktrees.map(worktree => worktreeRow(view, worktree, facts))
  if (hiddenCount <= 0) return rows
  return [
    ...rows,
    textButton(view.ui, `worktrees-more-${view.host.label}`, `show ${hiddenCount} more`, c.blue, view.act.showAllWorktrees),
  ]
}

function filterDropdown(view: TabView, facts: WorktreeFacts): Tree {
  const options: ChoiceOption<WorktreeFilter>[] = WORKTREE_FILTERS.map(name => ({
    value: name,
    label: WORKTREE_FILTER_SPECS[name].label,
    count: facts.counts[name],
  }))
  return dropdown(view.ui, {
    key: `worktree-filter-${view.host.label}`,
    label: 'show',
    options,
    selected: view.choices.filter,
    onSelect: view.act.filterWorktrees,
  })
}

export function worktreesToolbar(view: TabView): Tree {
  if (!isTerminal(view.ui)) return null
  const { Box, Text } = view.ui.el
  const worktrees = worktreesOfHost(view.worktrees, view.host)
  if (worktrees.state === 'pending' && worktrees.items.length === 0) return null
  const facts = worktreeFacts(worktrees.items, view.agents)
  return toolbar(
    view.ui,
    'worktrees-toolbar',
    [iconPicker(view.ui, 'layers', filterDropdown(view, facts))],
    [
      <Box columnGap={1} alignItems="center">
        {iconLabel(view.ui, 'archive', 'reclaimable', c.orange)}
        <Text color={c.orange}>{storageSize(facts.reclaimableKib)}</Text>
      </Box>,
    ],
  )
}

function measureNote(view: TabView, worktrees: HostWorktrees): Tree {
  const { Text } = view.ui.el
  const hasProblem = worktrees.state === 'failed' || Boolean(worktrees.reason)
  if (!hasProblem) return null
  const { summary, nextStep } = measureGuidance('worktree', worktrees, view.host, view.snapshot.settings)
  const color = worktrees.state === 'failed' ? c.red : c.yellow
  const detail = worktrees.state === 'failed' && worktrees.error ? ` (${worktrees.error})` : ''
  return <Text color={color}>{`${summary}${detail} Next: ${nextStep}`}</Text>
}

function worktreesTitle(view: TabView, totalKib: number | null): Tree {
  return panelTitle(view.ui, 'folder-git-2', 'worktrees', c.teal, totalKib === null ? undefined : storageSize(totalKib))
}

export function worktreesPanel(view: TabView): Tree {
  const { ui, host, snapshot } = view
  const { Text } = ui.el
  const { settings } = snapshot
  const worktrees = worktreesOfHost(view.worktrees, host)
  const isFirstMeasure = worktrees.state === 'pending' && worktrees.items.length === 0
  if (isFirstMeasure) {
    const message = `Measuring worktrees. A measure runs every ${age(settings.worktree_interval)} and can take up to ${age(settings.worktree_timeout)}.`
    return panel(ui, {
      key: `worktrees-${host.label}`,
      title: worktreesTitle(view, null),
      children: [<Text color={c.comment}>{message}</Text>],
    })
  }
  const facts = worktreeFacts(worktrees.items, view.agents)
  const shownWorktrees = worktrees.items.filter(worktree => facts.flagsOfWorktree.get(worktree)?.filters.has(view.choices.filter))
  const measuredText = `${shownWorktrees.length} of ${worktrees.items.length} worktrees · measured ${ageSince(worktrees.measured_at)} · every ${age(settings.worktree_interval)}`
  return panel(ui, {
    key: `worktrees-${host.label}`,
    title: worktreesTitle(view, worktrees.total_kb),
    rightTitle: isTerminal(ui) ? (
      <Text color={c.comment}>{ageSince(worktrees.measured_at)}</Text>
    ) : (
      <Text>
        <Text color={c.comment}>reclaimable </Text>
        <Text color={c.orange}>{storageSize(facts.reclaimableKib)}</Text>
        <Text color={c.comment}>{` · measured ${ageSince(worktrees.measured_at)}`}</Text>
      </Text>
    ),
    actions: isTerminal(ui) ? undefined : iconPicker(ui, 'layers', filterDropdown(view, facts)),
    children: [
      measureNote(view, worktrees),
      ...worktreeList(view, shownWorktrees, facts),
      <Text color={c.comment}>{measuredText}</Text>,
    ],
  })
}
