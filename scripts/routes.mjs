#!/usr/bin/env node
// Collect the real network paths behind the topology links, for the map's
// "真實路由" layer.
//
//   node scripts/routes.mjs            every link listed in routes.local.json
//   node scripts/routes.mjs 1>3 1>7    only these links, merged into the existing data
//   node scripts/routes.mjs --replan   no tracing: redo the sea crossings of the
//                                      routes already in src/data/routes.json
//
// For each link A>B it SSHes into A and runs `mtr --json` towards B, then turns
// the hops into waypoints of (AS, city, coordinate, RTT). Router locations come
// first from the city codes carriers put in reverse DNS (mel07, sjc01, stl03 …);
// hops without one are looked up on ip-api.com and kept only when their RTT
// says the router can physically be there and they don't send the path on a
// detour. The output carries no IP addresses: it ships in the public bundle.

import { spawn } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { overLand, planCrossing } from './lib/cables.mjs'
import { AS_NAMES, placeFromHostname } from './lib/places.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = resolve(root, 'routes.local.json')
const OUT = resolve(root, 'src/data/routes.json')

// --- helpers ----------------------------------------------------------------

const toRad = (d) => (d * Math.PI) / 180
function km([lng1, lat1], [lng2, lat2]) {
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

const PRIVATE = [/^10\./, /^127\./, /^169\.254\./, /^192\.168\./, /^172\.(1[6-9]|2\d|3[01])\./, /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./]
const isPrivate = (ip) => PRIVATE.some((r) => r.test(ip))
const IPV4 = /\b\d{1,3}(?:\.\d{1,3}){3}\b/

function run(cmd, args, timeoutMs) {
  return new Promise((done) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let out = ''
    let err = ''
    const timer = setTimeout(() => p.kill(), timeoutMs)
    p.stdout.on('data', (d) => (out += d))
    p.stderr.on('data', (d) => (err += d))
    p.on('close', (code) => {
      clearTimeout(timer)
      done({ code, out, err })
    })
  })
}

// "be202.bdr03.sjc01.ca.us.vocus.network (114.31.199.43)" | "38.32.77.115" | "???"
function parseHost(host) {
  const m = /^(.*) \(([\d.]+)\)$/.exec(host)
  if (m) return { name: m[1], ip: m[2] }
  return IPV4.test(host) ? { name: null, ip: host } : null
}

async function trace(src, dst) {
  const mtr = src.mtr || 'mtr'
  const { code, out, err } = await run(
    'ssh',
    ['-o', 'BatchMode=yes', '-o', 'ConnectTimeout=10', src.ssh, `${mtr} -rwbz -c 3 --json ${dst.trace || dst.ip}`],
    240_000,
  )
  if (code !== 0) throw new Error((err || out).trim().split('\n').pop() || `exit ${code}`)
  return JSON.parse(out).report.hubs.map((h) => {
    const host = parseHost(h.host)
    const asn = /^AS(\d+)$/.exec(h.ASN)
    return { ...host, asn: asn ? Number(asn[1]) : 0, best: h.Best, avg: h.Avg, loss: h['Loss%'] }
  })
}

async function ipApi(ips) {
  const out = new Map()
  for (let i = 0; i < ips.length; i += 100) {
    const res = await fetch('http://ip-api.com/batch?fields=status,countryCode,city,lat,lon,as,query', {
      method: 'POST',
      body: JSON.stringify(ips.slice(i, i + 100)),
    })
    if (!res.ok) throw new Error(`ip-api: HTTP ${res.status}`)
    for (const r of await res.json()) if (r.status === 'success') out.set(r.query, r)
  }
  return out
}

// "AS4826 Vocus Connect International Backbone" -> [4826, "Vocus Connect International…"]
function parseAs(s) {
  const m = /^AS(\d+)\s*(.*)$/.exec(s || '')
  if (!m) return null
  let name = m[2].split(',')[0].trim()
  if (name.length > 28) name = name.slice(0, 28).replace(/\s+\S*$/, '') + '…'
  return [Number(m[1]), name]
}

