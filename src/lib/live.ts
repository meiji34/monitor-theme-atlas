import { useEffect, useRef, useState } from 'react'
import { fetchNodes, fetchPing } from './api'
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
  return Array.isArray(parsed.nodes) ? (parsed.nodes as Node[]) : null
}

export type LiveState = { nodes: Node[]; loaded: boolean; error: string | null; mode: 'ws' | 'poll' | 'idle' }

// Live node list: WebSocket first, polling while the socket is unavailable
// (the hub turns anonymous sockets away with 503 past its cap). Everything
// stops while the tab is hidden and resumes with a fresh fetch.
export function useLiveNodes(): LiveState {
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
export function usePingSeries(ids: number[]): Record<number, PingSeries> {
  const [data, setData] = useState<Record<number, PingSeries>>({})
  const key = ids.join(',')

  useEffect(() => {
    const list = key ? key.split(',').map(Number) : []
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
