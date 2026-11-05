import { useState } from 'react'
import { MEDIA_GROUPS, STATUS_LABEL, type MediaResult, type MediaStatus } from '../lib/media'
import { useMedia } from '../lib/useMedia'
import { Flag } from './Flag'

// Shape and colour both carry the verdict, so it never rests on colour alone.
const ICON: Record<MediaStatus, { glyph: string; tone: string }> = {
  yes: { glyph: '✓', tone: 'text-good' },
  partial: { glyph: '◐', tone: 'text-warn' },
  no: { glyph: '✕', tone: 'text-bad' },
  error: { glyph: '?', tone: 'text-muted' },
}

function Region({ r, home }: { r: MediaResult; home?: string | null }) {
  if (!r.region) return null
  // The service places the address somewhere other than where the node is.
  const elsewhere = !!home && r.region.toUpperCase() !== home.toUpperCase()
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[10.5px] ${elsewhere ? 'text-warn' : 'text-muted'}`}
      title={elsewhere ? `服務判定為 ${r.region}，與節點所在地 ${home!.toUpperCase()} 不同` : `服務判定為 ${r.region}`}
    >
      <Flag code={r.region} className="h-2.5 w-3.5" />
      {r.region}
    </span>
  )
}

function Verdict({ name, r, home }: { name: string; r?: MediaResult; home?: string | null }) {
  const s = r?.status ?? 'error'
  const tip = [name, STATUS_LABEL[s], r?.note].filter(Boolean).join(' · ')
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-white px-1.5 py-0.5 text-[11.5px]" title={tip}>
      <span className={`w-3 text-center font-bold ${ICON[s].tone}`}>{ICON[s].glyph}</span>
      <span className="text-fg">{name}</span>
      {r && <Region r={r} home={home} />}
      {r?.note && <span className="text-[10.5px] text-muted">{r.note}</span>}
    </span>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-muted">
      {(Object.keys(ICON) as MediaStatus[]).map((s) => (
        <span key={s}>
          <b className={ICON[s].tone}>{ICON[s].glyph}</b> {STATUS_LABEL[s]}
        </span>
      ))}
      <span className="text-warn">黃色地區＝與節點所在地不同</span>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-primary/30 border-t-primary" />
}

// The ask-for-a-check button with its pending state and any error.
function CheckButton({ nodeId, label, small }: { nodeId: number; label: string; small?: boolean }) {
  const media = useMedia()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (media.pending(nodeId)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-muted ${small ? 'text-[11px]' : 'text-[12px]'}`}>
        <Spinner />
        檢測中，約一分鐘
      </span>
    )
  }
  if (!media.canCheck(nodeId)) return null
  const go = async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    setError(await media.check(nodeId))
    setBusy(false)
  }
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        onClick={go}
        disabled={busy}
        className={
          small
            ? 'text-[11px] text-primary hover:underline disabled:opacity-50'
            : 'rounded-md border border-primary/30 bg-primary-soft px-2.5 py-1 text-[12px] font-medium text-primary hover:bg-primary-soft/70 disabled:opacity-50'
        }
      >
        {busy ? '送出中…' : label}
      </button>
      {error && <span className="text-[11px] text-bad">{error}</span>}
    </span>
  )
}

// Section header extras: when it was checked, and a re-check for admins.
export function MediaActions({ nodeId }: { nodeId: number }) {
  const media = useMedia()
  const data = media.get(nodeId)
  return (
    <span className="flex items-center gap-2 text-[11px] text-muted">
      {data && !media.pending(nodeId) && <span title="最近一次檢測">{new Date(data.checked).toLocaleString()}</span>}
      {data && <CheckButton nodeId={nodeId} label="重新檢測" small />}
    </span>
  )
}

// Grouped verdict chips; `wide` lays the groups out side by side.
export function MediaChecks({ nodeId, home, wide }: { nodeId: number; home?: string | null; wide?: boolean }) {
  const media = useMedia()
  const data = media.get(nodeId)
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[12px] text-muted">
        {!media.pending(nodeId) && <span>尚未檢測</span>}
        <CheckButton nodeId={nodeId} label="點擊檢測" />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className={wide ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4' : 'flex flex-col gap-2'}>
        {MEDIA_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1 text-[10.5px] text-muted">{g.label}</div>
            <div className="flex flex-wrap gap-1">
              {g.items.map((it) => (
                <Verdict key={it.id} name={it.name} r={data.services[it.id]} home={home} />
              ))}
            </div>
          </div>
        ))}
      </div>
      <Legend />
    </div>
  )
}

// One line on a node card: a tally with the full list on hover, or the
// button when there's nothing yet.
export function MediaCardLine({ nodeId }: { nodeId: number }) {
  const media = useMedia()
  const data = media.get(nodeId)
  if (!data) {
    if (!media.canCheck(nodeId) && !media.pending(nodeId)) return null
    return (
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-[11px] text-muted">
        <span>流媒體</span>
        <CheckButton nodeId={nodeId} label="點擊檢測" small />
      </div>
    )
  }
  const all = MEDIA_GROUPS.flatMap((g) => g.items)
  const tally = (s: MediaStatus) => all.filter((it) => (data.services[it.id]?.status ?? 'error') === s).length
  const list = all
    .map((it) => {
      const r = data.services[it.id]
      return `${ICON[r?.status ?? 'error'].glyph} ${it.name}${r?.region ? ` ${r.region}` : ''}${r?.note ? `（${r.note}）` : ''}`
    })
    .join('\n')
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-[11px]" title={list}>
      <span className="text-muted">流媒體</span>
      <span className="flex items-center gap-2.5 font-mono">
        {(['yes', 'partial', 'no'] as const).map((s) =>
          tally(s) ? (
            <span key={s} className={ICON[s].tone}>
              {ICON[s].glyph} {tally(s)}
            </span>
          ) : null,
        )}
        {media.pending(nodeId) && <Spinner />}
      </span>
    </div>
  )
}
