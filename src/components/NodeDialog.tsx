import { useEffect, useMemo, useRef, useState } from 'react'
import { bytes, cycle, duration, expiry, money, pct, speed } from '../lib/format'
import { t } from '../lib/i18n'
import { DOWN, SERIES, UP } from '../lib/palette'
import { closeNode, Link } from '../lib/router'
import type { Node, PingSeries } from '../lib/types'
import { useHistory } from '../lib/useHistory'
import { useMedia } from '../lib/useMedia'
import { Chart } from './Chart'
import { Flag } from './Flag'
import { MediaActions, MediaChecks } from './Media'
import { Rate } from './Rate'

type Tab = 'res' | 'net' | 'ping' | 'info'
const TABS: [Tab, string][] = [
  ['res', '資源趨勢'],
  ['net', '網路與流量'],
  ['ping', '延遲・丟包'],
  ['info', '伺服器資訊'],
]
const RANGES = [1, 6, 24, 72, 168]
const rangeLabel = (h: number) => (h < 24 ? t('最近 {n} 小時', { n: h }) : t('最近 {n} 天', { n: Math.round(h / 24) }))

function Stat({ label, value, sub, bar }: { label: string; value: string; sub?: string; bar?: number }) {
  const tone = bar === undefined ? '' : bar >= 90 ? 'bg-bad' : bar >= 70 ? 'bg-warn' : 'bg-primary'
  return (
    <div className="panel p-3.5">
      <div className="text-[13px] text-muted">{label}</div>
      <div className="mt-0.5 font-display text-[26px] leading-tight font-semibold">{value}</div>
      {bar !== undefined && (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-soft">
          <div className={`h-full rounded-full ${tone}`} style={{ width: `${Math.min(100, bar)}%` }} />
        </div>
      )}
      {sub && <div className="mt-1 truncate font-mono text-[12.5px] text-muted">{sub}</div>}
    </div>
  )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-line/60 py-2 last:border-0">
      <span className="shrink-0 text-[13.5px] text-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-mono text-[14px]">{value || '—'}</span>
    </div>
  )
}

