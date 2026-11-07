// Komari (github.com/komari-monitor/komari) as a data source: its public API
// translated into the shapes the theme was written against (lib/types.ts).
// Only used in builds made with VITE_ATLAS_HUB=komari (npm run pack:komari).
import { HubError } from './hub-error'
import type { History, Me, Metrics, MetricRow, Node, PingRow, PingSeries } from './types'

type Wrapped<T> = { status?: string; message?: string; data: T }

async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, { signal, headers: { Accept: 'application/json' }, credentials: 'same-origin' })
  if (!res.ok) throw new HubError(res.status, `HTTP ${res.status}`)
  const body = (await res.json()) as Wrapped<T> | T
  return body && typeof body === 'object' && 'data' in body && ('status' in body || 'message' in body)
    ? (body as Wrapped<T>).data
    : (body as T)
}

// ---- static node info -------------------------------------------------------

export interface KNode {
  uuid: string
  name: string
  cpu_name?: string
  virtualization?: string
  arch?: string
  cpu_cores?: number
  os?: string
  kernel_version?: string
  region?: string // a flag emoji
  mem_total?: number
  swap_total?: number
  disk_total?: number
  weight?: number
  price?: number
  billing_cycle?: number // days
  currency?: string
  expired_at?: string | null
  group?: string
  tags?: string
  public_remark?: string
  hidden?: boolean
  traffic_limit?: number
  traffic_limit_type?: string // sum | max | min | up | down
  version?: string
}

// 🇦🇺 -> AU (two regional-indicator symbols).
export function flagToCode(flag: string | undefined): string | undefined {
  if (!flag) return undefined
  const cps = [...flag].map((c) => c.codePointAt(0)! - 0x1f1e6)
  if (cps.length !== 2 || cps.some((c) => c < 0 || c > 25)) return undefined
  return String.fromCharCode(65 + cps[0], 65 + cps[1])
}

const CYCLES: Record<number, string> = { 30: 'monthly', 31: 'monthly', 90: 'quarterly', 92: 'quarterly', 180: 'semiannually', 182: 'semiannually', 183: 'semiannually', 365: 'yearly', 366: 'yearly', 730: 'biennially', 1095: 'triennially' }

function expiresIn(at: string | null | undefined): number | null {
  if (!at) return null
  const t = Date.parse(at)
  // Komari stores "no expiry" as the zero time or a date centuries away.
  if (!Number.isFinite(t) || t < Date.UTC(2000, 0, 1) || t > Date.UTC(2150, 0, 1)) return null
  return Math.floor((t - Date.now()) / 86_400_000)
}

function staticNode(k: KNode): Node {
  return {
    id: k.uuid,
    name: k.name,
    online: false,
    metrics: null,
    country: flagToCode(k.region),
    group: k.group || undefined,
    public_remark: k.public_remark || undefined,
    os: k.os,
    kernel: k.kernel_version,
    arch: k.arch,
    virt: k.virtualization,
    cpu_name: k.cpu_name,
    cpu_cores: k.cpu_cores,
    mem_total: k.mem_total,
    disk_total: k.disk_total,
    agent_version: k.version,
    expires_in: expiresIn(k.expired_at),
    price: k.price && k.price > 0 ? k.price : undefined,
    currency: k.currency,
    billing_cycle: k.billing_cycle ? (CYCLES[k.billing_cycle] ?? `${k.billing_cycle}d`) : undefined,
    traffic_limit: k.traffic_limit || undefined,
    traffic_mode: k.traffic_limit_type,
    sort: k.weight ?? 0,
  }
}

export async function fetchKNodes(signal?: AbortSignal): Promise<KNode[]> {
  const list = await get<KNode[]>('/api/nodes', signal)
  return Array.isArray(list) ? list.filter((n) => !n.hidden) : []
}

// ---- live status (JSON-RPC common:getNodesLatestStatus) ------------------------
// What Komari's own theme polls every 2 s; plain POSTs, so no WebSocket origin rules.

