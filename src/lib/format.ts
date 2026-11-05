const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB']

export function bytes(n: number | undefined | null, digits = 2): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '-'
  let v = Math.max(0, n)
  let i = 0
  while (v >= 1024 && i < UNITS.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 ? v.toFixed(0) : v.toFixed(v >= 100 ? 0 : digits)} ${UNITS[i]}`
}

export const speed = (n: number | undefined | null) => `${bytes(n, 1)}/s`

// Map-label form: "744B", "4K", "1.2M". Short enough to sit next to a flag.
export function compactRate(n: number | undefined | null): string {
  if (n === undefined || n === null || !Number.isFinite(n) || n < 0) return '-'
  const units = ['B', 'K', 'M', 'G', 'T']
  let v = n
  let i = 0
  while (v >= 1000 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${i === 0 || v >= 10 ? Math.round(v) : v.toFixed(1)}${units[i]}`
}

export function pct(used?: number, total?: number): number {
  if (!used || !total) return 0
  return Math.min(100, Math.max(0, (used / total) * 100))
}

export function duration(sec: number | undefined | null): string {
  if (sec === undefined || sec === null || sec < 0) return '-'
  const d = Math.floor(sec / 86400)
  const h = Math.floor((sec % 86400) / 3600)
  const m = Math.floor((sec % 3600) / 60)
  if (d > 0) return `${d} 天 ${h} 小時`
  if (h > 0) return `${h} 小時 ${m} 分`
  return `${m} 分`
}

export function expiry(days: number | null | undefined): string {
  if (days === undefined || days === null) return '∞'
  if (days < 0) return `已過期 ${-days} 天`
  if (days === 0) return '今天到期'
  return `${days} 天後到期`
}

export function money(amount: number | undefined, currency: string | undefined): string {
  if (!amount || !currency) return ''
  try {
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount)
  } catch {
    return `${amount} ${currency}`
  }
}

const CYCLES: Record<string, string> = {
  monthly: '月',
  quarterly: '季',
  semiannual: '半年',
  yearly: '年',
  biennial: '兩年',
  triennial: '三年',
  once: '一次性',
}

export function cycle(c: string | undefined): string {
  if (!c) return ''
  if (CYCLES[c]) return CYCLES[c]
  const m = /^(\d+)m$/.exec(c)
  return m ? `${m[1]} 個月` : ''
}
