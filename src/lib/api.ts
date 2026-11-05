import type { History, Me, Node, PingSeries } from './types'

// Errors with a text/plain body come from the hub and are safe to show;
// anything else came from a proxy or CDN in front of it.
export class HubError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function getJSON<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' } })
  if (!res.ok) {
    const plain = res.headers.get('content-type')?.startsWith('text/plain')
    const text = plain ? (await res.text()).slice(0, 200) : `HTTP ${res.status}`
    throw new HubError(res.status, text)
  }
  return res.json() as Promise<T>
}

export const fetchMe = (signal?: AbortSignal) => getJSON<Me>('/api/me', signal)

export async function fetchNodes(signal?: AbortSignal): Promise<Node[]> {
  const body = await getJSON<{ nodes?: Node[] }>('/api/nodes', signal)
  return Array.isArray(body.nodes) ? body.nodes : []
}

export const fetchPing = (id: number, hours: number, signal?: AbortSignal) =>
  getJSON<PingSeries>(`/api/nodes/${id}/metrics?hours=${hours}&points=60&series=ping`, signal)

export const fetchHistory = (id: number, hours: number, points: number, signal?: AbortSignal) =>
  getJSON<History>(`/api/nodes/${id}/metrics?hours=${hours}&points=${points}`, signal)

// Only the values the owner changed come back; failures mean "use defaults".
export async function fetchThemeConfig(short: string): Promise<Record<string, unknown>> {
  try {
    return await getJSON<Record<string, unknown>>(`/api/themes/${short}/config`)
  } catch {
    return {}
  }
}
