import { useEffect, useMemo, useState } from 'react'
import { Chart, type Series } from '../components/Chart'
import { Flag } from '../components/Flag'
import { MediaActions, MediaChecks } from '../components/Media'
import { useMedia } from '../lib/useMedia'
import { Rate } from '../components/Rate'
import { fetchHistory } from '../lib/api'
import { bytes, cycle, duration, expiry, money, pct, speed } from '../lib/format'
import { DOWN, SERIES, UP } from '../lib/palette'
import { Link } from '../lib/router'
import type { History, MetricRow, Node } from '../lib/types'

const WINDOWS = [1, 6, 24, 168, 720, 2160]
const POINTS = 240

const windowLabel = (h: number) => (h < 24 ? `${h} 小時` : h % 24 === 0 && h < 168 ? `${h / 24} 天` : `${Math.round(h / 24)} 天`)

// Rings for the live gauges.
function Ring({ label, value, sub }: { label: string; value: number; sub: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const color = value >= 90 ? '#d03b3b' : value >= 70 ? '#b45309' : '#2f5bd3'
  return (
    <div className="panel flex items-center gap-4 p-4">
      <svg viewBox="0 0 80 80" className="size-20 shrink-0 -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#eef2f7" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
          className="transition-[stroke-dasharray] duration-500"
        />
      </svg>
      <div className="min-w-0">
        <div className="hud">{label}</div>
        <div className="font-mono text-2xl font-bold tabular-nums">{value.toFixed(1)}%</div>
        <div className="truncate font-mono text-[11px] text-muted">{sub}</div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-dashed border-line py-1.5 last:border-0">
      <span className="shrink-0 text-[12px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[12px]">{value || '—'}</span>
    </div>
  )
}

// Rows only exist for buckets that had data; insert nulls where the gap is
// wider than one step so the chart shows the outage instead of bridging it.
function withGaps(rows: MetricRow[], step: number) {
  const out: (MetricRow | null)[] = []
  const ts: number[] = []
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    if (prev && r.ts - prev.ts > step * 1.5) {
      out.push(null)
      ts.push(prev.ts + step)
    }
    out.push(r)
    ts.push(r.ts)
  })
  return { rows: out, ts }
}

