import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { t } from './i18n'
import { MEDIA, mediaFor, type MediaData } from './media'

// Live streaming-check results from the relay next to the hub (relay/), with
// the bundled snapshot as the fallback. A logged-in admin can ask for a check;
// the node picks the request up within a minute and reports back.

const BASE = '/atlas-media'
type NodeMedia = MediaData['nodes'][string]
interface Live {
  nodes: Record<string, NodeMedia>
  pending: string[]
  known: string[]
  agents?: string[] // nodes whose agent polled lately (older relays: absent)
  cooldown: number
}

export interface MediaCtx {
  // Any results to show at all: a bundled snapshot, or a relay answering.
  available: boolean
  get: (id: number) => NodeMedia | null
  pending: (id: number) => boolean
  canCheck: (id: number) => boolean
  // Resolves to an error message, or null once the request is queued.
  check: (id: number) => Promise<string | null>
}

export const MediaContext = createContext<MediaCtx>({
  available: MEDIA !== null,
  get: mediaFor,
  pending: () => false,
  canCheck: () => false,
  check: async () => t('無法連線到檢測服務'),
})
export const useMedia = () => useContext(MediaContext)

async function fetchLive(): Promise<Live | null> {
  try {
    const res = await fetch(`${BASE}/results`, { cache: 'no-store', headers: { Accept: 'application/json' } })
    if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
    const j = await res.json()
    return j && typeof j === 'object' && j.nodes && Array.isArray(j.known) ? (j as Live) : null
  } catch {
    return null
  }
}

export function useMediaProvider(authed: boolean): MediaCtx {
  const [live, setLive] = useState<Live | null>(null)
  // Bumped to poll right away (after asking for a check).
  const [kick, setKick] = useState(0)
  useEffect(() => {
    let stopped = false
    let timer: number | undefined
    const poll = async () => {
      const next = await fetchLive()
      if (stopped) return
      setLive(next)
      // Quick polls while a node is working on a check, slow ones otherwise.
      timer = window.setTimeout(poll, next?.pending.length ? 5000 : 60_000)
    }
    void poll()
    return () => {
      stopped = true
      window.clearTimeout(timer)
    }
  }, [kick])
  const refresh = useCallback(() => setKick((k) => k + 1), [])

  return useMemo<MediaCtx>(
    () => ({
      available: MEDIA !== null || live !== null,
      get: (id) => live?.nodes[id] ?? mediaFor(id),
      pending: (id) => !!live?.pending.includes(String(id)),
      canCheck: (id) => authed && !!(live?.agents ?? live?.known)?.includes(String(id)),
      check: async (id) => {
        try {
          const res = await fetch(`${BASE}/check/${id}`, { method: 'POST', headers: { 'X-Atlas': '1' } })
          if (res.status === 202) {
            refresh()
            return null
          }
          if (res.status === 401) return t('請先登入後台')
          if (res.status === 409) return t('這台節點沒有在執行檢測程式（未安裝或離線）')
          if (res.status === 429) {
            const retry = Number((await res.json().catch(() => ({})))?.retry ?? 0)
            return t('剛檢測過，請 {n} 分鐘後再試', { n: Math.max(1, Math.ceil(retry / 60)) })
          }
          return t('檢測請求失敗（{status}）', { status: res.status })
        } catch {
          return t('無法連線到檢測服務')
        }
      },
    }),
    [live, authed, refresh],
  )
}
