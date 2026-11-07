import { geoDistance } from 'd3-geo'
import type { Link, LngLat, Place } from './geo'
import { nodeId } from './ids'
import { SERIES } from './palette'

// Real network paths behind the topology links, written by scripts/routes.mjs
// (mtr from one node to another, routers placed by reverse DNS / ip-api).

// How a leg crosses the sea: along the submarine cable(s) it most plausibly
// rides, in order (empty when none fits and it's drawn as a plain water path).
export interface Via {
  cables: string[]
  points: { at: LngLat; name?: string }[] // between the two waypoints; named ones are landings
}
export interface RouteHop {
  asn: number // 0: unknown network or an exchange point
  rtt: number
  ix?: boolean
  near?: 'src' | 'dst' // inside the source's / destination's city
  city?: string
  cc?: string
  at?: LngLat
  via?: Via // the crossing from the previous waypoint to this one
}
export interface Route {
  from: string
  to: string
  traced: string
  hops: RouteHop[]
  tail?: Via // the crossing from the last hop to the destination
  dstAsn: number
  reached: boolean
  rtt: number | null
}
export interface RouteData {
  generated: string
  asns: Record<string, string>
  routes: Route[]
}

export const PLAIN_SEA = '海路推估'

// Bundled when the data file exists; a theme built without it just has no routes.
// `vite build --mode base` (npm run pack:base, the public release) leaves the
// deployment's own data out even when the file exists locally.
const files = import.meta.env.VITE_ATLAS_BASE
  ? {}
  : import.meta.glob<RouteData>('../data/routes.json', { eager: true, import: 'default' })
// Route ends are stored as the data's ids (numbers from the monitor hub);
// in the app they are hub node ids (strings, uuids on Komari).
const withNodeIds = (routes: Route[]) => routes.map((r) => ({ ...r, from: nodeId(r.from), to: nodeId(r.to) }))
const bundled = Object.values(files)[0]
const SNAPSHOT: RouteData | null = bundled ? { ...bundled, routes: withNodeIds(bundled.routes) } : null
// The bundled snapshot, with any routes the relay traced since laid over it
// (see useRoutes). A live binding: importers always see the current data.
export let ROUTES: RouteData | null = SNAPSHOT
export function setLiveRoutes(live: Pick<RouteData, 'routes' | 'asns'> | null) {
  if (!live?.routes.length) {
    ROUTES = SNAPSHOT
    return
  }
  const byLink = new Map((SNAPSHOT?.routes ?? []).map((r) => [`${r.from}>${r.to}`, r]))
  for (const r of withNodeIds(live.routes)) byLink.set(`${r.from}>${r.to}`, r)
  const routes = [...byLink.values()]
  ROUTES = {
    generated: routes.map((r) => r.traced).sort().at(-1) ?? SNAPSHOT?.generated ?? '',
    asns: { ...SNAPSHOT?.asns, ...live.asns },
    routes,
  }
}

export const asName = (asn: number) => (asn ? ROUTES?.asns[asn] || '' : '')

// The cables a crossing rides, or PLAIN_SEA for a water path.
const viaCables = (via: Via) => (via.cables.length ? via.cables : [PLAIN_SEA])
const addAll = (to: string[], from: string[]) => from.forEach((c) => !to.includes(c) && to.push(c))

// The route behind a link between two nodes, traced in either direction.
export function routeFor(link: Link): { route: Route; from: LngLat; to: LngLat } | null {
  if (!ROUTES || link.from.kind !== 'node' || link.to.kind !== 'node') return null
  const a = link.from.node.id
  const b = link.to.node.id
  const fwd = ROUTES.routes.find((r) => r.from === a && r.to === b)
  if (fwd) return { route: fwd, from: link.from.coord, to: link.to.coord }
  const back = ROUTES.routes.find((r) => r.from === b && r.to === a)
  return back ? { route: back, from: link.to.coord, to: link.from.coord } : null
}

export interface Waypoint {
  at: LngLat
  asn: number
  label: string
  rtt: number | null
  kind: 'hop' | 'landing' | 'shape' // router / cable landing station / bend in a sea path
  cables?: string[] // set on points of a sea crossing
}
// A stretch of the path inside one network. Each segment belongs to the
// network the packet enters at its far end.
export interface Leg {
  asn: number
  points: Waypoint[]
  cables: string[] // cables (or PLAIN_SEA) this stretch crosses the sea on
}

