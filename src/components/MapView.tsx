import {
  geoDistance,
  geoGraticule10,
  geoInterpolate,
  geoNaturalEarth1,
  geoOrthographic,
  geoPath,
  type GeoPermissibleObjects,
} from 'd3-geo'
import { useEffect, useMemo, useRef, useState } from 'react'
import { feature, mesh } from 'topojson-client'
import type { GeometryCollection, Topology } from 'topojson-specification'
import countries110 from 'world-atlas/countries-110m.json'
import { speed } from '../lib/format'
import { countryCentre, ISO_NUMERIC, type Endpoint, type Link, type LngLat } from '../lib/geo'
import { loadCables, type Cable, type CableData } from '../lib/cables'
import { asName, OTHER_AS, PLAIN_SEA, ROUTES, routeFor, routeLegs, type Leg } from '../lib/routes'
import type { Node } from '../lib/types'
import { Flag } from './Flag'
import { MapLabels, type LabelMode } from './MapLabels'

export interface MapPoint {
  key: string
  coord: LngLat
  label: string
  nodes: Node[]
}

// Drawing width is fixed; height follows the container's aspect in fill mode.
const BASE_W = 960
const BASE_H = 500
const topo = countries110 as unknown as Topology<{ countries: GeometryCollection; land: GeometryCollection }>
const LAND = feature(topo, topo.objects.land)
const COUNTRY_SHAPES = new Map(feature(topo, topo.objects.countries).features.map((f) => [String(f.id), f]))
const BORDERS = mesh(topo, topo.objects.countries, (a, b) => a !== b)
const GRATICULE = geoGraticule10()
const SPHERE = { type: 'Sphere' } as GeoPermissibleObjects

// Light palette for the map, kept here since SVG fills don't read CSS classes.
const C = {
  sea: '#f7f9fc',
  land: '#dbe3ee',
  border: '#ffffff',
  grid: '#2f5bd3',
  lit: '#bfd2f8',
  litStroke: '#2f5bd3',
  litDown: '#fde2e2',
  up: '#2f5bd3',
  down: '#d03b3b',
  partial: '#b45309',
}

type Mode = 'globe' | 'flat'

interface Props {
  points: MapPoint[]
  links: Link[]
  mode: Mode
  onModeChange: (m: Mode) => void
  rotation: { on: boolean; toggle: () => void }
  focus: LngLat | null
  onSelect?: (p: MapPoint) => void
  // Fill the parent's height (overview) instead of keeping the 960:500 box.
  fill?: boolean
  labels: LabelMode
  lightCountries: boolean
  nodes: Node[]
  // null when no topology is configured, so the toggle stays hidden.
  topology: { on: boolean; toggle: () => void } | null
  // null when no shown link has a traced route.
  routes: { on: boolean; toggle: () => void; colours: Map<number, string> } | null
}

const NO_LINKS: Link[] = []
const epName = (e: Endpoint) => (e.kind === 'node' ? e.node.name : e.label)
const samePlace = (a: LngLat, b: LngLat) => a[0] === b[0] && a[1] === b[1]
// "Sydney → San Jose": the places a leg passes, without repeats.
const legPlaces = (leg: Leg) =>
  leg.points
    .map((p) => p.label)
    .filter((l, i, all) => l && l !== all[i - 1])
    .join(' → ')

// Centre the flat map on the nodes: the widest empty band of longitude goes
// to the map's edge, so a fleet spread from Europe to the US west coast via
// Asia-Pacific is drawn Pacific-centred instead of split across both edges.
const wrap = (l: number) => ((l + 540) % 360) - 180
// Atlantic or Pacific: an edge here doesn't cut a continent in half.
const oceanEdge = (l: number) => (l >= -50 && l <= -5) || l >= 160 || l <= -165

function bestCentre(lngs: number[]): number {
  if (lngs.length < 2) return lngs[0] ?? 0
  const s = [...lngs].sort((a, b) => a - b)
  const gaps = s.map((l, i) => {
    const next = i === s.length - 1 ? s[0] + 360 : s[i + 1]
    return { size: next - l, edge: wrap(l + (next - l) / 2) }
  })
  gaps.sort((a, b) => b.size - a.size)
  // Among gaps nearly as wide as the widest, prefer one that ends in open ocean.
  const pick = gaps.find((g) => g.size >= gaps[0].size * 0.85 && oceanEdge(g.edge)) ?? gaps[0]
  return wrap(pick.edge + 180)
}

