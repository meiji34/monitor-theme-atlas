import { HubError } from './hub-error'
import { fetchKHistory, fetchKMe, fetchKPing, fetchKThemeConfig } from './komari'
import type { History, Me, Node, PingSeries } from './types'

export { HubError }

// Which hub serves the theme: monitor (default) or Komari (npm run pack:komari).
export const KOMARI = import.meta.env.VITE_ATLAS_HUB === 'komari'

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const plain = res.headers.get('content-type')?.startsWith('text/plain')
    const text = plain ? (await res.text()).slice(0, 200) : `HTTP ${res.status}`
    throw new HubError(res.status, text)
  }
  return res.json() as Promise<T>
}

export const fetchMe = (signal?: AbortSignal): Promise<Me> => (KOMARI ? fetchKMe() : getJSON<Me>('/api/me', signal))

// The monitor hub's ids are numbers; the app keys nodes by string (uuids on Komari).
export const withStringIds = (nodes: Node[]) => nodes.map((n) => (typeof n.id === 'string' ? n : { ...n, id: String(n.id) }))

export async function fetchNodes(signal?: AbortSignal): Promise<Node[]> {
  const body = await getJSON<{ nodes?: Node[] }>('/api/nodes', signal)
  return Array.isArray(body.nodes) ? withStringIds(body.nodes) : []
}

export const fetchPing = (id: string, hours: number, signal?: AbortSignal): Promise<PingSeries> =>
  KOMARI ? fetchKPing(id, hours, signal) : getJSON<PingSeries>(`/api/nodes/${id}/metrics?hours=${hours}&points=60&series=ping`, signal)

export const fetchHistory = (id: string, hours: number, points: number, signal?: AbortSignal): Promise<History> =>
  KOMARI ? fetchKHistory(id, hours, points, signal) : getJSON<History>(`/api/nodes/${id}/metrics?hours=${hours}&points=${points}`, signal)

// Only the values the owner changed come back; failures mean "use defaults".
export async function fetchThemeConfig(short: string): Promise<Record<string, unknown>> {
  try {
    if (KOMARI) return await fetchKThemeConfig()
    return await getJSON<Record<string, unknown>>(`/api/themes/${short}/config`)
  } catch {
    return {}
  }
}
