#!/usr/bin/env node
// Streaming / AI service availability per node, for the node details'
// 「流媒體」 section.
//
//   node scripts/media.mjs           every node in routes.local.json with an ssh alias
//   node scripts/media.mjs 1 3       only these nodes, merged into the existing data
//   node scripts/media.mjs --local   run the probes on this machine and print, no write
//
// For each node it pipes scripts/lib/media-check.sh into `sh -s` over SSH
// (as the same user mtr runs as, when routes.local.json gives one, so a node
// whose default traffic goes through WARP is tested on its own address). The
// probes are read-only HTTPS requests; nothing is installed on the node. The
// output holds only verdicts and country codes, never addresses.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = resolve(root, 'routes.local.json')
const OUT = resolve(root, 'src/data/media.json')
const PROBE = readFileSync(resolve(root, 'scripts/lib/media-check.sh'), 'utf8')

function run(cmd, args, input, timeout = 120_000) {
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

// --- verdicts -----------------------------------------------------------------

// yes: works; partial: works with a catch (note says which); no: blocked or
// not offered there; error: the probe got no usable answer.
const v = (status, region, note) => ({ status, ...(region ? { region } : {}), ...(note ? { note } : {}) })
const CC3 = {
  AUS: 'AU', USA: 'US', NLD: 'NL', NZL: 'NZ', SGP: 'SG', MYS: 'MY', HKG: 'HK', MAC: 'MO', TWN: 'TW', JPN: 'JP',
  KOR: 'KR', CHN: 'CN', GBR: 'GB', DEU: 'DE', FRA: 'FR', CAN: 'CA', IND: 'IN', IDN: 'ID', THA: 'TH', VNM: 'VN',
  PHL: 'PH', RUS: 'RU', BRA: 'BR', ARE: 'AE', TUR: 'TR', ITA: 'IT', ESP: 'ES', POL: 'PL', SWE: 'SE', CHE: 'CH',
}

function verdicts(raw) {
  const r = Object.fromEntries(
    raw
      .split('\n')
      .map((l) => l.split('\t'))
      .filter((p) => p.length === 2),
  )
  const num = (k) => Number(r[k] || 0)
  const out = {}

  {
    const [a, b, o] = [r['netflix.a'], r['netflix.b'], r['netflix.o']]
    const region = (r['netflix.url']?.match(/netflix\.com\/([a-z]{2})(?:-[a-z]{2})?\/title/)?.[1] ?? (o === '200' ? 'us' : '')).toUpperCase()
    out.netflix =
      a === '200' || b === '200'
        ? v('yes', region)
        : o === '200'
          ? v('partial', region, '僅自製劇')
          : [a, b, o].some((x) => x === '403' || x === '404')
            ? v('no')
            : v('error')
  }

  out.disney = r['disney.forbidden']
    ? v('no', '', 'IP 被擋')
    : r['disney.supported'] === 'true'
      ? v('yes', r['disney.cc'])
      : r['disney.supported'] === 'false'
        ? v('no', r['disney.cc'], '尚未開放')
        : v('error')

  out.youtube = !num('youtube.size')
    ? v('error')
    : num('youtube.cn')
      ? v('no', 'CN')
      : num('youtube.unavailable')
        ? v('no', r['youtube.gl'])
        : r['youtube.gl']
          ? v('yes', r['youtube.gl'])
          : v('error')

  out.prime = !num('prime.size')
    ? v('error')
    : num('prime.restricted')
      ? v('no', r['prime.territory'])
      : r['prime.territory']
        ? v('yes', r['prime.territory'])
        : v('error')

  out.chatgpt = !num('chatgpt.api')
    ? v('error')
    : num('chatgpt.unsupported')
      ? v('no', r['chatgpt.loc'])
      : num('chatgpt.vpn')
        ? v('partial', r['chatgpt.loc'], '僅網頁版')
        : v('yes', r['chatgpt.loc'])

  {
    const url = r['claude.url'] ?? ''
    out.claude = url.includes('unavailable-in-region')
      ? v('no', r['claude.loc'])
      : url.includes('claude.ai')
        ? v('yes', r['claude.loc'])
        : v('error')
  }

  {
    // The page itself loads anywhere; the region Google places the address
    // in decides. Gemini isn't offered in these.
    const cc = CC3[r['gemini.cc3']] ?? r['gemini.cc3']
    const off = ['CN', 'HK', 'MO', 'RU', 'BY', 'IR', 'KP', 'CU', 'SY']
    out.gemini = !num('gemini.size')
      ? v('error')
      : num('gemini.unsupported') || off.includes(cc)
        ? v('no', cc, cc ? `Google 判定為 ${cc}` : '')
        : cc
          ? v('yes', cc)
          : v('error')
  }

  {
    const [hk, tw] = [r['bilibili.hkmotw'], r['bilibili.tw']]
    out.bilibili = hk === '0' ? v('yes', '', '港澳台') : tw === '0' ? v('yes', 'TW', '僅台灣') : hk || tw ? v('no') : v('error')
  }

  out.abema =
    r['abema.cc'] === 'JP'
      ? v('yes', 'JP')
      : r['abema.cc']
        ? v('no', r['abema.cc'], '僅限日本')
        : r['abema.message'] === 'anonymous_ip'
          ? v('no', '', '機房 IP 被擋')
          : v('error')

  {
    const m = r['spotify.redirect']?.match(/spotify\.com\/([a-z]{2})(?:-[a-z]{2})?\/premium/)
    out.spotify = m ? v('yes', m[1].toUpperCase()) : r['spotify.redirect'] ? v('no') : v('error')
  }

  out.tiktok = r['tiktok.region'] ? v('yes', r['tiktok.region']) : v('error')

  return out
}

// --- main -----------------------------------------------------------------------

const args = process.argv.slice(2)
if (args.includes('--local')) {
  const raw = await run('sh', ['-s'], PROBE)
  console.log(verdicts(raw))
  process.exit(0)
}

if (!existsSync(CONFIG)) {
  console.error(`missing ${CONFIG}`)
  process.exit(1)
}
const nodes = JSON.parse(readFileSync(CONFIG, 'utf8')).nodes
const ids = (args.length ? args : Object.keys(nodes)).filter((id) => nodes[id]?.ssh)

const results = await Promise.all(
  ids.map(async (id) => {
    const n = nodes[id]
    // Same user as mtr (e.g. one exempt from WARP policy routing).
    const as = n.mtr?.match(/^sudo -n -u (\S+)/)?.[1]
    const remote = as ? `sudo -n -u ${as} sh -s` : 'sh -s'
    try {
      const raw = await run('ssh', ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', n.ssh, remote], PROBE)
      return { id, services: verdicts(raw) }
    } catch (e) {
      return { id, error: e.message }
    }
  }),
)

const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { nodes: {} }
const now = new Date().toISOString()
const data = { generated: now, nodes: { ...previous.nodes } }
const mark = { yes: '✓', partial: '◐', no: '✗', error: '?' }
for (const r of results) {
  if (r.error) {
    console.log(`  #${r.id}  skipped: ${r.error}`)
    continue
  }
  data.nodes[r.id] = { checked: now, services: r.services }
  const line = Object.entries(r.services).map(([k, s]) => `${k} ${mark[s.status]}${s.region ? ' ' + s.region : ''}`)
  console.log(`  #${r.id}  ${line.join('  ')}`)
}

const text = JSON.stringify(data, null, 1)
const ips = Object.values(nodes).flatMap((n) => [n.ip, n.trace].filter(Boolean))
if (/\b\d{1,3}(\.\d{1,3}){3}\b/.test(text) || ips.some((ip) => text.includes(ip))) {
  console.error('refusing to write: output contains an IP address')
  process.exit(1)
}
mkdirSync(dirname(OUT), { recursive: true })
writeFileSync(OUT, text + '\n')
console.log(`wrote ${Object.keys(data.nodes).length} nodes -> src/data/media.json`)