// Fit the width; in a taller box grow a little (the nodes are centred, so the
// trimmed edges are empty ocean) so the land doesn't float in a band of sea.
function flatBase(w: number, h: number, centre: number) {
  const p = geoNaturalEarth1().rotate([-centre, 0]).fitSize([w, h], SPHERE)
  const [[, y0], [, y1]] = geoPath(p).bounds(SPHERE)
  const grow = Math.min(1.15, (h * 0.96) / (y1 - y0))
  return grow > 1 ? p.scale(p.scale() * grow).translate([w / 2, h / 2]) : p
}

const linkUp = (l: Link) =>
  (l.from.kind === 'city' || l.from.node.online) && (l.to.kind === 'city' || l.to.node.online)

// Countries that host at least one node: a shape when the atlas has one,
// otherwise a spot at the country centre. "down" when every node there is offline.
function litCountries(nodes: Node[]) {
  const by = new Map<string, boolean>()
  for (const n of nodes) {
    const cc = n.country?.toUpperCase()
    if (cc) by.set(cc, (by.get(cc) ?? false) || n.online)
  }
  const shapes: { id: string; up: boolean }[] = []
  const spots: { cc: string; coord: LngLat; up: boolean }[] = []
  for (const [cc, up] of by) {
    const id = ISO_NUMERIC[cc]
    if (id && COUNTRY_SHAPES.has(id)) shapes.push({ id, up })
    else {
      const coord = countryCentre(cc)
      if (coord) spots.push({ cc, coord, up })
    }
  }
  return { shapes, spots }
}

