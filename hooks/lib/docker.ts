import type { DockerByHost, DockerContainer, HostDocker, HostSnapshot, Snapshot } from './schemas'

export const isRunningContainer = (container: DockerContainer): boolean =>
  container.state === 'running' || container.state === 'restarting'

export const dockerOfHost = (dockerByHost: DockerByHost, host: HostSnapshot): HostDocker =>
  dockerByHost[host.label] ?? host.docker

export function splitDocker(snapshot: Snapshot): { lightSnapshot: Snapshot; dockerByHost: DockerByHost } {
  const dockerByHost = Object.fromEntries(snapshot.hosts.map(host => [host.label, host.docker]))
  const hosts = snapshot.hosts.map(host => ({ ...host, docker: { ...host.docker, containers: [], images: [], volumes: [] } }))
  return { lightSnapshot: { ...snapshot, hosts }, dockerByHost }
}

export function dockerSignature(dockerByHost: DockerByHost): string {
  return Object.entries(dockerByHost)
    .map(
      ([label, docker]) => `${label}:${docker.state}:${docker.measured_at}:${docker.containers.length}:${docker.images.length}`,
    )
    .sort()
    .join('|')
}

export function sortedContainers(containers: DockerContainer[]): DockerContainer[] {
  return [...containers].sort(
    (first, second) =>
      Number(isRunningContainer(second)) - Number(isRunningContainer(first)) || first.name.localeCompare(second.name),
  )
}
