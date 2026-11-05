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

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CONFIG = resolve(root, 'routes.local.json')
const OUT = resolve(root, 'src/data/routes.json')

// --- places carriers name in reverse DNS ------------------------------------------

// name, country, lng, lat, codes (airport / CLLI / carrier site codes, city names)
const PLACE_ROWS = [
  ['Melbourne', 'AU', 144.96, -37.81, 'mel melb melbourne mlb'],
  ['Sydney', 'AU', 151.21, -33.87, 'syd sydney sydn sydnau sydo'],
  ['Brisbane', 'AU', 153.03, -27.47, 'bne brisbane bris'],
  ['Perth', 'AU', 115.86, -31.95, 'per perth'],
  ['Adelaide', 'AU', 138.6, -34.93, 'adl adelaide'],
  ['Auckland', 'NZ', 174.76, -36.85, 'akl auckland'],
  ['Wellington', 'NZ', 174.78, -41.29, 'wlg wellington'],
  ['Christchurch', 'NZ', 172.64, -43.53, 'chc christchurch'],
  ['Guam', 'GU', 144.79, 13.44, 'gum guam'],
  ['Honolulu', 'US', -157.86, 21.31, 'hnl honolulu'],
  ['Singapore', 'SG', 103.82, 1.35, 'sin sgp sng sngpsi singapore'],
  ['Hong Kong', 'HK', 114.17, 22.32, 'hkg hnk hkgchk hongkong'],
  ['Tokyo', 'JP', 139.69, 35.69, 'nrt hnd tyo tok tky tokyjp tokyo'],
  ['Osaka', 'JP', 135.5, 34.69, 'kix osa osakjp osaka'],
  ['Seoul', 'KR', 126.98, 37.57, 'icn sel seoul'],
  ['Taipei', 'TW', 121.56, 25.03, 'tpe taipei'],
  ['Kuala Lumpur', 'MY', 101.69, 3.14, 'kul kualalumpur'],
  ['Bangkok', 'TH', 100.5, 13.76, 'bkk bangkok'],
  ['Jakarta', 'ID', 106.85, -6.21, 'cgk jkt jakarta'],
  ['Manila', 'PH', 120.98, 14.6, 'mnl manila'],
  ['Mumbai', 'IN', 72.88, 19.08, 'bom mumbai'],
  ['Chennai', 'IN', 80.27, 13.08, 'maa chennai'],
  ['Dubai', 'AE', 55.27, 25.2, 'dxb dubai'],
  // tlot: Telstra Global's One Wilshire site
  ['Los Angeles', 'US', -118.24, 34.05, 'lax lsanca tlot losangeles'],
  ['San Jose', 'US', -121.89, 37.34, 'sjc snjsca sjo sanjose'],
  ['Palo Alto', 'US', -122.14, 37.44, 'pao plalca palo paloalto'],
  ['San Francisco', 'US', -122.42, 37.77, 'sfo sanfrancisco'],
  ['Fremont', 'US', -121.99, 37.55, 'fmt fremont'],
  ['Seattle', 'US', -122.33, 47.61, 'sea sttlwa seattle'],
  ['Portland', 'US', -122.68, 45.52, 'pdx portland'],
  ['Las Vegas', 'US', -115.14, 36.17, 'las lsvgnv lasvegas'],
  ['Phoenix', 'US', -112.07, 33.45, 'phx phnxaz phoenix'],
  ['Salt Lake City', 'US', -111.89, 40.76, 'slc saltlake'],
  ['Denver', 'US', -104.99, 39.74, 'den dnvrco denver'],
  ['Omaha', 'US', -95.94, 41.26, 'oma omaha'],
  ['Kansas City', 'US', -94.58, 39.1, 'mci kscymo kcy kansascity'],
  ['Minneapolis', 'US', -93.27, 44.98, 'msp minneapolis'],
  ['Chicago', 'US', -87.63, 41.88, 'ord chi chcgil chicago'],
  ['St. Louis', 'US', -90.2, 38.63, 'stl stlsmo stlouis'],
  ['Dallas', 'US', -96.8, 32.78, 'dfw dal dllstx dallas'],
  ['Houston', 'US', -95.37, 29.76, 'iah hou hstntx houston'],
  ['Atlanta', 'US', -84.39, 33.75, 'atl atlnga atlanta'],
  ['Miami', 'US', -80.19, 25.76, 'mia miamfl miami'],
  ['Ashburn', 'US', -77.49, 39.04, 'iad ash asbnva ashburn'],
  ['Washington', 'US', -77.04, 38.91, 'dca wdc washington'],
  ['New York', 'US', -74.0, 40.71, 'nyc jfk nyk ewr nycmny newyork'],
  ['Boston', 'US', -71.06, 42.36, 'bos boston'],
  ['Toronto', 'CA', -79.38, 43.65, 'yyz tor toronto'],
  ['Vancouver', 'CA', -123.12, 49.28, 'yvr vancouver'],
  ['Amsterdam', 'NL', 4.9, 52.37, 'ams adm amstnl amsterdam'],
  ['Frankfurt', 'DE', 8.68, 50.11, 'fra ffm frnkge frankfurt'],
  ['Düsseldorf', 'DE', 6.78, 51.23, 'dus dusseldorf'],
  ['Hamburg', 'DE', 9.99, 53.55, 'ham hamburg'],
  ['Berlin', 'DE', 13.4, 52.52, 'ber berlin'],
  ['Munich', 'DE', 11.58, 48.14, 'muc munich'],
  ['London', 'GB', -0.13, 51.51, 'lon lhr ldn londen london'],
  ['Paris', 'FR', 2.35, 48.86, 'par cdg prs parsfr paris'],
  ['Marseille', 'FR', 5.37, 43.3, 'mrs marseille'],
  ['Brussels', 'BE', 4.35, 50.85, 'bru brussels'],
  ['Zurich', 'CH', 8.54, 47.38, 'zrh zurich'],
  ['Vienna', 'AT', 16.37, 48.21, 'vie vienna'],
  ['Milan', 'IT', 9.19, 45.46, 'mil mxp mlanit milan'],
  ['Madrid', 'ES', -3.7, 40.42, 'mad mdrdsp madrid'],
  ['Lisbon', 'PT', -9.14, 38.72, 'lis lisbon'],
  ['Dublin', 'IE', -6.26, 53.35, 'dub dublin'],
  ['Stockholm', 'SE', 18.07, 59.33, 'sto arn stockholm'],
  ['Copenhagen', 'DK', 12.57, 55.68, 'cph kbn copenhagen'],
  ['Oslo', 'NO', 10.75, 59.91, 'osl oslo'],
  ['Helsinki', 'FI', 24.94, 60.17, 'hel helsinki'],
  ['Warsaw', 'PL', 21.01, 52.23, 'waw warsaw'],
  ['Prague', 'CZ', 14.42, 50.08, 'prg prague'],
]
const PLACE_CODES = new Map()
for (const [name, cc, lng, lat, codes] of PLACE_ROWS) {
  for (const code of codes.split(' ')) PLACE_CODES.set(code, { city: name, cc, at: [lng, lat] })
}
// Australian carriers often name only the state (…lsr01.melb.vic.vocus.network).
const STATE_CODES = { vic: 'mel', nsw: 'syd', qld: 'bne' }
// Exchange points name their site: 31898-me1-ix.equinix.com is Equinix ME1, Melbourne.
const IBX = { me: 'mel', sy: 'syd', sg: 'sin', hk: 'hkg', ty: 'tyo', os: 'osa', la: 'lax', sv: 'sjc', se: 'sea', ch: 'chi', da: 'dal', ny: 'nyc', dc: 'ash', am: 'ams', fr: 'fra', ld: 'lon', pa: 'par' }

