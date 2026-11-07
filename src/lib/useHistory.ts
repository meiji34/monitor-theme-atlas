import { useEffect, useMemo, useState } from 'react'
import type { Series } from '../components/Chart'
import { fetchHistory } from './api'
import { SERIES } from './palette'
import type { History, MetricRow } from './types'

export const POINTS = 240

// Rows only exist for buckets that had data; insert nulls where the gap is
// wider than one step so the chart shows the outage instead of bridging it.
function withGaps(rows: MetricRow[], step: number) {
  const out: (MetricRow | null)[] = []
  const ts: number[] = []
  rows.forEach((r, i) => {
    const prev = rows[i - 1]
    if (prev && r.ts - prev.ts > step * 1.5) {
      out.push(null)
      ts.push(prev.ts + step)
    }
    out.push(r)
    ts.push(r.ts)
  })
  return { rows: out, ts }
}

export interface Charts {
  ts: number[]
  pick: (f: (r: MetricRow) => number | undefined) => (number | null)[]
  pingTs: number[]
  ping: Series[]
}

// A node's history for the last `hours`, refreshed every minute for short
// windows, plus the series the charts draw from it.
export function useHistory(id: string, hours: number) {
  const [hist, setHist] = useState<History | null>(null)
  const [err, setErr] = useState<string | null>(null)

  useEffect(() => {
    const ctrl = new AbortController()
    const load = () =>
      fetchHistory(id, hours, POINTS, ctrl.signal).then(
        (h) => {
          setHist(h)
          setErr(null)
        },
        (e) => {
          if (!(e instanceof DOMException)) setErr((e as Error).message)
        },
      )
    setHist(null)
    load()
    const timer = hours <= 24 ? window.setInterval(() => !document.hidden && load(), 60000) : undefined
    return () => {
      ctrl.abort()
      clearInterval(timer)
    }
  }, [id, hours])

  const charts = useMemo<Charts | null>(() => {
    if (!hist) return null
    const { rows, ts } = withGaps(hist.metrics ?? [], hist.step)
    const pick = (f: (r: MetricRow) => number | undefined) => rows.map((r) => (r ? (f(r) ?? null) : null))
    const probes = Object.entries(hist.probes ?? {})
    const pingTs = [...new Set((hist.ping ?? []).map((p) => p.ts))].sort((a, b) => a - b)
    const pingIndex = new Map(pingTs.map((t, i) => [t, i]))
    const ping: Series[] = probes.map(([pid, name], k) => {
      const vals: (number | null)[] = pingTs.map(() => null)
      for (const p of hist.ping ?? []) if (String(p.task_id) === pid) vals[pingIndex.get(p.ts)!] = p.latency
      return { name, color: SERIES[k] ?? '#94a3b8', values: vals }
    })
    return { ts, pick, pingTs, ping }
  }, [hist])

  return { hist, charts, err }
}
