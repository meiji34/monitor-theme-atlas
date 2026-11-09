import type { Node } from './types'

// What the fleet costs a year, in one currency. Each node's price is scaled
// from its billing cycle to twelve months, then converted with the owner's
// rates from the theme settings; nothing is fetched from outside.

const MONTHS: Record<string, number> = {
  monthly: 1,
  quarterly: 3,
  semiannual: 6,
  yearly: 12,
  biennial: 24,
  triennial: 36,
}

// Komari stores a symbol rather than a code.
const SYMBOLS: Record<string, string> = { $: 'USD', '¥': 'CNY', '￥': 'CNY', '€': 'EUR', '£': 'GBP', '₩': 'KRW', '₹': 'INR' }

export function currencyCode(c: string | undefined): string {
  const s = (c ?? '').trim()
  return SYMBOLS[s] ?? s.toUpperCase()
}

// How many times a year a cycle is paid; 0 for one-off or unknown cycles,
// which have no yearly cost to add.
export function perYear(cycle: string | undefined): number {
  if (!cycle) return 0
  if (MONTHS[cycle]) return 12 / MONTHS[cycle]
  const m = /^(\d+)m$/.exec(cycle)
  if (m && Number(m[1]) > 0) return 12 / Number(m[1])
  const d = /^(\d+)d$/.exec(cycle) // Komari: cycle length in days
  if (d && Number(d[1]) > 0) return 365 / Number(d[1])
  return 0
}

// "CNY = 0.14" per line: one unit of that currency in the display currency.
export function parseRates(text: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const [code, rate] = line.split(/[=:\s]+/).filter(Boolean)
    const r = Number(rate)
    if (code && Number.isFinite(r) && r > 0) out[currencyCode(code)] = r
  }
  return out
}

export interface FleetValue {
  amount: number // per year, in `currency`
  currency: string
  priced: number // nodes counted
  missing: string[] // currencies left out for want of a rate
}

export function fleetValue(nodes: Node[], currency: string, rates: Record<string, number>): FleetValue {
  const target = currencyCode(currency) || 'USD'
  let amount = 0
  let priced = 0
  const missing = new Set<string>()
  for (const n of nodes) {
    const times = perYear(n.billing_cycle)
    if (!n.price || n.price <= 0 || !times) continue
    const from = currencyCode(n.currency) || target
    const rate = from === target ? 1 : rates[from]
    if (!rate) {
      missing.add(from)
      continue
    }
    amount += n.price * times * rate
    priced++
  }
  return { amount, currency: target, priced, missing: [...missing].sort() }
}