// --- one link -> waypoints ----------------------------------------------------

function buildRoute(hops, src, dst, geo, names) {
  const target = dst.trace || dst.ip
  const dstHop = hops.findLast((h) => h.ip === target)
  const dstAsn = dstHop?.asn || 0
  const near = (a, b) => km(a, b) < 80

  const list = hops
    .filter((h) => h.ip && h.ip !== target && h.ip !== src.ip && !isPrivate(h.ip) && h.loss < 100)
    .map((h) => {
      const g = geo.get(h.ip)
      const as = g && parseAs(g.as)
      if (as && as[1] && !names[as[0]]) names[as[0]] = as[1]
      // Exchange-point LANs belong to no transit network.
      const ix = /equinix|(^|[.-])ix([.-]|$)/i.test(h.name || '')
      const dns = placeFromHostname(h.name)
      let place = dns
      let how = dns ? 'dns' : null
      if (!place && g && Number.isFinite(g.lat)) {
        place = { city: g.city || null, cc: g.countryCode, at: [g.lon, g.lat] }
        how = 'api'
      }
      // The router can't be farther from the source than light in fibre
      // (~200 km/ms) travels in half the RTT.
      if (place && km(src.at, place.at) > (h.best / 2) * 200 + 100) [place, how] = [null, null]
      return { asn: ix ? 0 : h.asn || as?.[0] || 0, ix, best: h.best, place, how }
    })

  // Drop database locations that send the path on a detour, worst first.
  for (;;) {
    const pts = [{ at: src.at }, ...list.filter((h) => h.place).map((h) => ({ h, at: h.place.at })), { at: dst.at }]
    let worst = null
    for (let i = 1; i < pts.length - 1; i++) {
      if (pts[i].h.how !== 'api') continue
      const [a, b, c] = [pts[i - 1].at, pts[i].at, pts[i + 1].at]
      const extra = km(a, b) + km(b, c) - km(a, c)
      if (extra > 300 + km(a, c) * 0.3 && (!worst || extra > worst.extra)) worst = { h: pts[i].h, extra }
    }
    if (!worst) break
    ;[worst.h.place, worst.h.how] = [null, null]
  }

  // Unplaced hops: a near-zero RTT is the source's city; an RTT within 2 ms of
  // the hop before is that hop's city (a few hundred km at most).
  list.forEach((h, i) => {
    if (h.place) return
    if (h.best < 4) return void (h.how = 'src')
    const prev = list.slice(0, i).findLast((x) => x.place || x.how === 'src')
    if (prev && Math.abs(h.best - prev.best) < 2) [h.place, h.how] = [prev.place, prev.how === 'src' ? 'src' : 'near']
  })
  // One place per city: a database hit next to a DNS-named city takes its name.
  const canon = list.filter((h) => h.how === 'dns').map((h) => h.place)
  for (const h of list) {
    if (!h.place) continue
    const c = canon.find((p) => near(p.at, h.place.at))
    if (c) h.place = c
    else canon.push(h.place)
  }
  // Locations in the endpoints' own cities are drawn at the endpoints.
  for (const h of list) {
    if (h.place && near(h.place.at, src.at)) [h.place, h.how] = [null, 'src']
  }

  // The hops at the end inside the destination's network (and unknown-AS edge
  // routers right before it) sit at the destination, unless they were placed
  // in a city elsewhere — a transit leg the destination's own AS carries.
  for (let i = list.length - 1; i >= 0 && dstAsn; i--) {
    const h = list[i]
    if (h.place && !near(h.place.at, dst.at)) break
    if (!h.asn && !h.ix) h.asn = dstAsn
    if (h.asn !== dstAsn) break
    ;[h.place, h.how] = [null, 'dst']
  }
  for (const h of list) {
    if (h.place && near(h.place.at, dst.at)) [h.place, h.how] = [null, 'dst']
  }

  // A run of unknown-AS hops between two hops of the same AS belongs to it.
  for (let i = 1; i < list.length; i++) {
    if (list[i].asn || list[i].ix || !list[i - 1].asn) continue
    let j = i
    while (j < list.length && !list[j].asn && !list[j].ix) j++
    if (j < list.length && list[j].asn === list[i - 1].asn) for (let k = i; k < j; k++) list[k].asn = list[i - 1].asn
    i = j
  }

  // Merge consecutive hops in the same network and place; a hop with no
  // location folds into the one before it in the same network.
  const out = []
  for (const h of list) {
    const where = h.how === 'src' || h.how === 'dst' ? h.how : (h.place?.city ?? null)
    const key = `${h.asn}|${h.ix}|${where}`
    const last = out.at(-1)
    if (last && (last.key === key || (where === null && last.asn === h.asn && last.ix === h.ix))) {
      last.rtt = Math.min(last.rtt, h.best)
      continue
    }
    const hop = { key, asn: h.asn, ix: h.ix, rtt: h.best }
    if (where === 'src' || where === 'dst') hop.near = where
    else if (h.place) {
      hop.city = h.place.city
      hop.cc = h.place.cc
      hop.at = h.place.at.map((v) => Math.round(v * 100) / 100)
    }
    out.push(hop)
  }
  // A hop with neither a network nor a place tells the reader nothing.
  const result = out
    .filter((h) => h.asn || h.ix || h.at)
    .map(({ key: _key, ix, rtt, ...h }) => ({ ...h, ...(ix ? { ix: true } : {}), rtt: Math.round(rtt * 10) / 10 }))

  return {
    hops: result,
    dstAsn,
    reached: !!dstHop,
    rtt: dstHop ? Math.round(dstHop.avg * 10) / 10 : null,
  }
}

