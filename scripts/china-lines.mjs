#!/usr/bin/env node
// Which network each node's traffic takes back to the three Chinese carriers
// (China Telecom / Unicom / Mobile, Fujian), for the theme's 「三網回程」.
//
//   node scripts/china-lines.mjs                 every node in routes.local.json with an ssh alias
//   node scripts/china-lines.mjs 2 5             only these nodes, merged into the existing data
//   node scripts/china-lines.mjs 12=jp-neburst   a node not in routes.local.json: hub id = ssh alias
//   node scripts/china-lines.mjs --reclassify    no tracing: decide the lines of the saved paths again
//
// For each node it pipes scripts/lib/china-trace.sh into `sh -s` over SSH (as
// the same user mtr runs as when routes.local.json gives one), which traces
// with whatever the node has (traceroute over TCP 80, mtr, busybox, TTL-limited
// ping). The hops' networks come from a few well-known prefixes and ip-api.com;
// the line is decided by the carrier backbones seen. The output holds AS
// numbers and line names only, never addresses: it ships in the public bundle.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { AS_NAMES } from './lib/places.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = resolve(root, 'routes.local.json')
const OUT = resolve(root, 'src/data/china-lines.json')
const PROBE = readFileSync(resolve(root, 'scripts/lib/china-trace.sh'), 'utf8').replace(/\r\n/g, '\n')
const CARRIERS = ['ct', 'cu', 'cm']

function run(cmd, args, input, timeout = 300_000) {
  return new Promise((ok, fail) => {
    const p = spawn(cmd, args, { stdio: ['pipe', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill(), timeout)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('error', fail)
    p.on('close', (code) => {
      clearTimeout(timer)
      if (out.includes('done\t1')) ok(out)
      else fail(new Error(err.trim().split('\n').at(-1) || `exit ${code}`))
    })
    p.stdin.end(input)
  })
}

// --- networks -------------------------------------------------------------------

// Backbones that answer from well-known blocks: no lookup needed.
const PREFIX = [
  [/^59\.43\./, 4809], // China Telecom CN2
  [/^202\.97\./, 4134], // China Telecom 163
  [/^219\.158\./, 4837], // China Unicom 169 backbone
  [/^218\.105\./, 9929], // China Unicom Industrial Internet (A network)
  [/^210\.51\./, 9929],
  [/^221\.183\./, 9808], // China Mobile CMNET backbone
]
const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]
const isPrivate = (ip) => PRIVATE.some((r) => r.test(ip))

// Which carrier a network belongs to, from its number or holder name.
const CT_AS = new Set([4134, 4809, 4812, 4811, 4813, 4816, 23764, 4835, 4847, 134773, 133774, 136188, 137687])
const CU_AS = new Set([4837, 9929, 10099, 4808, 17621, 17623, 17816, 133118, 135061, 136958, 138421])
const CM_AS = new Set([9808, 58453, 58807, 24400, 56040, 56041, 56042, 56044, 56046, 56047, 56048, 24444, 24445, 132525, 134810])
function carrierOf(asn, name = '') {
  if (CT_AS.has(asn) || /chinanet|china ?telecom|ctg ?net/i.test(name)) return 'ct'
  if (CU_AS.has(asn) || /unicom|china169|cncgroup|cnc ?group/i.test(name)) return 'cu'
  if (CM_AS.has(asn) || /china ?mobile|cmnet|\bcmi\b|cmin2/i.test(name)) return 'cm'
  return ''
}

async function ipApi(ips) {
  const out = new Map()
  for (let i = 0; i < ips.length; i += 100) {
    const res = await fetch('http://ip-api.com/batch?fields=status,as,query', {
      method: 'POST',
      body: JSON.stringify(ips.slice(i, i + 100)),
    })
    if (!res.ok) throw new Error(`ip-api: HTTP ${res.status}`)
    for (const r of await res.json()) if (r.status === 'success') out.set(r.query, r)
  }
  return out
}

// "AS4837 CHINA UNICOM China169 Backbone" -> [4837, "CHINA UNICOM China169 Backbone"]
function parseAs(s) {
  const m = /^AS(\d+)\s*(.*)$/.exec(s || '')
  if (!m) return null
  let name = m[2].split(',')[0].trim()
  if (name.length > 28) name = name.slice(0, 28).replace(/\s+\S*$/, '') + '…'
  return [Number(m[1]), name]
}

// The carriers' own networks, named the way their lines are known.
const CARRIER_NAMES = {
  4837: 'China Unicom 4837',
  9808: 'China Mobile CMNET',
  10099: 'China Unicom CUG',
  23764: 'China Telecom CTGNet',
  133776: 'China Telecom Fujian',
}
const names = new Map(Object.entries({ ...AS_NAMES, ...CARRIER_NAMES }).map(([k, v]) => [Number(k), v]))

// The line, from the carrier networks the path passed through. Order of the
// checks is the order of preference: an optimised backbone anywhere on the
// path wins over the ordinary one it may hand over to.
// An ordinary line is only claimed when the handover into the carrier was
// seen: a trace whose routers stayed silent until the destination's own
// network can't rule out an optimised backbone in between.
function lineOf(carrier, asns) {
  const has = (n) => asns.includes(n)
  const first = asns.findIndex((n) => carrierOf(n, names.get(n)) === carrier)
  const own = first > 0
  if (carrier === 'ct') {
    // CN2 all the way is GIA; CN2 handing over to 163 is GT. Abroad the
    // carrier is either CN2 itself or CTGNet, its newer global network.
    if (has(4809)) return has(4134) ? 'CN2 GT' : has(23764) ? 'CTG GIA' : 'CN2 GIA'
    if (has(23764) && !has(4134)) return 'CTG'
    return own ? '163' : null
  }
  if (carrier === 'cu') {
    if (has(9929)) return '9929'
    if (has(10099)) return 'CUG'
    return own ? '4837' : null
  }
  if (has(58807)) return 'CMIN2'
  if (has(58453)) return 'CMI'
  return own ? 'CMNET' : null
}

// --- main -----------------------------------------------------------------------

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { nodes: {}, asns: {} }
const now = new Date().toISOString()

function save(data) {
  const used = new Set(Object.values(data.nodes).flatMap((n) => CARRIERS.flatMap((c) => n[c]?.path ?? [])))
  data.asns = {}
  for (const n of [...used].sort((x, y) => x - y)) data.asns[n] = names.get(n) || previous.asns?.[n] || ''
  const text = JSON.stringify(data, null, 1)
  if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text)) {
    console.error('refusing to write: output contains an IP address')
    process.exit(1)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, text + '\n')
  console.log(`wrote ${Object.keys(data.nodes).length} nodes -> src/data/china-lines.json`)
}
const show = (entry) =>
  CARRIERS.map((c) => `${c} ${entry[c].line ?? '?'} [${entry[c].path.map((n) => names.get(n) || `AS${n}`).join(' > ')}]`).join('  ')

