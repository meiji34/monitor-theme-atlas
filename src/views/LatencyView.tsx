import { Flag } from '../components/Flag'
import { Sparkline } from '../components/Meter'
import { latencyTone, pingLines } from '../components/NodeCard'
import { t } from '../lib/i18n'
import { NodeLink } from '../lib/router'
import type { Node, PingSeries } from '../lib/types'

// Every node against every latency probe for the last hour.
export function LatencyView({ nodes, ping }: { nodes: Node[]; ping: Record<string, PingSeries> }) {
  const probes = [...new Set(nodes.flatMap((n) => Object.values(ping[n.id]?.probes ?? {})))]
  if (!probes.length) {
    return <div className="panel p-10 text-center text-[15px] text-muted">{t('還沒有延遲資料。到後台「延遲」頁新增監控後，一分鐘內就會出現。')}</div>
  }
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full text-[14.5px]" style={{ minWidth: 300 + probes.length * 230 }}>
        <thead>
          <tr className="border-b border-line text-left">
            <th className="hud px-4 py-3 whitespace-nowrap">{t('{n} 個節點，近 1 小時', { n: nodes.length })}</th>
            {probes.map((p) => (
              <th key={p} className="hud px-4 py-3">
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
                <td className="px-4 py-3">
                  <NodeLink id={n.id} className="flex items-center gap-2.5 hover:text-primary">
                    <span className={`size-2 shrink-0 rounded-full ${n.online ? 'breathe bg-good' : 'bg-bad'}`} />
                    <Flag code={n.country} className="h-3.5 w-5" />
                    <span className="truncate text-[16px] font-semibold">{n.name}</span>
                  </NodeLink>
                </td>
                {probes.map((p) => {
                  const l = lines.find((x) => x.name === p)
                  if (!l) {
                    return (
                      <td key={p} className="px-4 py-3 text-muted">
                        —
                      </td>
                    )
                  }
                  const tone = latencyTone(l.latest, l.loss)
                  return (
                    <td key={p} className="px-4 py-3">
                      <div className="flex items-center gap-3 font-mono">
                        <span className={`w-16 text-[15.5px] font-semibold ${tone}`}>
                          {l.latest === null ? t('超時') : `${Math.round(l.latest)} ms`}
                        </span>
                        <Sparkline values={l.values} className={`h-5 w-24 ${tone}`} />
                        <span className={`w-14 text-right ${l.loss >= 5 ? 'text-bad' : 'text-muted'}`}>{l.loss.toFixed(1)}%</span>
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
