// Builds the "Financial review" from the parsed statutory accounts: a table
// of measures, a where-did-each-£1-go breakdown and plain-English commentary.
// Everything is derived from the accounts' own figures. Wording adapts to the
// direction of each movement so it never says "increased" for a fall.

import type { Statutory, Pair } from './statutory'
import { gbpWhole } from './money'

export interface ReviewRow {
  measure: string
  formula: string
  cur: string
  prior: string
  change: string
}
export interface KeyFigure {
  label: string
  value: string
  note: string
}
export interface ChartSegment {
  key: string
  label: string
  cur: number // fraction of turnover
  prior: number
}
export interface ReviewParagraph {
  heading: string
  text: string
  /** section id to link to, e.g. "profit-and-loss-account" */
  linkId?: string
  linkText?: string
}
export interface Review {
  currentLabel: string
  priorLabel: string
  keyFigures: KeyFigure[]
  rows: ReviewRow[]
  chart: { segments: ChartSegment[] } | null
  paragraphs: ReviewParagraph[]
  footnote: string
}

const pct = (x: number, dp = 1) => `${x.toFixed(dp)}%`
const sgn = (n: number) => (n >= 0 ? '+' : '-')
const pts = (d: number) => `${sgn(d)}${Math.abs(d).toFixed(1)} pts`
const money = (n: number) => gbpWhole(n)
const moneyBr = (n: number) => (n < 0 ? `(${gbpWhole(Math.abs(n))})` : gbpWhole(n))
const signedMoney = (n: number) => `${sgn(n)}${gbpWhole(Math.abs(n))}`
const lc = (s: string) => (s.length > 1 && s[1] === s[1].toLowerCase() ? s[0].toLowerCase() + s.slice(1) : s)

function yearLabel(iso: string | null, fallback: string): string {
  return iso ? String(Number(iso.slice(0, 4))) : fallback
}

export interface ReviewExtras {
  /** UK dividends per the director's return, in whole pounds (if a return was supplied) */
  dividends?: number | null
}

