import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { t } from './i18n'
import { setLiveRoutes, type Route } from './routes'

// Live routes from the relay next to the hub (relay/): routes traced from the
// source node to every other node, refreshed daily and on request. Laid over
// the bundled snapshot; without a relay the snapshot is all there is.

const BASE = '/atlas-media'
interface Live {
  enabled: boolean
  source: string
  routes: Route[]
  asns: Record<string, string>
  pending: string[]
  traceable: string[]
  sourceAlive: boolean
  cooldown: number
}

export interface RoutesCtx {
  version: number // bumps when the route data changes
  pending: (id: number) => boolean
  canTrace: (id: number) => boolean
  trace: (id: number) => Promise<string | null> // error message, or null once queued
}

export const RoutesContext = createContext<RoutesCtx>({
  version: 0,
  pending: () => false,
  canTrace: () => false,
  trace: async () => t('無法連線到檢測服務'),
})
export const useRoutesLive = () => useContext(RoutesContext)

async function fetchLive(): Promise<Live | null> {
  try {
    const res = await fetch(`${BASE}/routes`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    const j = await res.json()
    return j && j.enabled && Array.isArray(j.routes) ? (j as Live) : null
  } catch {
    return null
  }
}

export function useRoutesProvider(authed: boolean): RoutesCtx {
  const [live, setLive] = useState<Live | null>(null)
  const [version, setVersion] = useState(0)
  const [kick, setKick] = useState(0)
  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    let last = ''
    const poll = async () => {
      const next = await fetchLive()
      if (stopped) return
      const sig = JSON.stringify(next?.routes.map((r) => r.traced) ?? [])
      if (sig !== last) {
        last = sig
        setLiveRoutes(next)
        setVersion((v) => v + 1)
      }
      setLive(next)
      // Quick polls while a trace is running, slow ones otherwise.
      timer = window.setTimeout(poll, next?.pending.length ? 5000 : 120_000)
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [kick])
  const refresh = useCallback(() => setKick((k) => k + 1), [])

  return useMemo<RoutesCtx>(
    () => ({
      version,
      pending: (id) => !!live?.pending.includes(String(id)),
      canTrace: (id) => authed && !!live?.sourceAlive && !!live.traceable.includes(String(id)),
      trace: async (id) => {
        try {
          const res = await fetch(`${BASE}/trace/${id}`, { method: 'POST', headers: { 'X-Atlas': '1' } })
          if (res.status === 202) {
            refresh()
            return null
          }
          if (res.status === 401) return t('請先登入後台')
          if (res.status === 409) return t('沒有可以發起追蹤的節點')
          if (res.status === 429) {
            const retry = Number((await res.json().catch(() => ({})))?.retry ?? 0)
            return t('剛追蹤過，請 {n} 分鐘後再試', { n: Math.max(1, Math.ceil(retry / 60)) })
          }
          return t('路由追蹤請求失敗（{status}）', { status: res.status })
        } catch {
          return t('無法連線到檢測服務')
        }
      },
    }),
    [live, authed, version, refresh],
  )
}
