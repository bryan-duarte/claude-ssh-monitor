import { agentKey } from './history'
import type { AgentProcess, AgentState, AgentView, HostSnapshot, MonitorHistory, SessionRow, SessionState } from './schemas'

const WORKING_CPU_PERCENT = 3
const CLAUDE_APP = 'claude'
const SESSION_STATE_URGENCY: Record<SessionState, number> = { blocked: 2, working: 1, idle: 0 }

const mostUrgentThenNewest = (first: SessionRow, second: SessionRow): number =>
  SESSION_STATE_URGENCY[second.state] - SESSION_STATE_URGENCY[first.state] || second.updated_at - first.updated_at

function stateOf(agent: AgentProcess, rankedSessions: SessionRow[]): AgentState {
  const session = agent.app === CLAUDE_APP ? rankedSessions.find(row => row.cwd === agent.cwd) : undefined
  if (session) return session.state
  return (agent.cpu ?? 0) >= WORKING_CPU_PERCENT ? 'working' : 'idle'
}

export function agentViews(host: HostSnapshot, history: MonitorHistory): AgentView[] {
  const rankedSessions = [...host.sessions].sort(mostUrgentThenNewest)
  return host.agents.map(agent => ({
    process: agent,
    state: stateOf(agent, rankedSessions),
    cpuHistory: history.agents[agentKey(host.label, agent.pid)] ?? [],
  }))
}
