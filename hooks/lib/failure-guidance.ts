import { SNAPSHOT_TIMEOUT_MS } from './backend'
import { age, hostNameOfTarget } from './format'
import { BRAND, MILLISECONDS_PER_SECOND, nowInSeconds } from './mod'
import type {
  BackendFailure,
  BackendFailureReason,
  ConfigProblem,
  ConfigProblemReason,
  FailureReason,
  Guidance,
  HostDocker,
  HostProblem,
  HostProblemReason,
  HostSnapshot,
  HostWorktrees,
  MonitorSettings,
} from './schemas'

type HostContext = { label: string; target: string; hostName: string; settings: MonitorSettings }

const LOG_FILE = '~/.local/state/ssh-monitor/herdwatch.log'

const SETTING_FIELDS: Record<string, keyof MonitorSettings> = {
  WARN: 'warn',
  CRIT: 'crit',
  TOP_N: 'top_n',
  SSH_TIMEOUT: 'ssh_timeout',
  PANE_REFRESH: 'pane_refresh',
  STALE_SECONDS: 'stale_seconds',
  WORKTREE_INTERVAL: 'worktree_interval',
  WORKTREE_TIMEOUT: 'worktree_timeout',
  DOCKER_INTERVAL: 'docker_interval',
  ALERTS: 'alerts',
  DOCKER: 'docker',
}

const FAILURE_GUIDANCE: Record<FailureReason, (host: HostContext) => Guidance> = {
  timeout: ({ label, settings }) => ({
    summary: `${label} did not answer within SSH_TIMEOUT (${settings.ssh_timeout} s).`,
    nextStep: 'Raise SSH_TIMEOUT in settings.conf, or check the network.',
  }),
  hostkey: ({ label, target, hostName }) => ({
    summary: `The host key of ${label} changed since the last login.`,
    nextStep: `If you expected this, run ssh-keygen -R ${hostName}, then ssh ${target} once.`,
  }),
  tailscale_check: ({ label, target }) => ({
    summary: `Tailscale SSH asks for a browser check before it lets ${BRAND} into ${label}.`,
    nextStep: `In a terminal on this computer, not on ${label}, run ssh ${target} and open the link it prints.`,
  }),
  login: ({ label, target }) => ({
    summary: `${label} refused the SSH login.`,
    nextStep: `${BRAND} needs a key login without a prompt. Run ssh ${target} once and fix the key.`,
  }),
  dns: ({ label, hostName }) => ({
    summary: `The name ${hostName} does not resolve.`,
    nextStep: `Check the target of ${label} in hosts.conf.`,
  }),
  refused: ({ label }) => ({
    summary: `${label} refused the connection on the SSH port.`,
    nextStep: `Start sshd on ${label}, or check the port in hosts.conf.`,
  }),
  unreachable: ({ label }) => ({
    summary: `There is no network route to ${label}.`,
    nextStep: `Check the VPN or the network. ${BRAND} tries again at the next poll.`,
  }),
  ssh_config: ({ target }) => ({
    summary: 'Your SSH config has an error.',
    nextStep: `Run ssh -G ${target} to find the bad line in ~/.ssh/config.`,
  }),
  remote_shell: ({ label }) => ({
    summary: `${label} answered, but its login shell cannot run sh.`,
    nextStep: 'Give the SSH user a normal login shell.',
  }),
  probe_format: ({ label }) => ({
    summary: `${label} answered with text that is not ${BRAND} data.`,
    nextStep: 'Remove the lines that print text from the login files of the SSH user (.bashrc, .profile).',
  }),
  parse_failed: ({ label }) => ({
    summary: `${BRAND} could not read the data from ${label}.`,
    nextStep: `This is a ${BRAND} bug. Report the line from ${LOG_FILE}.`,
  }),
  unknown: ({ label, target }) => ({
    summary: `${label} did not answer.`,
    nextStep: `Run ssh ${target} true in a terminal to see the error.`,
  }),
}

const HOST_PROBLEM_GUIDANCE: Record<HostProblemReason, (problem: HostProblem) => Guidance> = {
  ports_hidden: ({ detail }) => ({
    summary: `Ports are hidden: ${detail} is not installed.`,
    nextStep: `Install ${detail} on the host.`,
  }),
  missing_tools: ({ detail }) => ({
    summary: `Some data is missing: ${detail} is not installed.`,
    nextStep: `Install ${detail} on the host.`,
  }),
  unsupported_os: () => ({
    summary: `${BRAND} does not know the OS of this host.`,
    nextStep: `${BRAND} reads Linux and macOS hosts.`,
  }),
}

const BACKEND_GUIDANCE: Record<BackendFailureReason, () => Guidance> = {
  backend_timeout: () => ({
    summary: `The poll took longer than ${SNAPSHOT_TIMEOUT_MS / MILLISECONDS_PER_SECOND} s.`,
    nextStep: 'Lower SSH_TIMEOUT in settings.conf, or remove slow hosts from hosts.conf.',
  }),
  backend_missing: () => ({
    summary: `The ${BRAND} backend is missing.`,
    nextStep: `Install the ${BRAND} plugin again, so its backend folder is complete.`,
  }),
  bad_output: () => ({
    summary: 'The backend printed data that the console cannot read.',
    nextStep: `Install the ${BRAND} plugin again, so the backend and the console match.`,
  }),
  mod_bug: () => ({ summary: 'The backend stopped with an error.', nextStep: `Read ${LOG_FILE}, and report the error.` }),
  runtime_dir: () => ({
    summary: `${BRAND} cannot use its folders.`,
    nextStep: 'Make sure that you own /tmp/ssh-monitor-<your uid> and ~/.local/state/ssh-monitor.',
  }),
}

