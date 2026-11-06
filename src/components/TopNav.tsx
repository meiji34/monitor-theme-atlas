import { LANGS, t, type Lang } from '../lib/i18n'
import { href, Link, type Route } from '../lib/router'
import { useDark } from '../lib/scheme'
import { AdminButton, FullscreenButton, SchemeButton, SettingsMenu, type VisitorSettings } from './Settings'

const ITEMS: { route: Route; label: string; icon: React.ReactNode }[] = [
  {
    route: { view: 'overview' },
    label: '總覽',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <circle cx="8" cy="8" r="6.2" />
        <ellipse cx="8" cy="8" rx="2.6" ry="6.2" />
        <path d="M1.8 8h12.4" />
      </svg>
    ),
  },
  {
    route: { view: 'cards' },
    label: '卡片',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <rect x="2" y="2" width="5" height="5" rx="1" />
        <rect x="9" y="2" width="5" height="5" rx="1" />
        <rect x="2" y="9" width="5" height="5" rx="1" />
        <rect x="9" y="9" width="5" height="5" rx="1" />
      </svg>
    ),
  },
  {
    route: { view: 'table' },
    label: '表格',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M2 3.5h12M2 8h12M2 12.5h12" />
      </svg>
    ),
  },
  {
    route: { view: 'latency' },
    label: '延遲',
    icon: (
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M1.5 9.5h2.5l2-5 3 8 2-4.5h3.5" strokeLinejoin="round" />
      </svg>
    ),
  },
]

// The wordmark: a graticule globe whose meridian is drawn in chart magenta,
// and the name set in the condensed display cut.
export function Wordmark({ className = '' }: { className?: string }) {
  return (
    <span className={`flex items-center gap-2 ${className}`}>
      <svg viewBox="0 0 28 28" className="size-[30px] shrink-0" aria-hidden="true">
        <circle cx="14" cy="14" r="11.6" fill="none" stroke="currentColor" strokeWidth="1.7" />
        <path d="M2.4 14h23.2" stroke="currentColor" strokeWidth="1.2" opacity="0.5" />
        <path d="M4.6 8.4h18.8M4.6 19.6h18.8" stroke="currentColor" strokeWidth="1" opacity="0.28" />
        <ellipse cx="14" cy="14" rx="5.2" ry="11.6" fill="none" className="stroke-accent" strokeWidth="1.9" />
        <circle cx="19.2" cy="14" r="1.9" className="fill-accent" />
      </svg>
      <span className="font-display text-[24px] leading-none font-semibold tracking-[0.05em] sm:text-[27px]">Atlas</span>
    </span>
  )
}

function LangPicker({ lang, onChange }: { lang: Lang; onChange: (l: Lang) => void }) {
  return (
    <label className="relative hidden items-center rounded-lg sm:flex border border-line bg-card text-muted hover:border-primary/40 hover:text-fg">
      <span className="sr-only">{t('語言')}</span>
      <svg viewBox="0 0 16 16" className="pointer-events-none absolute left-2 size-3.5" fill="none" stroke="currentColor" strokeWidth="1.3">
        <circle cx="8" cy="8" r="6" />
        <path d="M2 8h12M8 2c1.8 1.8 2.6 3.8 2.6 6S9.8 12.2 8 14C6.2 12.2 5.4 10.2 5.4 8S6.2 3.8 8 2Z" />
      </svg>
      <select
        value={lang}
        onChange={(e) => onChange(e.target.value as Lang)}
        className="cursor-pointer appearance-none bg-transparent py-1.5 pr-2.5 pl-7 text-[13px] font-medium outline-none"
      >
        {LANGS.map((l) => (
          <option key={l.id} value={l.id}>
            {l.short}
          </option>
        ))}
      </select>
    </label>
  )
}

export function TopNav({
  route,
  siteName,
  online,
  total,
  settings,
  authed,
}: {
  route: Route
  siteName: string
  online: number
  total: number
  settings: VisitorSettings
  authed: boolean
}) {
  const dark = useDark()
  const active = route.view === 'node' ? null : route.view
  return (
    // Full width like the status bar at the bottom; the contents line up with the page.
    <header className="sticky top-0 z-40 border-b border-line bg-card/85 backdrop-blur">
      <div className="page-w mx-auto flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:h-16 sm:flex-nowrap sm:gap-4 sm:px-6 sm:py-0">
        <Link to="/" className="flex items-center gap-3" title={siteName || 'Atlas'}>
          <Wordmark />
          {siteName && <span className="hidden max-w-40 truncate text-[14px] text-muted lg:inline">{siteName}</span>}
        </Link>
        <LangPicker lang={settings.lang} onChange={settings.setLang} />
        <nav className="order-last flex w-full items-center gap-0.5 rounded-lg border border-line bg-card p-0.5 sm:order-none sm:w-auto">
          {ITEMS.map((it) => {
            const on = active === it.route.view
            return (
              <Link
                key={it.route.view}
                to={href(it.route)}
                aria-current={on ? 'page' : undefined}
                className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-[14px] sm:flex-none ${
                  on ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                }`}
              >
                {it.icon}
                <span className="max-sm:text-[13px] sm:hidden md:inline">{t(it.label)}</span>
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-card px-3 py-1.5 text-[13px] lg:flex">
            <span className="breathe size-2 rounded-full bg-good" />
            <b className="font-mono text-[14px]">{online}</b>
            <span className="text-muted">
              / {total} {t('在線')}
            </span>
          </div>
          <SchemeButton dark={dark} onChange={settings.setScheme} />
          <SettingsMenu s={settings} />
          <FullscreenButton />
          <AdminButton authed={authed} />
        </div>
      </div>
    </header>
  )
}
