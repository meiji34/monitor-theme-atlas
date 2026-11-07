// Shapes returned by the hub. Keys can be absent on older hubs or for
// anonymous visitors, so everything beyond id/name/online is optional.

export interface Metrics {
  cpu?: number
  mem_used?: number
  mem_total?: number
  swap_used?: number
  swap_total?: number
  disk_used?: number
  disk_total?: number
  net_rx?: number
  net_tx?: number
  total_rx?: number
  total_tx?: number
  month_rx?: number
  month_tx?: number
  load?: number[]
  uptime?: number
  tcp?: number
  udp?: number
  procs?: number
}

export interface Node {
  id: string
  name: string
  online: boolean
  metrics: Metrics | null
  country?: string
  group?: string
  public_remark?: string
  os?: string
  kernel?: string
  arch?: string
  virt?: string
  cpu_name?: string
  cpu_cores?: number
  mem_total?: number
  disk_total?: number
  agent_version?: string
  expires_in?: number | null
  last_seen_ago?: number | null
  price?: number
  currency?: string
  billing_cycle?: string
  traffic_limit?: number
  traffic_mode?: string
  month_used?: number
  total_rx?: number
  total_tx?: number
  day_rx?: number
  day_tx?: number
  sort?: number
}

export interface Me {
  authed?: boolean
  site_name?: string
  history_days?: number
  public_page?: boolean
}

export interface PingRow {
  task_id: number
  ts: number
  latency: number | null
  loss?: number
}

// One bucket of history. Values are averages over the bucket except the
// *_max fields; `minutes` says how many minutes actually reported.
export interface MetricRow {
  ts: number
  minutes?: number
  cpu?: number
  cpu_max?: number
  mem_used?: number
  swap_used?: number
  disk_used?: number
  net_rx?: number
  net_tx?: number
  net_rx_max?: number
  net_tx_max?: number
  tcp?: number
  udp?: number
  procs?: number
}

export interface History {
  step: number
  probes?: Record<string, string>
  loss?: Record<string, number>
  metrics?: MetricRow[]
  ping?: PingRow[]
}

export interface PingSeries {
  step: number
  probes: Record<string, string>
  loss?: Record<string, number>
  ping: PingRow[]
}