export interface KStatus {
  time?: string
  online?: boolean
  cpu?: number
  ram?: number
  ram_total?: number
  swap?: number
  swap_total?: number
  disk?: number
  disk_total?: number
  load?: number
  load5?: number
  load15?: number
  net_in?: number
  net_out?: number
  net_total_up?: number
  net_total_down?: number
  process?: number
  connections?: number // TCP + UDP
  connections_udp?: number
  uptime?: number
}

let rpcId = 0
export async function fetchKStatus(signal?: AbortSignal): Promise<Record<string, KStatus>> {
  const res = await fetch('/api/rpc2', {
    method: 'POST',
    signal,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', method: 'common:getNodesLatestStatus', params: {}, id: ++rpcId }),
  })
  if (!res.ok) throw new HubError(res.status, `HTTP ${res.status}`)
  const body = (await res.json()) as { result?: Record<string, KStatus>; error?: { message?: string } }
  if (body.error) throw new HubError(500, body.error.message ?? 'RPC error')
  return body.result ?? {}
}

function usedFor(mode: string | undefined, up: number, down: number) {
  switch (mode) {
    case 'up':
      return up
    case 'down':
      return down
    case 'max':
      return Math.max(up, down)
    case 'min':
      return Math.min(up, down)
    default:
      return up + down
  }
}

export function mergeLive(statics: KNode[], live: Record<string, KStatus> | null): Node[] {
  return statics.map((k) => {
    const n = staticNode(k)
    const s = live?.[k.uuid]
    n.online = !!s?.online
    if (s) {
      const up = s.net_total_up ?? 0
      const down = s.net_total_down ?? 0
      const udp = s.connections_udp ?? 0
      const m: Metrics = {
        cpu: s.cpu,
        mem_used: s.ram,
        mem_total: s.ram_total || k.mem_total,
        swap_used: s.swap,
        swap_total: s.swap_total || k.swap_total,
        disk_used: s.disk,
        disk_total: s.disk_total || k.disk_total,
        net_rx: s.net_in,
        net_tx: s.net_out,
        total_rx: down,
        total_tx: up,
        load: [s.load ?? 0, s.load5 ?? 0, s.load15 ?? 0],
        uptime: s.uptime,
        tcp: s.connections !== undefined ? Math.max(0, s.connections - udp) : undefined,
        udp,
        procs: s.process,
      }
      n.metrics = n.online ? m : null
      // Komari counts traffic since its own reset point; shown where monitor shows the month.
      n.month_used = usedFor(k.traffic_limit_type, up, down)
      n.total_rx = down
      n.total_tx = up
      if (!n.online && s.time) {
        const ago = (Date.now() - Date.parse(s.time)) / 1000
        n.last_seen_ago = Number.isFinite(ago) && ago > 0 ? Math.round(ago) : null
      }
    }
    return n
  })
}

// ---- site, login, settings -----------------------------------------------------

interface KPublic {
  sitename?: string
  record_preserve_time?: number // hours
  ping_record_preserve_time?: number // hours
  theme?: string
  theme_settings?: Record<string, unknown>
}
let publicInfo: Promise<KPublic> | null = null
const fetchPublic = () => (publicInfo ??= get<KPublic>('/api/public').catch(() => ({}) as KPublic))

export async function fetchKMe(): Promise<Me> {
  const [me, pub] = await Promise.all([
    get<{ logged_in?: boolean }>('/api/me').catch(() => ({ logged_in: false })),
    fetchPublic(),
  ])
  return {
    authed: !!me.logged_in,
    site_name: pub.sitename,
    history_days: Math.max(1, Math.floor((pub.record_preserve_time ?? 24) / 24)),
  }
}

export async function fetchKThemeConfig(): Promise<Record<string, unknown>> {
  const pub = await fetchPublic()
  return pub.theme_settings && typeof pub.theme_settings === 'object' ? pub.theme_settings : {}
}

// ---- history ---------------------------------------------------------------------

interface KLoad {
  time: string
  cpu?: number
  load?: number
  ram?: number
  swap?: number
  disk?: number
  net_in?: number
  net_out?: number
  process?: number
  connections?: number
  connections_udp?: number
}
interface KPing {
  task_id: number
  time: string
  value: number // ms, -1 (or 0) when lost
}
interface KTask {
  id: number
  name: string
  loss?: number
}

