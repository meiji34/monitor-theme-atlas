import { CARRIER_NAME, CARRIERS, lineAsName, useCnLines, type Carrier, type NodeLine } from '../lib/cnlines'
import { t } from '../lib/i18n'
import type { Node } from '../lib/types'

// 「三網回程」: the line each node's traffic takes back to China Telecom,
// Unicom and Mobile. Optimised lines wear the warm highlight and a rosette;
// ordinary ones sit quietly in the panel's own tint.

const FULL_NAME: Record<Carrier, string> = { ct: '中國電信', cu: '中國聯通', cm: '中國移動' }
const tier = (l: NodeLine) => (l.premium ? t('優化線路') : t('普通線路'))
const day = (iso?: string) => (iso ? new Date(iso).toLocaleDateString() : '')

// A medal: ribbon on top, disc below (the other way round it reads as a map pin).
function Rosette({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 16 16" className={className} fill="currentColor" aria-hidden>
      <path d="M2.5 0h3.6l2.6 5.6-2.3 1.6zM13.5 0H9.9L7.3 5.6l2.3 1.6z" opacity=".7" />
      <circle cx="8" cy="10.6" r="5.2" />
      <circle cx="8" cy="10.6" r="2.9" fill="none" stroke="var(--color-card)" strokeWidth="1.2" opacity=".85" />
    </svg>
  )
}

const chipTone = (premium: boolean) =>
  premium ? 'bg-warn/12 text-warn ring-1 ring-inset ring-warn/30' : 'bg-primary-soft/70 text-fg/75'

// `compact` (the table): line name only, no rosette; the colour carries the tier.
function Chip({ l, compact }: { l: NodeLine; compact?: boolean }) {
  return (
    <span className={`inline-flex min-w-0 items-center gap-1 rounded-md px-1.5 py-0.5 ${chipTone(l.premium)}`}>
      {l.premium && !compact && <Rosette className="size-3 shrink-0" />}
      {!compact && <span className="shrink-0 opacity-80">{t(CARRIER_NAME[l.carrier])}</span>}
      <span className="truncate font-mono font-semibold">{l.line}</span>
    </span>
  )
}

const summary = (lines: NodeLine[]) =>
  [t('三網回程'), ...lines.map((l) => `${t(FULL_NAME[l.carrier])} ${l.line} · ${tier(l)}`)].join('\n')

// A row of chips at the foot of a node card.
export function CnLinesCard({ node }: { node: Node }) {
  const lines = useCnLines(node)
  if (!lines.length) return null
  return (
    <div className="grid grid-cols-3 gap-1.5 border-t border-line pt-3 text-[12.5px]" title={summary(lines)}>
      {lines.map((l) => (
        <Chip key={l.carrier} l={l} />
      ))}
    </div>
  )
}

// The table cell: three slots in carrier order (the header names them).
export function CnLinesCell({ node }: { node: Node }) {
  const lines = useCnLines(node)
  if (!lines.length) return <span className="text-muted">—</span>
  return (
    <span className="flex items-center gap-1 text-[12.5px] whitespace-nowrap" title={summary(lines)}>
      {CARRIERS.map((c) => {
        const l = lines.find((x) => x.carrier === c)
        return l ? (
          <Chip key={c} l={l} compact />
        ) : (
          <span key={c} className="px-1.5 text-muted">
            —
          </span>
        )
      })}
    </span>
  )
}

// The details section: one row per carrier with its tier, the networks the
// trace crossed and where the answer came from.
export function CnLinesSection({ node, wide }: { node: Node; wide?: boolean }) {
  const lines = useCnLines(node)
  if (!lines.length) return null
  return (
    <div className={`grid grid-cols-1 gap-2 ${wide ? 'md:grid-cols-3' : ''}`}>
      {CARRIERS.map((c) => {
        const l = lines.find((x) => x.carrier === c)
        return (
          <div key={c} className="rounded-lg border border-line/70 bg-bg/40 px-3 py-2.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13.5px] text-muted">{t(FULL_NAME[c])}</span>
              {l ? (
                <span className={`text-[12px] ${l.premium ? 'text-warn' : 'text-muted'}`}>{tier(l)}</span>
              ) : (
                <span className="text-[12px] text-muted">{t('未知')}</span>
              )}
            </div>
            {l ? (
              <>
                <div className="mt-1 flex items-center gap-1.5">
                  {l.premium && <Rosette className="size-4 shrink-0 text-warn" />}
                  <span className={`font-mono text-[18px] leading-tight font-semibold ${l.premium ? 'text-warn' : ''}`}>{l.line}</span>
                </div>
                {l.path.length > 0 && (
                  <div className="mt-1.5 text-[12.5px] leading-snug text-muted">{l.path.map(lineAsName).join(' → ')}</div>
                )}
                <div className="mt-1 text-[12px] text-muted/80">
                  {l.source === 'config' ? t('站長指定') : t('自動追蹤 · {date}', { date: day(l.traced) })}
                </div>
              </>
            ) : (
              <div className="mt-1 font-mono text-[18px] leading-tight text-muted">—</div>
            )}
          </div>
        )
      })}
    </div>
  )
}
