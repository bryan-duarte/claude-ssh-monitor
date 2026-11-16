import { dockerOfHost, isRunningContainer, sortedContainers } from '../docker'
import { measureGuidance } from '../failure-guidance'
import { age, ageSince, storageSize } from '../format'
import { TOKYO_NIGHT as c } from '../palette'
import type { DockerContainer, HostDocker } from '../schemas'
import type { Tree } from '../ui/ui'
import { fixedCell, panel, panelTitle, rowButton, textButton } from '../ui/widgets'
import type { TabView } from './view'

const RUNNING_DOT = '●'
const STOPPED_DOT = '○'
const COLUMNS = {
  dot: 2,
  state: 9,
  age: 5,
  size: 8,
  action: 2,
  wide: { name: 18 },
  narrow: { name: 12 },
} as const

type Notice = { color: string; message: string }

function containerAction(view: TabView, container: DockerContainer): Tree {
  const name = isRunningContainer(container) ? 'docker-stop' : 'docker-rm'
  return rowButton(view.ui, {
    key: `${name}-${container.id}`,
    glyph: name === 'docker-stop' ? 'square' : 'trash-2',
    onPress: () => view.act.changeContainer(container, name),
  })
}

function containerRow(view: TabView, container: DockerContainer): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  const isRunning = isRunningContainer(container)
  const nameColumns = view.isWide ? COLUMNS.wide.name : COLUMNS.narrow.name
  const createdAge = container.created_at === null ? '?' : ageSince(container.created_at).replace(' ago', '')
  return (
    <Box key={`docker-${container.id}`} columnGap={1}>
      {fixedCell(ui, COLUMNS.dot, <Text color={isRunning ? c.green : c.comment}>{isRunning ? RUNNING_DOT : STOPPED_DOT}</Text>)}
      {fixedCell(
        ui,
        nameColumns,
        <Text color={c.foreground} wrap="truncate-end">
          {container.name}
        </Text>,
      )}
      <Box flexGrow={1} flexShrink={1} overflow="hidden">
        <Text color={c.foregroundDark} wrap="truncate-end">
          {container.image}
        </Text>
      </Box>
      {fixedCell(ui, COLUMNS.state, <Text color={isRunning ? c.green : c.comment}>{container.state}</Text>)}
      {fixedCell(ui, COLUMNS.age, <Text color={c.comment}>{createdAge}</Text>, true)}
      {fixedCell(ui, COLUMNS.size, <Text color={c.comment}>{storageSize(container.size_kb)}</Text>, true)}
      {fixedCell(ui, COLUMNS.action, containerAction(view, container), true)}
    </Box>
  )
}

function columnHeader(view: TabView): Tree {
  const { ui } = view
  const { Box, Text } = ui.el
  const nameColumns = view.isWide ? COLUMNS.wide.name : COLUMNS.narrow.name
  const heading = (label: string): Tree => <Text color={c.comment}>{label}</Text>
  return (
    <Box key="docker-header" columnGap={1}>
      {fixedCell(ui, COLUMNS.dot, null)}
      {fixedCell(ui, nameColumns, heading('name'))}
      <Box flexGrow={1} flexShrink={1}>
        {heading('image')}
      </Box>
      {fixedCell(ui, COLUMNS.state, heading('state'))}
      {fixedCell(ui, COLUMNS.age, heading('age'), true)}
      {fixedCell(ui, COLUMNS.size, heading('size'), true)}
      {fixedCell(ui, COLUMNS.action, null)}
    </Box>
  )
}

function storageLine(docker: HostDocker): string {
  const imagesKib = docker.images.reduce((sum, image) => sum + (image.size_kb ?? 0), 0)
  const volumesKib = docker.volumes.reduce((sum, volume) => sum + (volume.size_kb ?? 0), 0)
  const unusedVolumes = docker.volumes.filter(volume => volume.is_unused).length
  const danglingImages = docker.images.filter(image => image.is_dangling).length
  return `images ${storageSize(imagesKib)} (${docker.images.length}, ${danglingImages} untagged) · volumes ${storageSize(volumesKib)} (${docker.volumes.length}, ${unusedVolumes} unused)`
}

