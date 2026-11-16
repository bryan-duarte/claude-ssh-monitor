import type {
  AgentView,
  ConsoleChoices,
  DockerByHost,
  DockerContainer,
  HostSnapshot,
  ListeningPort,
  MonitorHistory,
  PortNotes,
  Snapshot,
  Tunnel,
  WorktreeFilter,
  WorktreeItem,
  WorktreesByHost,
} from '../schemas'
import type { Ui } from '../ui/ui'

const WIDE_BODY_COLUMNS = 80

export type TabActions = {
  kill: (pid: number) => void
  removeWorktree: (worktree: WorktreeItem) => void
  changeContainer: (container: DockerContainer, name: 'docker-stop' | 'docker-rm') => void
  prune: () => void
  togglePin: (port: ListeningPort) => void
  openPort: (port: ListeningPort) => void
  stopTunnel: (port: ListeningPort) => void
  portMenu: (port: ListeningPort, hasTunnel: boolean) => void
  sortBy: (sort: ConsoleChoices['sort']) => void
  filterWorktrees: (filter: WorktreeFilter) => void
  showAllWorktrees: () => void
}

export type TabView = {
  act: TabActions
  ui: Ui
  host: HostSnapshot
  hostNumber: number
  snapshot: Snapshot
  history: MonitorHistory
  choices: ConsoleChoices
  agents: AgentView[]
  columns: number
  isWide: boolean
  worktrees: WorktreesByHost
  docker: DockerByHost
  tunnels: Tunnel[]
  portNotes: PortNotes
  checkingPruneOn: string | null
  showAllWorktrees: boolean
}

export const isWide = (bodyColumns: number): boolean => bodyColumns >= WIDE_BODY_COLUMNS
