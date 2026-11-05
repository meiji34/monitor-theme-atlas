import { Flag } from '../components/Flag'
import { latencyTone, type PingLine } from '../components/NodeCard'
import { Rate } from '../components/Rate'
import { bytes, compactRate, duration, expiry, pct } from '../lib/format'
import { navigate } from '../lib/router'
import type { Node } from '../lib/types'

function Bar({ v }: { v: number }) {
  const tone = v >= 90 ? 'bg-bad' : v >= 70 ? 'bg-warn' : 'bg-primary'
  return (
    <div className="flex items-center gap-2">
      <div className="h-1 w-14 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-9 text-right tabular-nums">{v.toFixed(0)}%</span>
    </div>
  )
}

export function TableView({ nodes, lines }: { nodes: Node[]; lines: (n: Node) => PingLine[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[1000px] text-[12px]">
        <thead>
          <tr className="border-b border-line text-left">
            {['節點', '分組', 'CPU', '記憶體', '硬碟', '上傳 / 下載', '本月流量', '延遲', '在線', '到期'].map((h) => (
              <th key={h} className="hud px-3 py-2.5 text-[10px]!">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="font-mono">
          {nodes.map((n) => {
            const m = n.metrics
            const first = lines(n)[0]
            return (
              <tr
                key={n.id}
                onClick={() => navigate(`/node/${n.id}`)}
                className={`cursor-pointer border-b border-line/70 last:border-0 hover:bg-primary-soft/50 ${n.online ? '' : 'opacity-60'}`}
              >
                <td className="px-3 py-2.5">
                  <span className="flex items-center gap-2 font-sans">
                    <span className={`size-2 shrink-0 rounded-full ${n.online ? 'breathe bg-good' : 'bg-bad'}`} />
                    <Flag code={n.country} className="h-3 w-4" />
                    <span className="truncate text-[13px] font-semibold">{n.name}</span>
                  </span>
                </td>
                <td className="px-3 py-2.5 font-sans text-muted">{n.group || '—'}</td>
                {m ? (
                  <>
                    <td className="px-3 py-2.5">
                      <Bar v={m.cpu ?? 0} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Bar v={pct(m.mem_used, m.mem_total ?? n.mem_total)} />
                    </td>
                    <td className="px-3 py-2.5">
                      <Bar v={pct(m.disk_used, m.disk_total ?? n.disk_total)} />
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">
                      <Rate dir="up">{compactRate(m.net_tx)}/s</Rate> <Rate dir="down">{compactRate(m.net_rx)}/s</Rate>
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="px-3 py-2.5 font-sans text-bad">
                    離線
                  </td>
                )}
                <td className="px-3 py-2.5 whitespace-nowrap">
                  {bytes(n.month_used)}
                  <span className="text-muted"> / {n.traffic_limit ? bytes(n.traffic_limit) : '∞'}</span>
                </td>
                <td className={`px-3 py-2.5 whitespace-nowrap ${first ? latencyTone(first.latest, first.loss) : 'text-muted'}`}>
                  {first ? `${first.name} ${first.latest === null ? '超時' : `${Math.round(first.latest)}ms`}` : '—'}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">
                  {n.online ? duration(m?.uptime) : duration(n.last_seen_ago)}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-muted">{expiry(n.expires_in)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
