// Submarine cables the traced routes plausibly ride. Geometry, landing
// stations and owners come from TeleGeography's Submarine Cable Map (the copy
// they published on GitHub under CC BY-NC-SA 3.0, snapshot 2022-08-05,
// imported by scripts/import-cables.mjs). The lines are TeleGeography's
// stylised drawings, not surveyed positions, and which cable a packet took
// can't be seen in a traceroute: every match is a guess from geography, with
// cables the carrier co-owns preferred.

import { existsSync, readFileSync } from 'node:fs'
import { Heap, km, landmass, seaPath } from './sea.mjs'

// Optional (see scripts/import-cables.mjs): without it every crossing is drawn
// as a plain water path.
const FILE = new URL('../data/submarine-cables.json', import.meta.url)
const DATA = existsSync(FILE) ? JSON.parse(readFileSync(FILE, 'utf8')) : { landings: {}, cables: [] }
const LANDINGS = DATA.landings // id -> [name, cc, lng, lat]
const landing = (id) => {
  const [name, cc, lng, lat] = LANDINGS[id]
  return { id, name, cc, at: [lng, lat] }
}
// Only systems already in service in the snapshot: plenty that were planned
// then have opened since, but some slipped or never got built, and the
// snapshot can't tell which.
const CABLES = DATA.cables.filter((c) => !c.planned)

// --- what's joined by land ---------------------------------------------------

// Countries traffic crosses by land (or a bridge) without a sea cable.
const GROUPS = [
  ['US', 'CA', 'MX'],
  ['NL', 'DE', 'FR', 'BE', 'LU', 'CH', 'AT', 'IT', 'ES', 'PT', 'PL', 'CZ', 'DK', 'SE', 'NO', 'FI'],
  ['SG', 'MY', 'TH'],
  ['CN', 'HK'],
]
const group = (cc) => GROUPS.findIndex((g) => g.includes(cc))
// Close together, or in the same country (group) on the same landmass, so
// Hawaii, Guam or Tasmania still need a cable from the mainland.
export function overLand(a, b) {
  if (km(a.at, b.at) < 300) return true
  const same = (a.cc && a.cc === b.cc) || (group(a.cc) >= 0 && group(a.cc) === group(b.cc))
  if (!same) return false
  const ma = landmass(a.at)
  const mb = landmass(b.at)
  return ma < 0 || mb < 0 || ma === mb
}

// --- the cable graph ---------------------------------------------------------
//
// Nodes are landing stations plus every vertex of every cable's drawing (a
// cable's branches meet at shared vertices). Riding a cable means boarding it
// at a landing, following its vertices, and leaving at another landing;
// stations a short way apart are joined by land, so a path can change cables.

const BOARD = 300 // km-equivalent per cable used, so one system beats a relay
const REACH = 4000 // furthest a waypoint goes by land to reach a landing
const LAND = 1.2 // land distance weighs a little more (roads aren't straight)

let G = null
function graph() {
  if (G) return G
  const ids = new Map()
  const at = []
  const adj = []
  const name = new Map() // node -> landing name (landing nodes, and vertices at a landing)
  const node = (key, p) => {
    let n = ids.get(key)
    if (n === undefined) {
      n = at.length
      ids.set(key, n)
      at.push(p)
      adj.push([])
    }
    return n
  }
  const edge = (u, v, w, cable) => adj[u].push([v, w, cable])
  const vkey = (ci, [x, y]) => `${ci}:${x === 180 ? -180 : x},${y}`

  const ls = Object.keys(LANDINGS).map(landing)
  for (const l of ls) name.set(node(`L:${l.id}`, l.at), l.name)

  CABLES.forEach((c, ci) => {
    for (const line of c.lines) {
      for (let k = 1; k < line.length; k++) {
        const u = node(vkey(ci, line[k - 1]), line[k - 1])
        const v = node(vkey(ci, line[k]), line[k])
        if (u === v) continue
        const d = km(line[k - 1], line[k])
        edge(u, v, d, ci)
        edge(v, u, d, ci)
      }
    }
    for (const id of c.landings) {
      const l = landing(id)
      let best = null
      let bestD = Infinity
      for (const line of c.lines) {
        for (const p of line) {
          const d = km(l.at, p)
          if (d < bestD) [best, bestD] = [p, d]
        }
      }
      if (!best || bestD > 50) continue
      const v = ids.get(vkey(ci, best))
      const u = ids.get(`L:${id}`)
      edge(u, v, BOARD + bestD, ci)
      edge(v, u, bestD, ci)
      name.set(v, l.name)
    }
  })

  // Stations within 60 km of each other on the same shore.
  const cell = (p) => `${Math.floor(p[0])},${Math.floor(p[1])}`
  const buckets = new Map()
  for (const l of ls) buckets.set(cell(l.at), [...(buckets.get(cell(l.at)) ?? []), l])
  for (const l of ls) {
    const [x, y] = [Math.floor(l.at[0]), Math.floor(l.at[1])]
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        for (const o of buckets.get(`${x + dx},${y + dy}`) ?? []) {
          if (o.id === l.id) continue
          const d = km(l.at, o.at)
          if (d < 60 && overLand(l, o)) edge(ids.get(`L:${l.id}`), ids.get(`L:${o.id}`), d * LAND, -1)
        }
      }
    }
  }
  G = { ids, at, adj, name, ls }
  return G
}

