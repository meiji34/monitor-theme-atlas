import { createContext, useContext } from 'react'
import { dataId } from './ids'
import { t } from './i18n'
import type { Node } from './types'

// The return path from each node to the three Chinese carriers: which network
// carries it back (CN2 GIA, 9929, CMI …). Traced by scripts/china-lines.mjs and
// bundled as a snapshot; the theme setting 「三網線路」 overrides it per node.

export type Carrier = 'ct' | 'cu' | 'cm'
export const CARRIERS: Carrier[] = ['ct', 'cu', 'cm']
export const CARRIER_NAME: Record<Carrier, string> = { ct: '電信', cu: '聯通', cm: '移動' }

export interface TracedLine {
  line: string | null // null: the trace didn't reach a network of that carrier
  path: number[] // networks crossed, in order
}
export interface LinesData {
  generated: string
  target: string // province traced to (FJ)
  asns: Record<string, string>
  nodes: Record<string, { traced: string; tool: string } & Record<Carrier, TracedLine>>
}

export interface NodeLine {
  carrier: Carrier
  line: string
  premium: boolean
  source: 'trace' | 'config'
  path: number[]
  traced?: string
}

// `vite build --mode base` (npm run pack:base, the public release) leaves the
// deployment's own data out even when the file exists locally.
const files = import.meta.env.VITE_ATLAS_BASE
  ? {}
  : import.meta.glob<LinesData>('../data/china-lines.json', { eager: true, import: 'default' })
export const LINES: LinesData | null = Object.values(files)[0] ?? null

// Where the traces went, for the section heading.
export const cnTarget = () => (LINES?.target === 'FJ' ? t('回程到福建三網') : t('回程到中國三網'))

export const lineAsName = (asn: number) => LINES?.asns[asn] || `AS${asn}`

// Optimised lines get the highlight; everything else, the carriers' ordinary
// backbones (163, CN2 GT, 4837, CMI, CMNET) and unknown names, does not.
export function isPremium(line: string): boolean {
  const s = line.toUpperCase()
  if (/\bGT\b|163|4837|CMNET|\bCMI\b/.test(s)) return false
  return /GIA|9929|10099|CUG|CMIN2|CTG|CN2/.test(s)
}

const CARRIER_KEYS: [RegExp, Carrier][] = [
  [/^(電信|电信|(china )?telecom\b|ct\b)\s*[:：]?\s*/i, 'ct'],
  [/^(聯通|联通|(china )?unicom\b|cu\b)\s*[:：]?\s*/i, 'cu'],
  [/^(移動|移动|(china )?mobile\b|cm\b)\s*[:：]?\s*/i, 'cm'],
]

// "name or #id = 電信 CN2 GIA, 聯通 9929, 移動 CMI" lines from the theme
// settings. A carrier left out keeps the traced line; "-" hides it.
export function parseCnLines(text: string): Map<string, Partial<Record<Carrier, string>>> {
  const out = new Map<string, Partial<Record<Carrier, string>>>()
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const eq = line.indexOf('=')
    if (!line || line.startsWith('//') || eq < 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const entry: Partial<Record<Carrier, string>> = {}
    for (const part of line.slice(eq + 1).split(/[,，、;；]/)) {
      const p = part.trim()
      for (const [re, c] of CARRIER_KEYS) {
        const m = re.exec(p)
        if (m) {
          entry[c] = p.slice(m[0].length).trim()
          break
        }
      }
    }
    if (key && Object.keys(entry).length) out.set(key, entry)
  }
  return out
}

// The three lines of a node, config first, then the snapshot. Carriers with
// neither are left out.
export function cnLinesFor(node: Node, config: Map<string, Partial<Record<Carrier, string>>>): NodeLine[] {
  const own = config.get(`#${node.id}`) ?? config.get(`#${dataId(node.id)}`) ?? config.get(node.name.toLowerCase())
  const traced = LINES?.nodes[dataId(node.id)]
  const out: NodeLine[] = []
  for (const c of CARRIERS) {
    const set = own?.[c]
    if (set === '-') continue
    if (set) {
      out.push({ carrier: c, line: set, premium: isPremium(set), source: 'config', path: traced?.[c]?.path ?? [] })
      continue
    }
    const t = traced?.[c]
    if (t?.line) out.push({ carrier: c, line: t.line, premium: isPremium(t.line), source: 'trace', path: t.path, traced: traced!.traced })
  }
  return out
}


// The lines of a node as the page shows them: the owner's switch and
// overrides applied once in App, read anywhere below it.
export const CnLinesContext = createContext<(node: Node) => NodeLine[]>(() => [])
export const useCnLines = (node: Node) => useContext(CnLinesContext)(node)
