import { useEffect, useRef, useState } from 'react'
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
  reset: () => void
}

function Segmented<T extends string>({ value, options, onChange }: { value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-line bg-slate-50 p-0.5">
      {options.map(([v, label]) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={`flex-1 rounded-md px-2 py-1 text-[12px] whitespace-nowrap ${
            value === v ? 'bg-white font-medium text-primary shadow-sm' : 'text-muted hover:text-fg'
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
      className={`relative h-5 w-9 shrink-0 rounded-full transition-colors disabled:opacity-40 ${on ? 'bg-primary' : 'bg-slate-300'}`}
    >
      <span className={`absolute top-0.5 size-4 rounded-full bg-white shadow transition-[left] ${on ? 'left-[18px]' : 'left-0.5'}`} />
    </button>
  )
}

const Item = ({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) => (
  <div className="flex items-center justify-between gap-4 py-2">
    <div className="min-w-0">
      <div className="text-[13px] font-medium">{label}</div>
      {hint && <div className="text-[11px] text-muted">{hint}</div>}
    </div>
    {children}
  </div>
)

const iconBtn =
  'flex size-9 items-center justify-center rounded-lg border border-line bg-white text-muted shadow-sm transition-colors hover:border-primary/30 hover:text-primary'

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
      <button onClick={() => setOpen((o) => !o)} title="顯示設定" className={`${iconBtn} ${open ? 'border-primary/30 text-primary' : ''}`}>
        <svg viewBox="0 0 20 20" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth="1.5">
          <circle cx="10" cy="10" r="2.6" />
          <path
            d="M10 2.5v2M10 15.5v2M17.5 10h-2M4.5 10h-2M15.3 4.7l-1.4 1.4M6.1 13.9l-1.4 1.4M15.3 15.3l-1.4-1.4M6.1 6.1 4.7 4.7"
            strokeLinecap="round"
          />
        </svg>
      </button>
      {open && (
        <div className="panel absolute top-11 right-0 z-50 w-80 p-4 shadow-xl">
          <div className="hud mb-1 text-fg!">顯示設定</div>
          <p className="mb-2 text-[11px] text-muted">只影響這個瀏覽器，站長的預設值在後台主題設定裡</p>
          <div className="divide-y divide-line">
            <Item label="地圖模式">
              <Segmented value={s.mapMode} options={[['globe', '地球'], ['flat', '平面']]} onChange={s.setMapMode} />
            </Item>
            <Item label="地球自動旋轉">
              <Switch on={s.spin} onChange={s.setSpin} />
            </Item>
            <Item label="拓撲連線" hint={s.topology === null ? '目前沒有可顯示的拓撲' : undefined}>
              <Switch on={!!s.topology} onChange={s.setTopology} disabled={s.topology === null} />
            </Item>
            {s.routes !== null && (
              <Item label="真實路由" hint={s.topology ? '連線沿實際的 AS 路徑走' : '需先開啟拓撲連線'}>
                <Switch on={s.routes} onChange={s.setRoutes} disabled={!s.topology} />
              </Item>
            )}
            <Item label="點亮有節點的國家">
              <Switch on={s.lit} onChange={s.setLit} />
            </Item>
            <div className="py-2">
              <div className="mb-1.5 text-[13px] font-medium">地圖節點標籤</div>
              <Segmented
                value={s.labels}
                options={[
                  ['speed', '速率'],
                  ['name', '名稱'],
                  ['name_speed', '名稱+速率'],
                  ['off', '關'],
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
            className="mt-2 w-full rounded-lg border border-line py-1.5 text-[12px] text-muted hover:border-primary/30 hover:text-primary"
          >
            恢復站長預設
          </button>
        </div>
      )}
    </div>
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
      title={full ? '離開全螢幕' : '全螢幕'}
      className={iconBtn}
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
    <a href="/admin" title={authed ? '已登入：前往後台' : '登入後台'} className={`${iconBtn} ${authed ? 'text-primary' : ''}`}>
      <svg viewBox="0 0 20 20" className="size-[18px]" fill={authed ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.5">
        <circle cx="10" cy="7" r="3.2" />
        <path d="M3.8 17c.9-3.2 3.4-4.8 6.2-4.8s5.3 1.6 6.2 4.8" strokeLinecap="round" />
      </svg>
    </a>
  )
}