// "Telstra Global" -> "telstra", "China Mobile CMI" -> "china mobile"
function ownerToken(asName) {
  const words = (asName || '').toLowerCase().split(/\s+/)
  return (words[0] === 'china' ? words.slice(0, 2) : words.slice(0, 1)).join(' ')
}

// Cheapest way from waypoint a to waypoint b over cables: by land to a landing
// in reach, along one or more cables, by land from the last landing. Cables the
// carrier co-owns cost a fifth less.
function cablePath(a, b, asName) {
  const { ids, at, adj, ls } = graph()
  const token = ownerToken(asName)
  const owned = CABLES.map((c) => token.length >= 3 && c.owners.some((o) => o.toLowerCase().includes(token)))
  const n = at.length
  const S = n
  const T = n + 1
  const dist = new Float64Array(n + 2).fill(Infinity)
  const prev = new Int32Array(n + 2).fill(-1)
  const via = new Int32Array(n + 2).fill(-1) // cable of the edge into each node
  const into = new Map() // landing node -> cost to T
  const heap = new Heap()
  dist[S] = 0
  for (const l of ls) {
    const da = km(a.at, l.at)
    const u = ids.get(`L:${l.id}`)
    if (da < REACH && overLand(a, l)) {
      dist[u] = da * LAND
      prev[u] = S
      heap.push(u, dist[u])
    }
    const db = km(l.at, b.at)
    if (db < REACH && overLand(l, b)) into.set(u, db * LAND)
  }
  const done = new Uint8Array(n + 2)
  while (heap.size) {
    const u = heap.pop()
    if (done[u]) continue
    done[u] = 1
    if (u === T) break
    if (into.has(u) && dist[u] + into.get(u) < dist[T]) {
      dist[T] = dist[u] + into.get(u)
      prev[T] = u
      heap.push(T, dist[T])
    }
    for (const [v, w, ci] of adj[u] ?? []) {
      const cost = dist[u] + (ci >= 0 && owned[ci] ? w * 0.8 : w)
      if (cost < dist[v]) {
        dist[v] = cost
        prev[v] = u
        via[v] = ci
        heap.push(v, cost)
      }
    }
  }
  if (prev[T] < 0) return null
  const chain = []
  for (let u = prev[T]; u !== S; u = prev[u]) chain.unshift(u)
  const cables = []
  for (const u of chain) {
    const ci = via[u]
    if (ci >= 0 && cables.at(-1) !== CABLES[ci].name) cables.push(CABLES[ci].name)
  }
  return { cost: dist[T], chain, cables }
}

const seaCache = new Map()
function sea(a, b) {
  const key = `${a.join()}|${b.join()}`
  if (!seaCache.has(key)) seaCache.set(key, seaPath(a, b))
  return seaCache.get(key)
}

// How a leg between two waypoints on different shores crosses the sea: along
// the best-fitting cable(s), or, when nothing reasonable connects them, a
// plain water path. Returns the cables in order and the points strictly
// between a and b (named ones are landing stations).
export function planCrossing(a, b, asName) {
  const found = cablePath(a, b, asName)
  const direct = km(a.at, b.at)
  if (found?.cables.length && found.cost < Math.max(direct * 2.5, direct + 3000)) {
    const { at, name } = graph()
    const points = []
    for (const u of found.chain) {
      const p = { at: at[u], ...(name.has(u) ? { name: name.get(u) } : {}) }
      const last = points.at(-1)
      if (last && km(last.at, p.at) < 2) {
        if (p.name && !last.name) last.name = p.name
        continue
      }
      // A station and the cable vertex it ties into: name it once.
      if (p.name && points.findLast((q) => q.name)?.name === p.name) delete p.name
      points.push(p)
    }
    return { cables: found.cables, points }
  }
  return { cables: [], points: sea(a.at, b.at).slice(1, -1).map((p) => ({ at: p })) }
}
