import { Flag } from '../components/Flag'
import { latencyTone, type PingLine } from '../components/NodeCard'
import { Rate } from '../components/Rate'
import { bytes, compactRate, duration, expiry, pct } from '../lib/format'
import { t } from '../lib/i18n'
import { navigate } from '../lib/router'
import type { Node } from '../lib/types'

function Bar({ v }: { v: number }) {
  const tone = v >= 90 ? 'bg-bad' : v >= 70 ? 'bg-warn' : 'bg-primary'
  return (
    <div className="flex items-center gap-2">
      <div className="h-2.5 w-14 overflow-hidden rounded-full bg-primary-soft min-[1500px]:w-20 min-[1700px]:w-24">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${v}%` }} />
      </div>
      <span className="w-11 text-right">{v.toFixed(0)}%</span>
    </div>
  )
}

const HEAD = ['節點', '分組', 'CPU', '記憶體', '硬碟', '上傳 / 下載', '本月流量', '延遲', '在線', '到期']

export function TableView({ nodes, lines }: { nodes: Node[]; lines: (n: Node) => PingLine[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[1100px] [&_td:first-child]:pl-5 [&_td:last-child]:pr-5 [&_th:first-child]:pl-5 [&_th:last-child]:pr-5 text-[16px] min-[1700px]:text-[17px]">
        <thead>
          <tr className="border-b border-line text-left">
            {HEAD.map((h) => (
              <th key={h} className="hud px-3 py-4 text-[15px]! whitespace-nowrap min-[1700px]:text-[16px]!">
                {t(h)}
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
                <td className="px-3 py-5">
                  <span className="flex items-center gap-2.5 font-sans">
                    <span className={`size-2.5 shrink-0 rounded-full ${n.online ? 'breathe bg-good' : 'bg-bad'}`} />
                    <Flag code={n.country} className="h-4 w-6" />
                    <span className="max-w-[12rem] truncate text-[17px] font-semibold min-[1700px]:max-w-none min-[1700px]:text-[19px]">{n.name}</span>
                  </span>
                </td>
                <td className="px-3 py-5 font-sans whitespace-nowrap text-muted">{n.group || '—'}</td>
                {m ? (
                  <>
                    <td className="px-3 py-5">
                      <Bar v={m.cpu ?? 0} />
                    </td>
                    <td className="px-3 py-5">
                      <Bar v={pct(m.mem_used, m.mem_total ?? n.mem_total)} />
                    </td>
                    <td className="px-3 py-5">
                      <Bar v={pct(m.disk_used, m.disk_total ?? n.disk_total)} />
                    </td>
                    <td className="px-3 py-5 whitespace-nowrap">
                      <Rate dir="up">{compactRate(m.net_tx)}/s</Rate> <Rate dir="down">{compactRate(m.net_rx)}/s</Rate>
                    </td>
                  </>
                ) : (
                  <td colSpan={4} className="px-3 py-5 font-sans text-bad">
                    {t('離線')}
                  </td>
                )}
                <td className="px-3 py-5 whitespace-nowrap">
                  {bytes(n.month_used)}
                  <span className="text-muted"> / {n.traffic_limit ? bytes(n.traffic_limit) : '∞'}</span>
                </td>
                <td className={`px-3 py-5 whitespace-nowrap ${first ? latencyTone(first.latest, first.loss) : 'text-muted'}`}>
                  {first ? (
                    <>
                      <span className="font-sans text-muted">{first.name} </span>
                      {first.latest === null ? t('超時') : `${Math.round(first.latest)} ms`}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
                <td className="px-3 py-5 whitespace-nowrap text-muted">
                  {n.online ? duration(m?.uptime) : duration(n.last_seen_ago)}
                </td>
                <td className="px-3 py-5 whitespace-nowrap text-muted">{expiry(n.expires_in)}</td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