// Legs between shores follow submarine cables (or at least open water): a
// hop's `via` holds the points between it and the waypoint before it, the
// route's `tail` those between the last hop and the destination.
function addCrossings(route, src, dst, asLabel) {
  const srcPt = { at: src.at, cc: src.cc }
  const dstPt = { at: dst.at, cc: dst.cc }
  let prev = srcPt
  delete route.tail
  for (const h of route.hops) {
    delete h.via
    const cur = h.near === 'src' ? srcPt : h.near === 'dst' ? dstPt : h.at ? { at: h.at, cc: h.cc } : null
    if (!cur) continue
    if (!overLand(prev, cur)) h.via = planCrossing(prev, cur, asLabel(h.asn))
    prev = cur
  }
  if (route.reached && !overLand(prev, dstPt)) route.tail = planCrossing(prev, dstPt, asLabel(route.dstAsn))
  return route
}

// Keeps a route's keys in a stable order (tail after hops) for readable diffs.
const ordered = ({ from, to, traced, hops, tail, dstAsn, reached, rtt }) => ({
  from,
  to,
  traced,
  hops,
  ...(tail ? { tail } : {}),
  dstAsn,
  reached,
  rtt,
})

const crossingText = (r) =>
  [...r.hops.map((h) => h.via), r.tail]
    .filter(Boolean)
    .map((v) => (v.cables.length ? v.cables.join(' + ') : '(open water)'))
    .join(' | ')

// Holder names from RIPEstat for networks nothing else named (AS numbers
// only; no addresses leave this machine for this).
async function asNames(asns) {
  const out = {}
  await Promise.all(
    asns.map(async (n) => {
      try {
        const res = await fetch(`https://stat.ripe.net/data/as-overview/data.json?resource=AS${n}`)
        const holder = (await res.json())?.data?.holder
        if (holder) out[n] = parseAs(`AS${n} ${holder.replace(/^[A-Z0-9]+(-[A-Z0-9]+)*\s+-?\s*/, '')}`)[1]
      } catch {
        /* keep the bare number */
      }
    }),
  )
  return out
}

// --- main -------------------------------------------------------------------

if (!existsSync(CONFIG)) {
  console.error(`missing ${CONFIG}`)
  process.exit(1)
}
const cfg = JSON.parse(readFileSync(CONFIG, 'utf8'))
const nodes = cfg.nodes
const expand = (spec) => {
  const [a, b] = spec.split('>')
  const targets = b === '*' ? Object.keys(nodes).filter((k) => k !== a) : [b]
  return targets.map((t) => [a, t])
}
const args = process.argv.slice(2)

