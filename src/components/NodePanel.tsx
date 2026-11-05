import { useState } from 'react'
import { bytes, duration, expiry, pct, speed } from '../lib/format'
import type { Link as TopoLink } from '../lib/geo'
import { Link } from '../lib/router'
import { asName, asPath, OTHER_AS, PLAIN_SEA, ROUTES, routeFor, type Route } from '../lib/routes'
import type { Node, PingSeries } from '../lib/types'
import { Flag } from './Flag'
import { MediaActions, MediaChecks } from './Media'
import { useMedia } from '../lib/useMedia'
import { Sparkline } from './Meter'
import { latencyTone, pingLines } from './NodeCard'
import { Rate } from './Rate'

function Row({ label, value }: { label: string; value?: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-3 py-1">
      <span className="w-14 shrink-0 text-[11px] text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate text-[12.5px]">{value || '—'}</span>
    </div>
  )
}

function Bar({ label, value, detail }: { label: string; value: number; detail?: string }) {
  const tone = value >= 90 ? 'bg-bad' : value >= 70 ? 'bg-warn' : 'bg-primary'
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12px] font-medium">
          {label}
          {detail && <span className="ml-1.5 font-mono text-[10.5px] text-muted">{detail}</span>}
        </span>
        <span className="font-mono text-[13px] font-semibold tabular-nums">{value.toFixed(1)}%</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-primary-soft">
        <div className={`h-full rounded-full transition-[width] duration-500 ${tone}`} style={{ width: `${value}%` }} />
      </div>
    </div>
  )
}

const Section = ({ title, children, right }: { title: string; children: React.ReactNode; right?: React.ReactNode }) => (
  <section className="border-b border-line px-4 py-3 last:border-0">
    <div className="mb-2 flex items-center justify-between">
      <span className="hud">{title}</span>
      {right}
    </div>
    {children}
  </section>
)

type Colours = Map<number, string>
const runColour = (asn: number, colours: Colours) => (asn ? (colours.get(asn) ?? OTHER_AS) : OTHER_AS)

// One traced route as an AS-by-AS timeline with the places each network passes.
function RouteTimeline({ route, colours, placeLabel }: { route: Route; colours: Colours; placeLabel: (id: number) => string }) {
  const runs = asPath(route, { from: placeLabel(route.from), to: placeLabel(route.to) })
  return (
    <ol>
      {runs.map((run, i) => {
        const last = i === runs.length - 1 && route.reached
        return (
          <li key={i} className="flex gap-2.5">
            <div className="flex w-2.5 flex-col items-center">
              <span
                className="mt-[3px] size-2.5 shrink-0 rounded-full border-2 bg-white"
                style={{ borderColor: runColour(run.asn, colours) }}
              />
              {!last && <span className="w-px flex-1 bg-line" />}
            </div>
            <div className="min-w-0 flex-1 pb-2.5">
              <div className="flex items-baseline gap-1.5 text-[12px]">
                <b className="font-mono">{run.ix ? 'IX' : run.asn ? `AS${run.asn}` : '未知'}</b>
                <span className="min-w-0 truncate">{run.ix ? '交換點' : asName(run.asn)}</span>
              </div>
              {run.places.length > 0 && <div className="text-[11px] text-muted">{run.places.join(' → ')}</div>}
              {run.cables.length > 0 && (
                <div className="mt-0.5 text-[11px] text-muted">
                  ⚓{' '}
                  {run.cables.map((c) => (c === PLAIN_SEA ? '跨海（未對應海纜）' : c)).join(' → ')}
                  {run.cables.some((c) => c !== PLAIN_SEA) && <span className="opacity-70">（推測）</span>}
                </div>
              )}
            </div>
          </li>
        )
      })}
      {!route.reached && (
        <li className="flex gap-2.5 text-[11.5px] text-bad">
          <span className="w-2.5 text-center">✕</span>
          追蹤在此中斷，沒有到達 {placeLabel(route.to)}
        </li>
      )}
    </ol>
  )
}

const RouteRtt = ({ route }: { route: Route }) =>
  route.reached && route.rtt !== null ? (
    <span className="font-mono text-[12.5px] font-semibold">{Math.round(route.rtt)} ms</span>
  ) : (
    <span className="text-[12px] font-medium text-bad">未到達</span>
  )