function placeFromHostname(host) {
  if (!host) return null
  const tokens = host.toLowerCase().split(/[.\-_]+/).filter(Boolean)
  if (/(^|\.)equinix\.com$/.test(host.toLowerCase())) {
    for (const t of tokens) {
      const m = /^([a-z]{2})\d{1,2}$/.exec(t)
      if (m && IBX[m[1]]) return PLACE_CODES.get(IBX[m[1]])
    }
  }
  const forms = (t) => [t, t.replace(/\d+$/, ''), t.replace(/^\d+/, '').replace(/\d+$/, '')]
  for (let i = 0; i < tokens.length; i++) {
    const pair = tokens[i + 1] ? [tokens[i] + tokens[i + 1]] : []
    for (const f of [...forms(tokens[i]), ...pair]) {
      if (f.length >= 3 && PLACE_CODES.has(f)) return PLACE_CODES.get(f)
    }
  }
  for (const t of tokens) if (STATE_CODES[t]) return PLACE_CODES.get(STATE_CODES[t])
  return null
}

// Friendly names for the networks these routes usually cross; others fall back
// to what ip-api reports.
const AS_NAMES = {
  174: 'Cogent',
  701: 'Verizon',
  1221: 'Telstra',
  1299: 'Arelion',
  2516: 'KDDI',
  2914: 'NTT',
  3257: 'GTT',
  3320: 'Deutsche Telekom',
  3356: 'Lumen',
  3491: 'PCCW',
  4134: 'China Telecom 163',
  4637: 'Telstra Global',
  4713: 'NTT OCN',
  4788: 'TM Net',
  4809: 'China Telecom CN2',
  4826: 'Vocus',
  4837: 'China Unicom',
  5511: 'Orange',
  6453: 'Tata',
  6461: 'Zayo',
  6762: 'Sparkle',
  6939: 'Hurricane Electric',
  7018: 'AT&T',
  7393: 'QuadraNet',
  7474: 'Optus',
  7578: 'GSL Networks',
  7473: 'Singtel',
  7922: 'Comcast',
  8075: 'Microsoft',
  9002: 'RETN',
  9009: 'M247',
  9304: 'HGC',
  9500: 'One NZ',
  9929: 'China Unicom 9929',
  10026: 'PCCW Global',
  13335: 'Cloudflare',
  14061: 'DigitalOcean',
  15169: 'Google',
  16276: 'OVH',
  16509: 'Amazon',
  17676: 'SoftBank',
  20473: 'Vultr',
  24482: 'SG.GS',
  24940: 'Hetzner',
  31898: 'Oracle Cloud',
  38195: 'Superloop',
  58453: 'China Mobile CMI',
  9808: 'China Mobile Guangdong',
  60781: 'LeaseWeb NL',
  137409: 'GSL Networks NZ',
  58807: 'China Mobile CMIN2',
  9299: 'PLDT',
  4775: 'Globe',
  4657: 'StarHub',
  4766: 'Korea Telecom',
  3786: 'LG U+',
  7713: 'Telkom Indonesia',
  9498: 'Airtel',
  4755: 'Tata Comm. India',
}

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
