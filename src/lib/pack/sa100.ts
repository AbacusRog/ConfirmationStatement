// Reads the parts of a Self Assessment return (SA100 + supplementary pages +
// SA302 calculation) that the Tax Payments sheet and sense-checks need.

import type { TPage, TItem } from './pdfText'
import { toPence, type Pence } from './money'
import { parseLongDate } from './statutory'

export interface DueItem {
  label: string
  amount: Pence
  /** amount quoted in brackets in the label, e.g. "(£925.18)" */
  described: Pence | null
}
export interface DueGroup {
  heading: string // e.g. "31 January 2027"
  dateISO: string | null
  items: DueItem[]
  total: Pence
}
export interface EmploymentPage {
  pay: Pence | null
  tips: Pence | null
  closeCompanyDividends: Pence | null
  employer: string | null
}
export interface Sa302 {
  income: { label: string; amount: Pence }[]
  totalIncome: Pence | null
  personalAllowance: Pence | null
  taxable: Pence | null
  bands: { group: string; label: string; amount: Pence; rate: number; tax: Pence }[]
  incomeTax: Pence | null
}
export interface Position {
  totalDue: Pence | null
  lessLines: DueItem[]
  lessTotal: Pence | null
  balance: { label: string; amount: Pence } | null
  groups: DueGroup[]
}
export interface Sa100 {
  name: string | null
  utr: string | null
  nino: string | null
  agentRef: string | null
  irmark: string | null
  yearEndedISO: string | null
  taxYear: string | null // "2025-26"
  issueAddress: string[]
  employment: EmploymentPage[]
  interest: { taxedUk: Pence | null; untaxedUk: Pence | null; foreign: Pence | null }
  ukDividendsBox: Pence | null
  sa302: Sa302 | null
  position: Position | null
  warnings: string[]
}

const flat = (p: TPage): TItem[] => p.lines.flatMap((l) => l.items)

/** Value in the £ digit-box that sits under the item matching labelRe. null = box blank / not found. */
function boxAmount(page: TPage, labelRe: RegExp): Pence | null {
  const items = flat(page)
  const label = items.find((i) => labelRe.test(i.str.trim()))
  if (!label) return null
  const pounds = items
    .filter((i) => i.str.trim() === '£' && i.x0 >= label.x0 - 4 && i.x0 <= label.x0 + 16 && i.y < label.y - 8 && i.y > label.y - 95)
    .sort((a, b) => b.y - a.y)[0]
  if (!pounds) return null
  const row = items
    .filter((i) => Math.abs(i.y - pounds.y) <= 2.5 && i.x0 > pounds.x0)
    .sort((a, b) => a.x0 - b.x0)
  const digits: string[] = []
  const pence: string[] = []
  let seenDot = false
  for (const it of row) {
    const s = it.str.trim()
    if (s === '£') break // next box on the same line
    if (s === '•' || s === '.') {
      seenDot = true
      continue
    }
    if (/^\d$/.test(s)) (seenDot ? pence : digits).push(s)
    else if (!seenDot) continue
  }
  if (digits.length === 0) return null
  return Number(digits.join('')) * 100 + Number((pence.join('') + '00').slice(0, 2))
}

function textBelow(page: TPage, labelRe: RegExp): string | null {
  const items = flat(page)
  const label = items.find((i) => labelRe.test(i.str.trim()))
  if (!label) return null
  const c = items
    .filter((i) => i.y < label.y - 4 && i.y > label.y - 40 && i.x0 >= label.x0 - 2 && i.x0 <= label.x0 + 40 && /[A-Za-z]/.test(i.str))
    .sort((a, b) => b.y - a.y)[0]
  return c ? c.str.trim() : null
}

const AMT_TAIL = /(\(?-?[\d,]+\.\d\d\)?)$/

