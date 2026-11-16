import type { EngineInterface as Engine } from 'claude-code'
import { type AskOption, type AskPlan, dockerPrunePlan, killPlan } from './action-dialogs'
import { runAction } from './action-run'
import { BRAND } from './mod'
import type { ActionResult, HostSnapshot, ListeningPort } from './schemas'
import { readCheckingPruneOn, updateCheckingPruneOn } from './store'
import { openPort, stopTunnel, togglePin } from './tunnels'

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

type PortChoice = 'open' | 'stop' | 'pin' | 'kill'

const FIRST_KILLABLE_PID = 2
const PORT_HEADER = 'Port'

function portChoices(port: ListeningPort, hasTunnel: boolean): { label: string; choice: PortChoice }[] {
  const pinChoice = { label: port.pinned ? 'Unpin' : 'Pin', choice: 'pin' as const }
  if (!port.listening) return [pinChoice]
  const canKill = port.pid !== null && port.pid >= FIRST_KILLABLE_PID
  const tunnelChoices = [{ label: 'Open in browser', choice: 'open' as const }]
  if (hasTunnel) return [...tunnelChoices, { label: 'Stop tunnel', choice: 'stop' as const }, pinChoice]
  return [...tunnelChoices, pinChoice, ...(canKill ? [{ label: 'Kill process', choice: 'kill' as const }] : [])]
}

async function askPortChoice($: Engine, host: HostSnapshot, port: ListeningPort, hasTunnel: boolean): Promise<PortChoice | null> {
  const choices = portChoices(port, hasTunnel)
  const owner = port.process || 'another user'
  const question = `:${port.port} on ${host.label}, held by ${owner}.\nWhat do you want to do?`
  try {
    const answer = await $.ui.ask(question, { header: PORT_HEADER, options: [...choices.map(item => item.label), CANCEL_LABEL] })
    return choices.find(item => item.label === answer)?.choice ?? null
  } catch {
    return null
  }
}

export async function choosePortAction($: Engine, host: HostSnapshot, port: ListeningPort, hasTunnel: boolean): Promise<void> {
  if (isAsking) {
    $.ui.toast(`${BRAND}: Another action waits for an answer.`)
    return
  }
  isAsking = true
  const choice = await askPortChoice($, host, port, hasTunnel).finally(() => {
    isAsking = false
  })
  if (choice === 'open') return openPort($, host, port.port)
  if (choice === 'stop') return stopTunnel($, host, port.port)
  if (choice === 'pin') return togglePin($, host, port.port, port.pinned)
  if (choice === 'kill' && port.pid !== null) return confirmAndRun($, killPlan(host, port.pid))
}
