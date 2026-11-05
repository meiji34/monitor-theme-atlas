import { href, Link, type Route } from '../lib/router'
import { AdminButton, FullscreenButton, SettingsMenu, type VisitorSettings } from './Settings'

const ITEMS: { route: Route; label: string; icon: React.ReactNode }[] = [
  {
    route: { view: 'overview' },
    label: '總覽',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
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
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
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
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M2 3.5h12M2 8h12M2 12.5h12" />
      </svg>
    ),
  },
  {
    route: { view: 'latency' },
    label: '延遲',
    icon: (
      <svg viewBox="0 0 16 16" className="size-3.5" fill="none" stroke="currentColor" strokeWidth="1.4">
        <path d="M1.5 9.5h2.5l2-5 3 8 2-4.5h3.5" strokeLinejoin="round" />
      </svg>
    ),
  },
]

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
  const active = route.view === 'node' ? null : route.view
  return (
    // Full width like the status bar at the bottom; the contents line up with the page.
    <header className="sticky top-0 z-40 border-b border-line bg-white/85 backdrop-blur">
      <div className="page-w mx-auto flex h-14 items-center gap-4 px-4 sm:px-6">
        <Link to="/" className="flex items-center gap-2.5">
          <img src="/favicon.svg" alt="" className="size-7" />
          <span className="text-[15px] font-bold tracking-tight">{siteName}</span>
        </Link>
        <nav className="flex items-center gap-0.5 rounded-lg border border-line bg-white p-0.5 shadow-sm">
          {ITEMS.map((it) => {
            const on = active === it.route.view
            return (
              <Link
                key={it.route.view}
                to={href(it.route)}
                className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[13px] ${
                  on ? 'bg-primary-soft font-medium text-primary' : 'text-muted hover:text-fg'
                }`}
              >
                {it.icon}
                <span className="hidden sm:inline">{it.label}</span>
              </Link>
            )
          })}
        </nav>
        <div className="ml-auto flex items-center gap-2">
          <div className="hidden items-center gap-2 rounded-full border border-line bg-white px-3 py-1.5 text-[12px] shadow-sm md:flex">
            <span className="breathe size-2 rounded-full bg-good" />
            <b className="font-mono">{online}</b>
            <span className="text-muted">/ {total} 在線</span>
          </div>
          <SettingsMenu s={settings} />
          <FullscreenButton />
          <AdminButton authed={authed} />
        </div>
      </div>
    </header>
  )
}