export function NodeDetail({
  id,
  nodes,
  historyDays,
  showMedia,
}: {
  id: number
  nodes: Node[]
  historyDays: number
  showMedia: boolean
}) {
  const node = nodes.find((n) => n.id === id)
  const media = useMedia()
  const windows = useMemo(() => {
    const whole = historyDays * 24
    return [...WINDOWS.filter((h) => h * 1.25 <= whole), whole]
  }, [historyDays])
  const [hours, setHours] = useState(6)
  const [hist, setHist] = useState<History | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const load = () =>
      fetchHistory(id, hours, POINTS, ctrl.signal).then(
        (h) => {
          setHist(h)
          setErr(null)
        },
        (e) => {
          if (!(e instanceof DOMException)) setErr((e as Error).message)
        },
      )
    setHist(null)
    load()
    // Short windows keep moving; refresh them every minute.
    const timer = hours <= 24 ? window.setInterval(() => !document.hidden && load(), 60000) : undefined
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [id, hours])

  const charts = useMemo(() => {
    if (!hist) return null
    const { rows, ts } = withGaps(hist.metrics ?? [], hist.step)
    const pick = (f: (r: MetricRow) => number | undefined) => rows.map((r) => (r ? (f(r) ?? null) : null))

    const probes = Object.entries(hist.probes ?? {})
    const pingTs = [...new Set((hist.ping ?? []).map((p) => p.ts))].sort((a, b) => a - b)
    const pingIndex = new Map(pingTs.map((t, i) => [t, i]))
    const ping: Series[] = probes.map(([pid, name], k) => {
      const vals: (number | null)[] = pingTs.map(() => null)
      for (const p of hist.ping ?? []) if (String(p.task_id) === pid) vals[pingIndex.get(p.ts)!] = p.latency
      return { name, color: SERIES[k] ?? '#94a3b8', values: vals }
    })
    return { ts, pick, pingTs, ping }
  }, [hist])

  if (!node) {
    return (
      <div className="panel p-10 text-center text-muted">
        找不到這個節點，可能已被隱藏或刪除。<Link to="/" className="ml-2 text-primary underline">回總覽</Link>
      </div>
    )
  }

  const m = node.metrics
  const memTotal = m?.mem_total ?? node.mem_total
  const diskTotal = m?.disk_total ?? node.disk_total
  const limit = node.traffic_limit ?? 0
  const price = money(node.price, node.currency)

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/cards" className="rounded-md border border-line bg-white px-2.5 py-1 text-[13px] text-muted shadow-sm hover:text-fg">
          ← 返回
        </Link>
        <span className={`size-2.5 rounded-full ${node.online ? 'breathe bg-good' : 'bg-bad'}`} />
        <h2 className="text-xl font-bold tracking-tight">{node.name}</h2>
        <Flag code={node.country} className="h-4 w-6" />
        {node.group && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[12px] text-primary">{node.group}</span>}
        <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] ${node.online ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
          {node.online ? `UP ${duration(m?.uptime)}` : `離線 ${duration(node.last_seen_ago)}`}
        </span>
      </div>
      {node.public_remark && <p className="-mt-2 text-[13px] text-muted">{node.public_remark}</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Ring label="CPU" value={m?.cpu ?? 0} sub={`${node.cpu_cores ?? '?'} 核 · 負載 ${(m?.load ?? []).map((l) => l.toFixed(2)).join(' ') || '-'}`} />
        <Ring label="記憶體" value={pct(m?.mem_used, memTotal)} sub={`${bytes(m?.mem_used)} / ${bytes(memTotal)}`} />
        <Ring label="硬碟" value={pct(m?.disk_used, diskTotal)} sub={`${bytes(m?.disk_used)} / ${bytes(diskTotal)}`} />
        <Ring
          label="流量"
          value={limit ? pct(node.month_used, limit) : 0}
          sub={`${bytes(node.month_used)} / ${limit ? bytes(limit) : '∞'}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">系統</div>
          <Info label="作業系統" value={node.os} />
          <Info label="核心" value={node.kernel} />
          <Info label="架構 / 虛擬化" value={[node.arch, node.virt].filter(Boolean).join(' · ')} />
          <Info label="CPU" value={node.cpu_name} />
          <Info label="Agent" value={node.agent_version} />
        </div>
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">即時</div>
          <Info label="上傳 / 下載" value={m ? <><Rate dir="up">{speed(m.net_tx)}</Rate> · <Rate dir="down">{speed(m.net_rx)}</Rate></> : null} />
          <Info label="累計流量" value={`↑ ${bytes(node.total_tx)} · ↓ ${bytes(node.total_rx)}`} />
          <Info label="今日流量" value={`↑ ${bytes(node.day_tx)} · ↓ ${bytes(node.day_rx)}`} />
          <Info label="TCP / UDP / 進程" value={m ? `${m.tcp ?? '-'} / ${m.udp ?? '-'} / ${m.procs ?? '-'}` : null} />
          <Info label="Swap" value={m?.swap_total ? `${bytes(m.swap_used)} / ${bytes(m.swap_total)}` : '無'} />
        </div>
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">計費</div>
          <Info label="價格" value={price ? `${price}${cycle(node.billing_cycle) ? ` / ${cycle(node.billing_cycle)}` : ''}` : '免費 / 未設定'} />
          <Info label="到期" value={expiry(node.expires_in)} />
          <Info label="流量限額" value={limit ? bytes(limit) : '∞'} />
          <Info label="本月已用" value={bytes(node.month_used)} />
        </div>
      </div>

      {showMedia && media.available && (
        <div className="panel p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="hud text-fg!">流媒體檢測</span>
            <MediaActions nodeId={node.id} />
          </div>
          <MediaChecks nodeId={node.id} home={node.country} wide />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="hud text-fg!">歷史</span>
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-sm">
          {windows.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`rounded-md px-2.5 py-1 text-[12px] ${hours === h ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'}`}
            >
              {windowLabel(h)}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-[13px] text-bad">讀取歷史失敗：{err}</div>}

      {!charts ? (
        <div className="py-16 text-center text-muted">載入中…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Chart
            title="CPU"
            ts={charts.ts}
            max={100}
            format={(v) => `${v.toFixed(0)}%`}
            series={[
              { name: '平均', color: SERIES[0], values: charts.pick((r) => r.cpu), area: true },
              { name: '峰值', color: SERIES[1], values: charts.pick((r) => r.cpu_max) },
            ]}
          />
          <Chart
            title="記憶體"
            ts={charts.ts}
            max={memTotal || undefined}
            format={(v) => bytes(v, 1)}
            series={[
              { name: '記憶體', color: SERIES[0], values: charts.pick((r) => r.mem_used), area: true },
              ...(m?.swap_total ? [{ name: 'Swap', color: SERIES[1], values: charts.pick((r) => r.swap_used) }] : []),
            ]}
          />
          <Chart
            title="網路"
            ts={charts.ts}
            format={(v) => speed(v)}
            series={[
              { name: '上傳', color: UP, values: charts.pick((r) => r.net_tx), area: true },
              { name: '下載', color: DOWN, values: charts.pick((r) => r.net_rx), area: true },
            ]}
          />
          <Chart
            title="延遲"
            ts={charts.pingTs}
            format={(v) => `${v.toFixed(0)} ms`}
            series={charts.ping}
            extra={
              hist?.loss && Object.keys(hist.loss).length ? (
                <span className="font-mono text-bad">
                  丟包{' '}
                  {Object.entries(hist.loss)
                    .map(([pid, l]) => `${hist.probes?.[pid] ?? pid} ${l.toFixed(1)}%`)
                    .join(' · ')}
                </span>
              ) : null
            }
          />
          <Chart
            title="硬碟"
            ts={charts.ts}
            max={diskTotal || undefined}
            format={(v) => bytes(v, 1)}
            series={[{ name: '已用', color: SERIES[0], values: charts.pick((r) => r.disk_used), area: true }]}
          />
          <Chart
            title="連線數"
            ts={charts.ts}
            format={(v) => v.toFixed(0)}
            series={[
              { name: 'TCP', color: SERIES[0], values: charts.pick((r) => r.tcp) },
              { name: 'UDP', color: SERIES[1], values: charts.pick((r) => r.udp) },
              { name: '進程', color: SERIES[2], values: charts.pick((r) => r.procs) },
            ]}
          />
        </div>
      )}
    </div>
  )
}