export function MapView({
  points,
  links: allLinks,
  mode,
  onModeChange,
  rotation,
  focus,
  labels,
  lightCountries,
  nodes,
  topology,
  routes,
  onSelect,
  fill,
}: Props) {
  const links = topology?.on === false ? NO_LINKS : allLinks
  const showRoutes = !!routes?.on
  // Per link: its traced path split into per-network legs, when routes are shown.
  const routed = useMemo(() => {
    // Waypoints at a node read as its city, like the routers' own places.
    const city = (e: Endpoint) => (e.kind === 'node' ? points.find((p) => p.nodes.includes(e.node))?.label : e.label) ?? epName(e)
    return links.map((l) => {
      const r = showRoutes ? routeFor(l) : null
      if (!r) return null
      const [a, b] = samePlace(r.from, l.from.coord) ? [l.from, l.to] : [l.to, l.from]
      return { ...r, legs: routeLegs(r.route, r.from, r.to, { from: city(a), to: city(b) }) }
    })
  }, [links, showRoutes, points])
  const colourOf = (asn: number) => routes?.colours.get(asn) ?? OTHER_AS
  const [focusAs, setFocusAs] = useState<number | null>(null)
  const [hoverLeg, setHoverLeg] = useState<{ leg: Leg; link: Link; rtt: number | null; x: number; y: number } | null>(null)
  // The submarine cable base map, fetched the first time routes are shown.
  const [cables, setCables] = useState<CableData | null>(null)
  useEffect(() => {
    if (showRoutes && !cables) void loadCables()?.then(setCables)
  }, [showRoutes, cables])
  const [hoverCable, setHoverCable] = useState<{ cable: Cable; x: number; y: number } | null>(null)
  // Cables some drawn route is guessed to ride, drawn a little stronger.
  const usedCables = useMemo(() => new Set(routed.flatMap((r) => r?.legs.flatMap((l) => l.cables) ?? [])), [routed])
  // Networks on the drawn routes: coloured ones in palette order, the rest folded.
  const legend = useMemo(() => {
    const seen = new Set(routed.flatMap((r) => r?.legs.map((l) => l.asn) ?? []).filter(Boolean))
    const coloured = [...(routes?.colours.keys() ?? [])].filter((a) => seen.has(a))
    return { coloured, others: [...seen].filter((a) => !routes?.colours.has(a)) }
  }, [routed, routes])
  const lit = useMemo(() => (lightCountries ? litCountries(nodes) : { shapes: [], spots: [] }), [lightCountries, nodes])
  const svgRef = useRef<SVGSVGElement>(null)
  const boxRef = useRef<HTMLElement>(null)
  const [rotate, setRotate] = useState<[number, number]>([-120, -15])
  const [globeZoom, setGlobeZoom] = useState(1)
  const [flat, setFlat] = useState({ k: 1, x: 0, y: 0 })
  const [hover, setHover] = useState<{ point: MapPoint; x: number; y: number } | null>(null)
  // Only a node under the pointer pauses the spin (its card is being read);
  // lines and open globe don't.
  const hovering = !!hover
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const pausedUntil = useRef(0)
  const autorotate = rotation.on

  const [dims, setDims] = useState({ w: BASE_W, h: BASE_H })
  useEffect(() => {
    const el = boxRef.current
    if (!fill || !el) {
      setDims({ w: BASE_W, h: BASE_H })
      return
    }
    const ro = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect
      if (width > 0 && height > 0) setDims({ w: BASE_W, h: Math.round((BASE_W * height) / width) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [fill])
  const centre = useMemo(() => bestCentre(points.map((p) => p.coord[0])), [points])
  const W = dims.w
  const H = dims.h
  const R = Math.min(W, H) / 2.15

  // Spin the globe while nobody is interacting with it.
  useEffect(() => {
    if (mode !== 'globe' || !autorotate) return
    let raf = 0
    const tick = () => {
      if (!drag.current && !hovering && performance.now() > pausedUntil.current) {
        setRotate(([l, p]) => [(l + 0.08) % 360, p])
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [mode, autorotate, hovering])

  // Clicking a node's name elsewhere on the page brings its location into view.
  useEffect(() => {
    if (!focus) return
    pausedUntil.current = performance.now() + 8000
    if (mode === 'globe') {
      const from = rotate
      const to: [number, number] = [-focus[0], Math.max(-60, Math.min(60, -focus[1]))]
      const dl = ((to[0] - from[0] + 540) % 360) - 180
      const start = performance.now()
      let raf = 0
      // performance.now() rather than the rAF timestamp, which can predate `start`.
      const step = () => {
        const e = Math.min(1, Math.max(0, (performance.now() - start) / 700))
        const k = e < 0.5 ? 2 * e * e : 1 - (-2 * e + 2) ** 2 / 2
        setRotate([from[0] + dl * k, from[1] + (to[1] - from[1]) * k])
        if (e < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
      return () => cancelAnimationFrame(raf)
    }
    const base = flatBase(W, H, centre)
    const [px, py] = base(focus) ?? [W / 2, H / 2]
    const k = 3
    setFlat({ k, x: (W / 2 - px) * k, y: (H / 2 - py) * k })
    // Only a new focus target should trigger this; rotate is read as the start point.
  }, [focus, mode])

  const projection = useMemo(() => {
    if (mode === 'globe') {
      return geoOrthographic()
        .scale(R * globeZoom)
        .translate([W / 2, H / 2])
        .rotate([rotate[0], rotate[1], 0])
        .clipAngle(90)
    }
    const p = flatBase(W, H, centre)
    return p.scale(p.scale() * flat.k).translate([W / 2 + flat.x, H / 2 + flat.y])
  }, [mode, rotate, globeZoom, flat, W, H, R, centre])

  const path = geoPath(projection)
  const center: LngLat = [-rotate[0], -rotate[1]]
  const visible = (c: LngLat) => mode === 'flat' || geoDistance(c, center) < Math.PI / 2 - 0.02

  // A topology link as an arch: the great circle between its ends, lifted off
  // the surface towards the middle, higher for longer links. On the globe the
  // lift is radial, so an arch can rise over the limb while its far end is
  // still hidden; on the flat map the line bows upward.
  const archPath = (a: LngLat, b: LngLat): string | null => {
    const dist = geoDistance(a, b)
    if (dist < 1e-6) return null
    const along = geoInterpolate(a, b)
    const n = Math.max(16, Math.ceil(dist * 48))
    const pts: ([number, number] | null)[] = []
    if (mode === 'globe') {
      const lift = Math.min(0.22, 0.03 + dist * 0.07)
      const r = R * globeZoom
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const at = along(t)
        const xy = projection(at)
        if (!xy) {
          pts.push(null)
          continue
        }
        const k = 1 + lift * Math.sin(Math.PI * t)
        const sx = (xy[0] - W / 2) * k
        const sy = (xy[1] - H / 2) * k
        // Behind the globe and inside its outline: hidden.
        const behind = geoDistance(at, center) > Math.PI / 2 && Math.hypot(sx, sy) < r
        pts.push(behind ? null : [W / 2 + sx, H / 2 + sy])
      }
    } else {
      const p0 = projection(a)
      const p1 = projection(b)
      if (!p0 || !p1) return null
      const dx = p1[0] - p0[0]
      const dy = p1[1] - p0[1]
      const len = Math.hypot(dx, dy)
      // Unit normal to the chord, pointing up the map.
      const [nx, ny] = dx >= 0 ? [dy / len, -dx / len] : [-dy / len, dx / len]
      const bow = Math.min(len * 0.16, 90)
      let prev: [number, number] | null = null
      for (let i = 0; i <= n; i++) {
        const t = i / n
        const xy = projection(along(t))
        if (!xy) return null
        // Crosses the map's edge: no sensible arch, draw it plain.
        if (prev && Math.abs(xy[0] - prev[0]) > W * 0.4) return path({ type: 'LineString', coordinates: [a, b] })
        prev = xy
        const off = bow * Math.sin(Math.PI * t)
        pts.push([xy[0] + nx * off, xy[1] + ny * off])
      }
    }
    let d = ''
    let pen = false
    for (const p of pts) {
      if (!p) {
        pen = false
        continue
      }
      d += `${pen ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`
      pen = true
    }
    return d || null
  }

  // Screen <-> viewBox through the SVG's own transform, which stays right when
  // the box is letterboxed (fill mode) rather than exactly 960:500.
  const toView = (e: { clientX: number; clientY: number }) => {
    const ctm = svgRef.current!.getScreenCTM()!
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse())
    return { x: p.x, y: p.y, scale: 1 / ctm.a }
  }
  const toBox = (x: number, y: number) => {
    const p = new DOMPoint(x, y).matrixTransform(svgRef.current!.getScreenCTM()!)
    const r = boxRef.current!.getBoundingClientRect()
    return { x: p.x - r.left, y: p.y - r.top }
  }

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
    drag.current = { x: e.clientX, y: e.clientY, moved: false }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    const { scale } = toView(e)
    const dx = (e.clientX - d.x) * scale
    const dy = (e.clientY - d.y) * scale
    if (Math.abs(dx) + Math.abs(dy) > 2) d.moved = true
    d.x = e.clientX
    d.y = e.clientY
    if (mode === 'globe') {
      const s = 0.25 / globeZoom
      setRotate(([l, p]) => [l + dx * s, Math.max(-80, Math.min(80, p - dy * s))])
    } else {
      setFlat((f) => ({ ...f, x: f.x + dx, y: f.y + dy }))
    }
  }
  const onPointerUp = () => {
    // After dragging, give the reader a moment before the spin resumes.
    if (drag.current?.moved) pausedUntil.current = performance.now() + 4000
    drag.current = null
  }

  // Zoom around a point given in viewBox coordinates relative to the centre.
  const zoomBy = (factor: number, mx = 0, my = 0) => {
    pausedUntil.current = performance.now() + 4000
    if (mode === 'globe') {
      setGlobeZoom((z) => Math.max(0.7, Math.min(4, z * factor)))
      return
    }
    setFlat((f) => {
      const k = Math.max(1, Math.min(10, f.k * factor))
      const ratio = k / f.k
      return k === 1 ? { k: 1, x: 0, y: 0 } : { k, x: mx - (mx - f.x) * ratio, y: my - (my - f.y) * ratio }
    })
  }

  // Plain wheel keeps scrolling the page; Ctrl/⌘ + wheel (and trackpad pinch,
  // which browsers report as ctrl+wheel) zooms the map. Attached natively so
  // preventDefault works.
  const [hint, setHint] = useState(false)
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    let hideHint: number | undefined
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) {
        setHint(true)
        clearTimeout(hideHint)
        hideHint = window.setTimeout(() => setHint(false), 1200)
        return
      }
      e.preventDefault()
      const v = toView(e)
      zoomBy(Math.exp(-e.deltaY * 0.002), v.x - W / 2, v.y - H / 2)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => {
      el.removeEventListener('wheel', onWheel)
      clearTimeout(hideHint)
    }
    // zoomBy only reads mode, which is listed.
  }, [mode])

  const reset = () => {
    setGlobeZoom(1)
    setFlat({ k: 1, x: 0, y: 0 })
  }

  return (
    <section ref={boxRef} className="panel relative h-full overflow-hidden">
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between p-3">
        <div>
          <div className="hud text-primary!">指揮中心</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">
            {points.length} 地點 · {lit.shapes.length + lit.spots.length} 國家 · {allLinks.length} 鏈路
          </div>
        </div>
        <div className="pointer-events-auto flex gap-1 rounded-lg border border-line bg-white/85 p-0.5 text-[12px] shadow-sm backdrop-blur">
          {(['globe', 'flat'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onModeChange(m)}
              className={`rounded-md px-2.5 py-1 ${mode === m ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'}`}
            >
              {m === 'globe' ? '地球' : '平面'}
            </button>
          ))}
          {mode === 'globe' && (
            <>
              <span className="mx-0.5 w-px self-stretch bg-line" />
              <button
                onClick={() => {
                  pausedUntil.current = 0
                  rotation.toggle()
                }}
                title={rotation.on ? '暫停轉動' : '開始轉動'}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${
                  rotation.on ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                }`}
              >
                {rotation.on ? (
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="currentColor">
                    <rect x="4" y="3" width="2.6" height="10" rx="0.6" />
                    <rect x="9.4" y="3" width="2.6" height="10" rx="0.6" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
                    <path d="M5 3.2v9.6L12.5 8 5 3.2Z" />
                  </svg>
                )}
                {rotation.on ? '暫停轉動' : '開始轉動'}
              </button>
            </>
          )}
          {topology && (
            <>
              <span className="mx-0.5 w-px self-stretch bg-line" />
              <button
                onClick={topology.toggle}
                title={topology.on ? '隱藏拓撲連線' : '顯示拓撲連線'}
                className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${
                  topology.on ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                }`}
              >
                <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
                  <circle cx="3.5" cy="11.5" r="1.8" />
                  <circle cx="12.5" cy="4.5" r="1.8" />
                  <circle cx="12.5" cy="12" r="1.8" />
                  <path d="M5 10.4 11 5.6M5.3 11.6h5.4" />
                </svg>
                拓撲
              </button>
              {routes && topology.on && (
                <button
                  onClick={routes.toggle}
                  title={routes.on ? '改回直線連線' : '依實際路由（AS 路徑）畫出連線'}
                  className={`flex items-center gap-1 rounded-md px-2.5 py-1 ${
                    routes.on ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                  }`}
                >
                  <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round">
                    <path d="M2.5 12.5 5 7.5l3.5 2.5L11 4.5l2.5 3" />
                    <circle cx="2.5" cy="12.5" r="1.2" fill="currentColor" />
                    <circle cx="13.5" cy="7.5" r="1.2" fill="currentColor" />
                  </svg>
                  路由
                </button>
              )}
            </>
          )}
          <span className="mx-0.5 w-px self-stretch bg-line" />
          <button onClick={() => zoomBy(1.4)} className="rounded-md px-2 py-1 text-muted hover:text-fg" title="放大">
            +
          </button>
          <button onClick={() => zoomBy(1 / 1.4)} className="rounded-md px-2 py-1 text-muted hover:text-fg" title="縮小">
            −
          </button>
          <button onClick={reset} className="rounded-md px-2 py-1 text-muted hover:text-fg" title="重設縮放">
            ⟲
          </button>
        </div>
      </div>

      <div
        className={`pointer-events-none absolute inset-x-0 bottom-3 z-10 text-center text-[12px] text-muted transition-opacity ${
          hint ? 'opacity-100' : 'opacity-0'
        }`}
      >
        按住 Ctrl（Mac 為 ⌘）再滾動滑鼠以縮放地圖
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className={`block w-full touch-none select-none ${fill ? 'absolute inset-0 h-full' : 'h-auto'} ${
          drag.current ? 'cursor-grabbing' : 'cursor-grab'
        }`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
      >
        <defs>
          <radialGradient id="globe-glow" cx="50%" cy="50%" r="50%">
            <stop offset="86%" stopColor="#2f5bd3" stopOpacity="0" />
            <stop offset="93%" stopColor="#2f5bd3" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#2f5bd3" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="globe-shade" cx="38%" cy="32%" r="78%">
            <stop offset="0%" stopColor="#ffffff" />
            <stop offset="70%" stopColor="#f1f4f9" />
            <stop offset="100%" stopColor="#dfe5ee" />
          </radialGradient>
        </defs>

        {mode === 'globe' && (
          <circle cx={W / 2} cy={H / 2} r={R * globeZoom * 1.12} fill="url(#globe-glow)" />
        )}
        <path
          d={path(SPHERE) ?? ''}
          fill={mode === 'globe' ? 'url(#globe-shade)' : C.sea}
          stroke={mode === 'globe' ? '#ffffff' : '#e2e8f0'}
          strokeWidth={mode === 'globe' ? 2 : 1}
        />
        <path d={path(GRATICULE) ?? ''} fill="none" stroke={C.grid} strokeOpacity="0.07" />
        <path d={path(LAND) ?? ''} fill={C.land} stroke="none" />
        {lit.shapes.map(({ id, up }) => (
          <path
            key={id}
            d={path(COUNTRY_SHAPES.get(id)!) ?? ''}
            fill={up ? C.lit : C.litDown}
            stroke={up ? C.litStroke : C.down}
            strokeOpacity="0.55"
            strokeWidth="0.8"
          />
        ))}
        <path d={path(BORDERS) ?? ''} fill="none" stroke={C.border} strokeWidth="0.7" />
        {lit.spots.map(({ cc, coord, up }) => {
          if (!visible(coord)) return null
          const xy = projection(coord)
          return xy ? (
            <circle
              key={cc}
              cx={xy[0]}
              cy={xy[1]}
              r="11"
              fill={up ? C.lit : C.litDown}
              fillOpacity="0.8"
              stroke={up ? C.litStroke : C.down}
              strokeOpacity="0.5"
              strokeWidth="0.8"
            />
          ) : null
        })}

        {showRoutes &&
          cables?.cables.map((c, i) => {
            const d = path({ type: 'MultiLineString', coordinates: c.paths })
            if (!d) return null
            const used = usedCables.has(c.name)
            const lit = hoverCable?.cable === c
            const onHover = (e: React.PointerEvent) => {
              const r = boxRef.current!.getBoundingClientRect()
              setHoverCable({ cable: c, x: e.clientX - r.left, y: e.clientY - r.top })
            }
            return (
              <g key={i}>
                <path
                  d={d}
                  fill="none"
                  stroke={c.color}
                  strokeOpacity={lit ? 1 : used ? 0.9 : 0.42}
                  strokeWidth={lit ? 2.4 : used ? 1.5 : 0.9}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                  strokeDasharray={c.planned ? '3 3' : undefined}
                  pointerEvents="none"
                />
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth="7"
                  pointerEvents="stroke"
                  onPointerEnter={onHover}
                  onPointerMove={onHover}
                  onPointerLeave={() => setHoverCable(null)}
                />
              </g>
            )
          })}

        {links.map((l, i) => {
          const rt = routed[i]
          if (rt?.legs.length) {
            const up = linkUp(l)
            const end = rt.legs.at(-1)!.points.at(-1)!.at
            // A trace that never reached the far end: dashed on from where it stopped.
            const rest = rt.route.reached ? null : path({ type: 'LineString', coordinates: [end, rt.to] })
            return (
              <g key={i}>
                {rt.legs.map((leg, j) => {
                  const d = path({ type: 'LineString', coordinates: leg.points.map((p) => p.at) })
                  if (!d) return null
                  const c = colourOf(leg.asn)
                  const onHover = (e: React.PointerEvent) => {
                    const r = boxRef.current!.getBoundingClientRect()
                    setHoverLeg({ leg, link: l, rtt: rt.route.rtt, x: e.clientX - r.left, y: e.clientY - r.top })
                  }
                  return (
                    <g key={j} opacity={focusAs !== null && focusAs !== leg.asn ? 0.12 : 1} className="transition-opacity">
                      <path d={d} fill="none" stroke={c} strokeOpacity="0.16" strokeWidth="5" />
                      <path
                        d={d}
                        fill="none"
                        stroke={c}
                        strokeWidth="2"
                        strokeLinejoin="round"
                        strokeDasharray={up ? undefined : '4 5'}
                      />
                      {up && <path d={d} fill="none" stroke="#ffffff" strokeWidth="2" strokeDasharray="3 15" className="flow" />}
                      <path
                        d={d}
                        fill="none"
                        stroke="transparent"
                        strokeWidth="12"
                        pointerEvents="stroke"
                        onPointerEnter={onHover}
                        onPointerMove={onHover}
                        onPointerLeave={() => setHoverLeg(null)}
                      />
                    </g>
                  )
                })}
                {rest && <path d={rest} fill="none" stroke={C.down} strokeOpacity="0.7" strokeWidth="1.6" strokeDasharray="4 5" />}
                {rt.legs.flatMap((leg, j) =>
                  leg.points.slice(j === 0 ? 1 : 0).map((p, k) => {
                    if (p.kind === 'shape' || samePlace(p.at, rt.from) || samePlace(p.at, rt.to) || !visible(p.at)) return null
                    const xy = projection(p.at)
                    if (!xy) return null
                    if (p.kind === 'landing') {
                      return (
                        <rect
                          key={`${j}-${k}`}
                          x={xy[0] - 2.2}
                          y={xy[1] - 2.2}
                          width="4.4"
                          height="4.4"
                          transform={`rotate(45 ${xy[0]} ${xy[1]})`}
                          fill="#ffffff"
                          stroke="#475569"
                          strokeWidth="1.2"
                          opacity={focusAs !== null && focusAs !== leg.asn ? 0.15 : 1}
                          pointerEvents="none"
                        />
                      )
                    }
                    const handover = k === 0 && j > 0
                    return (
                      <circle
                        key={`${j}-${k}`}
                        cx={xy[0]}
                        cy={xy[1]}
                        r={handover ? 3.4 : 2.6}
                        fill="#ffffff"
                        stroke={colourOf(handover ? leg.asn : p.asn)}
                        strokeWidth={handover ? 2 : 1.5}
                        opacity={focusAs !== null && focusAs !== leg.asn ? 0.15 : 1}
                        pointerEvents="none"
                      />
                    )
                  }),
                )}
              </g>
            )
          }
          const d = archPath(l.from.coord, l.to.coord)
          if (!d) return null
          const up = linkUp(l)
          return (
            <g key={i}>
              <path d={d} fill="none" stroke={up ? C.up : C.down} strokeOpacity="0.12" strokeWidth="5" />
              <path
                d={d}
                fill="none"
                stroke={up ? C.up : C.down}
                strokeOpacity={up ? 0.85 : 0.7}
                strokeWidth="1.6"
                strokeDasharray={up ? undefined : '4 5'}
              />
              {up && (
                <path d={d} fill="none" stroke="#ffffff" strokeWidth="1.6" strokeDasharray="3 15" className="flow" />
              )}
            </g>
          )
        })}

        {links.flatMap((l) => [l.from, l.to]).map((ep, i) => {
          if (ep.kind !== 'city' || !visible(ep.coord)) return null
          const xy = projection(ep.coord)
          if (!xy) return null
          return (
            <g key={`c${i}`} transform={`translate(${xy[0]},${xy[1]})`}>
              <circle r="3.5" fill="#ffffff" stroke="#64748b" strokeWidth="1.2" />
              <text y="-8" textAnchor="middle" className="fill-muted text-[10px] font-medium">
                {ep.label}
              </text>
            </g>
          )
        })}

        {points.map((p) => {
          if (!visible(p.coord)) return null
          const xy = projection(p.coord)
          if (!xy) return null
          const up = p.nodes.filter((n) => n.online).length
          const color = up === p.nodes.length ? C.up : up === 0 ? C.down : C.partial
          return (
            <g
              key={p.key}
              transform={`translate(${xy[0]},${xy[1]})`}
              onPointerEnter={() => setHover({ point: p, ...toBox(xy[0], xy[1]) })}
              onPointerLeave={() => setHover(null)}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onSelect?.(p)}
              className="cursor-pointer"
            >
              <circle r="10" fill={color} opacity="0.2" className={up ? 'ping-ring' : ''} />
              <circle r="4.5" fill={color} stroke="#ffffff" strokeWidth="2" />
              {p.nodes.length > 1 && labels === 'off' && (
                <text x="7" y="-6" className="fill-fg text-[10px] font-semibold">
                  {p.nodes.length}
                </text>
              )}
            </g>
          )
        })}

        <MapLabels
          mode={labels}
          width={W}
          height={H}
          points={points.flatMap((p) => {
            if (!visible(p.coord)) return []
            const xy = projection(p.coord)
            return xy ? [{ point: p, px: xy[0], py: xy[1] }] : []
          })}
        />
      </svg>

      {showRoutes && legend.coloured.length + legend.others.length > 0 && (
        <div className="absolute bottom-3 left-3 z-10 w-56 rounded-lg border border-line bg-white/90 p-2 text-[11.5px] shadow-sm backdrop-blur">
          <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
            <span className="hud">AS 路由</span>
            {ROUTES && (
              <span className="font-mono text-[10px] text-muted" title="路由快照時間（mtr 單向追蹤）">
                {new Date(ROUTES.generated).toLocaleDateString()}
              </span>
            )}
          </div>
          {legend.coloured.map((asn) => (
            <button
              key={asn}
              onPointerEnter={() => setFocusAs(asn)}
              onPointerLeave={() => setFocusAs(null)}
              onClick={() => setFocusAs((f) => (f === asn ? null : asn))}
              className={`flex w-full items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-primary-soft/60 ${
                focusAs === asn ? 'bg-primary-soft/60' : ''
              }`}
            >
              <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: colourOf(asn) }} />
              <span className="shrink-0 font-mono text-[10.5px] text-muted">AS{asn}</span>
              <span className="min-w-0 truncate">{asName(asn)}</span>
            </button>
          ))}
          {legend.others.length > 0 && (
            <div
              className="flex items-center gap-2 px-1 py-0.5 text-muted"
              title={legend.others.map((a) => `AS${a} ${asName(a)}`).join('\n')}
            >
              <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: OTHER_AS }} />
              其他 {legend.others.length} 個網路
            </div>
          )}
          {cables && (
            <div className="mt-1 flex items-center gap-2 border-t border-line px-1 pt-1.5 text-[10.5px] text-muted">
              <span className="flex h-[3px] w-4 shrink-0 overflow-hidden rounded-full">
                <span className="flex-1 bg-[#d41f77]" />
                <span className="flex-1 bg-[#2a9d8f]" />
                <span className="flex-1 bg-[#e9a23b]" />
              </span>
              海纜示意路線 · 走哪條為推測
            </div>
          )}
        </div>
      )}

      {hoverLeg && (
        <div
          className="pointer-events-none absolute z-20 w-60 -translate-x-1/2 rounded-lg border border-line bg-white/95 p-2.5 text-[12px] shadow-xl backdrop-blur"
          style={{ left: hoverLeg.x, top: hoverLeg.y + 16 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: colourOf(hoverLeg.leg.asn) }} />
            <b className="font-mono">{hoverLeg.leg.asn ? `AS${hoverLeg.leg.asn}` : '交換點'}</b>
            <span className="min-w-0 truncate">{asName(hoverLeg.leg.asn)}</span>
          </div>
          <div className="mt-1 text-fg">{legPlaces(hoverLeg.leg)}</div>
          {hoverLeg.leg.cables.length > 0 && (
            <div className="mt-1 flex items-start gap-1 text-[11px] text-muted">
              <span>⚓</span>
              <span>
                {hoverLeg.leg.cables.filter((c) => c !== PLAIN_SEA).join(' → ') || '跨海段未對應到海纜，沿海面推估'}
                {hoverLeg.leg.cables.some((c) => c !== PLAIN_SEA) && '（推測）'}
              </span>
            </div>
          )}
          <div className="mt-1.5 border-t border-line pt-1.5 text-[11px] text-muted">
            {epName(hoverLeg.link.from)} → {epName(hoverLeg.link.to)}
            {hoverLeg.rtt !== null && <span className="ml-1 font-mono">· {hoverLeg.rtt} ms</span>}
          </div>
        </div>
      )}

      {hoverCable && !hoverLeg && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-lg border border-line bg-white/95 p-2.5 text-[12px] shadow-xl backdrop-blur"
          style={{ left: hoverCable.x, top: hoverCable.y + 16 }}
        >
          <div className="flex items-center gap-2">
            <span className="h-[3px] w-4 shrink-0 rounded-full" style={{ background: hoverCable.cable.color }} />
            <b className="min-w-0 leading-snug">{hoverCable.cable.name}</b>
          </div>
          <div className="mt-1 text-[11px] text-muted">
            {[
              hoverCable.cable.planned
                ? `2022 年時規劃中${hoverCable.cable.rfs ? `，預計 ${hoverCable.cable.rfs}` : ''}`
                : hoverCable.cable.rfs && `${hoverCable.cable.rfs} 年啟用`,
              hoverCable.cable.length,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
          {hoverCable.cable.owners.length > 0 && (
            <div className="mt-1 text-[11px] leading-snug text-fg">
              {hoverCable.cable.owners.slice(0, 5).join('、')}
              {hoverCable.cable.owners.length > 5 && ` 等 ${hoverCable.cable.owners.length} 家`}
            </div>
          )}
          {usedCables.has(hoverCable.cable.name) && <div className="mt-1 text-[11px] text-muted">⚓ 推測有路由經過</div>}
        </div>
      )}

      {showRoutes && cables && (
        <div className="absolute right-3 bottom-2 z-10 rounded bg-white/75 px-1.5 py-0.5 text-[10px] text-muted backdrop-blur">
          海纜資料 ©{' '}
          <a href={cables.source.url} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">
            {cables.source.author}
          </a>{' '}
          {cables.source.snapshot.slice(0, 4)} ·{' '}
          <a href={cables.source.licenseUrl} target="_blank" rel="noreferrer" className="underline decoration-dotted hover:text-fg">
            {cables.source.license}
          </a>
        </div>
      )}

      {hover && (
        <div
          className="pointer-events-none absolute z-20 w-64 -translate-x-1/2 rounded-lg border border-line bg-white/95 p-2.5 text-[12px] shadow-xl backdrop-blur"
          style={{
            left: hover.x,
            top: hover.y + 14,
          }}
        >
          <div className="mb-1.5 text-muted">{hover.point.label}</div>
          {hover.point.nodes.map((n) => (
            <div key={n.id} className="flex items-center gap-2 py-0.5">
              <Flag code={n.country} className="h-3 w-4" />
              <span className="min-w-0 flex-1 truncate">{n.name}</span>
              {n.online && n.metrics ? (
                <span className="shrink-0 font-mono text-muted">
                  {(n.metrics.cpu ?? 0).toFixed(0)}% · ↓{speed(n.metrics.net_rx)}
                </span>
              ) : (
                <span className="shrink-0 text-bad">離線</span>
              )}
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