const CONFIG_PROBLEM_TEXT: Record<ConfigProblemReason, (problem: ConfigProblem) => string> = {
  not_a_positive_integer: ({ key, value }) => `${key}=${value} is not a positive number`,
  above_100: ({ key, value }) => `${key}=${value} is above 100`,
  above_crit: ({ value }) => `WARN=${value} is above CRIT`,
  bad_regex: ({ key }) => `${key} is not a valid regular expression`,
  bad_path_list: ({ key, value }) => `${key}=${value} is not a list of 1 to 8 folders`,
  bad_branch_list: ({ key, value }) => `${key}=${value} is not a list of 1 to 8 branch names`,
  not_on_or_off: ({ key, value }) => `${key}=${value} is not on or off`,
  unknown_key: ({ key }) => `${key} is not a setting`,
  bad_label: ({ key }) => `the label ${key} is not valid. Use letters, digits, ".", "_" or "-", at most 24 characters`,
  bad_target: ({ key }) => `the target of ${key} is empty or starts with "-"`,
  duplicate: ({ key }) => `the label ${key} is used twice`,
  unreadable: () => `${BRAND} cannot read this file`,
  bad_port: ({ value }) => `${value} is not a port from 1 to 65535`,
  unknown_host: ({ key }) => `${key} is not a host in hosts.conf`,
  broken_host: ({ key, value }) => `the data of host ${key} is broken: ${value}`,
}

const hostContext = (host: HostSnapshot, settings: MonitorSettings): HostContext => ({
  label: host.label,
  target: host.target,
  hostName: hostNameOfTarget(host.target),
  settings,
})

const isFailureReason = (reason: string): reason is FailureReason => Object.hasOwn(FAILURE_GUIDANCE, reason)

export function hostFailureGuidance(host: HostSnapshot, settings: MonitorSettings): Guidance {
  const fallbackReason: FailureReason = host.state === 'auth' ? 'login' : 'unknown'
  const reason = host.reason && isFailureReason(host.reason) ? host.reason : fallbackReason
  return FAILURE_GUIDANCE[reason](hostContext(host, settings))
}

export const hostProblemGuidance = (problem: HostProblem): Guidance => HOST_PROBLEM_GUIDANCE[problem.reason](problem)

export const backendGuidance = (failure: BackendFailure): Guidance => BACKEND_GUIDANCE[failure.reason]()

function configProblemOutcome(problem: ConfigProblem, settings: MonitorSettings): string {
  if (problem.file === 'hosts.conf') return `${BRAND} skips this line.`
  if (problem.file === 'pins.conf') return `${BRAND} skips this pin.`
  if (problem.file === 'snapshot') return `${BRAND} hides this host.`
  const settingKey = problem.reason === 'above_crit' ? 'CRIT' : problem.key
  const field = SETTING_FIELDS[settingKey]
  if (!field) return `${BRAND} uses the default.`
  const currentValue = settings[field]
  const shownValue = typeof currentValue === 'boolean' ? (currentValue ? 'on' : 'off') : currentValue
  return `${BRAND} uses ${shownValue}.`
}

export function configProblemLine(problem: ConfigProblem, settings: MonitorSettings): string {
  const place = problem.line !== null && Number.isFinite(problem.line) ? `${problem.file} line ${problem.line}` : problem.file
  const describeProblem = CONFIG_PROBLEM_TEXT[problem.reason] ?? (() => `${problem.key} was refused (${problem.reason})`)
  return `${place}: ${describeProblem(problem)}. ${configProblemOutcome(problem, settings)}`
}

export function measureGuidance(
  measureName: 'worktree' | 'Docker',
  measure: HostWorktrees | HostDocker,
  host: HostSnapshot,
  settings: MonitorSettings,
): Guidance {
  if (measure.reason === 'missing_root') {
    return {
      summary: `These WORKTREE_ROOTS are not on ${host.label}: ${measure.error}.`,
      nextStep: 'Fix WORKTREE_ROOTS in settings.conf.',
    }
  }
  if (measure.reason === 'timeout') {
    const nextStep =
      measureName === 'worktree'
        ? 'Raise WORKTREE_TIMEOUT, or lower WORKTREE_DEPTH, in settings.conf.'
        : 'Check that docker system df answers on the host.'
    return { summary: `The ${measureName} measure of ${host.label} took too long.`, nextStep }
  }
  if (measure.reason) return FAILURE_GUIDANCE[measure.reason](hostContext(host, settings))
  return {
    summary: `The ${measureName} measure of ${host.label} failed.`,
    nextStep: `${BRAND} tries again at the next measure.`,
  }
}

export const downForText = (host: HostSnapshot, now: number = nowInSeconds()): string =>
  host.down_since !== null && Number.isFinite(host.down_since) ? ` · down for ${age(Math.max(0, now - host.down_since))}` : ''