// The traced paths of the topology links touching this node: one link as a
// timeline, several (the hub of a star topology) as a list that expands.
function RouteSection({
  links,
  nodeId,
  colours,
  placeLabel,
}: {
  links: TopoLink[]
  nodeId: number
  colours: Colours
  placeLabel: (id: number) => string
}) {
  const [open, setOpen] = useState<number | null>(null)
  const items = links.flatMap((link) => {
    const r = routeFor(link)
    if (!r) return []
    const other = r.route.from === nodeId ? r.route.to : r.route.from
    const name = [link.from, link.to].flatMap((e) => (e.kind === 'node' && e.node.id === other ? [e.node.name] : []))[0] ?? `#${other}`
    return [{ route: r.route, name, outbound: r.route.from === nodeId }]
  })
  if (!items.length) return null
  const stamp = ROUTES && <span className="ml-1">· {new Date(items[0].route.traced).toLocaleDateString()} 快照</span>

  if (items.length === 1) {
    const it = items[0]
    return (
      <Section title="路由" right={<RouteRtt route={it.route} />}>
        <div className="mb-2.5 text-[11px] text-muted">
          {it.outbound ? `本機 → ${it.name}` : `${it.name} → 本機`}
          {stamp}
        </div>
        <RouteTimeline route={it.route} colours={colours} placeLabel={placeLabel} />
      </Section>
    )
  }

  return (
    <Section title="路由" right={<span className="text-[11px] text-muted">{items.length} 條</span>}>
      <div className="mb-1.5 text-[11px] text-muted">
        從本機出發的實際路徑，點一條展開{stamp}
      </div>
      <div className="-mx-2 flex flex-col">
        {items.map((it, i) => {
          const asns = [...new Set(it.route.hops.map((h) => h.asn).concat(it.route.reached ? [it.route.dstAsn] : []))].filter(
            (a) => a && a !== it.route.hops[0]?.asn,
          )
          return (
            <div key={i} className={`rounded-md ${open === i ? 'bg-primary-soft/50' : ''}`}>
              <button
                onClick={() => setOpen(open === i ? null : i)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-primary-soft/60"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12.5px] font-medium">
                    {it.outbound ? '→ ' : '← '}
                    {it.name}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10.5px] text-muted">
                    {asns.map((a, k) => (
                      <span key={a} className="flex items-center gap-1">
                        {k > 0 && <span className="text-line">›</span>}
                        <span className="size-1.5 rounded-full" style={{ background: runColour(a, colours) }} />
                        {asName(a) || `AS${a}`}
                      </span>
                    ))}
                  </div>
                </div>
                <RouteRtt route={it.route} />
              </button>
              {open === i && (
                <div className="px-2 pt-1 pb-0.5">
                  <RouteTimeline route={it.route} colours={colours} placeLabel={placeLabel} />
                </div>
              )}
            </div>
          )
        })}
      </div>
    </Section>
  )
}

