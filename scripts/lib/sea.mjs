// Paths over open water between two coastal points, for drawing submarine
// cable legs that don't cut across land. Land comes from Natural Earth
// (public domain, via world-atlas), rasterised to a 0.25° grid; A* finds the
// shortest water path, then string-pulling straightens it into a few
// great-circle stretches that still clear the coast.

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { geoInterpolate } from 'd3-geo'
import { feature } from 'topojson-client'

const RES = 0.25
const W = 360 / RES
const H = 180 / RES
const require = createRequire(import.meta.url)

const toRad = (d) => (d * Math.PI) / 180
export function km([lng1, lat1], [lng2, lat2]) {
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2
  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(a)))
}

// --- land raster ------------------------------------------------------------

let land = null
function landGrid() {
  if (land) return land
  const topo = JSON.parse(readFileSync(require.resolve('world-atlas/land-50m.json'), 'utf8'))
  const geo = feature(topo, topo.objects.land)
  const rings = geo.features.flatMap((f) =>
    f.geometry.type === 'Polygon' ? f.geometry.coordinates : f.geometry.coordinates.flat(),
  )
  // Scanline fill, even-odd across every ring, sampling each cell's centre.
  const rows = Array.from({ length: H }, () => [])
  for (const ring of rings) {
    for (let k = 0; k < ring.length - 1; k++) {
      const [x1, y1] = ring[k]
      const [x2, y2] = ring[k + 1]
      if (y1 === y2) continue
      const lo = Math.min(y1, y2)
      const hi = Math.max(y1, y2)
      const jStart = Math.max(0, Math.ceil((90 - hi) / RES - 0.5))
      const jEnd = Math.min(H - 1, Math.floor((90 - lo) / RES - 0.5))
      for (let j = jStart; j <= jEnd; j++) {
        const lat = 90 - (j + 0.5) * RES
        if (lat < lo || lat >= hi) continue
        rows[j].push(x1 + ((lat - y1) * (x2 - x1)) / (y2 - y1))
      }
    }
  }
  land = new Uint8Array(W * H)
  rows.forEach((xs, j) => {
    xs.sort((a, b) => a - b)
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] + 180) / RES - 0.5))
      const i1 = Math.min(W - 1, Math.floor((xs[k + 1] + 180) / RES - 0.5))
      for (let i = i0; i <= i1; i++) land[j * W + i] = 1
    }
  })
  return land
}

const cellOf = ([lng, lat]) => {
  const i = (((Math.floor((lng + 180) / RES) % W) + W) % W) | 0
  const j = Math.min(H - 1, Math.max(0, Math.floor((90 - lat) / RES)))
  return j * W + i
}
const centreOf = (c) => [-180 + ((c % W) + 0.5) * RES, 90 - (Math.floor(c / W) + 0.5) * RES]
const isWater = (c) => !landGrid()[c]

// Nearest water cell, searching outward ring by ring (landing stations sit on
// the shore, so their own cell is often land).
function nearestWater(at) {
  const c0 = cellOf(at)
  if (isWater(c0)) return c0
  const i0 = c0 % W
  const j0 = Math.floor(c0 / W)
  for (let r = 1; r <= 40; r++) {
    let best = -1
    let bestD = Infinity
    for (let dj = -r; dj <= r; dj++) {
      for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue
        const j = j0 + dj
        if (j < 0 || j >= H) continue
        const c = j * W + ((i0 + di + W) % W)
        if (!isWater(c)) continue
        const d = km(at, centreOf(c))
        if (d < bestD) [best, bestD] = [c, d]
      }
    }
    if (best >= 0) return best
  }
  return c0
}

// Cells next to land cost a little more, so paths keep off the coastline.
function coastal(c) {
  const i = c % W
  const j = Math.floor(c / W)
  for (let dj = -1; dj <= 1; dj++) {
    for (let di = -1; di <= 1; di++) {
      const jj = j + dj
      if (jj >= 0 && jj < H && !isWater(jj * W + ((i + di + W) % W))) return true
    }
  }
  return false
}

