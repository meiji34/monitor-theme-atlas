import { useEffect, useState } from 'react'

// A tiny history-API router. The hub serves dist/index.html for any path it
// doesn't own, so /cards, /node/3 etc. survive a reload.
export type Route =
  | { view: 'overview' }
  | { view: 'cards' }
  | { view: 'table' }
  | { view: 'latency' }
  | { view: 'node'; id: string }

export function parse(path: string): Route {
  // /node/<id> on monitor, /instance/<uuid> on Komari (its own theme's links).
  const node = /^\/(?:node|instance)\/([\w-]+)\/?$/.exec(path)
  if (node) return { view: 'node', id: node[1] }
  if (path.startsWith('/cards')) return { view: 'cards' }
  if (path.startsWith('/table')) return { view: 'table' }
  if (path.startsWith('/latency')) return { view: 'latency' }
  return { view: 'overview' }
}

export const href = (r: Route) =>
  r.view === 'overview' ? '/' : r.view === 'node' ? `/node/${r.id}` : `/${r.view}`

const EVENT = 'atlas:navigate'

export function navigate(to: string) {
  if (to === location.pathname) return
  history.pushState(null, '', to)
  window.dispatchEvent(new Event(EVENT))
  window.scrollTo({ top: 0 })
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parse(location.pathname))
  useEffect(() => {
    const sync = () => setRoute(parse(location.pathname))
    window.addEventListener('popstate', sync)
    window.addEventListener(EVENT, sync)
    return () => {
      window.removeEventListener('popstate', sync)
      window.removeEventListener(EVENT, sync)
    }
  }, [])
  return route
}

// Plain <a> so middle-click / open-in-new-tab keep working; ordinary clicks
// stay inside the app.
export function Link({ to, className, children, title }: { to: string; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <a
      href={to}
      title={title}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        navigate(to)
      }}
    >
      {children}
    </a>
  )
}
