export type HostState = 'ok' | 'down' | 'auth' | 'pending'
export type PercentLevel = 'normal' | 'warning' | 'critical'
export type HostHealth = Exclude<HostState, 'ok'> | PercentLevel
export type AgentState = 'working' | 'blocked' | 'idle' | 'done'
export type SessionState = 'working' | 'blocked' | 'idle'
export type ConsoleTab = 'overview' | 'agents' | 'ports' | 'worktrees' | 'docker' | 'procs'
export type WorktreeFilter = 'all' | 'stale' | 'merged' | 'changed' | 'agent' | 'behind'
export type ProcessSort = 'cpu' | 'mem'
export type ChartRange = 24 | 60 | 120

export type FailureReason =
  | 'timeout'
  | 'hostkey'
  | 'tailscale_check'
  | 'login'
  | 'dns'
  | 'refused'
  | 'unreachable'
  | 'ssh_config'
  | 'remote_shell'
  | 'probe_format'
  | 'parse_failed'
  | 'unknown'

export type HostProblemReason = 'missing_tools' | 'unsupported_os' | 'ports_hidden'

export type HostProblem = { reason: HostProblemReason; detail: string }

export type ConfigProblemReason =
  | 'not_a_positive_integer'
  | 'above_100'
  | 'above_crit'
  | 'bad_regex'
  | 'bad_path_list'
  | 'bad_branch_list'
  | 'not_on_or_off'
  | 'unknown_key'
  | 'bad_label'
  | 'bad_target'
  | 'duplicate'
  | 'unreadable'
  | 'bad_port'
  | 'unknown_host'
  | 'broken_host'

export type ConfigProblem = {
  file: 'hosts.conf' | 'settings.conf' | 'pins.conf' | 'snapshot'
  line: number | null
  key: string
  value: string
  reason: ConfigProblemReason
}

export type BackendFailureReason = 'backend_timeout' | 'backend_missing' | 'bad_output' | 'mod_bug' | 'runtime_dir'

export type BackendFailure = { reason: BackendFailureReason; detail: string }

export type CollectorState = { state: 'ran' | 'busy'; busy_since: number | null }

export type Guidance = { summary: string; nextStep: string }

export type ProcessRow = {
  pid: number | null
  cpu: number | null
  mem: number | null
  agent: boolean
  name: string
}

export type AgentProcess = {
  pid: number | null
  app: string
  elapsed_seconds: number | null
  cpu: number | null
  mem: number | null
  cwd: string
  branch: string
  repository: string
  tree_cpu: number | null
  tree_rss_kb: number | null
  tree_count: number | null
  tree_names: string
}

export type ListeningPort = {
  port: number
  pid: number | null
  process: string
  agent_pid: number | null
  pinned: boolean
  listening: boolean
}

export type SessionRow = { cwd: string; state: SessionState; updated_at: number }

export type Tunnel = {
  label: string
  remotePort: number
  localPort: number
  state: 'running' | 'exited'
}

export type GpuInfo = {
  name: string
  pct: number | null
  mem_used_mib: number | null
  mem_total_mib: number | null
}

export type WorktreeItem = {
  size_kb: number | null
  tool: string
  repository: string
  branch: string
  path: string
  changed_files: number | null
  ahead: number | null
  behind: number | null
  last_commit_at: number | null
  absolute_path: string
  created_at: number | null
  last_activity_at: number | null
  merged_into: string
  common_dir: string
  default_branch: string
}

export type MeasureReason = '' | FailureReason | 'missing_root'

export type HostWorktrees = {
  state: 'ok' | 'failed' | 'pending'
  measured_at: number | null
  reason: MeasureReason
  error: string
  total_kb: number
  items: WorktreeItem[]
}

export type DockerContainerState = 'running' | 'exited' | 'paused' | 'created' | 'dead' | 'restarting' | 'removing'

export type DockerContainer = {
  id: string
  name: string
  image: string
  state: DockerContainerState
  created_at: number | null
  size_kb: number | null
}

export type DockerImage = {
  id: string
  repository: string
  tag: string
  size_kb: number | null
  is_dangling: boolean
}

export type DockerVolume = { name: string; size_kb: number | null; is_unused: boolean }

export type HostDocker = {
  state: 'ok' | 'failed' | 'pending' | 'missing' | 'denied' | 'off'
  measured_at: number | null
  reason: MeasureReason
  error: string
  total_kb: number
  reclaimable_kb: number
  containers: DockerContainer[]
  images: DockerImage[]
  volumes: DockerVolume[]
}