export function routeLegs(route: Route, from: LngLat, to: LngLat, labels: { from: string; to: string }): Leg[] {
  const pts: Waypoint[] = [{ at: from, asn: route.hops[0]?.asn ?? route.dstAsn, label: labels.from, rtt: 0, kind: 'hop' }]
  const cross = (via: Via | undefined, asn: number) => {
    for (const p of via?.points ?? []) {
      pts.push({ at: p.at, asn, label: p.name ?? '', rtt: null, kind: p.name ? 'landing' : 'shape', cables: viaCables(via!) })
    }
  }
  for (const h of route.hops) {
    const at = h.near === 'src' ? from : h.near === 'dst' ? to : h.at
    if (!at) continue
    const label = h.near === 'src' ? labels.from : h.near === 'dst' ? labels.to : (h.city ?? '')
    cross(h.via, h.asn)
    pts.push({ at, asn: h.asn, label, rtt: h.rtt, kind: 'hop', cables: h.via && viaCables(h.via) })
  }
  if (route.reached) {
    cross(route.tail, route.dstAsn)
    pts.push({ at: to, asn: route.dstAsn, label: labels.to, rtt: route.rtt, kind: 'hop', cables: route.tail && viaCables(route.tail) })
  }

  const legs: Leg[] = []
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1]
    const b = pts[i]
    if (a.at[0] === b.at[0] && a.at[1] === b.at[1]) continue
    let last = legs.at(-1)
    if (last && last.asn === b.asn && last.points.at(-1) === a) last.points.push(b)
    else legs.push((last = { asn: b.asn, points: [a, b], cables: [] }))
    if (b.cables) addAll(last.cables, b.cables)
  }
  return legs
}

// One colour per network, the same everywhere on the page: the six networks
// drawn as the most segments (then the most distance) across all routes get
// the categorical hues in order; the rest, and exchange points, stay neutral.
export const OTHER_AS = '#94a3b8'
export function asColours(places: Map<string, Place>): Map<number, string> {
  const score = new Map<number, { segs: number; dist: number }>()
  for (const r of ROUTES?.routes ?? []) {
    const a = places.get(r.from)
    const b = places.get(r.to)
    if (!a || !b) continue
    for (const leg of routeLegs(r, a.coord, b.coord, { from: '', to: '' })) {
      if (!leg.asn) continue
      const s = score.get(leg.asn) ?? { segs: 0, dist: 0 }
      for (let i = 1; i < leg.points.length; i++) s.dist += geoDistance(leg.points[i - 1].at, leg.points[i].at)
      // Routers seen, not the bends a sea crossing is drawn with.
      s.segs += leg.points.slice(1).filter((p) => p.kind === 'hop').length
      score.set(leg.asn, s)
    }
  }
  const ranked = [...score.entries()].sort((x, y) => y[1].segs - x[1].segs || y[1].dist - x[1].dist).map(([asn]) => asn)
  return new Map(ranked.slice(0, SERIES.length).map((asn, i) => [asn, SERIES[i]]))
}

// Consecutive hops in the same network, with the places they pass through:
// the AS path as a reader wants it.
export interface AsRun {
  asn: number
  ix: boolean
  places: string[]
  rtt: number
  cables: string[]
}
export function asPath(route: Route, labels: { from: string; to: string }): AsRun[] {
  const runs: AsRun[] = []
  for (const h of route.hops) {
    const place = h.near === 'src' ? labels.from : h.near === 'dst' ? labels.to : h.city
    const last = runs.at(-1)
    const run = last && last.asn === h.asn && last.ix === !!h.ix ? last : null
    const cables = h.via ? viaCables(h.via) : []
    if (run) {
      if (place && run.places.at(-1) !== place) run.places.push(place)
      addAll(run.cables, cables)
      run.rtt = h.rtt
    } else runs.push({ asn: h.asn, ix: !!h.ix, places: place ? [place] : [], rtt: h.rtt, cables: [...cables] })
  }
  // The destination's own network, when the trace got there.
  const tail = route.tail ? viaCables(route.tail) : []
  if (route.reached && runs.at(-1)?.asn !== route.dstAsn) {
    runs.push({ asn: route.dstAsn, ix: false, places: [labels.to], rtt: route.rtt ?? 0, cables: tail })
  } else if (runs.length) addAll(runs.at(-1)!.cables, tail)
  return runs
}
