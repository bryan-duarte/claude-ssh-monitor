import type { Tree } from '../ui/ui'
import { agentsPanel } from './agents'
import { dockerPanel } from './docker'
import { overviewPanel } from './overview'
import { portsPanel } from './ports'
import { procsPanels } from './procs'
import type { TabView } from './view'
import { worktreesPanel } from './worktrees'

export function panelsOfTab(view: TabView): Tree[] {
  switch (view.choices.tab) {
    case 'overview':
      return [overviewPanel(view), agentsPanel(view, { showSparklines: false })]
    case 'agents':
      return [agentsPanel(view, { showSparklines: true })]
    case 'procs':
      return procsPanels(view)
    case 'ports':
      return [portsPanel(view)]
    case 'worktrees':
      return [worktreesPanel(view)]
    case 'docker':
      return [dockerPanel(view)]
  }
}
