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

// The node dialog lives in the URL hash (#node=<id>) on whatever page opened
// it, as its own history entry: Back closes it, a reload or a shared link
// reopens it.
const DIALOG = 'atlas:dialog'
const dialogFromHash = () => {
  const m = /^#node=([\w-]+)$/.exec(location.hash)
  return m ? m[1] : null
}

export function openNode(id: string) {
  history.pushState({ atlasDialog: true }, '', `${location.pathname}${location.search}#node=${id}`)
  window.dispatchEvent(new Event(DIALOG))
}

export function closeNode() {
  if ((history.state as { atlasDialog?: boolean } | null)?.atlasDialog) history.back()
  else {
    history.replaceState(null, '', `${location.pathname}${location.search}`)
    window.dispatchEvent(new Event(DIALOG))
  }
}

export function useDialogNode(): string | null {
  const [id, setId] = useState(dialogFromHash)
  useEffect(() => {
    const sync = () => setId(dialogFromHash())
    for (const e of ['popstate', 'hashchange', DIALOG, EVENT]) window.addEventListener(e, sync)
    return () => {
      for (const e of ['popstate', 'hashchange', DIALOG, EVENT]) window.removeEventListener(e, sync)
    }
  }, [])
  return id
}

// A node's name as a link: a plain click opens the dialog, a middle-click or
// ctrl-click opens the full page in a new tab.
export function NodeLink({ id, className, children, title }: { id: string; className?: string; children: React.ReactNode; title?: string }) {
  return (
    <a
      href={`/node/${id}`}
      title={title}
      className={className}
      onClick={(e) => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return
        e.preventDefault()
        openNode(id)
      }}
    >
      {children}
    </a>
  )
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
