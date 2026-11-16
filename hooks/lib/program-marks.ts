import { type Mark, makeMark } from './agent-marks'
import { TOKYO_NIGHT as color } from './palette'

const VERSION_IN_PARENTHESES = /\s*\(v?[\d.]+\)$/
const TRAILING_VERSION = /[\d.]+$/
const MAX_CACHED_NAMES = 256

const program = (key: string, name: string, glyph: string, glyphColor: string = color.foreground): Mark =>
  makeMark('programs', key, { name, tint: true, glyph, color: glyphColor })

const MARKS = {
  node: program('node', 'Node.js', '⬢', color.green),
  next: program('next', 'Next.js', 'N'),
  python: program('python', 'Python', 'λ', color.yellow),
  fastapi: program('fastapi', 'FastAPI', 'ϟ', color.teal),
  django: program('django-admin', 'Django', 'd', color.green),
  docker: program('docker', 'Docker', '⬡', color.blue),
  postgres: program('psql', 'PostgreSQL', 'ε', color.blue),
  redis: program('redis-cli', 'Redis', '◆', color.red),
  mongodb: program('mongosh', 'MongoDB', '♦', color.green),
  mysql: program('mysql', 'MySQL', '≋', color.blue),
  go: program('go', 'Go', 'G', color.cyan),
  rust: program('cargo', 'Rust', 'R', color.orange),
  electron: program('electron', 'Electron', '⚛', color.cyan),
  kubernetes: program('kubectl', 'Kubernetes', '⎈', color.blue),
  ssh: program('ssh', 'SSH', '⇄'),
  rails: program('rubyonrails', 'Rails', 'R', color.red),
  chrome: program('googlechrome', 'Chrome', '◍', color.yellow),
} as const

const PROGRAM_MARKS: Record<string, Mark> = {
  node: MARKS.node,
  'next-server': MARKS.next,
  next: MARKS.next,
  vite: program('vite', 'Vite', 'V', color.purple),
  esbuild: program('esbuild', 'esbuild', 'e', color.yellow),
  webpack: program('webpack', 'webpack', '◈', color.blue),
  turbo: program('turbo', 'Turborepo', '◎', color.red),
  bun: program('bun', 'Bun', 'b'),
  deno: program('deno', 'Deno', 'd'),
  python: MARKS.python,
  uvicorn: MARKS.fastapi,
  fastapi: MARKS.fastapi,
  gunicorn: program('gunicorn', 'Gunicorn', 'g', color.green),
  flask: program('flask', 'Flask', 'f'),
  'django-admin': MARKS.django,
  'manage.py': MARKS.django,
  ruby: program('ruby', 'Ruby', '◆', color.red),
  rails: MARKS.rails,
  puma: MARKS.rails,
  docker: MARKS.docker,
  dockerd: MARKS.docker,
  containerd: MARKS.docker,
  'docker-proxy': MARKS.docker,
  podman: program('podman', 'Podman', '⬡', color.purple),
  postgres: MARKS.postgres,
  postmaster: MARKS.postgres,
  'redis-server': MARKS.redis,
  mongod: MARKS.mongodb,
  mysqld: MARKS.mysql,
  mariadbd: MARKS.mysql,
  nginx: program('nginx', 'nginx', 'N', color.green),
  caddy: program('caddy', 'Caddy', 'C', color.teal),
  java: program('java', 'Java', 'J', color.orange),
  go: MARKS.go,
  gopls: MARKS.go,
  cargo: MARKS.rust,
  rustc: MARKS.rust,
  'rust-analyzer': MARKS.rust,
  electron: MARKS.electron,
  ollama: program('ollama', 'Ollama', 'o'),
  elasticsearch: program('elasticsearch', 'Elasticsearch', 'E', color.yellow),
  'beam.smp': program('rabbitmq', 'RabbitMQ', 'r', color.orange),
  kubectl: MARKS.kubernetes,
  kubelet: MARKS.kubernetes,
  ssh: MARKS.ssh,
  sshd: MARKS.ssh,
  git: program('git', 'git', '⎇', color.orange),
  tmux: program('tmux', 'tmux', '▥', color.green),
  nvim: program('nvim', 'Neovim', 'v', color.green),
  vim: program('vim', 'Vim', 'v', color.green),
  chrome: MARKS.chrome,
  chromium: MARKS.chrome,
}

const PROGRAM_PATTERNS: [RegExp, Mark][] = [
  [/^(google )?chrome|^chromium/i, MARKS.chrome],
  [/^com\.docker\./, MARKS.docker],
  [/^(rails|puma)\b/, MARKS.rails],
  [/^electron/i, MARKS.electron],
]

const markOfName = new Map<string, Mark | null>()

const listedMarkOf = (name: string): Mark | null => PROGRAM_MARKS[name] ?? null

function findMark(processName: string): Mark | null {
  const name = processName.trim().replace(VERSION_IN_PARENTHESES, '').toLowerCase()
  const exactMark = listedMarkOf(name) ?? listedMarkOf(name.replace(TRAILING_VERSION, ''))
  if (exactMark) return exactMark
  return PROGRAM_PATTERNS.find(([pattern]) => pattern.test(processName.trim()))?.[1] ?? null
}

export function programMarkOf(processName: string): Mark | null {
  const cached = markOfName.get(processName)
  if (cached !== undefined) return cached
  if (markOfName.size >= MAX_CACHED_NAMES) markOfName.clear()
  const mark = findMark(processName)
  markOfName.set(processName, mark)
  return mark
}

export const allProgramMarks = (): Mark[] => [...new Set(Object.values(PROGRAM_MARKS))]
