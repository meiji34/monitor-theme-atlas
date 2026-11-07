import { useMemo, useState } from 'react'
import { Dropdown } from './Dropdown'
import { compactRate, duration, pct } from '../lib/format'
import { locale, t } from '../lib/i18n'
import type { Node } from '../lib/types'
import { Flag } from './Flag'
import { Rate } from './Rate'

type Sort = 'default' | 'cpu' | 'net' | 'name'
const SORTS: { key: Sort; label: string }[] = [
  { key: 'default', label: '預設' },
  { key: 'cpu', label: 'CPU' },
  { key: 'net', label: '網速' },
  { key: 'name', label: '名稱' },
]
const ALL = '\u0000all'
const NONE = '\u0000none'

function Mini({ label, value }: { label: string; value: number }) {
  const tone = value >= 90 ? 'bg-bad' : value >= 70 ? 'bg-warn' : 'bg-primary'
  return (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className="w-12 shrink-0 truncate text-[12px] text-muted">{label}</span>
      <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-primary-soft">
        <span className={`block h-full rounded-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <span className="w-9 shrink-0 text-right font-mono text-[13px] font-semibold">{value.toFixed(0)}%</span>
    </span>
  )
}

function Row({ n, onPick }: { n: Node; onPick: () => void }) {
  const m = n.metrics
  const sys = [n.os?.replace(/ GNU\/Linux| LTS/g, ''), n.arch, n.virt].filter(Boolean).join(' · ')
  return (
    <li>
      <button
        onClick={onPick}
        className={`group relative flex w-full flex-col gap-2 border-b border-line/70 px-4 py-3 text-left transition-colors hover:bg-primary-soft/50 ${
          n.online ? '' : 'opacity-60'
        }`}
      >
        <span className="absolute inset-y-2 left-0 w-0.5 rounded-r bg-primary opacity-0 transition-opacity group-hover:opacity-100" />
        <span className="flex items-center gap-2.5">
          <span className={`size-2 shrink-0 rounded-full ${n.online ? 'breathe bg-good' : 'bg-bad'}`} />
          <span className="min-w-0 flex-1 truncate text-[16px] font-semibold">{n.name}</span>
          <Flag code={n.country} className="h-3.5 w-5" />
        </span>
        <span className="truncate pl-[18px] text-[12.5px] text-muted">{sys || '—'}</span>
        {n.online && m ? (
          <>
            <span className="grid grid-cols-2 gap-x-4 pl-[18px]">
              <Mini label="CPU" value={m.cpu ?? 0} />
              <Mini label={t('記憶體')} value={pct(m.mem_used, m.mem_total ?? n.mem_total)} />
            </span>
            <span className="flex items-center gap-3 pl-[18px] font-mono text-[13px]">
              <Rate dir="up">{compactRate(m.net_tx)}/s</Rate>
              <Rate dir="down">{compactRate(m.net_rx)}/s</Rate>
              <span className="ml-auto text-[12px] text-muted">UP {duration(m.uptime)}</span>
            </span>
          </>
        ) : (
          <span className="pl-[18px] text-[12.5px] font-medium text-bad">{t('離線 {duration}', { duration: duration(n.last_seen_ago) })}</span>
        )}
      </button>
    </li>
  )
}

// Roster beside the map: filter, group, sort; click a row to fly to it.
export function NodeList({ nodes: all, onFocus }: { nodes: Node[]; onFocus: (n: Node) => void }) {
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(ALL)
  const [sort, setSort] = useState<Sort>('default')

  const groups = useMemo(() => {
    const seen: string[] = []
    for (const n of all) if (n.group && !seen.includes(n.group)) seen.push(n.group)
    return seen
  }, [all])

  const needle = q.trim().toLowerCase()
  const nodes = all
    .filter((n) => (group === ALL ? true : group === NONE ? !n.group : n.group === group))
    .filter(
      (n) =>
        !needle ||
        [n.name, n.group, n.country, n.os, n.arch].filter(Boolean).some((s) => s!.toLowerCase().includes(needle)),
    )
  const rate = (n: Node) => (n.metrics?.net_rx ?? 0) + (n.metrics?.net_tx ?? 0)
  if (sort === 'cpu') nodes.sort((a, b) => (b.metrics?.cpu ?? -1) - (a.metrics?.cpu ?? -1))
  else if (sort === 'net') nodes.sort((a, b) => rate(b) - rate(a))
  else if (sort === 'name') nodes.sort((a, b) => a.name.localeCompare(b.name))

  const up = all.filter((n) => n.online).length
  const chip = (key: string, label: string, count: number) => (
    <button
      key={key}
      onClick={() => setGroup(key)}
      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[12.5px] transition-colors ${
        group === key ? 'border-primary/30 bg-primary-soft font-medium text-primary' : 'border-line text-muted hover:text-fg'
      }`}
    >
      {label} <span className="font-mono opacity-70">{count}</span>
    </button>
  )

  return (
    <aside className="panel flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <span className="font-display text-[19px] font-semibold tracking-[0.02em]">{t('節點')}</span>
        <span className="flex gap-1.5 font-mono text-[13px] font-semibold">
          <span className="flex items-center gap-1 rounded-md bg-good/10 px-2 py-0.5 text-good">
            <span className="size-1.5 rounded-full bg-good" />
            {up} {t('在線')}
          </span>
          {all.length - up > 0 && (
            <span className="flex items-center gap-1 rounded-md bg-bad/10 px-2 py-0.5 text-bad">
              <span className="size-1.5 rounded-full bg-bad" />
              {all.length - up} {t('離線')}
            </span>
          )}
        </span>
      </div>

      <div className="flex flex-col gap-2 border-b border-line px-3 pb-3">
        <div className="flex gap-2">
          <label className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-line bg-bg px-2.5 focus-within:border-primary/50 focus-within:bg-raised">
            <svg viewBox="0 0 16 16" className="size-3.5 shrink-0 text-muted" fill="none" stroke="currentColor" strokeWidth="1.6">
              <circle cx="7" cy="7" r="4.5" />
              <path d="m10.5 10.5 3 3" strokeLinecap="round" />
            </svg>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('篩選名稱、國家、系統…')}
              className="min-w-0 flex-1 bg-transparent py-1.5 text-[13.5px] outline-none placeholder:text-muted"
            />
          </label>
          <Dropdown
            value={sort}
            onChange={setSort}
            label={t('排序')}
            align="end"
            className="h-full px-2.5"
            options={SORTS.map((s) => ({ value: s.key, label: t(s.label) }))}
          />
        </div>
        {groups.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            {chip(ALL, t('全部'), all.length)}
            {groups.map((g) => chip(g, g, all.filter((n) => n.group === g).length))}
            {all.some((n) => !n.group) && chip(NONE, t('未分組'), all.filter((n) => !n.group).length)}
          </div>
        )}
      </div>

      <ul className="min-h-0 flex-1 overflow-y-auto">
        {!nodes.length && <li className="px-4 py-8 text-center text-[13.5px] text-muted">{t('沒有符合的節點')}</li>}
        {nodes.map((n) => (
          <Row key={n.id} n={n} onPick={() => onFocus(n)} />
        ))}
      </ul>
    </aside>
  )
}

