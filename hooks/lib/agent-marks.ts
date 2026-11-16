import { TOKYO_NIGHT as color } from './palette'

export type Mark = {
  key: string
  name: string
  svg: string | null
  png: string | null
  tint: boolean
  glyph: string
  color: string
  isDefault: boolean
}

type MarkSpec = { name: string; tint: boolean; glyph: string; color: string; pngOnly?: boolean }

const markFile = (folder: string, key: string, extension: 'svg' | 'png'): string => `assets/${folder}/${key}.${extension}`

export function makeMark(folder: string, key: string, spec: MarkSpec): Mark {
  return {
    key,
    name: spec.name,
    svg: spec.pngOnly ? null : markFile(folder, key, 'svg'),
    png: spec.pngOnly ? markFile(folder, key, 'png') : markFile(`png/${folder}`, key, 'png'),
    tint: spec.tint,
    glyph: spec.glyph,
    color: spec.color,
    isDefault: false,
  }
}

const AGENT_SPECS: Record<string, MarkSpec> = {
  claude: { name: 'Claude Code', tint: false, glyph: '✻', color: '#d97757' },
  codex: { name: 'Codex', tint: false, glyph: '◎', color: color.foreground },
  cursor: { name: 'Cursor', tint: true, glyph: '⬢', color: color.foreground },
  opencode: { name: 'OpenCode', tint: true, glyph: '▣', color: color.foreground },
  gemini: { name: 'Gemini CLI', tint: true, glyph: '✦', color: color.blue },
  antigravity: { name: 'Antigravity', tint: false, glyph: '▲', color: color.blue },
  amp: { name: 'Amp', tint: false, glyph: '≈', color: color.orange },
  copilot: { name: 'Copilot', tint: true, glyph: '◉', color: color.foreground },
  crush: { name: 'Crush', tint: false, glyph: '◆', color: color.magenta },
  kimi: { name: 'Kimi', tint: false, glyph: 'K', color: color.foreground },
  kiro: { name: 'Kiro', tint: false, glyph: '◐', color: color.purple },
  grok: { name: 'Grok', tint: true, glyph: '⊘', color: color.foreground },
  pi: { name: 'Pi', tint: true, glyph: 'π', color: color.foreground },
  pig: { name: 'PiG', tint: false, glyph: 'π', color: color.magenta },
  qoder: { name: 'Qoder', tint: true, glyph: 'Q', color: color.foreground },
  hermes: { name: 'Hermes', tint: true, glyph: '☿', color: color.foreground },
  mastracode: { name: 'Mastra Code', tint: true, glyph: 'M', color: color.foreground },
  'dsh-tui': { name: 'DeepSeek Harness', tint: true, glyph: 'D', color: color.blue },
  git: { name: 'git', tint: true, glyph: '⎇', color: color.dim },
  goose: { name: 'Goose', tint: true, glyph: 'G', color: color.foreground },
  cline: { name: 'Cline', tint: true, glyph: 'C', color: color.foreground },
  kilo: { name: 'Kilo Code', tint: true, glyph: 'K', color: color.yellow },
  qwen: { name: 'Qwen Code', tint: true, glyph: 'Q', color: color.purple },
  devin: { name: 'Devin', tint: false, glyph: 'D', color: color.teal },
  openhands: { name: 'OpenHands', tint: false, glyph: 'O', color: color.yellow },
  jules: { name: 'Jules', tint: true, glyph: 'J', color: color.purple },
  continue: { name: 'Continue', tint: true, glyph: '»', color: color.foreground },
  droid: { name: 'Droid', tint: true, glyph: 'Ð', color: color.orange },
  omp: { name: 'oh-my-pi', tint: false, glyph: 'π', color: color.yellow },
  aider: { name: 'Aider', tint: false, glyph: 'A', color: color.green, pngOnly: true },
  plandex: { name: 'Plandex', tint: false, glyph: 'P', color: color.cyan, pngOnly: true },
}

export const AGENT_MARKS: Record<string, Mark> = Object.fromEntries(
  Object.entries(AGENT_SPECS).map(([key, spec]) => [key, makeMark('agents', key, spec)]),
)

const COMMAND_ALIASES: Record<string, string> = {
  'cursor-agent': 'cursor',
  'kiro-cli': 'kiro',
  agy: 'antigravity',
  qodercli: 'qoder',
  kilocode: 'kilo',
  pdx: 'plandex',
  cn: 'continue',
}

const SHEEP_KEY = 'default'
const SHEEP_GLYPH = 'ɷ'

const sheepMark = (agentName: string): Mark => ({
  ...makeMark('agents', SHEEP_KEY, { name: agentName, tint: true, glyph: SHEEP_GLYPH, color: color.foreground }),
  isDefault: true,
})

export function markOf(agentName: string): Mark {
  const key = COMMAND_ALIASES[agentName] ?? agentName
  return AGENT_MARKS[key] ?? sheepMark(agentName)
}
