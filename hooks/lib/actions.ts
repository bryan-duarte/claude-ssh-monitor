import type { EngineInterface as Engine } from 'claude-code'
import { type AskOption, type AskPlan, dockerPrunePlan } from './action-dialogs'
import { runAction } from './action-run'
import { BRAND } from './mod'
import type { ActionResult, HostSnapshot } from './schemas'
import { readCheckingPruneOn, updateCheckingPruneOn } from './store'

const CANCEL_LABEL = 'Cancel'
const FAILURE_TOAST_MS = 8000
let isAsking = false

async function ask($: Engine, plan: AskPlan, question: string, options: AskOption[]): Promise<AskOption | null> {
  const labels = [...options.map(option => option.label), CANCEL_LABEL]
  try {
    const answer = await $.ui.ask(question, { header: plan.header, options: labels })
    return options.find(option => option.label === answer) ?? null
  } catch {
    return null
  }
}

const failureText = (result: Extract<ActionResult, { ok: false }>): string =>
  `${BRAND}: ${result.message}${result.detail ? ` ${result.detail}` : ''}`

function toastResult($: Engine, result: ActionResult): void {
  if (result.ok) {
    $.ui.toast(`${BRAND}: ${result.message}`)
    return
  }
  $.ui.toast(failureText(result), { timeoutMs: FAILURE_TOAST_MS })
}

async function runPlan($: Engine, plan: AskPlan): Promise<void> {
  const option = await ask($, plan, plan.question, plan.options)
  if (!option) return
  const result = await runAction($, plan.name, plan.label, [...plan.args, ...option.flags])
  const escalation = plan.escalation
  const canEscalate = !result.ok && escalation !== null && result.reason === escalation.reason
  if (!canEscalate || result.ok) return toastResult($, result)
  const forceOption: AskOption = { label: escalation.label, flags: [...option.flags, escalation.flag] }
  const escalationQuestion = [result.message, result.detail, `${escalation.label}?`].filter(Boolean).join('\n')
  const forced = await ask($, plan, escalationQuestion, [forceOption])
  if (!forced) return
  toastResult($, await runAction($, plan.name, plan.label, [...plan.args, ...forced.flags]))
}

export async function confirmAndRun($: Engine, plan: AskPlan): Promise<void> {
  if (isAsking) {
    $.ui.toast(`${BRAND}: Another action waits for an answer.`)
    return
  }
  isAsking = true
  try {
    await runPlan($, plan)
  } finally {
    isAsking = false
  }
}

const numberOrZero = (candidate: unknown): number => Number(candidate) || 0

export async function previewPrune($: Engine, host: HostSnapshot): Promise<void> {
  if (await readCheckingPruneOn($)) return
  await updateCheckingPruneOn($, () => host.label)
  const preview = await runAction($, 'docker-prune', host.label, ['--preview']).finally(() =>
    updateCheckingPruneOn($, () => null),
  )
  if (!preview.ok) {
    $.ui.toast(`${BRAND}: Docker prune · ${preview.message}`, { timeoutMs: FAILURE_TOAST_MS })
    return
  }
  const sizes = { imagesKib: numberOrZero(preview.data.images_kb), volumesKib: numberOrZero(preview.data.volumes_kb) }
  await confirmAndRun($, dockerPrunePlan(host, sizes))
}