// A node's details over the page it was opened from: header, spec chips,
// four tabs and a time range. A full-screen sheet on phones; Esc, the close
// button, a click outside or Back closes it.
export function NodeDialog({
  node,
  ping,
  historyDays,
  showMedia,
}: {
  node: Node
  ping?: PingSeries
  historyDays: number
  showMedia: boolean
}) {
  const [tab, setTab] = useState<Tab>('res')
  const ranges = useMemo(() => RANGES.filter((h) => h <= historyDays * 24), [historyDays])
  const [hours, setHours] = useState(1)
  const { hist, charts, err } = useHistory(node.id, hours)
  const media = useMedia()
  const box = useRef<HTMLDivElement>(null)

  // Esc closes; focus moves into the dialog and back to where it was after;
  // the page behind doesn't scroll.
  useEffect(() => {
    const before = document.activeElement as HTMLElement | null
    box.current?.focus()
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeNode()
    document.addEventListener('keydown', onKey)
    const overflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = overflow
      before?.focus?.()
    }
  }, [])

  const m = node.metrics
  const memTotal = m?.mem_total ?? node.mem_total
  const diskTotal = m?.disk_total ?? node.disk_total
  const limit = node.traffic_limit ?? 0
  const price = money(node.price, node.currency)
  const status = node.online ? t('在線') : t('離線 {duration}', { duration: duration(node.last_seen_ago) })
  const chips = [
    node.cpu_cores ? `${node.cpu_cores} vCPU` : null,
    memTotal ? `${bytes(memTotal, 1)} RAM` : null,
    diskTotal ? `${bytes(diskTotal, 0)} ${t('硬碟')}` : null,
    node.arch,
    node.virt,
  ].filter(Boolean) as string[]
  const latest = (ping?.ping ?? []).length ? ping : null

  const loading = <div className="py-14 text-center text-muted">{t('載入中…')}</div>

  return (
    <div className="fixed inset-0 z-[60] flex items-stretch justify-center sm:items-center sm:p-6" role="presentation">
      <div className="absolute inset-0 bg-black/45 backdrop-blur-[3px]" onClick={() => closeNode()} />
      <div
        ref={box}
        role="dialog"
        aria-modal="true"
        aria-label={node.name}
        tabIndex={-1}
        className="glass relative flex w-full flex-col overflow-hidden border border-line bg-raised shadow-2xl outline-none sm:max-h-[90vh] sm:max-w-[1000px] sm:rounded-2xl"
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-line/70 px-4 pt-4 pb-3 sm:px-6 sm:pt-5">
          <div className="flex size-12 shrink-0 items-center justify-center rounded-xl border border-line bg-bg/60">
            <Flag code={node.country} className="h-5 w-7" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[24px] leading-tight font-semibold sm:text-[26px]">{node.name}</h2>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[13.5px] text-muted">
              {node.group && <span>{node.group}</span>}
              {node.group && node.os && <span>·</span>}
              {node.os && <span className="truncate">{node.os}</span>}
              <span>·</span>
              <span className={`inline-flex items-center gap-1 ${node.online ? 'text-good' : 'text-bad'}`}>
                <span className={`size-1.5 rounded-full ${node.online ? 'breathe bg-good' : 'bg-bad'}`} />
                {status}
              </span>
              {node.online && m?.uptime ? <span className="font-mono">· UP {duration(m.uptime)}</span> : null}
            </div>
          </div>
          <Link
            to={`/node/${node.id}`}
            className="hidden shrink-0 rounded-lg border border-line px-2.5 py-1.5 text-[13px] text-muted hover:border-primary/40 hover:text-primary sm:block"
          >
            {t('完整詳情')}
          </Link>
          <button
            onClick={() => closeNode()}
            title={t('關閉')}
            aria-label={t('關閉')}
            className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-line text-muted hover:border-primary/40 hover:text-primary"
          >
            <svg viewBox="0 0 20 20" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <path d="M5 5l10 10M15 5 5 15" />
            </svg>
          </button>
        </div>

        {/* Chips, tabs, range */}
        <div className="flex flex-col gap-2.5 px-4 pt-3 sm:px-6">
          {chips.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {chips.map((c) => (
                <span key={c} className="rounded-md border border-line bg-bg/40 px-2 py-0.5 font-mono text-[12.5px] text-muted">
                  {c}
                </span>
              ))}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line/70 pb-2.5">
            <div className="-mx-1 flex gap-0.5 overflow-x-auto px-1" role="tablist">
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={tab === id}
                  onClick={() => setTab(id)}
                  className={`shrink-0 rounded-lg px-3 py-1.5 text-[14px] whitespace-nowrap ${
                    tab === id ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                  }`}
                >
                  {t(label)}
                </button>
              ))}
            </div>
            {tab !== 'info' && (
              <select
                value={hours}
                onChange={(e) => setHours(Number(e.target.value))}
                aria-label={t('時間範圍')}
                className="rounded-lg border border-line bg-bg/60 px-2 py-1.5 text-[13.5px] outline-none focus:border-primary/60"
              >
                {ranges.map((h) => (
                  <option key={h} value={h}>
                    {rangeLabel(h)}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4 pt-3 pb-5 sm:px-6">
          {err && <div className="mb-3 rounded-lg border border-bad/30 bg-bad/5 px-3 py-2 text-[13.5px] text-bad">{t('讀取歷史失敗：{error}', { error: err })}</div>}

          {tab === 'res' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="panel flex justify-between gap-4 p-3.5">
                  <div>
                    <div className="text-[13px] text-muted">{t('價格')}</div>
                    <div className="mt-0.5 text-[17px] font-semibold">
                      {price ? `${price}${cycle(node.billing_cycle) ? ` / ${cycle(node.billing_cycle)}` : ''}` : t('免費 / 未設定')}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[13px] text-muted">{t('到期')}</div>
                    <div className="mt-0.5 text-[17px] font-semibold">{expiry(node.expires_in)}</div>
                  </div>
                </div>
                <div className="panel p-3.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[13px] text-muted">{t('累計流量')}</span>
                    <span className="font-display text-[20px] font-semibold">{bytes((node.total_tx ?? 0) + (node.total_rx ?? 0))}</span>
                  </div>
                  <div className="mt-1 flex gap-4 font-mono text-[13px]">
                    <Rate dir="up">{bytes(node.total_tx)}</Rate>
                    <Rate dir="down">{bytes(node.total_rx)}</Rate>
                  </div>
                  {limit > 0 && (
                    <div className="mt-1.5">
                      <div className="h-1.5 overflow-hidden rounded-full bg-primary-soft">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, pct(node.month_used, limit))}%` }} />
                      </div>
                      <div className="mt-1 text-[12px] text-muted">
                        {t('本月已用')} {bytes(node.month_used)} / {bytes(limit)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={t('CPU 使用率')} value={`${(m?.cpu ?? 0).toFixed(1)}%`} bar={m?.cpu ?? 0} sub={node.cpu_cores ? `${node.cpu_cores} vCPU` : undefined} />
                <Stat
                  label={t('記憶體')}
                  value={`${pct(m?.mem_used, memTotal).toFixed(1)}%`}
                  bar={pct(m?.mem_used, memTotal)}
                  sub={`${bytes(m?.mem_used)} / ${bytes(memTotal)}`}
                />
                <Stat
                  label={t('硬碟')}
                  value={`${pct(m?.disk_used, diskTotal).toFixed(1)}%`}
                  bar={pct(m?.disk_used, diskTotal)}
                  sub={`${bytes(m?.disk_used)} / ${bytes(diskTotal)}`}
                />
                <Stat
                  label={t('負載')}
                  value={m?.load?.length ? m.load[0].toFixed(2) : '—'}
                  sub={m?.load?.length ? m.load.map((l) => l.toFixed(2)).join(' · ') : t('1 / 5 / 15 分鐘')}
                />
              </div>
              {!charts ? (
                loading
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <Chart
                    title={t('CPU 使用率')}
                    ts={charts.ts}
                    max={100}
                    format={(v) => `${v.toFixed(1)}%`}
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
                    title={t('硬碟')}
                    ts={charts.ts}
                    max={diskTotal || undefined}
                    format={(v) => bytes(v, 1)}
                    series={[{ name: t('已用'), color: SERIES[0], values: charts.pick((r) => r.disk_used), area: true }]}
                  />
                  {charts.pick((r) => r.load).some((v) => v !== null) ? (
                    <Chart
                      title={t('負載')}
                      ts={charts.ts}
                      format={(v) => v.toFixed(2)}
                      series={[{ name: t('1 分鐘'), color: SERIES[0], values: charts.pick((r) => r.load), area: true }]}
                    />
                  ) : (
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
                  )}
                </div>
              )}
            </div>
          )}

          {tab === 'net' && (
            <div className="flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <Stat label={t('上傳')} value={speed(m?.net_tx)} />
                <Stat label={t('下載')} value={speed(m?.net_rx)} />
                <Stat label={t('今日流量')} value={bytes((node.day_tx ?? 0) + (node.day_rx ?? 0))} sub={`↑ ${bytes(node.day_tx)} ↓ ${bytes(node.day_rx)}`} />
                <Stat
                  label={t('本月已用')}
                  value={bytes(node.month_used)}
                  sub={limit ? `${t('限額')} ${bytes(limit)}` : t('無限額')}
                  bar={limit ? pct(node.month_used, limit) : undefined}
                />
              </div>
              {!charts ? (
                loading
              ) : (
                <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
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
          )}

          {tab === 'ping' && (
            <div className="flex flex-col gap-3">
              {hist?.probes && Object.keys(hist.probes).length > 0 && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  {Object.entries(hist.probes).map(([pid, name], k) => {
                    const vals = (hist.ping ?? []).filter((p) => String(p.task_id) === pid).map((p) => p.latency)
                    const ok = vals.filter((v): v is number => v !== null)
                    const avg = ok.length ? ok.reduce((a, b) => a + b, 0) / ok.length : null
                    const last = latest?.ping.filter((p) => String(p.task_id) === pid).at(-1)?.latency ?? ok.at(-1) ?? null
                    const loss = hist.loss?.[pid] ?? 0
                    return (
                      <div key={pid} className="panel p-3.5">
                        <div className="flex items-center gap-2 text-[13px] text-muted">
                          <span className="h-[3px] w-4 rounded-full" style={{ background: SERIES[k] ?? '#94a3b8' }} />
                          {name}
                        </div>
                        <div className="mt-0.5 font-display text-[24px] font-semibold">{last === null ? t('超時') : `${Math.round(last)} ms`}</div>
                        <div className="font-mono text-[12.5px] text-muted">
                          {t('平均')} {avg === null ? '—' : `${Math.round(avg)} ms`} ·{' '}
                          <span className={loss >= 5 ? 'text-bad' : ''}>
                            {t('丟包')} {loss.toFixed(1)}%
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
              {!charts ? (
                loading
              ) : charts.ping.length ? (
                <Chart title={t('延遲')} ts={charts.pingTs} format={(v) => `${v.toFixed(0)} ms`} series={charts.ping} />
              ) : (
                <div className="py-14 text-center text-muted">{t('這台節點沒有延遲監控')}</div>
              )}
            </div>
          )}

          {tab === 'info' && (
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="panel px-4 py-2">
                <Row label={t('作業系統')} value={node.os} />
                <Row label={t('核心')} value={node.kernel} />
                <Row label={t('架構 / 虛擬化')} value={[node.arch, node.virt].filter(Boolean).join(' / ')} />
                <Row label="CPU" value={node.cpu_name} />
                <Row label={t('核心數')} value={node.cpu_cores ? String(node.cpu_cores) : null} />
                <Row label="Agent" value={node.agent_version} />
              </div>
              <div className="panel px-4 py-2">
                <Row label={t('在線時間')} value={node.online ? duration(m?.uptime) : null} />
                <Row label="Swap" value={m?.swap_total ? `${bytes(m.swap_used)} / ${bytes(m.swap_total)}` : t('無')} />
                <Row label={`TCP / UDP / ${t('進程')}`} value={m ? `${m.tcp ?? '-'} / ${m.udp ?? '-'} / ${m.procs ?? '-'}` : null} />
                <Row label={t('流量限額')} value={limit ? bytes(limit) : '∞'} />
                <Row label={t('到期')} value={expiry(node.expires_in)} />
                {node.public_remark && <Row label={t('備註')} value={node.public_remark} />}
              </div>
              {showMedia && media.available && (
                <div className="panel p-4 lg:col-span-2">
                  <div className="mb-3 flex items-baseline justify-between gap-2">
                    <span className="hud text-fg!">{t('流媒體檢測')}</span>
                    <MediaActions nodeId={node.id} />
                  </div>
                  <MediaChecks nodeId={node.id} home={node.country} wide />
                </div>
              )}
              <Link
                to={`/node/${node.id}`}
                className="rounded-lg border border-line py-2 text-center text-[14px] text-primary hover:bg-primary-soft/60 sm:hidden lg:col-span-2"
              >
                {t('完整詳情')}
              </Link>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
