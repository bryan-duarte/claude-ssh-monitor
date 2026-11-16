import type { EngineInterface as Engine } from 'claude-code'
import { ACTION_TIMEOUT_MS, runBackend } from './backend'
import { BRAND, MILLISECONDS_PER_SECOND } from './mod'
import type { ActionFailureReason, ActionName, ActionResult } from './schemas'
import { isRecord } from './schemas'

const UNREADABLE_OUTPUT_DETAIL_CHARACTERS = 200
const ACTION_FAILURE_REASONS = new Set<string>([
  'bad_input',
  'busy',
  'host_down',
  'not_owner',
  'still_running',
  'dirty',
  'agent_inside',
  'branch_not_merged',
  'docker_denied',
  'docker_missing',
  'remote_error',
  'backend_timeout',
  'port_busy',
  'ssh_failed',
] satisfies ActionFailureReason[])

function actionResultOrNull(parsed: unknown): ActionResult | null {
  if (!isRecord(parsed) || typeof parsed.message !== 'string') return null
  if (parsed.ok === true) return { ok: true, message: parsed.message, data: isRecord(parsed.data) ? parsed.data : {} }
  const isKnownFailure = parsed.ok === false && ACTION_FAILURE_REASONS.has(String(parsed.reason))
  if (!isKnownFailure) return null
  return {
    ok: false,
    reason: parsed.reason as ActionFailureReason,
    message: parsed.message,
    detail: typeof parsed.detail === 'string' ? parsed.detail : '',
  }
}

function parsedJsonOrNull(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return null
  }
}

function parseActionOutput(stdout: string): ActionResult {
  const actionResult = actionResultOrNull(parsedJsonOrNull(stdout))
  if (actionResult) return actionResult
  return {
    ok: false,
    reason: 'remote_error',
    message: 'The backend answered with data that the console cannot read.',
    detail: stdout.slice(0, UNREADABLE_OUTPUT_DETAIL_CHARACTERS),
  }
}

export async function runAction($: Engine, name: ActionName, label: string, actionArguments: string[]): Promise<ActionResult> {
  return runActionCommand($, [name, label, ...actionArguments])
}

export async function runActionCommand($: Engine, actionCommand: string[]): Promise<ActionResult> {
  const backendRun = await runBackend($, ['action', ...actionCommand], ACTION_TIMEOUT_MS)
  if (backendRun.ok) return parseActionOutput(backendRun.stdout)
  const { reason, detail } = backendRun.failure
  if (reason === 'backend_timeout') {
    const timeoutSeconds = ACTION_TIMEOUT_MS / MILLISECONDS_PER_SECOND
    return {
      ok: false,
      reason,
      message: `The action took longer than ${timeoutSeconds} s. It can still finish on the host.`,
      detail,
    }
  }
  return { ok: false, reason: 'remote_error', message: `The ${BRAND} backend failed.`, detail }
}