// Fixed bar along the bottom edge, like an instrument readout.
export function StatusBar({ nodes, live }: { nodes: Node[]; live: 'ws' | 'poll' | 'idle' }) {
  const online = nodes.filter((n) => n.online && n.metrics)
  const avgCpu = online.reduce((a, n) => a + (n.metrics?.cpu ?? 0), 0) / (online.length || 1)
  const tx = online.reduce((a, n) => a + (n.metrics?.net_tx ?? 0), 0)
  const rx = online.reduce((a, n) => a + (n.metrics?.net_rx ?? 0), 0)
  const time = new Intl.DateTimeFormat(locale(), { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).format(
    new Date(),
  )
  return (
    <div className="glass-bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-card/90 backdrop-blur">
      <div className="page-w mx-auto flex flex-wrap items-center gap-x-5 gap-y-1 px-4 py-1.5 font-mono text-[12.5px] text-muted sm:px-6">
        <span className="flex items-center gap-1.5">
          <span className={`size-1.5 rounded-full ${live === 'ws' ? 'breathe bg-good' : 'bg-warn'}`} />
          {live === 'ws' ? t('已連線') : live === 'poll' ? t('輪詢中') : t('連線中')}
        </span>
        <span>{time}</span>
        <span>
          {t('平均 CPU')} <b className="text-fg">{avgCpu.toFixed(1)}%</b>
        </span>
        <Rate dir="up" className="text-fg">
          {compactRate(tx)}/s
        </Rate>
        <Rate dir="down" className="text-fg">
          {compactRate(rx)}/s
        </Rate>
        <span className="ml-auto hidden font-display tracking-[0.05em] sm:inline">Atlas</span>
      </div>
    </div>
  )
}
