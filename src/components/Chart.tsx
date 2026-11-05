import { useMemo, useRef, useState } from 'react'
import { t as tr } from '../lib/i18n'

export interface Series {
  name: string
  color: string
  // null = no data for that bucket; drawn as a gap.
  values: (number | null)[]
  area?: boolean
}

interface Props {
  title: string
  ts: number[]
  series: Series[]
  format: (v: number) => string
  // Fixed upper bound (e.g. 100 for percentages); otherwise fits the data.
  max?: number
  extra?: React.ReactNode
}

const W = 600
const H = 180
const PAD = { l: 52, r: 10, t: 10, b: 22 }

function niceMax(v: number): number {
  if (v <= 0) return 1
  const p = 10 ** Math.floor(Math.log10(v))
  const n = v / p
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p
}

const timeFmt = (sec: number, span: number) => {
  const d = new Date(sec * 1000)
  const hm = d.toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit', hour12: false })
  return span > 2 * 86400 ? `${d.getMonth() + 1}/${d.getDate()} ${hm}` : hm
}

// Multi-series time chart drawn in plain SVG, with a hover crosshair.
export function Chart({ title, ts, series, format, max, extra }: Props) {
  const ref = useRef<SVGSVGElement>(null)
  const [hover, setHover] = useState<number | null>(null)

  const { yMax, x, y } = useMemo(() => {
    const all = series.flatMap((s) => s.values).filter((v): v is number => v !== null)
    const top = max ?? niceMax(Math.max(0, ...all) * 1.1)
    const n = Math.max(1, ts.length - 1)
    return {
      yMax: top,
      x: (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r),
      y: (v: number) => PAD.t + (1 - Math.min(v, top) / top) * (H - PAD.t - PAD.b),
    }
  }, [series, ts, max])

  const pathFor = (vals: (number | null)[], close: boolean) => {
    let d = ''
    let start = -1
    vals.forEach((v, i) => {
      if (v === null) {
        if (close && start >= 0) d += `L${x(i - 1)},${y(0)}L${x(start)},${y(0)}Z`
        start = -1
        return
      }
      if (start < 0) {
        start = i
        d += `M${x(i)},${y(v)}`
      } else d += `L${x(i)},${y(v)}`
    })
    if (close && start >= 0) d += `L${x(vals.length - 1)},${y(0)}L${x(start)},${y(0)}Z`
    return d
  }

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const px = ((e.clientX - r.left) / r.width) * W
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (ts.length - 1))
    setHover(i >= 0 && i < ts.length ? i : null)
  }

  const span = ts.length > 1 ? ts[ts.length - 1] - ts[0] : 0
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => yMax * f)
  const xTicks = ts.length > 1 ? [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * (ts.length - 1))) : []

  return (
    <div className="panel p-4">
      <div className="mb-2 flex items-center justify-between gap-3">
        <span className="hud text-fg!">{title}</span>
        <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
          {series.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5 text-muted">
              <span className="h-0.5 w-3 rounded" style={{ background: s.color }} />
              {s.name}
            </span>
          ))}
          {extra}
        </div>
      </div>
      {ts.length < 2 ? (
        <div className="flex h-[150px] items-center justify-center text-[14px] text-muted">{tr('沒有資料')}</div>
      ) : (
        <div className="relative">
          <svg
            ref={ref}
            viewBox={`0 0 ${W} ${H}`}
            className="block h-auto w-full"
            onPointerMove={onMove}
            onPointerLeave={() => setHover(null)}
          >
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.l} x2={W - PAD.r} y1={y(t)} y2={y(t)} className="stroke-line" strokeDasharray={t ? '3 3' : undefined} />
                <text x={PAD.l - 6} y={y(t) + 3.5} textAnchor="end" className="fill-muted font-mono text-[11.5px]">
                  {format(t)}
                </text>
              </g>
            ))}
            {xTicks.map((i, k) => (
              <text
                key={k}
                x={x(i)}
                y={H - 6}
                textAnchor={k === 0 ? 'start' : k === xTicks.length - 1 ? 'end' : 'middle'}
                className="fill-muted font-mono text-[11.5px]"
              >
                {timeFmt(ts[i], span)}
              </text>
            ))}
            {series.map((s) => (
              <g key={s.name}>
                {s.area && <path d={pathFor(s.values, true)} fill={s.color} fillOpacity="0.1" />}
                <path d={pathFor(s.values, false)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              </g>
            ))}
            {hover !== null && (
              <g>
                <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={H - PAD.b} className="stroke-muted" strokeDasharray="2 2" />
                {series.map((s) =>
                  s.values[hover] !== null && s.values[hover] !== undefined ? (
                    <circle key={s.name} cx={x(hover)} cy={y(s.values[hover]!)} r="3" className="fill-card" stroke={s.color} strokeWidth="1.5" />
                  ) : null,
                )}
              </g>
            )}
          </svg>
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-md border border-line bg-raised/95 px-2.5 py-1.5 text-[12.5px] shadow-lg"
              style={
                x(hover) / W > 0.6
                  ? { right: `${(1 - x(hover) / W) * 100 + 2}%` }
                  : { left: `${(x(hover) / W) * 100 + 2}%` }
              }
            >
              <div className="mb-1 font-mono text-muted">{timeFmt(ts[hover], Math.max(span, 3 * 86400))}</div>
              {series.map((s) => (
                <div key={s.name} className="flex items-center justify-between gap-3">
                  <span className="flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full" style={{ background: s.color }} />
                    {s.name}
                  </span>
                  <span className="font-mono font-semibold">
                    {s.values[hover] === null || s.values[hover] === undefined ? '—' : format(s.values[hover]!)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