const secs = (iso: string) => Math.floor(Date.parse(iso) / 1000)

// Average rows into `points` buckets of whole minutes.
function bucket(rows: KLoad[], hours: number, points: number): { step: number; rows: MetricRow[] } {
  const step = Math.max(60, Math.ceil((hours * 3600) / points / 60) * 60)
  const groups = new Map<number, KLoad[]>()
  for (const r of rows) {
    const ts = secs(r.time)
    if (!Number.isFinite(ts)) continue
    const key = Math.floor(ts / step) * step
    ;(groups.get(key) ?? groups.set(key, []).get(key)!).push(r)
  }
  const avg = (g: KLoad[], f: (r: KLoad) => number | undefined) => {
    const v = g.map(f).filter((x): x is number => typeof x === 'number')
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : undefined
  }
  const max = (g: KLoad[], f: (r: KLoad) => number | undefined) => {
    const v = g.map(f).filter((x): x is number => typeof x === 'number')
    return v.length ? Math.max(...v) : undefined
  }
  const out = [...groups.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([ts, g]) => ({
      ts,
      minutes: g.length,
      cpu: avg(g, (r) => r.cpu),
      cpu_max: max(g, (r) => r.cpu),
      load: avg(g, (r) => r.load),
      mem_used: avg(g, (r) => r.ram),
      swap_used: avg(g, (r) => r.swap),
      disk_used: avg(g, (r) => r.disk),
      net_rx: avg(g, (r) => r.net_in),
      net_tx: avg(g, (r) => r.net_out),
      net_rx_max: max(g, (r) => r.net_in),
      net_tx_max: max(g, (r) => r.net_out),
      tcp: avg(g, (r) => (r.connections === undefined ? undefined : Math.max(0, r.connections - (r.connections_udp ?? 0)))),
      udp: avg(g, (r) => r.connections_udp),
      procs: avg(g, (r) => r.process),
    }))
  return { step, rows: out }
}

async function pingSeries(id: string, hours: number, points: number, signal?: AbortSignal): Promise<PingSeries> {
  const d = await get<{ records?: KPing[]; tasks?: KTask[] }>(
    `/api/records/ping?uuid=${encodeURIComponent(id)}&hours=${hours}`,
    signal,
  )
  const tasks = d.tasks ?? []
  const step = Math.max(60, Math.ceil((hours * 3600) / points / 60) * 60)
  // Per task and bucket: mean of the answered probes, loss share of all probes.
  const acc = new Map<string, { task: number; ts: number; sum: number; ok: number; all: number }>()
  for (const r of d.records ?? []) {
    const ts = Math.floor(secs(r.time) / step) * step
    if (!Number.isFinite(ts)) continue
    const key = `${r.task_id}:${ts}`
    const a = acc.get(key) ?? { task: r.task_id, ts, sum: 0, ok: 0, all: 0 }
    a.all++
    if (r.value > 0) {
      a.sum += r.value
      a.ok++
    }
    acc.set(key, a)
  }
  const ping: PingRow[] = [...acc.values()]
    .sort((a, b) => a.ts - b.ts)
    .map((a) => ({ task_id: a.task, ts: a.ts, latency: a.ok ? a.sum / a.ok : null, loss: ((a.all - a.ok) / a.all) * 100 }))
  return {
    step,
    probes: Object.fromEntries(tasks.map((t) => [String(t.id), t.name])),
    loss: Object.fromEntries(tasks.map((t) => [String(t.id), t.loss ?? 0])),
    ping,
  }
}

export const fetchKPing = (id: string, hours: number, signal?: AbortSignal) => pingSeries(id, hours, 60, signal)

export async function fetchKHistory(id: string, hours: number, points: number, signal?: AbortSignal): Promise<History> {
  const [load, ping] = await Promise.all([
    get<{ records?: KLoad[] }>(`/api/records/load?uuid=${encodeURIComponent(id)}&hours=${hours}`, signal),
    pingSeries(id, hours, points, signal).catch(() => null),
  ])
  const { step, rows } = bucket(load.records ?? [], hours, points)
  return { step, metrics: rows, probes: ping?.probes, loss: ping?.loss, ping: ping?.ping }
}
