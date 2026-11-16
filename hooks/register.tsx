import type { Register } from 'claude-code'
import { wireBand } from './lib/band'
import { startConsole, wireConsole } from './lib/console'
import { registerModelTool, wireModelTool } from './lib/model-tool'
import { startPoller } from './lib/poller'
import { startSessionState, wireSessionState } from './lib/session-state'
import { refreshTunnels } from './lib/tunnels'
import { loadIcons } from './lib/ui/icons'

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await loadIcons($)
    await startPoller($)
    startSessionState($)
    await startConsole($)
    await registerModelTool($)
    void refreshTunnels($).catch(() => undefined)
    return next(e)
  })
  wireSessionState(on)
  wireBand(on)
  wireConsole(on)
  wireModelTool(on)
}
