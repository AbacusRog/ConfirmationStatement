// Rule-based sense-checks across the statutory accounts, the corporation tax
// figures and the Self Assessment return(s). Each check is only raised when
// the data it needs is present, and reports the actual figures involved.
//
// A pack can carry more than one personal tax return (for example both
// directors). Checks 6-10 below are personal to a return and run once per
// return; when there is more than one, the check text is prefixed with that
// person's first name so it's clear which return it refers to.

import type { Statutory } from './statutory'
import type { Sa100 } from './sa100'
import { personFirstName } from './sa100'
import { gbp, gbpWhole, type Pence } from './money'

export interface CtInfo {
  amount: Pence // exact Corporation Tax, in pence
  reference: string
  dueISO: string
}

export interface Check {
  tone: 'attention' | 'ok'
  text: string
}

/** £1,374.27, or £500 when there are no pence. */
const auto = (p: Pence) => (p % 100 === 0 ? gbp(p, { pence: false }) : gbp(p))
const w = (n: number) => gbpWhole(n)
const signedW = (n: number) => (n < 0 ? `-${w(Math.abs(n))}` : w(n))

/** UK dividends on one personal return, in whole pounds (null when there are none or no return). */
export function personalDividends(sa: Sa100 | null): number | null {
  if (!sa) return null
  if (sa.ukDividendsBox != null) return Math.round(sa.ukDividendsBox / 100)
  const d = sa.sa302?.income.find((i) => /dividend/i.test(i.label))
  return d ? Math.round(d.amount / 100) : null
}

/** Total UK dividends across every personal return supplied (null when none report any). */
export function totalPersonalDividends(saList: Sa100[]): number | null {
  const vals = saList.map(personalDividends).filter((n): n is number => n != null)
  return vals.length ? vals.reduce((a, n) => a + n, 0) : null
}

