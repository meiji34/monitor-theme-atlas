import { useMemo, useState } from 'react'
import { Chart } from '../components/Chart'
import { Flag } from '../components/Flag'
import { MediaActions, MediaChecks } from '../components/Media'
import { useMedia } from '../lib/useMedia'
import { Rate } from '../components/Rate'
import { bytes, cycle, duration, expiry, money, pct, speed } from '../lib/format'
import { t } from '../lib/i18n'
import { DOWN, SERIES, UP } from '../lib/palette'
import { Link } from '../lib/router'
import type { Node } from '../lib/types'
import { useHistory } from '../lib/useHistory'

const WINDOWS = [1, 6, 24, 168, 720, 2160]

const windowLabel = (h: number) => (h < 24 ? t('{n} 小時', { n: h }) : t('{n} 天', { n: Math.round(h / 24) }))

// Rings for the live gauges.
function Ring({ label, value, sub }: { label: string; value: number; sub: string }) {
  const r = 30
  const c = 2 * Math.PI * r
  const tone = value >= 90 ? 'stroke-bad' : value >= 70 ? 'stroke-warn' : 'stroke-primary'
  return (
    <div className="panel flex flex-col items-start gap-2 p-3 sm:flex-row sm:items-center sm:gap-4 sm:p-4">
      <svg viewBox="0 0 80 80" className="size-14 shrink-0 -rotate-90 sm:size-20">
        <circle cx="40" cy="40" r={r} fill="none" className="stroke-primary-soft" strokeWidth="7" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          className={`${tone} transition-[stroke-dasharray] duration-500`}
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={`${(value / 100) * c} ${c}`}
        />
      </svg>
      <div className="w-full min-w-0">
        <div className="hud">{label}</div>
        <div className="font-display text-[24px] leading-tight font-semibold sm:text-[30px]">{value.toFixed(1)}%</div>
        <div className="truncate font-mono text-[13px] text-muted">{sub}</div>
      </div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/70 py-2 last:border-0">
      <span className="shrink-0 text-[13.5px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[14px]">{value || '—'}</span>
    </div>
  )
}

