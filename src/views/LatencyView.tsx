import { Flag } from '../components/Flag'
import { Sparkline } from '../components/Meter'
import { latencyTone, pingLines } from '../components/NodeCard'
import { Link } from '../lib/router'
import type { Node, PingSeries } from '../lib/types'

// Every node against every latency probe for the last hour.
export function LatencyView({ nodes, ping }: { nodes: Node[]; ping: Record<number, PingSeries> }) {
  const probes = [...new Set(nodes.flatMap((n) => Object.values(ping[n.id]?.probes ?? {})))]
  if (!probes.length) {
    return <div className="panel p-10 text-center text-muted">還沒有延遲資料。到後台「延遲」頁新增監控後，一分鐘內就會出現。</div>
  }
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[12px]" style={{ minWidth: 260 + probes.length * 190 }}>
        <thead>
          <tr className="border-b border-line text-left">
            <th className="hud px-3 py-2.5 text-[10px]!">節點 · 近 1 小時</th>
            {probes.map((p) => (
              <th key={p} className="hud px-3 py-2.5 text-[10px]!">
                {p}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {nodes.map((n) => {
            const lines = pingLines(ping[n.id], probes)
            return (
              <tr key={n.id} className="border-b border-line/70 last:border-0">
                <td className="px-3 py-2">
                  <Link to={`/node/${n.id}`} className="flex items-center gap-2 hover:text-primary">
                    <span className={`size-2 shrink-0 rounded-full ${n.online ? 'breathe bg-good' : 'bg-bad'}`} />
                    <Flag code={n.country} className="h-3 w-4" />
                    <span className="truncate text-[13px] font-semibold">{n.name}</span>
                  </Link>
                </td>
                {probes.map((p) => {
                  const l = lines.find((x) => x.name === p)
                  if (!l) {
                    return (
                      <td key={p} className="px-3 py-2 text-muted">
                        —
                      </td>
                    )
                  }
                  const tone = latencyTone(l.latest, l.loss)
                  return (
                    <td key={p} className="px-3 py-2">
                      <div className="flex items-center gap-2 font-mono">
                        <span className={`w-14 font-semibold tabular-nums ${tone}`}>
                          {l.latest === null ? '超時' : `${Math.round(l.latest)}ms`}
                        </span>
                        <Sparkline values={l.values} className={`h-4 w-20 ${tone}`} />
                        <span className={`w-12 text-right tabular-nums ${l.loss >= 5 ? 'text-bad' : 'text-muted'}`}>
                          {l.loss.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
