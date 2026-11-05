const tone = (v: number) => (v >= 90 ? 'bg-bad' : v >= 70 ? 'bg-warn' : 'bg-primary')

export function Meter({ label, value, right, detail }: { label: string; value: number; right: string; detail: string }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2">
        <span className="hud">{label}</span>
        <span className="font-mono text-[15px] font-semibold">{right}</span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-primary-soft">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone(value)}`} style={{ width: `${value}%` }} />
      </div>
      <div className="mt-1.5 truncate font-mono text-[13px] text-muted">{detail}</div>
    </div>
  )
}

// A latency line: null points are gaps (lost probes), drawn as breaks.
export function Sparkline({ values, className = '' }: { values: (number | null)[]; className?: string }) {
  const w = 120
  const h = 18
  const nums = values.filter((v): v is number => v !== null)
  if (nums.length < 2) return <div className={className} />
  const lo = Math.min(...nums)
  const hi = Math.max(...nums)
  const span = hi - lo || 1
  const x = (i: number) => (i / (values.length - 1)) * w
  const y = (v: number) => h - 2 - ((v - lo) / span) * (h - 4)
  let d = ''
  values.forEach((v, i) => {
    if (v === null) return
    const prev = values[i - 1]
    d += `${prev === null || prev === undefined ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`
  })
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" className={className}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth="1.3" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
