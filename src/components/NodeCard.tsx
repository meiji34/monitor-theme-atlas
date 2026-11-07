import { bytes, duration, expiry, pct, speed } from '../lib/format'
import { coordText, type Place } from '../lib/geo'
import { t } from '../lib/i18n'
import { MediaCardLine } from './Media'
import { NodeLink, openNode } from '../lib/router'
import type { Node, PingSeries } from '../lib/types'
import { Flag } from './Flag'
import { Meter, Sparkline } from './Meter'
import { Rate } from './Rate'

export interface PingLine {
  name: string
  latest: number | null
  loss: number
  values: (number | null)[]
}

// Pick which probes to show: the configured names in order, else the first three.
export function pingLines(series: PingSeries | undefined, wanted: string[]): PingLine[] {
  if (!series) return []
  const entries = Object.entries(series.probes ?? {})
  const chosen = wanted.length
    ? wanted.map((w) => entries.find(([, n]) => n === w)).filter((e): e is [string, string] => !!e)
    : entries.slice(0, 3)
  return chosen.map(([id, name]) => {
    const rows = series.ping.filter((p) => String(p.task_id) === id)
    const values = rows.map((r) => r.latency)
    const last = [...values].reverse().find((v) => v !== null) ?? null
    return { name, latest: last, loss: series.loss?.[id] ?? 0, values }
  })
}

export const latencyTone = (ms: number | null, loss: number) =>
  ms === null || loss >= 50 ? 'text-bad' : ms > 200 || loss >= 5 ? 'text-warn' : 'text-good'

export function NodeCard({
  node,
  lines,
  onFocus,
  showMedia,
  place,
}: {
  node: Node
  lines: PingLine[]
  onFocus?: () => void
  showMedia?: boolean
  place?: Place
}) {
  const m = node.metrics
  const cpu = m?.cpu ?? 0
  const memTotal = m?.mem_total ?? node.mem_total
  const diskTotal = m?.disk_total ?? node.disk_total
  const limit = node.traffic_limit ?? 0
  const used = node.month_used ?? 0
  return (
    <article
      onClick={(e) => {
        // The whole card opens the detail page; inner links/buttons handle themselves.
        if (!(e.target as Element).closest('a,button')) openNode(node.id)
      }}
      className={`panel lift flex cursor-pointer flex-col gap-4 p-4 ${node.online ? '' : 'opacity-70'}`}
    >
      <header className="flex items-start justify-between gap-3">
        <NodeLink id={node.id} className="flex min-w-0 items-center gap-2 hover:text-primary">
          <span className={`size-2 shrink-0 rounded-full ${node.online ? 'breathe bg-good' : 'bg-bad'}`} />
          <h3 className="truncate text-[17px] font-semibold">{node.name}</h3>
          <Flag code={node.country} />
        </NodeLink>
        <span className="flex shrink-0 items-center gap-1.5">
          {onFocus && (
            <button
              onClick={onFocus}
              title={t('在地圖上定位')}
              className="rounded-md p-1 text-muted hover:bg-primary-soft hover:text-primary"
            >
              <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M8 14s4.5-4.2 4.5-7.5a4.5 4.5 0 0 0-9 0C3.5 9.8 8 14 8 14Z" />
                <circle cx="8" cy="6.5" r="1.6" />
              </svg>
            </button>
          )}
          <span
            className={`rounded-full px-2 py-0.5 font-mono text-[12.5px] ${
              node.online ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'
            }`}
          >
            {node.online ? `UP ${duration(m?.uptime)}` : t('離線 {duration}', { duration: duration(node.last_seen_ago) })}
          </span>
        </span>
      </header>

      <div className="-mt-2 flex items-center justify-between gap-3 font-mono text-[13px] text-muted">
        {place ? (
          <span className="min-w-0 truncate" title={place.label}>
            {place.source !== 'country' && <span className="text-fg/80">{place.label} </span>}
            {coordText(place.coord)}
          </span>
        ) : (
          <span className="truncate">{[node.virt, node.arch].filter(Boolean).join(' ') || '—'}</span>
        )}
        <span className="shrink-0">{expiry(node.expires_in)}</span>
      </div>

      {m ? (
        <>
          <div className="grid grid-cols-2 gap-x-5 gap-y-4">
            <Meter
              label={node.cpu_cores ? t('CPU {n} 核', { n: node.cpu_cores }) : 'CPU'}
              value={cpu}
              right={`${cpu.toFixed(1)}%`}
              detail={(m.load ?? []).map((l) => l.toFixed(2)).join(' ') || '-'}
            />
            <Meter
              label={t('記憶體')}
              value={pct(m.mem_used, memTotal)}
              right={`${pct(m.mem_used, memTotal).toFixed(0)}%`}
              detail={`${bytes(m.mem_used)} / ${bytes(memTotal)}`}
            />
            <Meter
              label={t('硬碟')}
              value={pct(m.disk_used, diskTotal)}
              right={`${pct(m.disk_used, diskTotal).toFixed(0)}%`}
              detail={`${bytes(m.disk_used)} / ${bytes(diskTotal)}`}
            />
            <Meter
              label={t('流量')}
              value={limit ? pct(used, limit) : 0}
              right={limit ? `${pct(used, limit).toFixed(1)}%` : '∞'}
              detail={`${bytes(used)} / ${limit ? bytes(limit) : '∞'}`}
            />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-0.5 rounded-lg bg-bg px-3 py-2 font-mono text-[14px]">
            <Rate dir="up" className="font-semibold">{speed(m.net_tx)}</Rate>
            <Rate dir="down" className="font-semibold">{speed(m.net_rx)}</Rate>
            <span className="text-muted">↑ {bytes(node.total_tx ?? m.total_tx)}</span>
            <span className="text-muted">↓ {bytes(node.total_rx ?? m.total_rx)}</span>
          </div>
        </>
      ) : (
        <div className="py-6 text-center text-[14px] text-muted">{node.online ? t('等待資料…') : t('節點離線')}</div>
      )}

      {lines.length > 0 && (
        <div className="flex flex-col gap-1.5 border-t border-line pt-3 text-[13.5px]">
          {lines.map((l) => (
            <div key={l.name} className="grid grid-cols-[3.4rem_4.4rem_1fr_3.4rem] items-center gap-2">
              <span className="truncate text-muted">{l.name}</span>
              <span className={`font-mono font-semibold tabular-nums ${latencyTone(l.latest, l.loss)}`}>
                {l.latest === null ? t('超時') : `${Math.round(l.latest)} ms`}
              </span>
              <Sparkline values={l.values} className={`h-4 w-full ${latencyTone(l.latest, l.loss)}`} />
              <span className={`text-right font-mono tabular-nums ${l.loss >= 5 ? 'text-bad' : 'text-muted'}`}>
                {l.loss.toFixed(1)}%
              </span>
            </div>
          ))}
        </div>
      )}
      {showMedia && <MediaCardLine nodeId={node.id} />}
    </article>
  )
}