export type HostSnapshot = {
  label: string
  target: string
  state: HostState
  reason: FailureReason | ''
  detail: string
  os: string
  load: string
  home: string
  polled_at: number | null
  updated_at: number | null
  down_since: number | null
  rtt_ms: number | null
  ncpu: number | null
  uptime_seconds: number | null
  cpu_pct: number | null
  mem_total_kb: number | null
  mem_used_kb: number | null
  mem_pct: number | null
  swap_total_kb: number | null
  swap_used_kb: number | null
  swap_pct: number | null
  procs: number | null
  disk_pct: number | null
  disk_total_kb: number | null
  disk_used_kb: number | null
  disk_read_rate: number | null
  disk_write_rate: number | null
  disk_io_rate: number | null
  net_rx_rate: number | null
  net_tx_rate: number | null
  cores: (number | null)[]
  gpu: GpuInfo | null
  problems: HostProblem[]
  processes: ProcessRow[]
  agents: AgentProcess[]
  ports: ListeningPort[]
  sessions: SessionRow[]
  worktrees: HostWorktrees
  docker: HostDocker
}

export type MonitorSettings = {
  warn: number
  crit: number
  top_n: number
  ssh_timeout: number
  pane_refresh: number
  stale_seconds: number
  worktree_interval: number
  worktree_timeout: number
  docker_interval: number
  alerts: boolean
  docker: boolean
}

export type HostAlert = {
  kind: 'hot' | 'port_down'
  label: string
  cpu_pct: number | null
  mem_pct: number | null
  top_process: string
  port: number | null
}

export type Snapshot = {
  version: number
  generated_at: number
  hosts_file: string
  settings_file: string
  pins_file: string
  settings: MonitorSettings
  hosts: HostSnapshot[]
  worktrees_due: boolean
  docker_due: boolean
  collector: CollectorState
  problems: ConfigProblem[]
  alerts: HostAlert[]
}

export type SnapshotResult = { ok: true; snapshot: Snapshot } | { ok: false; failure: BackendFailure }
export type BackendRunResult = { ok: true; stdout: string } | { ok: false; failure: BackendFailure }

export type ActionName =
  | 'pin'
  | 'unpin'
  | 'kill'
  | 'worktree-remove'
  | 'docker-stop'
  | 'docker-rm'
  | 'docker-prune'
  | 'tunnel-open'
  | 'tunnel-stop'
  | 'tunnel-list'

export type ActionFailureReason =
  | 'bad_input'
  | 'busy'
  | 'host_down'
  | 'not_owner'
  | 'still_running'
  | 'dirty'
  | 'agent_inside'
  | 'branch_not_merged'
  | 'docker_denied'
  | 'docker_missing'
  | 'remote_error'
  | 'backend_timeout'
  | 'port_busy'
  | 'ssh_failed'

export type ActionResult =
  | { ok: true; message: string; data: Record<string, unknown> }
  | { ok: false; reason: ActionFailureReason; message: string; detail: string }

export type Sample = number | null

export type HostSeries = {
  at: number[]
  cpu: Sample[]
  mem: Sample[]
  swap: Sample[]
  rx: Sample[]
  tx: Sample[]
}

export type HostEventKind = 'start' | 'done' | 'alert'

export type HostEvent = { at: number; kind: HostEventKind; text: string }

export type ChartMarker = { position: number; kind: HostEventKind; text: string }

export type SharedAlert = HostAlert & { id: string; at: number }

export type MonitorHistory = {
  hosts: Record<string, HostSeries>
  agents: Record<string, Sample[]>
  events: Record<string, HostEvent[]>
  pids: Record<string, (number | null)[]>
  alerts: SharedAlert[]
}

export type WorktreesByHost = Record<string, HostWorktrees>
export type DockerByHost = Record<string, HostDocker>

export type AgentView = { process: AgentProcess; state: AgentState; cpuHistory: Sample[] }

export type ConsoleChoices = {
  host: string | null
  tab: ConsoleTab
  range: ChartRange
  filter: WorktreeFilter
  sort: ProcessSort
}

export type PortNotes = Record<string, string>

export type KeysMessage = { type: 'focus' } | { type: 'key'; key: string }

declare module 'claude-code' {
  interface PluginState {
    'ssh-monitor': {
      snapshot: Shaped<Snapshot | null>
      error: BackendFailure | null
      history: Shaped<MonitorHistory>
      worktrees: Shaped<WorktreesByHost>
      docker: Shaped<DockerByHost>
      tunnels: Shaped<Tunnel[]>
      choices: Shaped<ConsoleChoices>
      portNotes: PortNotes
      checkingPruneOn: string | null
      showAllWorktrees: boolean
      isKeyboardOn: boolean
      isConsoleOpen: boolean
      clockKey: string
      seenAlertIds: string[]
      ownerId: string
      startedAt: number
    }
  }
}
