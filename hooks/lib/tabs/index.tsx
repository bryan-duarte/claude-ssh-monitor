import type { Tree } from '../ui/ui'
import { agentsPanel } from './agents'
import { dockerPanel, dockerToolbar } from './docker'
import { overviewPanel } from './overview'
import { portsPanel } from './ports'
import { procsPanel, procsToolbar } from './procs'
import type { TabView } from './view'
import { worktreesPanel, worktreesToolbar } from './worktrees'

export type TabContent = { toolbar: Tree; panels: Tree[] }

export function contentOfTab(view: TabView): TabContent {
  switch (view.choices.tab) {
    case 'overview':
      return { toolbar: null, panels: [overviewPanel(view), agentsPanel(view, { showSparklines: false })] }
    case 'agents':
      return { toolbar: null, panels: [agentsPanel(view, { showSparklines: true })] }
    case 'procs':
      return { toolbar: procsToolbar(view), panels: [procsPanel(view)] }
    case 'ports':
      return { toolbar: null, panels: [portsPanel(view)] }
    case 'worktrees':
      return { toolbar: worktreesToolbar(view), panels: [worktreesPanel(view)] }
    case 'docker':
      return { toolbar: dockerToolbar(view), panels: [dockerPanel(view)] }
  }
}
