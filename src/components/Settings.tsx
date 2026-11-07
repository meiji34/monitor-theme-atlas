import { useEffect, useRef, useState } from 'react'
import { LANGS, t, type Lang } from '../lib/i18n'
import type { BackdropCtl } from '../lib/backdrop'
import type { Scheme } from '../lib/scheme'
import type { LabelMode } from './MapLabels'

export interface VisitorSettings {
  mapMode: 'globe' | 'flat'
  setMapMode: (v: 'globe' | 'flat') => void
  spin: boolean
  setSpin: (v: boolean) => void
  topology: boolean | null // null: no topology to show
  setTopology: (v: boolean) => void
  routes: boolean | null // null: no traced route for the shown links
  setRoutes: (v: boolean) => void
  labels: LabelMode
  setLabels: (v: LabelMode) => void
  lit: boolean
  setLit: (v: boolean) => void
  cableGrey: boolean | null // null: no cable map
  setCableGrey: (v: boolean) => void
  lang: Lang
  setLang: (v: Lang) => void
  scheme: Scheme
  setScheme: (v: Scheme) => void
  backdrop: BackdropCtl
  reset: () => void
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-bg p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={value === v}
          className={`flex-1 rounded-md px-2 py-1 text-[13px] whitespace-nowrap ${
            value === v ? 'bg-raised font-medium text-primary shadow-sm' : 'text-muted hover:text-fg'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

function Switch({ on, onChange, disabled }: { on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={() => onChange(!on)}
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-primary' : 'bg-line'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-raised shadow transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

function Slider({ label, value, min, max, unit, onChange }: { label: string; value: number; min: number; max: number; unit: string; onChange: (v: number) => void }) {
  return (
    <label className="flex items-center gap-3 py-1 text-[13px]">
      <span className="w-14 shrink-0 text-muted">{label}</span>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="min-w-0 flex-1 accent-primary" />
      <span className="w-12 shrink-0 text-right font-mono">
        {value}
        {unit}
      </span>
    </label>
  )
}

const BG_ERRORS: Record<string, string> = {
  url: '請輸入 http(s):// 開頭的圖片網址',
  type: '無法讀取這張圖片',
  storage: '圖片太大，瀏覽器存不下，請改用網址',
}

// Background picture: the site's, the visitor's own (URL or upload), or none.
function BackgroundSection({ b }: { b: BackdropCtl }) {
  const [url, setUrl] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const file = useRef<HTMLInputElement>(null)
  const btn = 'rounded-md border border-line px-2.5 py-1 text-[13px] text-muted hover:border-primary/40 hover:text-primary disabled:opacity-50'
  const done = (e: string | null) => setError(e ? t(BG_ERRORS[e] ?? e) : null)
  return (
    <div className="py-2">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <span className="text-[14px] font-medium">{t('背景圖片')}</span>
        <span className="text-[12px] text-muted">
          {b.bd.own ? t('自己的圖片') : b.bd.url ? t('站長預設') : t('無')}
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button className={btn} disabled={busy} onClick={() => file.current?.click()}>
          {busy ? t('處理中…') : t('上傳圖片')}
        </button>
        {b.bd.url && (
          <button className={btn} onClick={() => (b.hideImage(), setError(null))}>
            {t('不用背景')}
          </button>
        )}
        {!b.bd.url && b.hasSite && (
          <button className={btn} onClick={() => (b.reset(), setError(null))}>
            {t('用站長預設')}
          </button>
        )}
        <input
          ref={file}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            e.target.value = ''
            if (!f) return
            setBusy(true)
            done(await b.upload(f))
            setBusy(false)
          }}
        />
      </div>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return
          const err = b.setUrl(url)
          done(err)
          if (!err) setUrl('')
        }}
      >
        <input
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder={t('或貼上圖片網址')}
          className="min-w-0 flex-1 rounded-md border border-line bg-bg px-2 py-1 text-[13px] outline-none placeholder:text-muted focus:border-primary/60"
        />
        <button className={btn} type="submit">
          {t('套用')}
        </button>
      </form>
      {error && <div className="mt-1 text-[12px] text-bad">{error}</div>}
      {b.bd.url && (
        <div className="mt-1.5">
          <Slider label={t('模糊')} value={b.bd.blur} min={0} max={30} unit="px" onChange={b.setBlur} />
          <Slider label={t('壓暗')} value={b.bd.dim} min={0} max={90} unit="%" onChange={b.setDim} />
          <div className="flex items-center justify-between gap-4 py-1">
            <span className="text-[13px] text-muted">{t('毛玻璃面板')}</span>
            <Switch on={b.bd.glass} onChange={b.setGlass} />
          </div>
        </div>
      )}
      <p className="mt-1 text-[11.5px] text-muted">{t('上傳的圖片只存在這個瀏覽器，不會傳到伺服器')}</p>
    </div>
  )
}

const Item = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="min-w-0">
      <div className="text-[14px] font-medium">{label}</div>
      {hint && <div className="text-[12px] text-muted">{hint}</div>}
    </div>
    {children}
  </div>
)

export const iconBtn =
  'flex size-9 items-center justify-center rounded-lg border border-line bg-card text-muted transition-colors hover:border-primary/40 hover:text-primary'

// Gear button + popover with the visitor's own display preferences.
export function SettingsMenu({ s }: { s: VisitorSettings }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false)
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        title={t('顯示設定')}
        aria-expanded={open}
        className={`${iconBtn} ${open ? 'border-primary/40 text-primary' : ''}`}
      >
        <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3 5.5h8M14 5.5h3M3 14.5h3M9 14.5h8" strokeLinecap="round" />
          <circle cx="12.5" cy="5.5" r="1.8" />
          <circle cx="7.5" cy="14.5" r="1.8" />
        </svg>
      </button>
      {open && (
        <div className="panel absolute top-11 right-0 z-50 max-h-[calc(100vh-5rem)] w-[22rem] max-w-[calc(100vw-2rem)] overflow-y-auto bg-raised! p-4 shadow-xl">
          <div className="hud mb-0.5 text-fg!">{t('顯示設定')}</div>
          <p className="mb-2 text-[12px] text-muted">{t('只影響這個瀏覽器，站長的預設值在後台主題設定裡')}</p>
          <div className="divide-y divide-line">
            <div className="py-2">
              <div className="mb-1.5 text-[14px] font-medium">{t('外觀')}</div>
              <Segmented
                value={s.scheme}
                options={[
                  ['system', t('跟隨系統')],
                  ['light', t('淺色')],
                  ['dark', t('深色')],
                ]}
                onChange={s.setScheme}
              />
            </div>
            <div className="py-2">
              <div className="mb-1.5 text-[14px] font-medium">{t('語言')}</div>
              <Segmented value={s.lang} options={LANGS.map((l) => [l.id, l.label])} onChange={s.setLang} />
            </div>
            <BackgroundSection b={s.backdrop} />
            <Item label={t('地圖模式')}>
              <Segmented
                value={s.mapMode}
                options={[
                  ['globe', t('地球')],
                  ['flat', t('平面')],
                ]}
                onChange={s.setMapMode}
              />
            </Item>
            <Item label={t('地球自動旋轉')}>
              <Switch on={s.spin} onChange={s.setSpin} />
            </Item>
            <Item label={t('拓撲連線')} hint={s.topology === null ? t('目前沒有可顯示的拓撲') : undefined}>
              <Switch on={!!s.topology} onChange={s.setTopology} disabled={s.topology === null} />
            </Item>
            {s.routes !== null && (
              <Item label={t('真實路由')} hint={s.topology ? t('連線沿實際的 AS 路徑走') : t('需先開啟拓撲連線')}>
                <Switch on={s.routes} onChange={s.setRoutes} disabled={!s.topology} />
              </Item>
            )}
            {s.cableGrey !== null && (
              <Item label={t('其他海纜顯示為灰色')} hint={t('只有節點路由經過的海纜保留顏色')}>
                <Switch on={s.cableGrey} onChange={s.setCableGrey} />
              </Item>
            )}
            <Item label={t('點亮有節點的國家')}>
              <Switch on={s.lit} onChange={s.setLit} />
            </Item>
            <div className="py-2">
              <div className="mb-1.5 text-[14px] font-medium">{t('地圖節點標籤')}</div>
              <Segmented
                value={s.labels}
                options={[
                  ['speed', t('速率')],
                  ['name', t('名稱')],
                  ['name_speed', t('名稱+速率')],
                  ['off', t('關')],
                ]}
                onChange={s.setLabels}
              />
            </div>
          </div>
          <button
            onClick={() => {
              s.reset()
              setOpen(false)
            }}
            className="mt-2 w-full rounded-lg border border-line py-1.5 text-[13px] text-muted hover:border-primary/40 hover:text-primary"
          >
            {t('恢復站長預設')}
          </button>
        </div>
      )}
    </div>
  )
}

// One click between light and dark (the menu also offers "system").
export function SchemeButton({ dark, onChange }: { dark: boolean; onChange: (v: Scheme) => void }) {
  return (
    <button onClick={() => onChange(dark ? 'light' : 'dark')} title={dark ? t('淺色') : t('深色')} className={iconBtn}>
      {dark ? (
        <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
          <circle cx="10" cy="10" r="3.4" />
          <path d="M10 2.5v1.8M10 15.7v1.8M17.5 10h-1.8M4.3 10H2.5M15.3 4.7l-1.3 1.3M6 14l-1.3 1.3M15.3 15.3 14 14M6 6 4.7 4.7" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round">
          <path d="M15.5 12.3A6.5 6.5 0 0 1 7.7 4.5a6.5 6.5 0 1 0 7.8 7.8Z" />
        </svg>
      )}
    </button>
  )
}

export function FullscreenButton() {
  const [full, setFull] = useState(() => !!document.fullscreenElement)
  useEffect(() => {
    const sync = () => setFull(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', sync)
    return () => document.removeEventListener('fullscreenchange', sync)
  }, [])
  if (!document.fullscreenEnabled) return null
  return (
    <button
      onClick={() => (full ? document.exitFullscreen() : document.documentElement.requestFullscreen())}
      title={full ? t('離開全螢幕') : t('全螢幕')}
      className={`${iconBtn} hidden sm:flex`}
    >
      <svg viewBox="0 0 20 20" className="size-[17px]" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {full ? (
          <path d="M7.5 3v4.5H3M12.5 3v4.5H17M7.5 17v-4.5H3M12.5 17v-4.5H17" />
        ) : (
          <path d="M3 7.5V3h4.5M17 7.5V3h-4.5M3 12.5V17h4.5M17 12.5V17h-4.5" />
        )}
      </svg>
    </button>
  )
}

// The hub's own admin panel; filled icon when this browser is signed in.
export function AdminButton({ authed }: { authed: boolean }) {
  return (
    <a href="/admin" title={authed ? t('已登入：前往後台') : t('登入後台')} className={`${iconBtn} ${authed ? 'text-primary' : ''}`}>
      <svg viewBox="0 0 20 20" className="size-[18px]" fill={authed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3.2" />
        <path d="M3.8 17c.9-3.2 3.4-4.8 6.2-4.8s5.3 1.6 6.2 4.8" strokeLinecap="round" />
      </svg>
    </a>
  )
}
