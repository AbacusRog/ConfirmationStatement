// Money is handled in integer pence throughout so totals never drift.

export type Pence = number

/** "£1,374.27", "(479.09)", "-479.09", "1,853.36" -> pence. Returns null if not an amount. */
export function toPence(s: string | null | undefined): Pence | null {
  if (s == null) return null
  const t = s.trim()
  if (!t) return null
  const neg = /^\(.*\)$/.test(t) || /^-/.test(t) || /^£-/.test(t)
  const d = t.replace(/[()£,\-\s]/g, '')
  if (!/^\d+(\.\d{1,2})?$/.test(d)) return null
  const [p, dec = ''] = d.split('.')
  const v = Number(p) * 100 + Number((dec + '00').slice(0, 2))
  return neg ? -v : v
}

/** 123456 -> "£1,234.56"; negatives as "-£1,234.56". */
export function gbp(p: Pence, opts: { pence?: boolean } = {}): string {
  const showPence = opts.pence ?? true
  const abs = Math.abs(p)
  const pounds = Math.floor(abs / 100)
  const rem = abs % 100
  const body = pounds.toLocaleString('en-GB') + (showPence ? '.' + String(rem).padStart(2, '0') : '')
  return (p < 0 ? '-£' : '£') + body
}

/** Whole pounds from pence, rounded to nearest pound. */
export function roundPounds(p: Pence): number {
  return Math.round(p / 100)
}

/** 1,258 (pounds) -> "£1,258" */
export function gbpWhole(pounds: number): string {
  return (pounds < 0 ? '-£' : '£') + Math.abs(pounds).toLocaleString('en-GB')
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** "2027-01-01" -> "1 January 2027" (no locale dependence, safe in every runtime). */
export function longDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  return `${d} ${MONTHS[m - 1]} ${y}`
}

/** Add whole months, clamping the day (31 Mar + 9 months -> 31 Dec), then add days. */
export function addMonthsDays(iso: string, months: number, days = 0): string {
  const [y, m, d] = iso.split('-').map(Number)
  const total = m - 1 + months
  const ny = y + Math.floor(total / 12)
  const nm = ((total % 12) + 12) % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  const dt = new Date(Date.UTC(ny, nm, Math.min(d, last) + days))
  return dt.toISOString().slice(0, 10)
}

/** 1 -> "1st", 22 -> "22nd" */
export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