export function parseSa100(pages: TPage[]): Sa100 {
  const warnings: string[] = []
  const out: Sa100 = {
    name: null,
    utr: null,
    nino: null,
    agentRef: null,
    irmark: null,
    yearEndedISO: null,
    taxYear: null,
    issueAddress: [],
    employment: [],
    interest: { taxedUk: null, untaxedUk: null, foreign: null },
    ukDividendsBox: null,
    sa302: null,
    position: null,
    warnings,
  }

  // --- Page 1: identity ---
  const p1 = pages[0]
  if (p1) {
    const allText = p1.lines.map((l) => l.text).join('\n')
    out.irmark = allText.match(/IRMark:\s*([A-Z0-9]{20,})/)?.[1] ?? null
    const ye = allText.match(/Tax Return for the year ended (\d{1,2} \w+ \d{4})/)
    if (ye) {
      out.yearEndedISO = parseLongDate(ye[1])
      if (out.yearEndedISO) {
        const y = Number(out.yearEndedISO.slice(0, 4))
        out.taxYear = `${y - 1}-${String(y).slice(2)}`
      }
    }
    const hdrIdx = p1.lines.findIndex((l) => /NI Number/.test(l.text) && /Agent Reference/.test(l.text))
    if (hdrIdx >= 0 && p1.lines[hdrIdx + 1]) {
      const it = p1.lines[hdrIdx + 1].items
      if (it.length >= 4) {
        out.name = it[0].str.trim()
        out.utr = it[1].str.trim()
        out.nino = it[2].str.trim()
        out.agentRef = it[3].str.trim()
      }
    }
  }
  if (!out.utr) warnings.push('Could not read the UTR from the tax return.')

  // --- Page 2: issue address ---
  const p2 = pages.find((p) => p.lines.some((l) => /Issue address/.test(l.text)))
  if (p2) {
    const items = flat(p2)
    const ia = items.find((i) => /Issue address/.test(i.str))
    if (ia) {
      out.issueAddress = items
        .filter((i) => i.x0 >= ia.x0 - 6 && i.x0 <= ia.x0 + 30 && i.y < ia.y - 2 && i.y > ia.y - 130 && !/^(For|Reference)$/.test(i.str.trim()) && !/Issue address/.test(i.str))
        .sort((a, b) => b.y - a.y)
        .map((i) => i.str.trim())
    }
  }

  // --- Interest / dividends page ---
  const pInc = pages.find((p) => p.lines.some((l) => /Dividends and interest from UK banks/.test(l.text)))
  if (pInc) {
    out.interest.taxedUk = boxAmount(pInc, /^Taxed UK interest/)
    out.interest.untaxedUk = boxAmount(pInc, /^Untaxed UK interest/)
    out.interest.foreign = boxAmount(pInc, /^Untaxed foreign interest/)
    out.ukDividendsBox = boxAmount(pInc, /^Dividends from UK companies/)
  }

  // --- Employment pages ---
  for (const p of pages) {
    if (!p.lines.some((l) => /Complete an .Employment. page/.test(l.text))) continue
    out.employment.push({
      pay: boxAmount(p, /^Pay from this employment/),
      tips: boxAmount(p, /^Tips and other payments/),
      closeCompanyDividends: boxAmount(p, /^Dividends you received from this close company/),
      employer: textBelow(p, /^Your employer.s name/),
    })
  }

  // --- SA302 calculation ---
  const pCalc = pages.find((p) => p.lines.some((l) => /Calculation Result for/.test(l.text)))
  if (pCalc) {
    const s: Sa302 = { income: [], totalIncome: null, personalAllowance: null, taxable: null, bands: [], incomeTax: null }
    let mode: 'pre' | 'income' | 'after' = 'pre'
    let group = ''
    for (const l of pCalc.lines) {
      const t = l.text
      if (/^Income received/.test(t)) {
        mode = 'income'
        continue
      }
      const amt = t.match(/^(.*?)\s*£(-?[\d,]+\.\d\d)$/)
      if (/^Total income received/.test(t) && amt) {
        s.totalIncome = toPence(amt[2])
        mode = 'after'
        continue
      }
      if (mode === 'income' && amt && !/^minus/.test(t)) {
        s.income.push({ label: amt[1].trim(), amount: toPence(amt[2])! })
        continue
      }
      if (/^Personal Allowance/.test(t) && amt) s.personalAllowance = toPence(amt[2])
      else if (/^Total income on which tax is due/.test(t) && amt) s.taxable = toPence(amt[2])
      else if (/^Income Tax due after allowances and reliefs/.test(t) && amt) s.incomeTax = toPence(amt[2])
      const band = t.match(/^(.*?)\s*£([\d,]+\.\d\d) x ([\d.]+)% = £([\d,]+\.\d\d)$/)
      if (band) s.bands.push({ group, label: band[1].trim(), amount: toPence(band[2])!, rate: Number(band[3]), tax: toPence(band[4])! })
      else if (!amt && /^(Savings|Dividends|Non-savings|Other|Earned|Basic|Higher|Additional)/i.test(t) && l.x0 > 200) group = t
    }
    out.sa302 = s
  } else warnings.push('No SA302 calculation found in the tax return.')

  // --- Payment / repayment summary ---
  const pPay = pages.find((p) => p.lines.some((l) => /Tax Payment\/Repayment Summary/.test(l.text)))
  if (pPay) {
    const pos: Position = { totalDue: null, lessLines: [], lessTotal: null, balance: null, groups: [] }
    let stage: 'top' | 'less' | 'afterLess' | 'summary' = 'top'
    let cur: DueGroup | null = null
    for (const l of pPay.lines) {
      const t = l.text
      if (/^(Ms|Mr|Mrs|Miss|Dr)\b/.test(t) && stage === 'top') continue
      const m = t.match(AMT_TAIL)
      const amount = m ? toPence(m[1]) : null
      const label = m ? t.slice(0, t.length - m[1].length).trim() : t
      if (/^Total Due\b/.test(t) && amount != null && stage === 'top') {
        pos.totalDue = amount
        continue
      }
      if (/^Less:/.test(t)) {
        stage = 'less'
        continue
      }
      if (/^Summary of amounts due/.test(t)) {
        stage = 'summary'
        continue
      }
      if (stage === 'less') {
        if (amount != null && label === '') {
          pos.lessTotal = amount
          stage = 'afterLess'
        } else if (amount != null) {
          const d = label.match(/\(£([\d,]+\.\d\d)\)/)
          pos.lessLines.push({ label, amount, described: d ? toPence(d[1]) : null })
        }
        continue
      }
      if (stage === 'afterLess') {
        if (amount != null && label) pos.balance = { label, amount }
        continue
      }
      if (stage === 'summary') {
        const gh = t.match(/^Amount due (.+)$/)
        if (gh) {
          cur = { heading: gh[1].trim(), dateISO: parseLongDate(gh[1]), items: [], total: 0 }
          pos.groups.push(cur)
          continue
        }
        if (!cur || amount == null) continue
        if (/^Total due\b/.test(t)) cur.total = amount
        else cur.items.push({ label, amount, described: null })
      }
    }
    for (const g of pos.groups) if (g.total === 0 && g.items.length) g.total = g.items.reduce((a, i) => a + i.amount, 0)
    out.position = pos
  } else warnings.push('No tax payment summary found in the tax return.')

  return out
}

/** "Ms Daniela Zummo" -> "Daniela Zummo" (title stripped; used when several returns are on one pack). */
export function personName(sa: Pick<Sa100, 'name'> | null | undefined): string {
  return (sa?.name ?? '').replace(/^(mr|mrs|ms|miss|dr|mx)\.?\s+/i, '').trim()
}

/** "Ms Daniela Zummo" -> "Daniela" */
export function personFirstName(sa: Pick<Sa100, 'name'> | null | undefined): string {
  return personName(sa).split(/\s+/)[0] ?? ''
}
