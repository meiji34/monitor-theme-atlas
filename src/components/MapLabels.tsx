import { compactRate } from '../lib/format'
import { DOWN, UP } from '../lib/palette'
import { flagDataUrl } from './Flag'
import type { MapPoint } from './MapView'

export type LabelMode = 'speed' | 'name' | 'name_speed' | 'off'

interface Placed {
  key: string
  px: number
  py: number
  x: number
  y: number
  w: number
  far: boolean
  point: MapPoint
}

const H = 22
const GAP = 9
const FLAG_W = 16
const SEP = 7

// Rough text width at 11px: CJK glyphs are about square, Latin about 0.6em.
const textWidth = (s: string) => [...s].reduce((w, ch) => w + (ch.charCodeAt(0) > 0x2e80 ? 11 : 6.6), 0)

const shorten = (s: string, max = 16) => ([...s].length > max ? `${[...s].slice(0, max - 1).join('')}…` : s)

function parts(p: MapPoint, mode: LabelMode) {
  const online = p.nodes.filter((n) => n.online)
  const rx = online.reduce((a, n) => a + (n.metrics?.net_rx ?? 0), 0)
  const tx = online.reduce((a, n) => a + (n.metrics?.net_tx ?? 0), 0)
  const name = p.nodes.length > 1 ? `${p.label} ×${p.nodes.length}` : shorten(p.nodes[0].name)
  const offline = online.length === 0
  const showRate = mode !== 'name'
  return {
    name: mode === 'speed' ? '' : name,
    up: showRate && !offline ? `↑${compactRate(tx)}` : '',
    down: showRate && !offline ? `↓${compactRate(rx)}` : '',
    offline,
    count: mode === 'speed' && p.nodes.length > 1 ? `×${p.nodes.length}` : '',
  }
}

// SVG collapses runs of spaces, so pieces are separate tspans spaced with dx.
// Arrows carry the series colour; numbers stay in text ink.
const INK = '#0f172a'
interface Segment {
  text: string
  fill: string
  sans?: boolean
  arrow?: string
}
function segments(t: ReturnType<typeof parts>): Segment[] {
  const out: Segment[] = []
  if (t.name) out.push({ text: t.name, fill: INK, sans: true })
  if (t.up) out.push({ text: t.up, fill: INK, arrow: UP })
  if (t.down) out.push({ text: t.down, fill: INK, arrow: DOWN })
  if (t.offline) out.push({ text: '離線', fill: '#d03b3b', sans: true })
  if (t.count) out.push({ text: t.count, fill: '#64748b' })
  return out
}

const overlaps = (a: { x: number; y: number; w: number }, b: { x: number; y: number; w: number }) =>
  a.x < b.x + b.w + 3 && b.x < a.x + a.w + 3 && a.y < b.y + H + 3 && b.y < a.y + H + 3

// Greedy placement: each label tries the spots around its dot in turn and
// takes the first one that stays on the map and clears earlier labels and
// every dot; the last resorts sit further out with a leader line.
function layout(points: { point: MapPoint; px: number; py: number }[], mode: LabelMode, width: number, height: number) {
  const placed: Placed[] = []
  const dots = points.map((p) => ({ x: p.px - 6, y: p.py - H / 2, w: 12 }))
  const sorted = [...points].sort((a, b) => a.py - b.py || a.px - b.px)
  for (const { point, px, py } of sorted) {
    const segs = segments(parts(point, mode))
    const w = 9 + FLAG_W + 6 + segs.reduce((a, s, i) => a + textWidth(s.text) + (i ? SEP : 0), 0) + 10
    const spots = [
      { x: px - w / 2, y: py + GAP, far: false },
      { x: px - w / 2, y: py - GAP - H, far: false },
      { x: px + GAP, y: py - H / 2, far: false },
      { x: px - GAP - w, y: py - H / 2, far: false },
      { x: px + GAP, y: py + GAP, far: false },
      { x: px - GAP - w, y: py - GAP - H, far: false },
      { x: px - w / 2, y: py + GAP + H + 6, far: true },
      { x: px - w / 2, y: py - GAP - 2 * H - 6, far: true },
      { x: px + GAP + 24, y: py + H, far: true },
      { x: px - GAP - 24 - w, y: py - 2 * H, far: true },
    ]
    const ok = (s: { x: number; y: number }) =>
      s.x >= 2 &&
      s.y >= 2 &&
      s.x + w <= width - 2 &&
      s.y + H <= height - 2 &&
      !placed.some((o) => overlaps({ ...s, w }, o)) &&
      !dots.some((d) => overlaps({ ...s, w }, d))
    const spot = spots.find(ok) ?? spots[0]
    placed.push({ key: point.key, px, py, ...spot, w, point })
  }
  return placed
}

export function MapLabels({
  points,
  mode,
  width,
  height,
}: {
  points: { point: MapPoint; px: number; py: number }[]
  mode: LabelMode
  width: number
  height: number
}) {
  if (mode === 'off') return null
  return (
    <g className="pointer-events-none">
      <defs>
        <filter id="pill-shadow" x="-20%" y="-40%" width="140%" height="200%">
          <feDropShadow dx="0" dy="2" stdDeviation="2.5" floodColor="#0f172a" floodOpacity="0.12" />
        </filter>
      </defs>
      {layout(points, mode, width, height).map((l) => {
        const t = parts(l.point, mode)
        const flag = flagDataUrl(l.point.nodes[0].country)
        const cx = Math.max(l.x, Math.min(l.px, l.x + l.w))
        const cy = l.py < l.y ? l.y : l.py > l.y + H ? l.y + H : l.py
        return (
          <g key={l.key}>
            {l.far && <line x1={l.px} y1={l.py} x2={cx} y2={cy} stroke="#94a3b8" strokeWidth="0.9" strokeDasharray="2 2" />}
            <rect
              x={l.x}
              y={l.y}
              width={l.w}
              height={H}
              rx={H / 2}
              fill="#ffffff"
              fillOpacity="0.96"
              stroke={t.offline ? '#fca5a5' : '#dbe3ef'}
              strokeWidth="0.9"
              filter="url(#pill-shadow)"
            />
            {flag ? (
              <image href={flag} x={l.x + 9} y={l.y + (H - 11) / 2} width={FLAG_W} height={11} preserveAspectRatio="xMidYMid slice" />
            ) : (
              <rect x={l.x + 9} y={l.y + (H - 11) / 2} width={FLAG_W} height={11} rx="1.5" fill="#e2e8f0" />
            )}
            <text x={l.x + 9 + FLAG_W + 6} y={l.y + H / 2 + 3.8} className="font-mono text-[11px] font-semibold">
              {segments(t).map((s, i) =>
                s.arrow ? (
                  <tspan key={i} dx={i ? SEP : 0}>
                    <tspan fill={s.arrow}>{s.text.slice(0, 1)}</tspan>
                    <tspan fill={s.fill}>{s.text.slice(1)}</tspan>
                  </tspan>
                ) : (
                  <tspan key={i} dx={i ? SEP : 0} fill={s.fill} className={s.sans ? 'font-sans' : ''}>
                    {s.text}
                  </tspan>
                ),
              )}
            </text>
          </g>
        )
      })}
    </g>
  )
}