// The node's live state, shown in place of the roster beside the map.
export function NodePanel({
  node,
  ping,
  onBack,
  routes,
  asColour,
  placeLabel,
  showMedia,
}: {
  node: Node
  ping?: PingSeries
  onBack: () => void
  routes: TopoLink[]
  asColour: Map<number, string>
  placeLabel: (id: number) => string
  showMedia: boolean
}) {
  const routeSection = routes.length ? (
    <RouteSection key={node.id} links={routes} nodeId={node.id} colours={asColour} placeLabel={placeLabel} />
  ) : null
  const media = useMedia()
  const mediaSection = showMedia && media.available ? (
    <Section title="流媒體" right={<MediaActions nodeId={node.id} />}>
      <MediaChecks nodeId={node.id} home={node.country} />
    </Section>
  ) : null
  const m = node.metrics
  const memTotal = m?.mem_total ?? node.mem_total
  const diskTotal = m?.disk_total ?? node.disk_total
  const lines = pingLines(ping, [])
  const head = lines[0]
  const load = m?.load ?? []
  return (
    <aside className="panel flex h-full min-h-0 flex-col">
      <header className="flex items-start gap-2 border-b border-line px-3 py-3">
        <button onClick={onBack} title="返回清單" className="mt-0.5 rounded-md p-1 text-muted hover:bg-primary-soft hover:text-primary">
          <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M10 3.5 5.5 8l4.5 4.5" />
          </svg>
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-[15px] font-bold">{node.name}</h3>
            <Flag code={node.country} className="h-3 w-4" />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className={`flex items-center gap-1 ${node.online ? 'text-good' : 'text-bad'}`}>
              <span className={`size-1.5 rounded-full ${node.online ? 'breathe bg-good' : 'bg-bad'}`} />
              {node.online ? '在線' : `離線 ${duration(node.last_seen_ago)}`}
            </span>
            {node.group && <span className="rounded bg-primary-soft px-1.5 py-0.5 text-primary">{node.group}</span>}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <Section title="系統資訊">
          <Row label="CPU" value={node.cpu_name} />
          <Row label="架構" value={node.arch} />
          <Row label="系統" value={node.os} />
          <Row label="虛擬化" value={node.virt} />
          <Row
            label="地區"
            value={
              node.country ? (
                <span className="inline-flex items-center gap-1.5">
                  <Flag code={node.country} className="h-3 w-4" />
                  {node.country}
                </span>
              ) : null
            }
          />
          <Row label="核心" value={node.kernel} />
        </Section>

        {m ? (
          <>
            <Section title="資源">
              <div className="flex flex-col gap-3">
                <Bar label="CPU" value={m.cpu ?? 0} detail={node.cpu_cores ? `${node.cpu_cores} 核` : undefined} />
                <Bar label="記憶體" value={pct(m.mem_used, memTotal)} detail={`${bytes(m.mem_used)} / ${bytes(memTotal)}`} />
                <Bar label="硬碟" value={pct(m.disk_used, diskTotal)} detail={`${bytes(m.disk_used)} / ${bytes(diskTotal)}`} />
                {node.traffic_limit ? (
                  <Bar
                    label="流量"
                    value={pct(node.month_used, node.traffic_limit)}
                    detail={`${bytes(node.month_used)} / ${bytes(node.traffic_limit)}`}
                  />
                ) : null}
              </div>
            </Section>

            <Section
              title="延遲"
              right={
                head && (
                  <span className={`font-mono text-[13px] font-semibold ${latencyTone(head.latest, head.loss)}`}>
                    {head.latest === null ? '超時' : `${Math.round(head.latest)} ms`}
                  </span>
                )
              }
            >
              {lines.length ? (
                <div className="flex flex-col gap-1.5">
                  {lines.map((l) => (
                    <div key={l.name} className="grid grid-cols-[2.6rem_1fr_3.6rem] items-center gap-2 text-[11px]">
                      <span className="text-muted">{l.name}</span>
                      <Sparkline values={l.values} className={`h-5 w-full ${latencyTone(l.latest, l.loss)}`} />
                      <span className={`text-right font-mono ${latencyTone(l.latest, l.loss)}`}>
                        {l.latest === null ? '超時' : `${Math.round(l.latest)}ms`}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-[12px] text-muted">沒有延遲監控</div>
              )}
            </Section>

            {routeSection}

            {mediaSection}

            <Section title="網路">
              <div className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-3 gap-y-1 font-mono">
                <span className="font-sans text-[11px] text-muted">總上傳</span>
                <span className="text-[14px] font-bold">{bytes(node.total_tx ?? m.total_tx)}</span>
                <Rate dir="up" className="text-[13px] font-semibold">{speed(m.net_tx)}</Rate>
                <span className="font-sans text-[11px] text-muted">總下載</span>
                <span className="text-[14px] font-bold">{bytes(node.total_rx ?? m.total_rx)}</span>
                <Rate dir="down" className="text-[13px] font-semibold">{speed(m.net_rx)}</Rate>
              </div>
              <div className="mt-2 flex gap-4 font-mono text-[11px] text-muted">
                <span>
                  TCP <b className="text-fg">{m.tcp ?? '-'}</b>
                </span>
                <span>
                  UDP <b className="text-fg">{m.udp ?? '-'}</b>
                </span>
                <span>
                  進程 <b className="text-fg">{m.procs ?? '-'}</b>
                </span>
              </div>
            </Section>

            <Section title="負載">
              <div className="font-mono text-2xl font-bold">{load[0]?.toFixed(2) ?? '-'}</div>
              <div className="mt-1 grid grid-cols-3 font-mono text-[11px]">
                {['1 分鐘', '5 分鐘', '15 分鐘'].map((label, i) => (
                  <span key={label}>
                    <span className="block text-muted">{label}</span>
                    <b className="text-[13px]">{load[i]?.toFixed(2) ?? '-'}</b>
                  </span>
                ))}
              </div>
            </Section>

            <Section title="其他">
              <Row label="運行時間" value={<span className="font-mono">{duration(m.uptime)}</span>} />
              <Row label="到期" value={expiry(node.expires_in)} />
            </Section>
          </>
        ) : (
          <>
            <div className="px-4 py-10 text-center text-[13px] text-muted">{node.online ? '等待資料…' : '節點離線，沒有即時資料'}</div>
            {routeSection}
            {mediaSection}
          </>
        )}
      </div>

      <Link
        to={`/node/${node.id}`}
        className="border-t border-line px-4 py-2.5 text-center text-[12px] font-medium text-primary hover:bg-primary-soft/60"
      >
        完整詳情與歷史曲線 →
      </Link>
    </aside>
  )
}
