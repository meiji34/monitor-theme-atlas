import { useEffect, useRef, useState } from 'react'
import { fetchNodes, fetchPing, KOMARI, withStringIds } from './api'
import { fetchKNodes, fetchKStatus, mergeLive, type KNode, type KStatus } from './komari'
import type { Node, PingSeries } from './types'

const POLL_MS = 5000
const STALL_MS = 15000
const WS_RETRY_MS = 30000

async function decodeFrame(data: unknown): Promise<Node[] | null> {
  let text: string
  if (typeof data === 'string') {
    text = data
  } else if (data instanceof Blob) {
    // ?gzip frames arrive as binary; admin frames and old hubs send text.
    const stream = data.stream().pipeThrough(new DecompressionStream('gzip'))
    text = await new Response(stream).text()
  } else {
    return null
  }
  const parsed = JSON.parse(text) as { nodes?: unknown }
  return Array.isArray(parsed.nodes) ? withStringIds(parsed.nodes as Node[]) : null
}

export type LiveState = { nodes: Node[]; loaded: boolean; error: string | null; mode: 'ws' | 'poll' | 'idle' }

// Live node list: WebSocket first, polling while the socket is unavailable
// (the hub turns anonymous sockets away with 503 past its cap). Everything
// stops while the tab is hidden and resumes with a fresh fetch.
export function useLiveNodes(): LiveState {
  return KOMARI ? useKomariNodes() : useMonitorNodes()
}

// Komari: node info once a minute, live status every few seconds, both paused
// while the tab is hidden.
const K_STATUS_MS = 3000
const K_NODES_MS = 60000
function useKomariNodes(): LiveState {
  const [state, setState] = useState<LiveState>({ nodes: [], loaded: false, error: null, mode: 'idle' })
  useEffect(() => {
    let statics: KNode[] | null = null
    let status: Record<string, KStatus> | null = null
    let lastNodes = 0
    let timer: number | undefined
    let stopped = false
    let abort: AbortController | null = null
    const tick = async () => {
      if (stopped) return
      abort = new AbortController()
      try {
        const now = Date.now()
        const [s, n] = await Promise.all([
          fetchKStatus(abort.signal),
          !statics || now - lastNodes > K_NODES_MS ? fetchKNodes(abort.signal) : Promise.resolve(statics),
        ])
        if (n !== statics) lastNodes = now
        statics = n
        status = s
        // Polling is how Komari is meant to be read, so it counts as connected.
        if (!stopped) setState({ nodes: mergeLive(statics, status), loaded: true, error: null, mode: 'ws' })
      } catch (e) {
        if (!stopped && !(e instanceof DOMException))
          setState((st) => ({ ...st, loaded: true, error: (e as Error).message }))
      }
      if (!stopped && !document.hidden) timer = window.setTimeout(tick, K_STATUS_MS)
    }
    const onVisibility = () => {
      clearTimeout(timer)
      abort?.abort()
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    tick()
    return () => {
      stopped = true
      clearTimeout(timer)
      abort?.abort()
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])
  return state
}

function useMonitorNodes(): LiveState {
  const [state, setState] = useState<LiveState>({ nodes: [], loaded: false, error: null, mode: 'idle' })
  const gen = useRef(0)

  useEffect(() => {
    let ws: WebSocket | null = null
    let poll: number | undefined
    let stall: number | undefined
    let retry: number | undefined
    let abort: AbortController | null = null

    const stop = () => {
      gen.current++
      ws?.close()
      ws = null
      abort?.abort()
      clearInterval(poll)
      clearTimeout(stall)
      clearTimeout(retry)
      poll = stall = retry = undefined
    }

    const apply = (nodes: Node[], mode: LiveState['mode']) =>
      setState({ nodes, loaded: true, error: null, mode })

    const pollOnce = async (g: number) => {
      abort = new AbortController()
      try {
        const nodes = await fetchNodes(abort.signal)
        if (g === gen.current) apply(nodes, ws ? 'ws' : 'poll')
      } catch (e) {
        if (g === gen.current && !(e instanceof DOMException))
          setState((s) => ({ ...s, loaded: true, error: (e as Error).message }))
      }
    }

    const startPolling = (g: number) => {
      if (poll !== undefined) return
      poll = window.setInterval(() => pollOnce(g), POLL_MS)
      retry = window.setTimeout(() => {
        if (g === gen.current) openSocket(g)
      }, WS_RETRY_MS)
    }

    const openSocket = (g: number) => {
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
      const sock = new WebSocket(`${proto}//${location.host}/api/ws?gzip`)
      ws = sock
      let chain = Promise.resolve()
      const armStall = () => {
        clearTimeout(stall)
        stall = window.setTimeout(() => sock.close(), STALL_MS)
      }
      sock.onopen = () => {
        clearInterval(poll)
        clearTimeout(retry)
        poll = retry = undefined
        armStall()
      }
      sock.onmessage = (ev) => {
        // Decoding is async; chain frames so a slow one can't overwrite a newer one.
        chain = chain.then(async () => {
          try {
            const nodes = await decodeFrame(ev.data)
            if (nodes && g === gen.current) {
              armStall()
              apply(nodes, 'ws')
            }
          } catch {
            /* a bad frame only skips this tick */
          }
        })
      }
      sock.onclose = () => {
        if (ws === sock) ws = null
        if (g === gen.current) startPolling(g)
      }
    }

    const start = () => {
      stop()
      const g = gen.current
      pollOnce(g)
      openSocket(g)
    }

    const onVisibility = () => (document.hidden ? stop() : start())
    document.addEventListener('visibilitychange', onVisibility)
    start()
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      stop()
    }
  }, [])

  return state
}

// Recent ping rows per node, refreshed every minute and staggered so a page
// with many nodes doesn't trip the hub's history rate limit.
export function usePingSeries(ids: string[]): Record<string, PingSeries> {
  const [data, setData] = useState<Record<string, PingSeries>>({})
  const key = ids.join(',')

  useEffect(() => {
    const list = key ? key.split(",") : []
    let cancelled = false
    const timers: number[] = []
    const load = () => {
      if (document.hidden) return
      list.forEach((id, i) => {
        timers.push(
          window.setTimeout(async () => {
            try {
              const s = await fetchPing(id, 1)
              if (!cancelled) setData((d) => ({ ...d, [id]: s }))
            } catch {
              /* keep the previous series */
            }
          }, i * 300),
        )
      })
    }
    load()
    const every = window.setInterval(load, 60000)
    return () => {
      cancelled = true
      clearInterval(every)
      timers.forEach(clearTimeout)
    }
  }, [key])

  return data
}