// Write the data file, refusing anything that looks like an address.
const nodeIps = new Set(Object.values(nodes).flatMap((n) => [n.ip, n.trace].filter(Boolean)))
function save(data, note) {
  const text = JSON.stringify(data, null, 1)
  if (IPV4.test(text) || [...nodeIps].some((ip) => text.includes(ip))) {
    console.error('refusing to write: output contains an IP address')
    process.exit(1)
  }
  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, text + '\n')
  console.log(note)
}

if (args.includes('--replan')) {
  const data = JSON.parse(readFileSync(OUT, 'utf8'))
  const label = (n) => AS_NAMES[n] || data.asns?.[n] || ''
  data.routes = data.routes.map((r) => {
    if (!nodes[r.from] || !nodes[r.to]) return r
    addCrossings(r, nodes[r.from], nodes[r.to], label)
    console.log(`  #${r.from} > #${r.to}  ${crossingText(r) || '(over land)'}`)
    return ordered(r)
  })
  delete data.cables
  save(data, `re-planned ${data.routes.length} routes -> src/data/routes.json`)
  process.exit(0)
}

const wanted = (args.length ? args : cfg.links).flatMap(expand)

const results = await Promise.all(
  wanted.map(async ([a, b]) => {
    const src = nodes[a]
    const dst = nodes[b]
    if (!src?.ssh || !dst?.ip) return { a, b, error: `#${!src?.ssh ? a + ' has no ssh' : b + ' has no ip'}` }
    try {
      return { a, b, hops: await trace(src, dst) }
    } catch (e) {
      return { a, b, error: e.message }
    }
  }),
)

const lookup = [
  ...new Set(results.flatMap((r) => r.hops ?? []).flatMap((h) => (h.ip && !isPrivate(h.ip) && !nodeIps.has(h.ip) ? [h.ip] : []))),
]
console.log(`tracing done, locating ${lookup.length} routers on ip-api.com …`)
const geo = await ipApi(lookup)

const names = {}
const previous = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : { routes: [], asns: {} }
const routes = new Map(previous.routes.map((r) => [`${r.from}>${r.to}`, r]))
const now = new Date().toISOString()
for (const r of results) {
  if (r.error) {
    console.log(`  #${r.a} > #${r.b}  skipped: ${r.error}`)
    continue
  }
  const route = buildRoute(r.hops, nodes[r.a], nodes[r.b], geo, names)
  addCrossings(route, nodes[r.a], nodes[r.b], (n) => AS_NAMES[n] || names[n] || previous.asns?.[n] || '')
  routes.set(`${r.a}>${r.b}`, ordered({ from: Number(r.a), to: Number(r.b), traced: now, ...route }))
  const path = [...new Set(route.hops.map((h) => h.asn).concat(route.dstAsn).filter(Boolean))].map((n) => `AS${n}`)
  console.log(`  #${r.a} > #${r.b}  ${route.rtt ?? '?'} ms  ${path.join(' → ')}`)
  const sea = crossingText(route)
  if (sea) console.log(`      ⚓ ${sea}`)
}

const all = [...routes.values()].sort((x, y) => x.from - y.from || x.to - y.to)
const used = new Set(all.flatMap((r) => r.hops.map((h) => h.asn).concat(r.dstAsn)).filter(Boolean))
const asns = {}
const unnamed = [...used].filter((n) => !AS_NAMES[n] && !names[n] && !previous.asns?.[n])
Object.assign(names, await asNames(unnamed))
for (const n of [...used].sort((x, y) => x - y)) asns[n] = AS_NAMES[n] || names[n] || previous.asns?.[n] || ''

// Last line of defence (in save): nothing that looks like an address goes into the bundle.
save({ generated: now, asns, routes: all }, `wrote ${all.length} routes, ${used.size} networks -> src/data/routes.json`)