export function buildChecks(stat: Statutory, saList: Sa100[], ct: CtInfo | null): Check[] {
  const f = stat.figures
  const out: Check[] = []
  const ok = (text: string) => out.push({ tone: 'ok', text })
  const attn = (text: string) => out.push({ tone: 'attention', text })
  const multi = saList.length > 1
  const tag = (sa: Sa100, text: string) => (multi ? `${personFirstName(sa) || 'The return'}: ${text}` : text)

  // 1. Company arithmetic
  if (f.turnover && f.pbt) {
    const parts = [f.directCosts, f.staff, f.depreciation, f.other]
    const sum = f.turnover[0] + parts.reduce((a, p) => a + (p ? p[0] : 0), 0)
    const names: string[] = []
    if (f.directCosts) names.push(`${w(Math.abs(f.directCosts[0]))} direct costs`)
    if (f.staff) names.push(`${w(Math.abs(f.staff[0]))} staff costs`)
    if (f.depreciation) names.push(`${w(Math.abs(f.depreciation[0]))} depreciation`)
    if (f.other) names.push(`${w(Math.abs(f.other[0]))} other charges`)
    const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : names.join('')
    if (Math.abs(sum - f.pbt[0]) <= 1)
      ok(`Company arithmetic agrees: ${w(f.turnover[0])} turnover less ${list} equals ${w(f.pbt[0])} profit before tax.`)
    else attn(`Company arithmetic does not agree: ${w(f.turnover[0])} turnover less ${list} gives ${w(sum)}, but the accounts show ${w(f.pbt[0])} profit before tax.`)
  }

  // 2. Corporation Tax vs the accounts
  if (ct && f.pbt && f.tax && f.netProfit) {
    const exactTax = ct.amount
    const pat = f.pbt[0] * 100 - exactTax
    const roundedTax = Math.round(exactTax / 100)
    if (Math.abs(roundedTax - Math.abs(f.tax[0])) <= 1 && Math.abs(Math.round(pat / 100) - f.netProfit[0]) <= 1)
      ok(`Exact Corporation Tax of ${gbp(exactTax)} gives exact post-tax profit of ${gbp(pat)}, correctly rounding to ${w(f.netProfit[0])}.`)
    else
      attn(`Corporation Tax of ${gbp(exactTax)} does not agree to the tax charge of ${w(Math.abs(f.tax[0]))} in the accounts (net profit ${w(f.netProfit[0])}).`)
  }

  // 3. Balance sheet arithmetic
  if (f.currentAssets && f.creditors && f.netCurrent && f.fixedAssets && f.netAssets) {
    const nc = f.currentAssets[0] + f.creditors[0]
    const na = f.netCurrent[0] + f.fixedAssets[0] + (f.accruals ? f.accruals[0] : 0)
    const label = (n: number) => (n < 0 ? `${w(Math.abs(n))} net current liabilities` : `${w(n)} net current assets`)
    const naLabel = (n: number) => (n < 0 ? `${w(Math.abs(n))} net liabilities` : `${w(n)} net assets`)
    if (Math.abs(nc - f.netCurrent[0]) <= 1 && Math.abs(na - f.netAssets[0]) <= 1)
      ok(
        `Balance sheet arithmetic agrees: ${w(f.currentAssets[0])} current assets less ${w(Math.abs(f.creditors[0]))} creditors gives ${label(f.netCurrent[0])}; plus ${w(f.fixedAssets[0])} fixed assets${f.accruals ? ` less ${w(Math.abs(f.accruals[0]))} accruals` : ''} gives ${naLabel(f.netAssets[0])}.`,
      )
    else attn('Balance sheet arithmetic does not agree. Re-check the balance sheet subtotals.')
  }

  // 4. Net assets movement vs profit and dividends (dividends summed across every return)
  const divPounds = totalPersonalDividends(saList)
  if (f.netAssets && f.netProfit) {
    const change = f.netAssets[0] - f.netAssets[1]
    const outside = change - f.netProfit[0]
    if (Math.abs(outside) > 1) {
      const posNeg = (n: number) => `${w(Math.abs(n))} ${n < 0 ? 'negative' : 'positive'}`
      const move = `Net assets moved from ${posNeg(f.netAssets[1])} to ${posNeg(f.netAssets[0])}, a ${w(Math.abs(change))} ${change < 0 ? 'reduction' : 'increase'} against post-tax profit of ${w(f.netProfit[0])}. This indicates a ${w(Math.abs(outside))} movement outside profit and loss`
      if (divPounds != null && Math.abs(Math.abs(outside) - divPounds) <= 1 && outside < 0) ok(`${move}, matching the personal dividend${divPounds && saList.length > 1 ? 's' : ''}.`)
      else if (divPounds != null) attn(`${move}, which does not match the ${w(divPounds)} of dividends on the personal return${saList.length > 1 ? 's' : ''}. Establish what the movement is.`)
      else attn(`${move}. Establish what it is (for example dividends or a director's loan).`)
    }
  }

  // 5. Dividends: reserves and paperwork
  if (divPounds != null && divPounds > 0) {
    if (f.netAssets && f.netProfit) {
      const available = f.netAssets[1] + f.netProfit[0]
      if (divPounds > available)
        attn(
          `Dividends of ${w(divPounds)} exceed the reserves available before dividends (opening net assets of ${signedW(f.netAssets[1])} plus profit of ${w(f.netProfit[0])} is ${signedW(available)}) by ${w(divPounds - available)}. Confirm distributable reserves at the date each dividend was declared and how any excess is to be treated.`,
        )
    }
    attn(`The personal return${saList.length > 1 ? 's report' : ' reports'} ${w(divPounds)} dividends in total. Check against dividend vouchers, board approval and company reserves.`)
  }

  // Checks 6-10 are personal to a return, so run once per return supplied.
  for (const sa of saList) {
    // 6. Employment
    if (sa.sa302) {
      const payTotal = sa.sa302.income.find((i) => /pay from all employments/i.test(i.label))
      const emp = sa.employment
      if (payTotal && emp.length) {
        const pay = emp.reduce((a, e) => a + (e.pay ?? 0), 0)
        const tips = emp.reduce((a, e) => a + (e.tips ?? 0), 0)
        const agrees = pay + tips === payTotal.amount
        const split = tips > 0 ? `${auto(pay)} pay plus ${auto(tips)} tips/other payments, totalling ${auto(pay + tips)}` : `${auto(pay)} pay`
        const tail = tips > 0 ? `payroll/P60 and the nature of the ${auto(tips)} amount` : 'payroll/P60'
        if (agrees) attn(tag(sa, `The employment page reports ${split}. This agrees with the SA302 total but should be checked against ${tail}.`))
        else attn(tag(sa, `The employment page reports ${split}, which does not agree to the SA302 pay figure of ${auto(payTotal.amount)}.`))
      }
      // Note: deliberately no check comparing directors' salaries in the accounts
      // against the pay on the personal return — the two figures cover different
      // periods and are not expected to reconcile, so this is not raised.
    }

    // 7. Bank interest boxes
    if (sa.interest.taxedUk == null && sa.interest.untaxedUk == null && sa.interest.foreign == null)
      attn(tag(sa, 'No personal bank interest is reported. The taxed UK, untaxed UK and foreign-interest boxes are blank. Confirm against all bank and building society records.'))

    // 8. Personal tax calculation
    if (sa.sa302 && sa.sa302.totalIncome != null && sa.sa302.personalAllowance != null && sa.sa302.taxable != null && sa.sa302.incomeTax != null) {
      const s = sa.sa302
      const taxableOk = s.totalIncome! - s.personalAllowance! === s.taxable
      const bandsOk = s.bands.length > 0 && s.bands.every((b) => Math.abs(Math.round((b.amount * b.rate) / 100) - b.tax) <= 1)
      const sumOk = s.bands.reduce((a, b) => a + b.tax, 0) === s.incomeTax
      if (taxableOk && bandsOk && sumOk) {
        const bandText = s.bands
          .map((b, i) => `${auto(b.amount)}${i === 0 && /dividend/i.test(b.group) ? ' dividends' : ''} at ${b.rate}%`)
          .join(' and ')
        ok(tag(sa, `The personal tax calculation agrees: ${auto(s.totalIncome!)} total income less ${auto(s.personalAllowance!)} Personal Allowance leaves ${auto(s.taxable!)} taxable; ${bandText} gives ${auto(s.incomeTax!)}.`))
      } else attn(tag(sa, 'The personal tax calculation on the SA302 does not reconcile (allowance, bands or total). Re-check the calculation.'))
    }

    // 9. Payments on account
    if (sa.position) {
      const p = sa.position
      const bad = p.lessLines.filter((l) => l.described != null && l.described !== l.amount)
      const credit = p.balance && p.balance.amount < 0 ? -p.balance.amount : null
      const jan = p.groups[0]
      if (bad.length) {
        const described = p.lessLines.map((l) => (l.described != null ? auto(l.described) : auto(l.amount)))
        const used = p.lessLines.map((l) => auto(l.amount))
        const total = p.lessLines.reduce((a, l) => a + l.amount, 0)
        attn(
          tag(
            sa,
            `The return describes prior payments as ${described.join(' and ')}, but the arithmetic column uses ${used.join(' and ')}, totalling ${auto(total)}. Verify the actual HMRC payment before relying on ${credit != null ? `the ${auto(credit)} credit` : 'the balance shown'}${jan ? ` and the ${auto(jan.total)} ${jan.heading.split(' ')[1] ?? ''} payment` : ''}.`,
          ),
        )
      } else if (p.lessLines.length) ok(tag(sa, 'The prior payments on account described on the return agree to the amounts used in the calculation.'))
    }

    // 10. Address wording
    if (sa.issueAddress.length > 1) {
      for (let i = 1; i < sa.issueAddress.length; i++) {
        if (sa.issueAddress[i].toLowerCase() === sa.issueAddress[i - 1].toLowerCase()) {
          attn(tag(sa, `The address repeats “${sa.issueAddress[i]}”. Confirm the correct postal wording.`))
          break
        }
      }
    }
  }

  // Attention items first, then the checks that agree.
  return [...out.filter((c) => c.tone === 'attention'), ...out.filter((c) => c.tone === 'ok')]
}

export function defaultCtDue(periodEndISO: string | null): string | null {
  if (!periodEndISO) return null
  // Corporation Tax is due 9 months and 1 day after the accounting period ends.
  const [y, m, d] = periodEndISO.split('-').map(Number)
  const total = m - 1 + 9
  const ny = y + Math.floor(total / 12)
  const nm = total % 12
  const last = new Date(Date.UTC(ny, nm + 1, 0)).getUTCDate()
  const dt = new Date(Date.UTC(ny, nm, Math.min(d, last) + 1))
  return dt.toISOString().slice(0, 10)
}
