import type { EngineInterface } from 'claude-code'
import { MILLISECONDS_PER_SECOND } from './mod'
import type { BackendFailure, BackendRunResult, MonitorSettings } from './schemas'

export const SNAPSHOT_TIMEOUT_MS = 20_000
export const DOCKER_TIMEOUT_MS = 90_000
export const ACTION_TIMEOUT_MS = 240_000
const WORKTREE_TIMEOUT_MARGIN_MS = 30_000
const MAX_RUN_TIMEOUT_MS = 600_000
const COMMAND_NOT_FOUND_EXIT_CODE = 127
const UNUSABLE_FOLDERS_EXIT_CODE = 1
const MISSING_PROGRAM_PATTERN = /ENOENT|not found|no such file/i

export const measureTimeoutMs = (settings: MonitorSettings): number =>
  Math.min(settings.worktree_timeout * MILLISECONDS_PER_SECOND + WORKTREE_TIMEOUT_MARGIN_MS, MAX_RUN_TIMEOUT_MS)

function backendPath($: EngineInterface): string {
  return `${$.plugin.root}/backend/bin/ssh-monitor`
}

function exitFailure(code: number, stderr: string): BackendFailure {
  const detail = stderr.trim() || `backend exited with ${code}`
  if (code === COMMAND_NOT_FOUND_EXIT_CODE) return { reason: 'backend_missing', detail }
  if (code === UNUSABLE_FOLDERS_EXIT_CODE) return { reason: 'runtime_dir', detail }
  return { reason: 'mod_bug', detail }
}

const hasUsedWholeTimeout = (startedAt: number, timeoutMs: number): boolean => Date.now() - startedAt >= timeoutMs

export async function runBackend($: EngineInterface, backendArguments: string[], timeoutMs: number): Promise<BackendRunResult> {
  const startedAt = Date.now()
  try {
    const run = await $.process.run(['bash', backendPath($), ...backendArguments], { timeoutMs })
    if (run.exitCode === 0) return { ok: true, stdout: run.stdout }
    return { ok: false, failure: exitFailure(run.exitCode, run.stderr) }
  } catch (runError) {
    const detail = String(runError)
    if (hasUsedWholeTimeout(startedAt, timeoutMs)) return { ok: false, failure: { reason: 'backend_timeout', detail } }
    const reason = MISSING_PROGRAM_PATTERN.test(detail) ? 'backend_missing' : 'mod_bug'
    return { ok: false, failure: { reason, detail } }
  }
}