function failedMeasureMessage(view: TabView, docker: HostDocker): string {
  const { summary, nextStep } = docker.reason
    ? measureGuidance('Docker', docker, view.host, view.snapshot.settings)
    : { summary: 'Docker did not answer.', nextStep: 'Check that the Docker daemon runs on the host.' }
  return `${summary}${docker.error ? ` (${docker.error})` : ''} Next: ${nextStep}`
}

function stateNotice(view: TabView, docker: HostDocker): Notice | null {
  const { host, snapshot } = view
  if (docker.state === 'off')
    return { color: c.comment, message: 'The Docker tab is off. Set DOCKER=on in settings.conf to turn it on.' }
  if (docker.state === 'missing') return { color: c.comment, message: `Docker is not installed on ${host.label}.` }
  if (docker.state === 'denied') {
    return {
      color: c.yellow,
      message: `The SSH user of ${host.label} cannot reach Docker. Add it to the docker group, then log in again.`,
    }
  }
  if (docker.state === 'pending')
    return { color: c.comment, message: `Measuring Docker. A measure runs every ${age(snapshot.settings.docker_interval)}.` }
  if (docker.state === 'failed') return { color: c.red, message: failedMeasureMessage(view, docker) }
  return null
}

function pruneButton(view: TabView, docker: HostDocker): Tree {
  const { Text } = view.ui.el
  const isCheckingHere = view.checkingPruneOn === view.host.label
  if (view.checkingPruneOn !== null) {
    return <Text color={c.comment}>{isCheckingHere ? 'checking…' : `prune ${storageSize(docker.reclaimable_kb)}`}</Text>
  }
  const label = `prune ${storageSize(docker.reclaimable_kb)}`
  return textButton(view.ui, `docker-prune-${view.host.label}`, `[ ${label} ]`, c.foregroundDark, view.act.prune)
}

function dockerTitle(view: TabView, docker: HostDocker | null): Tree {
  const { Text } = view.ui.el
  return (
    <Text>
      {panelTitle(view.ui, 'container', 'docker', c.blue)}
      {docker ? <Text color={c.foreground}>{` ${storageSize(docker.total_kb)}`}</Text> : null}
      {docker ? <Text color={c.comment}>{` · ${storageSize(docker.reclaimable_kb)} can be freed`}</Text> : null}
    </Text>
  )
}

function containersTitle(view: TabView, docker: HostDocker): Tree {
  const { Text } = view.ui.el
  const runningCount = docker.containers.filter(isRunningContainer).length
  const stoppedCount = docker.containers.length - runningCount
  return <Text color={c.comment}>{`${runningCount} running · ${stoppedCount} stopped`}</Text>
}

export function dockerPanel(view: TabView): Tree {
  const { ui, host, snapshot } = view
  const { Box, Text } = ui.el
  const docker = dockerOfHost(view.docker, host)
  const notice = stateNotice(view, docker)
  const hasLists = docker.containers.length + docker.images.length + docker.volumes.length > 0
  const statusLine = notice ? <Text color={notice.color}>{notice.message}</Text> : null
  if (!hasLists) {
    return panel(ui, {
      key: `docker-${host.label}`,
      title: dockerTitle(view, null),
      children: [statusLine ?? <Text color={c.comment}>No Docker data yet.</Text>],
    })
  }
  const containers =
    docker.containers.length > 0
      ? [columnHeader(view), ...sortedContainers(docker.containers).map(container => containerRow(view, container))]
      : [<Text color={c.comment}>No containers.</Text>]
  return panel(ui, {
    key: `docker-${host.label}`,
    title: dockerTitle(view, docker),
    rightTitle: containersTitle(view, docker),
    children: [
      statusLine,
      <Box key="docker-tools" justifyContent="space-between" columnGap={1}>
        <Text
          color={c.comment}
        >{`containers · ${docker.containers.filter(isRunningContainer).length} running of ${docker.containers.length}`}</Text>
        {pruneButton(view, docker)}
      </Box>,
      ...containers,
      <Text color={c.comment}>{storageLine(docker)}</Text>,
      <Text
        color={c.comment}
      >{`measured ${ageSince(docker.measured_at)} · every ${age(snapshot.settings.docker_interval)}`}</Text>,
    ],
  })
}