// Connected landmasses (8-neighbour flood fill over the raster): a point's
// landmass id, from the land cell under it or the nearest one within ~1°;
// -1 out at sea.
let mass = null
function landmasses() {
  if (mass) return mass
  const grid = landGrid()
  mass = new Int32Array(W * H).fill(-1)
  let next = 0
  const stack = []
  for (let c0 = 0; c0 < W * H; c0++) {
    if (!grid[c0] || mass[c0] >= 0) continue
    mass[c0] = next
    stack.push(c0)
    while (stack.length) {
      const c = stack.pop()
      const i = c % W
      const j = Math.floor(c / W)
      for (let dj = -1; dj <= 1; dj++) {
        const jj = j + dj
        if (jj < 0 || jj >= H) continue
        for (let di = -1; di <= 1; di++) {
          const n = jj * W + ((i + di + W) % W)
          if (grid[n] && mass[n] < 0) {
            mass[n] = next
            stack.push(n)
          }
        }
      }
    }
    next++
  }
  return mass
}
export function landmass(at) {
  const m = landmasses()
  const c0 = cellOf(at)
  if (m[c0] >= 0) return m[c0]
  const i0 = c0 % W
  const j0 = Math.floor(c0 / W)
  let best = -1
  let bestD = Infinity
  for (let dj = -4; dj <= 4; dj++) {
    for (let di = -4; di <= 4; di++) {
      const j = j0 + dj
      if (j < 0 || j >= H) continue
      const c = j * W + ((i0 + di + W) % W)
      if (m[c] < 0) continue
      const d = km(at, centreOf(c))
      if (d < bestD) [best, bestD] = [m[c], d]
    }
  }
  return best
}

// --- A* ---------------------------------------------------------------------

export class Heap {
  constructor() {
    this.k = []
    this.v = []
  }
  push(key, val) {
    const { k, v } = this
    let n = k.length
    k.push(key)
    v.push(val)
    while (n > 0) {
      const p = (n - 1) >> 1
      if (v[p] <= v[n]) break
      ;[k[p], k[n], v[p], v[n]] = [k[n], k[p], v[n], v[p]]
      n = p
    }
  }
  pop() {
    const { k, v } = this
    const top = k[0]
    const lastK = k.pop()
    const lastV = v.pop()
    if (k.length) {
      k[0] = lastK
      v[0] = lastV
      let n = 0
      for (;;) {
        const l = 2 * n + 1
        const r = l + 1
        let m = n
        if (l < k.length && v[l] < v[m]) m = l
        if (r < k.length && v[r] < v[m]) m = r
        if (m === n) break
        ;[k[m], k[n], v[m], v[n]] = [k[n], k[m], v[n], v[m]]
        n = m
      }
    }
    return top
  }
  get size() {
    return this.k.length
  }
}

function astar(start, goal) {
  const g = new Float64Array(W * H).fill(Infinity)
  const from = new Int32Array(W * H).fill(-1)
  const done = new Uint8Array(W * H)
  const goalAt = centreOf(goal)
  const heap = new Heap()
  g[start] = 0
  heap.push(start, km(centreOf(start), goalAt))
  while (heap.size) {
    const c = heap.pop()
    if (c === goal) break
    if (done[c]) continue
    done[c] = 1
    const at = centreOf(c)
    const i = c % W
    const j = Math.floor(c / W)
    for (let dj = -1; dj <= 1; dj++) {
      const jj = j + dj
      if (jj < 0 || jj >= H) continue
      for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue
        const n = jj * W + ((i + di + W) % W)
        if (done[n] || !isWater(n)) continue
        const step = km(at, centreOf(n)) * (coastal(n) ? 1.6 : 1)
        const cost = g[c] + step
        if (cost < g[n]) {
          g[n] = cost
          from[n] = c
          heap.push(n, cost + km(centreOf(n), goalAt))
        }
      }
    }
  }
  if (from[goal] < 0 && goal !== start) return null
  const cells = [goal]
  while (cells[0] !== start) cells.unshift(from[cells[0]])
  return cells.map(centreOf)
}

// Does the great circle a→b stay on water (sampled every ~8 km)?
function clear(a, b) {
  const n = Math.max(2, Math.ceil(km(a, b) / 8))
  const f = geoInterpolate(a, b)
  for (let k = 1; k < n; k++) if (!isWater(cellOf(f(k / n)))) return false
  return true
}

// Water path from a to b as [a, ...turning points, b].
export function seaPath(a, b) {
  const s = nearestWater(a)
  const t = nearestWater(b)
  const cells = astar(s, t)
  if (!cells) return [a, b]
  const pts = [centreOf(s), ...cells.slice(1, -1), centreOf(t)]
  const out = [pts[0]]
  let i = 0
  while (i < pts.length - 1) {
    let k = pts.length - 1
    while (k > i + 1 && !clear(pts[i], pts[k])) k--
    out.push(pts[k])
    i = k
  }
  const round = (p) => p.map((v) => Math.round(v * 100) / 100)
  return [a, ...out.map(round), b].filter((p, idx, all) => idx === 0 || km(p, all[idx - 1]) > 5)
}

export function pathLength(pts) {
  let d = 0
  for (let i = 1; i < pts.length; i++) d += km(pts[i - 1], pts[i])
  return d
}