export function buildReview(stat: Statutory, extras: ReviewExtras = {}): Review | null {
  const f = stat.figures
  if (!f.turnover || !f.pbt || !f.netProfit) return null

  const curYear = yearLabel(stat.periodEnd, 'Current')
  const priorYear = stat.periodEnd ? String(Number(stat.periodEnd.slice(0, 4)) - 1) : 'Prior'
  const cur = (p?: Pair) => (p ? p[0] : 0)
  const pri = (p?: Pair) => (p ? p[1] : 0)

  const T: Pair = f.turnover
  const cost = (p?: Pair): Pair => [Math.abs(cur(p)), Math.abs(pri(p))]
  const direct = cost(f.directCosts)
  const staff = cost(f.staff)
  const dep = cost(f.depreciation)
  const other = cost(f.other)
  const tax = cost(f.tax)
  const PBT = f.pbt
  const NP = f.netProfit

  const rows: ReviewRow[] = []
  const ratio = (a: number, b: number) => (b !== 0 ? (a / b) * 100 : null)

  // Turnover growth
  if (T[1] > 0) {
    const g = (T[0] / T[1] - 1) * 100
    rows.push({
      measure: 'Turnover growth',
      formula: '(This year ÷ last year) − 1',
      cur: pct(g),
      prior: '–',
      change: signedMoney(T[0] - T[1]),
    })
  }
  const pairRatio = (measure: string, formula: string, num: Pair, den: Pair, lowerIsBetter?: boolean) => {
    const a = ratio(num[0], den[0])
    const b = ratio(num[1], den[1])
    if (a === null || b === null) return
    const d = Math.round(a * 10) / 10 - Math.round(b * 10) / 10 // difference of the figures as displayed
    rows.push({ measure, formula, cur: pct(a), prior: pct(b), change: Math.abs(d) < 0.05 ? 'No change' : pts(d) })
    void lowerIsBetter
  }
  if (f.directCosts) pairRatio('Direct cost ratio', 'Direct costs ÷ turnover', direct, T)
  if (f.staff) pairRatio('Staff cost ratio', 'Staff costs ÷ turnover', staff, T)
  if (f.other) pairRatio('Other charges ratio', 'Other charges ÷ turnover', other, T)
  pairRatio('Profit before tax margin', 'Profit before tax ÷ turnover', PBT, T)
  pairRatio('Net profit margin', 'Net profit ÷ turnover', NP, T)
  if (f.tax && PBT[0] > 0 && PBT[1] > 0) pairRatio('Effective tax rate', 'Tax ÷ profit before tax', tax, PBT)

  // Liquidity
  const CA = f.currentAssets
  const CL: Pair | null = f.creditors ? [Math.abs(f.creditors[0]), Math.abs(f.creditors[1])] : null
  let workingCap: Pair | null = null
  if (f.netCurrent) workingCap = f.netCurrent
  else if (CA && CL) workingCap = [CA[0] - CL[0], CA[1] - CL[1]]
  if (CA && CL && CL[0] > 0 && CL[1] > 0) {
    const a = CA[0] / CL[0]
    const b = CA[1] / CL[1]
    rows.push({
      measure: 'Current ratio',
      formula: 'Current assets ÷ creditors due within one year',
      cur: `${a.toFixed(2)}x`,
      prior: `${b.toFixed(2)}x`,
      change: Math.abs(a - b) < 0.005 ? 'No change' : a > b ? 'Higher' : 'Lower',
    })
  }
  if (workingCap) {
    const d = workingCap[0] - workingCap[1]
    rows.push({
      measure: 'Working capital',
      formula: 'Current assets − creditors due within one year',
      cur: moneyBr(workingCap[0]),
      prior: moneyBr(workingCap[1]),
      change: d === 0 ? 'No change' : `${d > 0 ? 'Up' : 'Down'} ${money(Math.abs(d))}`,
    })
  }

  // Key figures
  const keyFigures: KeyFigure[] = []
  const chg = (a: number, b: number) => {
    if (b > 0 && a >= 0) return `${sgn(a - b)}${Math.abs((a / b - 1) * 100).toFixed(1)}% on ${priorYear}`
    return `${priorYear}: ${moneyBr(b)}`
  }
  keyFigures.push({ label: 'Turnover', value: money(T[0]), note: chg(T[0], T[1]) })
  keyFigures.push({ label: 'Profit before tax', value: moneyBr(PBT[0]), note: chg(PBT[0], PBT[1]) })
  keyFigures.push({ label: 'Net profit', value: moneyBr(NP[0]), note: chg(NP[0], NP[1]) })
  if (f.netAssets) {
    keyFigures.push({
      label: f.netAssets[0] < 0 ? 'Net liabilities' : 'Net assets',
      value: money(Math.abs(f.netAssets[0])),
      note: `${priorYear}: ${f.netAssets[1] < 0 ? 'net liabilities of ' : ''}${money(Math.abs(f.netAssets[1]))}`,
    })
  }

  // Where each £1 went
  let chart: Review['chart'] = null
  if (T[0] > 0 && T[1] > 0 && f.tax) {
    const comps = [
      { key: 'direct', label: 'Direct costs', v: direct },
      { key: 'staff', label: 'Staff costs', v: staff },
      { key: 'dep', label: 'Depreciation', v: dep },
      { key: 'other', label: 'Other charges', v: other },
      { key: 'tax', label: 'Tax', v: tax },
      { key: 'profit', label: 'Net profit', v: NP },
    ]
    const sumCur = comps.reduce((a, c) => a + c.v[0], 0)
    const sumPri = comps.reduce((a, c) => a + c.v[1], 0)
    const allPositive = comps.every((c) => c.v[0] >= 0 && c.v[1] >= 0)
    // Only draw it when the parts genuinely add back to turnover (within £2 for rounding).
    if (allPositive && Math.abs(sumCur - T[0]) <= 2 && Math.abs(sumPri - T[1]) <= 2) {
      chart = {
        segments: comps.map((c) => ({ key: c.key, label: c.label, cur: c.v[0] / T[0], prior: c.v[1] / T[1] })),
      }
    }
  }

  // ---- Commentary ----
  const paragraphs: ReviewParagraph[] = []
  const verb = (a: number, b: number, up = 'increased', down = 'fell') => (a >= b ? up : down)

  {
    let t = ''
    if (T[1] > 0) {
      const g = (T[0] / T[1] - 1) * 100
      t += `Turnover ${verb(T[0], T[1])} by ${Math.abs(g).toFixed(1)}% to ${money(T[0])} (${curYear === priorYear ? '' : priorYear + ': '}${money(T[1])}). `
    } else t += `Turnover was ${money(T[0])}. `
    if (PBT[0] > 0 && PBT[1] > 0) {
      const g = (PBT[0] / PBT[1] - 1) * 100
      t += `Profit before tax ${verb(PBT[0], PBT[1])} by ${Math.abs(g).toFixed(1)}% to ${money(PBT[0])}`
      if (NP[0] > 0 && NP[1] > 0) {
        const gn = (NP[0] / NP[1] - 1) * 100
        t += `, while net profit ${verb(NP[0], NP[1])} by ${Math.abs(gn).toFixed(1)}% to ${money(NP[0])}.`
      } else t += `.`
    } else {
      const word = (n: number) => (n >= 0 ? `a profit of ${money(n)}` : `a loss of ${money(Math.abs(n))}`)
      t += `Before tax the company made ${word(PBT[0])} (${priorYear}: ${word(PBT[1])}), and after tax ${word(NP[0])} (${priorYear}: ${word(NP[1])}).`
    }
    paragraphs.push({ heading: 'Revenue and profit', text: t.trim(), linkId: 'profit-and-loss-account', linkText: 'Profit and loss account' })
  }

  // Costs and margins: name the biggest movers from the trading account when we have it.
  {
    const mPrev = ratio(PBT[1], T[1])
    const mCur = ratio(PBT[0], T[0])
    let t = ''
    if (mPrev !== null && mCur !== null) {
      const d = mCur - mPrev
      t += Math.abs(d) < 0.05
        ? `The profit margin before tax was unchanged at ${pct(mCur)}. `
        : `The profit margin before tax ${d < 0 ? 'reduced' : 'improved'} from ${pct(mPrev)} to ${pct(mCur)}. `
    }
    const drivers = tradingMovers(stat, T[0])
    if (drivers.length) {
      t += `The largest movements in costs were ${joinAnd(drivers)}.`
    } else if (f.staff && f.other) {
      const parts: string[] = []
      if (Math.abs(staff[0] - staff[1]) >= 250) parts.push(`staff costs ${staff[0] >= staff[1] ? 'rose' : 'fell'} from ${money(staff[1])} to ${money(staff[0])}`)
      if (Math.abs(other[0] - other[1]) >= 250) parts.push(`other charges ${other[0] >= other[1] ? 'rose' : 'fell'} from ${money(other[1])} to ${money(other[0])}`)
      if (parts.length) t += `Within costs, ${joinAnd(parts)}.`
    }
    if (t.trim()) paragraphs.push({ heading: 'Costs and margins', text: t.trim(), linkId: 'trading-profit-and-loss-account', linkText: 'Trading profit and loss account' })
  }

  if (f.tax && PBT[0] > 0 && PBT[1] > 0 && tax[0] > 0) {
    const a = (tax[0] / PBT[0]) * 100
    const b = (tax[1] / PBT[1]) * 100
    paragraphs.push({
      heading: 'Tax',
      text: `The tax charge of ${money(tax[0])} is ${pct(a)} of profit before tax (${priorYear}: ${pct(b)}).`,
    })
  }

  if (CA && CL && workingCap) {
    let t = `At the year end current assets were ${money(CA[0])} against creditors due within one year of ${money(CL[0])}. `
    t += `Working capital moved from ${workingCap[1] >= 0 ? 'positive ' : 'negative '}${money(Math.abs(workingCap[1]))} to ${workingCap[0] >= 0 ? 'positive ' : 'negative '}${money(Math.abs(workingCap[0]))}`
    if (CL[0] > 0 && CL[1] > 0) t += `, and the current ratio ${CA[0] / CL[0] >= CA[1] / CL[1] ? 'improved' : 'reduced'} from ${(CA[1] / CL[1]).toFixed(2)}x to ${(CA[0] / CL[0]).toFixed(2)}x`
    t += '.'
    if (CL[0] > 0 && CA[0] < CL[0]) t += ' This means short-term liabilities were greater than short-term assets at the year end.'
    paragraphs.push({ heading: 'Liquidity', text: t, linkId: 'balance-sheet', linkText: 'Balance sheet' })
  }

  if (f.netAssets) {
    const [na, np] = f.netAssets
    const change = na - np
    const outside = change - NP[0]
    const naText = (n: number) => (n < 0 ? `net liabilities of ${money(Math.abs(n))}` : `net assets of ${money(n)}`)
    let t = `The company moved from ${naText(np)} to ${naText(na)}, ${change < 0 ? 'a reduction' : 'an increase'} of ${money(Math.abs(change))}`
    if (Math.abs(outside) <= 1) {
      t += `, in line with the net profit of ${money(NP[0])} for the year.`
    } else if (NP[0] > 0 && change < NP[0]) {
      t += `, even though the company reported a net profit of ${money(NP[0])}. The difference of ${money(Math.abs(outside))} left the company other than through the profit and loss account (for example dividends or other distributions to shareholders). The accounts do not include a statement of changes in equity, so the movement is not analysed there.`
      if (extras.dividends != null && Math.abs(Math.abs(outside) - extras.dividends) <= 1) {
        t += ` It matches the UK dividends of ${money(extras.dividends)} shown on the director's Self Assessment return.`
      }
    } else {
      t += NP[0] < 0 ? `, compared with a loss of ${money(Math.abs(NP[0]))} for the year.` : `, compared with a net profit of ${money(NP[0])} for the year.`
    }
    paragraphs.push({ heading: 'Net assets', text: t, linkId: 'balance-sheet', linkText: 'Balance sheet' })
  }

  return {
    currentLabel: curYear,
    priorLabel: priorYear,
    keyFigures,
    rows,
    chart,
    paragraphs,
    footnote:
      'The measures above use the closing balance sheet and the figures in the statutory accounts. They are indicators to help you read the accounts, not an audit opinion, valuation or forecast.',
  }
}

function joinAnd(parts: string[]): string {
  if (parts.length <= 1) return parts.join('')
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`
}

/** The biggest year-on-year cost movements from the trading account, as short phrases. */
function tradingMovers(stat: Statutory, turnover: number): string[] {
  const threshold = Math.max(250, turnover * 0.005)
  const movers = stat.trading
    .filter((l) => l.kind === 'detail' && l.cur !== null && l.prior !== null && !/^sales$/i.test(l.label) && !/^direct costs?$/i.test(l.label))
    .map((l) => ({ label: l.label, cur: l.cur as number, prior: l.prior as number, d: (l.cur as number) - (l.prior as number) }))
    .filter((m) => Math.abs(m.d) >= threshold)
    .sort((a, b) => Math.abs(b.d) - Math.abs(a.d))
    .slice(0, 4)
  return movers.map((m) =>
    m.prior === 0
      ? `${lc(m.label)} (${money(m.cur)}, nothing in the previous year)`
      : m.cur === 0
        ? `${lc(m.label)} (nil this year, ${money(m.prior)} in the previous year)`
        : `${lc(m.label)} (${m.d > 0 ? 'up' : 'down'} ${money(Math.abs(m.d))} to ${money(m.cur)})`,
  )
}