if (process.argv.includes('--reclassify')) {
  for (const [n, name] of Object.entries(previous.asns ?? {})) if (name && !names.has(Number(n))) names.set(Number(n), name)
  for (const [id, entry] of Object.entries(previous.nodes)) {
    for (const c of CARRIERS) entry[c].line = lineOf(c, entry[c].path)
    console.log(`  #${id}  ${show(entry)}`)
  }
  save(previous)
  process.exit(0)
}

const cfgNodes = existsSync(CONFIG) ? JSON.parse(readFileSync(CONFIG, 'utf8')).nodes : {}
const args = process.argv.slice(2)
const extra = Object.fromEntries(args.filter((a) => a.includes('=')).map((a) => a.split('=')))
const listed = args.filter((a) => !a.includes('='))
const targets = [
  ...(listed.length || Object.keys(extra).length ? listed : Object.keys(cfgNodes))
    .filter((id) => cfgNodes[id]?.ssh)
    .map((id) => ({ id, ssh: cfgNodes[id].ssh, mtr: cfgNodes[id].mtr })),
  ...Object.entries(extra).map(([id, ssh]) => ({ id, ssh })),
]
if (!targets.length) {
  console.error('no nodes: add ssh aliases to routes.local.json, or pass <id>=<ssh alias>')
  process.exit(1)
}

console.log(`tracing ${targets.length} nodes to the three carriers (Fujian) …`)
const traced = await Promise.all(
  targets.map(async (n) => {
    // Same user as mtr (e.g. one exempt from WARP policy routing).
    const as = n.mtr?.match(/^sudo -n -u (\S+)/)?.[1]
    const remote = as ? `sudo -n -u ${as} sh -s` : 'sh -s'
    try {
      const raw = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', n.ssh, remote], PROBE)
      const hops = { ct: [], cu: [], cm: [] }
      const tools = {}
      for (const l of raw.split('\n')) {
        const p = l.split('\t')
        if (p[0] === 'tool' && hops[p[1]]) tools[p[1]] = p[2]
        if (p[0] === 'hop' && hops[p[1]] && /^\d+\.\d+\.\d+\.\d+$/.test(p[3]) && !isPrivate(p[3])) hops[p[1]].push(p[3])
      }
      return { id: n.id, hops, tool: tools.ct ?? tools.cu ?? tools.cm ?? 'none' }
    } catch (e) {
      return { id: n.id, error: e.message }
    }
  }),
)

const lookup = [...new Set(traced.flatMap((r) => (r.hops ? CARRIERS.flatMap((c) => r.hops[c]) : [])))].filter(
  (ip) => !PREFIX.some(([re]) => re.test(ip)),
)
console.log(`looking up ${lookup.length} routers on ip-api.com …`)
const geo = await ipApi(lookup)
const asnOf = (ip) => {
  const pre = PREFIX.find(([re]) => re.test(ip))
  if (pre) return pre[1]
  const p = parseAs(geo.get(ip)?.as)
  if (!p) return 0
  if (p[1] && !names.has(p[0])) names.set(p[0], p[1])
  return p[0]
}

const data = { generated: now, target: 'FJ', asns: {}, nodes: { ...previous.nodes } }
for (const r of traced) {
  if (r.error) {
    console.log(`  #${r.id}  skipped: ${r.error}`)
    continue
  }
  const entry = { traced: now, tool: r.tool }
  for (const c of CARRIERS) {
    // The networks in the order the path crosses them, repeats folded.
    const path = []
    for (const ip of r.hops[c]) {
      const asn = asnOf(ip)
      if (asn && path.at(-1) !== asn) path.push(asn)
    }
    entry[c] = { line: lineOf(c, path), path }
  }
  data.nodes[r.id] = entry
  console.log(`  #${r.id}  (${r.tool})  ${show(entry)}`)
}
save(data)