export function NodeDetail({
  id,
  nodes,
  historyDays,
  showMedia,
}: {
  id: string
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
  const { hist, charts, err } = useHistory(id, hours)

  if (!node) {
    return (
      <div className="panel p-10 text-center text-muted">
        {t('找不到這個節點，可能已被隱藏或刪除。')}
        <Link to="/" className="ml-2 text-primary underline">
          {t('回總覽')}
        </Link>
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
        <Link to="/cards" className="rounded-md border border-line bg-card px-2.5 py-1 text-[14px] text-muted hover:text-fg">
          {t('返回')}
        </Link>
        <span className={`size-2.5 rounded-full ${node.online ? 'breathe bg-good' : 'bg-bad'}`} />
        <h2 className="font-display text-[30px] leading-tight font-semibold tracking-[0.01em]">{node.name}</h2>
        <Flag code={node.country} className="h-4 w-6" />
        {node.group && <span className="rounded-full bg-primary-soft px-2.5 py-0.5 text-[13px] text-primary">{node.group}</span>}
        <span className={`rounded-full px-2.5 py-0.5 font-mono text-[13px] ${node.online ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
          {node.online ? `UP ${duration(m?.uptime)}` : t('離線 {duration}', { duration: duration(node.last_seen_ago) })}
        </span>
      </div>
      {node.public_remark && <p className="-mt-2 text-[14px] text-muted">{node.public_remark}</p>}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Ring
          label="CPU"
          value={m?.cpu ?? 0}
          sub={t('{n} 核，負載 {load}', { n: node.cpu_cores ?? '?', load: (m?.load ?? []).map((l) => l.toFixed(2)).join(' ') || '-' })}
        />
        <Ring label={t('記憶體')} value={pct(m?.mem_used, memTotal)} sub={`${bytes(m?.mem_used)} / ${bytes(memTotal)}`} />
        <Ring label={t('硬碟')} value={pct(m?.disk_used, diskTotal)} sub={`${bytes(m?.disk_used)} / ${bytes(diskTotal)}`} />
        <Ring
          label={t('流量')}
          value={limit ? pct(node.month_used, limit) : 0}
          sub={`${bytes(node.month_used)} / ${limit ? bytes(limit) : '∞'}`}
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">{t('系統')}</div>
          <Info label={t('作業系統')} value={node.os} />
          <Info label={t('核心')} value={node.kernel} />
          <Info label={t('架構 / 虛擬化')} value={[node.arch, node.virt].filter(Boolean).join(' / ')} />
          <Info label="CPU" value={node.cpu_name} />
          <Info label="Agent" value={node.agent_version} />
        </div>
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">{t('即時')}</div>
          <Info
            label={t('上傳 / 下載')}
            value={
              m ? (
                <>
                  <Rate dir="up">{speed(m.net_tx)}</Rate> <Rate dir="down">{speed(m.net_rx)}</Rate>
                </>
              ) : null
            }
          />
          <Info label={t('累計流量')} value={`↑ ${bytes(node.total_tx)}  ↓ ${bytes(node.total_rx)}`} />
          <Info label={t('今日流量')} value={`↑ ${bytes(node.day_tx)}  ↓ ${bytes(node.day_rx)}`} />
          <Info label={`TCP / UDP / ${t('進程')}`} value={m ? `${m.tcp ?? '-'} / ${m.udp ?? '-'} / ${m.procs ?? '-'}` : null} />
          <Info label="Swap" value={m?.swap_total ? `${bytes(m.swap_used)} / ${bytes(m.swap_total)}` : t('無')} />
        </div>
        <div className="panel p-4">
          <div className="hud mb-2 text-fg!">{t('計費')}</div>
          <Info
            label={t('價格')}
            value={price ? `${price}${cycle(node.billing_cycle) ? ` / ${cycle(node.billing_cycle)}` : ''}` : t('免費 / 未設定')}
          />
          <Info label={t('到期')} value={expiry(node.expires_in)} />
          <Info label={t('流量限額')} value={limit ? bytes(limit) : '∞'} />
          <Info label={t('本月已用')} value={bytes(node.month_used)} />
        </div>
      </div>

      {showMedia && media.available && (
        <div className="panel p-4">
          <div className="mb-3 flex items-baseline justify-between gap-2">
            <span className="hud text-fg!">{t('流媒體檢測')}</span>
            <MediaActions nodeId={node.id} />
          </div>
          <MediaChecks nodeId={node.id} home={node.country} wide />
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="hud text-fg!">{t('歷史')}</span>
        <div className="flex flex-wrap gap-0.5 rounded-lg border border-line bg-card p-0.5">
          {windows.map((h) => (
            <button
              key={h}
              onClick={() => setHours(h)}
              className={`rounded-md px-2.5 py-1 text-[13.5px] ${hours === h ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'}`}
            >
              {windowLabel(h)}
            </button>
          ))}
        </div>
      </div>

      {err && <div className="rounded-lg border border-bad/30 bg-bad/5 px-4 py-2.5 text-[14px] text-bad">{t('讀取歷史失敗：{error}', { error: err })}</div>}

      {!charts ? (
        <div className="py-16 text-center text-muted">{t('載入中…')}</div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <Chart
            title="CPU"
            ts={charts.ts}
            max={100}
            format={(v) => `${v.toFixed(0)}%`}
            series={[
              { name: t('平均'), color: SERIES[0], values: charts.pick((r) => r.cpu), area: true },
              { name: t('峰值'), color: SERIES[1], values: charts.pick((r) => r.cpu_max) },
            ]}
          />
          <Chart
            title={t('記憶體')}
            ts={charts.ts}
            max={memTotal || undefined}
            format={(v) => bytes(v, 1)}
            series={[
              { name: t('記憶體'), color: SERIES[0], values: charts.pick((r) => r.mem_used), area: true },
              ...(m?.swap_total ? [{ name: 'Swap', color: SERIES[1], values: charts.pick((r) => r.swap_used) }] : []),
            ]}
          />
          <Chart
            title={t('網路')}
            ts={charts.ts}
            format={(v) => speed(v)}
            series={[
              { name: t('上傳'), color: UP, values: charts.pick((r) => r.net_tx), area: true },
              { name: t('下載'), color: DOWN, values: charts.pick((r) => r.net_rx), area: true },
            ]}
          />
          <Chart
            title={t('延遲')}
            ts={charts.pingTs}
            format={(v) => `${v.toFixed(0)} ms`}
            series={charts.ping}
            extra={
              hist?.loss && Object.keys(hist.loss).length ? (
                <span className="font-mono text-bad">
                  {t('丟包')}{' '}
                  {Object.entries(hist.loss)
                    .map(([pid, l]) => `${hist.probes?.[pid] ?? pid} ${l.toFixed(1)}%`)
                    .join(', ')}
                </span>
              ) : null
            }
          />
          <Chart
            title={t('硬碟')}
            ts={charts.ts}
            max={diskTotal || undefined}
            format={(v) => bytes(v, 1)}
            series={[{ name: t('已用'), color: SERIES[0], values: charts.pick((r) => r.disk_used), area: true }]}
          />
          <Chart
            title={t('連線數')}
            ts={charts.ts}
            format={(v) => v.toFixed(0)}
            series={[
              { name: 'TCP', color: SERIES[0], values: charts.pick((r) => r.tcp) },
              { name: 'UDP', color: SERIES[1], values: charts.pick((r) => r.udp) },
              { name: t('進程'), color: SERIES[2], values: charts.pick((r) => r.procs) },
            ]}
          />
        </div>
      )}
    </div>
  )
}
