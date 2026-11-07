import { useState } from 'react'
import { MEDIA_GROUPS, STATUS_LABEL, type MediaResult, type MediaStatus } from '../lib/media'
import { locale, t } from '../lib/i18n'
import { useMedia } from '../lib/useMedia'
import { Flag } from './Flag'

// Shape and colour both carry the verdict, so it never rests on colour alone.
const ICON: Record<MediaStatus, { glyph: string; tone: string }> = {
  yes: { glyph: '✓', tone: 'text-good' },
  partial: { glyph: '◐', tone: 'text-warn' },
  no: { glyph: '✕', tone: 'text-bad' },
  error: { glyph: '?', tone: 'text-muted' },
}

// Notes come from the relay / snapshot in Traditional Chinese.
const noteText = (note: string) => {
  const g = /^Google 判定為 (\w+)$/.exec(note)
  return g ? t('Google 判定為 {cc}', { cc: g[1] }) : t(note)
}

function Region({ r, home }: { r: MediaResult; home?: string | null }) {
  if (!r.region) return null
  // The service places the address somewhere other than where the node is.
  const elsewhere = !!home && r.region.toUpperCase() !== home.toUpperCase()
  return (
    <span
      className={`inline-flex items-center gap-1 font-mono text-[12px] ${elsewhere ? 'text-warn' : 'text-muted'}`}
      title={
        elsewhere
          ? t('服務判定為 {region}，與節點所在地 {home} 不同', { region: r.region, home: home!.toUpperCase() })
          : t('服務判定為 {region}', { region: r.region })
      }
    >
      <Flag code={r.region} className="h-2.5 w-3.5" />
      {r.region}
    </span>
  )
}

function Verdict({ name, r, home }: { name: string; r?: MediaResult; home?: string | null }) {
  const s = r?.status ?? 'error'
  const tip = [name, t(STATUS_LABEL[s]), r?.note && noteText(r.note)].filter(Boolean).join(', ')
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-line bg-card px-2 py-1 text-[13px]" title={tip}>
      <span className={`w-3 text-center font-bold ${ICON[s].tone}`}>{ICON[s].glyph}</span>
      <span className="text-fg">{name}</span>
      {r && <Region r={r} home={home} />}
      {r?.note && <span className="text-[12px] text-muted">{noteText(r.note)}</span>}
    </span>
  )
}

function Legend() {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[12px] text-muted">
      {(Object.keys(ICON) as MediaStatus[]).map((s) => (
        <span key={s}>
          <b className={ICON[s].tone}>{ICON[s].glyph}</b> {t(STATUS_LABEL[s])}
        </span>
      ))}
      <span className="text-warn">{t('黃色地區＝與節點所在地不同')}</span>
    </div>
  )
}

function Spinner() {
  return <span className="inline-block size-3 animate-spin rounded-full border-[1.5px] border-primary/30 border-t-primary" />
}

// The ask-for-a-check button with its pending state and any error.
function CheckButton({ nodeId, label, small }: { nodeId: string; label: string; small?: boolean }) {
  const media = useMedia()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  if (media.pending(nodeId)) {
    return (
      <span className={`inline-flex items-center gap-1.5 text-muted ${small ? 'text-[12.5px]' : 'text-[13.5px]'}`}>
        <Spinner />
        {t('檢測中，約一分鐘')}
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
            ? 'text-[12.5px] text-primary hover:underline disabled:opacity-50'
            : 'rounded-md border border-primary/30 bg-primary-soft px-2.5 py-1 text-[13.5px] font-medium text-primary hover:bg-primary-soft/70 disabled:opacity-50'
        }
      >
        {busy ? t('送出中…') : label}
      </button>
      {error && <span className="text-[12.5px] text-bad">{error}</span>}
    </span>
  )
}

// Section header extras: when it was checked, and a re-check for admins.
export function MediaActions({ nodeId }: { nodeId: string }) {
  const media = useMedia()
  const data = media.get(nodeId)
  return (
    <span className="flex items-center gap-2 text-[12.5px] text-muted">
      {data && !media.pending(nodeId) && <span title={t('最近一次檢測')}>{new Date(data.checked).toLocaleString(locale())}</span>}
      {data && <CheckButton nodeId={nodeId} label={t('重新檢測')} small />}
    </span>
  )
}

// Grouped verdict chips; `wide` lays the groups out side by side.
export function MediaChecks({ nodeId, home, wide }: { nodeId: string; home?: string | null; wide?: boolean }) {
  const media = useMedia()
  const data = media.get(nodeId)
  if (!data) {
    return (
      <div className="flex items-center gap-2 text-[13.5px] text-muted">
        {!media.pending(nodeId) && <span>{t('尚未檢測')}</span>}
        <CheckButton nodeId={nodeId} label={t('點擊檢測')} />
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-2.5">
      <div className={wide ? 'grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4' : 'flex flex-col gap-2'}>
        {MEDIA_GROUPS.map((g) => (
          <div key={g.label}>
            <div className="mb-1 text-[12.5px] text-muted">{t(g.label)}</div>
            <div className="flex flex-wrap gap-1">
              {g.items.map((it) => (
                <Verdict key={it.id} name={t(it.name)} r={data.services[it.id]} home={home} />
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
export function MediaCardLine({ nodeId }: { nodeId: string }) {
  const media = useMedia()
  const data = media.get(nodeId)
  if (!data) {
    if (!media.canCheck(nodeId) && !media.pending(nodeId)) return null
    return (
      <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-[13px] text-muted">
        <span>{t('流媒體')}</span>
        <CheckButton nodeId={nodeId} label={t('點擊檢測')} small />
      </div>
    )
  }
  const all = MEDIA_GROUPS.flatMap((g) => g.items)
  const tally = (s: MediaStatus) => all.filter((it) => (data.services[it.id]?.status ?? 'error') === s).length
  const list = all
    .map((it) => {
      const r = data.services[it.id]
      return `${ICON[r?.status ?? 'error'].glyph} ${t(it.name)}${r?.region ? ` ${r.region}` : ''}${r?.note ? ` (${noteText(r.note)})` : ''}`
    })
    .join('\n')
  return (
    <div className="flex items-center justify-between gap-2 border-t border-line pt-3 text-[13.5px]" title={list}>
      <span className="text-muted">{t('流媒體')}</span>
      <span className="flex items-center gap-2.5 font-mono text-[14px]">
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
