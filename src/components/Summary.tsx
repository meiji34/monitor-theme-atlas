import { bytes, pct, speed } from '../lib/format'
import type { Node } from '../lib/types'

function Tile({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: number }) {
  return (
    <div className="panel px-4 py-3">
      <div className="hud">{label}</div>
      <div className="mt-1 font-mono text-xl font-bold tabular-nums">{value}</div>
      {bar !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
          <div className="h-full rounded-full bg-primary" style={{ width: `${bar}%` }} />
        </div>
      )}
      {sub && <div className="mt-1.5 truncate font-mono text-[11px] text-muted">{sub}</div>}
    </div>
  )
}

export function Summary({ nodes }: { nodes: Node[] }) {
  const online = nodes.filter((n) => n.online)
  const sum = (f: (n: Node) => number | undefined) => online.reduce((a, n) => a + (f(n) ?? 0), 0)
  const memUsed = sum((n) => n.metrics?.mem_used)
  const memTotal = sum((n) => n.metrics?.mem_total ?? n.mem_total)
  const diskUsed = sum((n) => n.metrics?.disk_used)
  const diskTotal = sum((n) => n.metrics?.disk_total ?? n.disk_total)
  const cores = sum((n) => n.cpu_cores)
  const avgCpu = sum((n) => n.metrics?.cpu) / (online.length || 1)
  const countries = new Set(nodes.map((n) => n.country).filter(Boolean)).size
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-5">
      <Tile label="節點在線" value={`${online.length} / ${nodes.length}`} sub={`${countries} 個國家／地區`} />
      <Tile label="CPU" value={`${avgCpu.toFixed(1)}%`} sub={`${cores} 核`} bar={avgCpu} />
      <Tile label="記憶體" value={`${pct(memUsed, memTotal).toFixed(0)}%`} sub={`${bytes(memUsed)} / ${bytes(memTotal)}`} bar={pct(memUsed, memTotal)} />
      <Tile label="硬碟" value={`${pct(diskUsed, diskTotal).toFixed(0)}%`} sub={`${bytes(diskUsed)} / ${bytes(diskTotal)}`} bar={pct(diskUsed, diskTotal)} />
      <Tile
        label="即時網速"
        value={speed(sum((n) => n.metrics?.net_rx) + sum((n) => n.metrics?.net_tx))}
        sub={`今日 ↑${bytes(sum((n) => n.day_tx))} ↓${bytes(sum((n) => n.day_rx))}`}
      />
    </section>
  )
}
