// Builds "<Client>_<year>_Tax_Payments.pdf": a private-client tax payment sheet
// pulling together the Corporation Tax figures (typed in or read from the
// covering letter), the Self Assessment payment schedule and a short sense-check.

import type { Statutory } from './statutory'
import type { Sa100, DueGroup } from './sa100'
import type { Check, CtInfo } from './checks'
import { gbp, longDate, type Pence } from './money'
import { COLORS as C, renderPdf, addBookmarks, type DocDef } from './pdfEnv'

const PAGE_W = 595.28
const MARGIN_X = 40
const CONTENT_W = PAGE_W - MARGIN_X * 2
const FIRM = 'Abacus Consultancy'

export const HMRC_ACCOUNT = 'HMRC Shipley | 08-32-10 | 12001020'

const LINKS = {
  ctGuide: 'https://www.gov.uk/pay-corporation-tax',
  ctPay: 'https://www.tax.service.gov.uk/pay/corporation-tax/choose-a-way-to-pay',
  saGuide: 'https://www.gov.uk/pay-self-assessment-tax-bill',
  saPay: 'https://www.tax.service.gov.uk/pay/self-assessment/choose-a-way-to-pay',
}

export interface PaymentsInput {
  stat: Statutory
  sa: Sa100 | null
  ct: CtInfo | null
  checks: Check[]
  includeChecks: boolean
}

/** One scheduled payment, ready to show as a card. */
export interface PaymentCard {
  title: string // "CORPORATION TAX"
  label: string // "Corporation Tax" (for emails)
  amount: Pence
  dueISO: string | null
  dueText: string
}

const monthName = (g: DueGroup) => (g.heading.split(' ')[1] ?? g.heading).toUpperCase()

/** The payments to highlight: Corporation Tax plus each Self Assessment due date with money to pay. */
export function paymentCards(sa: Sa100 | null, ct: CtInfo | null): PaymentCard[] {
  const cards: PaymentCard[] = []
  if (ct && ct.amount > 0)
    cards.push({ title: 'CORPORATION TAX', label: 'Corporation Tax', amount: ct.amount, dueISO: ct.dueISO, dueText: longDate(ct.dueISO) })
  for (const g of sa?.position?.groups ?? []) {
    if (g.total > 0) cards.push({ title: `PERSONAL TAX - ${monthName(g)}`, label: `Personal Tax – ${g.heading.split(' ')[1] ?? g.heading}`, amount: g.total, dueISO: g.dateISO, dueText: g.heading })
  }
  return cards
}

export const paymentsTotal = (cards: PaymentCard[]): Pence => cards.reduce((a, c) => a + c.amount, 0)

/** "Ms Daniela Zummo" -> "Daniela_Zummo" style file stem. */
export function fileStem(name: string): string {
  return name
    .replace(/^(mr|mrs|ms|miss|dr|mx)\.?\s+/i, '')
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

// ---------- small building blocks ----------

const heading = (text: string, id?: string): DocDef => ({ text, fontSize: 14, bold: true, color: C.navy, margin: [0, 10, 0, 4], ...(id ? { id } : {}) })

const kvTable = (rows: [string, string][], labelW = 130): DocDef => ({
  table: {
    widths: [labelW, '*'],
    body: rows.map(([k, v]) => [
      { text: k, fillColor: C.greyLight, color: C.grey, fontSize: 9, margin: [4, 3, 4, 3] },
      { text: v, fontSize: 9.5, margin: [4, 3, 4, 3] },
    ]),
  },
  layout: { hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
})

const link = (text: string, url: string): DocDef => ({ text, link: url, color: C.blueLink, bold: true, fontSize: 9, margin: [0, 4, 0, 0] })

function cards(list: PaymentCard[]): DocDef {
  const n = list.length
  const widths = Array(n).fill('*')
  const head = list.map((c) => ({ text: c.title, color: C.white, bold: true, fontSize: 8.5, fillColor: C.red, margin: [6, 5, 6, 5] }))
  const amt = list.map((c) => ({ text: gbp(c.amount), color: C.red, bold: true, fontSize: 19, fillColor: C.redLight, margin: [6, 5, 6, 3] }))
  const due = list.map((c) => ({ text: `DUE ${c.dueText.toUpperCase()}`, color: C.red, bold: true, fontSize: 8.5, fillColor: C.redLight, margin: [6, 4, 6, 6] }))
  return {
    table: { widths, body: [head, amt, due] },
    layout: {
      hLineColor: () => C.red,
      vLineColor: () => C.red,
      hLineWidth: (i: number) => (i === 1 || i === 2 ? 0 : 0.8),
      vLineWidth: () => 0.8,
    },
  }
}

// ---------- the document ----------

export async function buildPaymentsPdf(inp: PaymentsInput): Promise<Uint8Array> {
  const { stat, sa, ct } = inp
  const f = stat.figures
  const clientName = sa?.name ?? stat.directors[0] ?? ''
  const list = paymentCards(sa, ct)
  const total = paymentsTotal(list)
  const checks = inp.includeChecks ? inp.checks : []
  const pos = sa?.position ?? null

  const content: DocDef[] = []

  // ---- Page 1: what to pay ----
  content.push({ text: 'Tax payments requiring attention', fontSize: 20, bold: true, color: C.navy, id: 'payments', margin: [0, 0, 0, 2] })
  content.push({ text: [clientName, stat.companyName].filter(Boolean).join(' and '), fontSize: 10, color: C.grey, margin: [0, 0, 0, 10] })

  if (list.length) {
    content.push(cards(list))
    content.push({
      table: {
        widths: ['*'],
        body: [
          [{ text: 'TOTAL SCHEDULED PAYMENTS SHOWN', color: C.white, bold: true, fontSize: 8.5, fillColor: C.navy, margin: [6, 5, 6, 5] }],
          [{ text: gbp(total), color: C.red, bold: true, fontSize: 19, fillColor: C.amber, margin: [6, 5, 6, 5] }],
        ],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
      margin: [0, 8, 0, 2],
    })
    content.push({
      text: `The exact total of the ${list.length === 1 ? 'highlighted payment' : list.length === 3 ? 'three highlighted payments' : `${list.length} highlighted payments`} is ${gbp(total)}.`,
      fontSize: 8.5,
      color: C.grey,
    })
  } else {
    content.push({ text: 'No payments are due on the figures supplied.', fontSize: 11, color: C.grey })
  }

  // Payment control (kept near the top so it is never separated from the amounts)
  const mentionsPrior = checks.some((c) => c.tone === 'attention' && /prior payments/i.test(c.text))
  const credit = pos?.balance && pos.balance.amount < 0 ? -pos.balance.amount : null
  const control =
    'Before paying, confirm each live HMRC balance and use the correct tax-specific reference. Do not combine the company and personal payments.' +
    (mentionsPrior && credit != null ? ` The previous-payments discrepancy described in the sense-check must be resolved before relying on the ${gbp(credit)} credit.` : '')
  content.push({
    table: {
      widths: ['*'],
      body: [
        [{ text: 'IMPORTANT PAYMENT CONTROL', color: C.white, bold: true, fontSize: 8.5, fillColor: C.red, margin: [6, 5, 6, 5] }],
        [{ text: control, fontSize: 9, fillColor: C.redLight, margin: [6, 6, 6, 6] }],
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
    margin: [0, 8, 0, 0],
    unbreakable: true,
  })

  // Corporation Tax details
  if (ct) {
    content.push(heading('Corporation Tax details'))
    content.push(
      kvTable([
        ['Company', stat.companyName],
        ['Exact amount', gbp(ct.amount)],
        ['Due date', longDate(ct.dueISO)],
        ['Reference', ct.reference || 'Not supplied'],
        ['Account shown', HMRC_ACCOUNT],
      ]),
    )
    content.push(link('GOV.UK: Corporation Tax payment guidance', LINKS.ctGuide))
    content.push(link('HMRC: Pay Corporation Tax now', LINKS.ctPay))
  }

  // Self Assessment details
  if (pos && pos.groups.length) {
    const hasBalance = pos.balance && /offset/i.test(pos.balance.label)
    const rows: DocDef[][] = []
    const th = (t: string, al?: string) => ({ text: t, color: C.white, bold: true, fontSize: 9, fillColor: C.navy, margin: [5, 4, 5, 4], alignment: al })
    rows.push([th('Due date'), th('Description'), th('Amount', 'right')])
    for (const g of pos.groups) {
      if (g.items.length > 1) g.items.forEach((it) => {
        const label = hasBalance ? it.label.replace(/repayment due/i, 'credit carried forward') : it.label
        rows.push([
          { text: g.heading, fontSize: 9, margin: [5, 4, 5, 4] },
          { text: label, fontSize: 9, margin: [5, 4, 5, 4] },
          { text: gbp(it.amount), fontSize: 9, alignment: 'right', margin: [5, 4, 5, 4] },
        ])
      })
      const hi = { fillColor: C.amber, color: C.red, bold: true, fontSize: 9.5, margin: [5, 4, 5, 4] }
      const isPoa = g.items.length === 1
      rows.push([
        { text: g.heading, ...hi },
        { text: isPoa ? g.items[0].label.replace(/^\d{4}-\d{2}\s+/, '').toUpperCase() : 'NET AMOUNT TO PAY', ...hi },
        { text: gbp(g.total), alignment: 'right', ...hi },
      ])
    }
    content.push(heading('Personal Self Assessment details'))
    content.push({
      table: { headerRows: 1, widths: [90, '*', 80], body: rows },
      layout: { hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
    })
    const saRows: [string, string][] = []
    if (sa?.utr) saRows.push(['Self Assessment reference', `${sa.utr}K`])
    if (clientName) saRows.push(['Client', clientName])
    if (sa?.utr) saRows.push(['UTR', sa.utr])
    content.push({ ...kvTable(saRows, 150), margin: [0, 6, 0, 0], unbreakable: true })
    content.push(link('GOV.UK: Self Assessment payment guidance', LINKS.saGuide))
    content.push(link('HMRC: Pay Self Assessment now', LINKS.saPay))
  }

  // ---- Page 2: information and summaries ----
  content.push({ text: 'Company and personal information', fontSize: 14, bold: true, color: C.navy, pageBreak: 'before', margin: [0, 0, 0, 6], id: 'information' })
  const info: [string, string][] = [['Company', stat.companyName]]
  if (stat.companyNumber) info.push(['Company number', stat.companyNumber])
  if (stat.directors.length) info.push([stat.directors.length > 1 ? 'Directors' : 'Director', stat.directors.join(', ')])
  if (stat.periodLabel) info.push(['Company year end', stat.periodLabel])
  if (sa?.taxYear) info.push(['Personal tax year', sa.taxYear])
  if (sa?.nino) info.push(['NI number', sa.nino])
  if (sa?.agentRef) info.push(['Agent reference', sa.agentRef])
  content.push(kvTable(info))

  // Company financial summary
  const money = (n: number) => gbp(Math.round(n * 100), { pence: false })
  const fin: [string, string][] = []
  if (f.turnover) fin.push(['Turnover', money(f.turnover[0])])
  if (f.staff) fin.push(['Staff costs', money(f.staff[0])])
  if (f.pbt) fin.push(['Profit before tax', money(f.pbt[0])])
  if (ct && f.pbt) {
    fin.push(['Corporation Tax - exact', gbp(-ct.amount)])
    fin.push(['Post-tax profit - exact', gbp(f.pbt[0] * 100 - ct.amount)])
  }
  if (f.netAssets) fin.push([f.netAssets[0] < 0 ? 'Net liabilities' : 'Net assets', money(f.netAssets[0])])
  if (fin.length) {
    content.push(heading('Company financial summary'))
    content.push({
      table: {
        widths: ['*', 110],
        body: [
          [
            { text: 'Item', color: C.white, bold: true, fontSize: 9, fillColor: C.navy, margin: [5, 4, 5, 4] },
            { text: 'Amount', color: C.white, bold: true, fontSize: 9, fillColor: C.navy, margin: [5, 4, 5, 4], alignment: 'right' },
          ],
          ...fin.map(([k, v]) => [
            { text: k, fontSize: 9.5, margin: [5, 4, 5, 4] },
            { text: v, fontSize: 9.5, alignment: 'right', margin: [5, 4, 5, 4] },
          ]),
        ],
      },
      layout: { hLineColor: () => C.line, vLineColor: () => C.line, hLineWidth: () => 0.6, vLineWidth: () => 0.6 },
    })
  }

  // Personal tax summary
  const s = sa?.sa302
  if (s) {
    const inc = (re: RegExp) => s.income.find((i) => re.test(i.label))?.amount
    const rows: [string, string][] = []
    const pay = inc(/pay from all employments/i)
    const div = inc(/dividend/i)
    if (pay != null) rows.push(['Employment pay', gbp(pay)])
    if (div != null) rows.push(['UK dividends', gbp(div)])
    if (s.totalIncome != null) rows.push(['Total income', gbp(s.totalIncome)])
    if (s.incomeTax != null) rows.push([`${sa?.taxYear ?? ''} Income Tax`.trim(), gbp(s.incomeTax)])
    if (pos && pos.lessTotal != null && pos.lessTotal !== 0) rows.push(['Prior payments used in summary', gbp(-pos.lessTotal)])
    if (credit != null) rows.push(['Credit carried forward', gbp(credit)])
    if (rows.length) {
      content.push(heading('Personal tax summary'))
      content.push(kvTable(rows, 200))
    }
  }

  // ---- Page 3: sense-check ----
  if (checks.length) {
    content.push({ text: 'Sense-check information', fontSize: 14, bold: true, color: C.navy, pageBreak: 'before', margin: [0, 0, 0, 8], id: 'sense-check' })
    for (const c of checks) {
      const attn = c.tone === 'attention'
      content.push({
        columns: [
          { width: 12, canvas: [{ type: 'rect', x: 0, y: 3, w: 6, h: 6, color: attn ? C.red : C.teal }] },
          { width: '*', text: c.text, fontSize: 9.5, lineHeight: 1.3 },
        ],
        margin: [0, 0, 0, 7],
        unbreakable: true,
      })
    }
    content.push({
      stack: [
        { text: 'Limitations', bold: true, fontSize: 10, color: C.navy, margin: [0, 0, 0, 3] },
        {
          text: 'This sheet is an internal sense-check based on the supplied statutory accounts, letter and Self Assessment return. It does not confirm CT600 filing, live HMRC balances, bank interest or payment allocation.',
          fontSize: 8.5,
          color: C.grey,
        },
      ],
      margin: [0, 12, 0, 0],
    })
  }

  const dd: DocDef = {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 62, MARGIN_X, 50],
    info: { title: 'Private client tax payment sheet', author: FIRM },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.ink },
    header: () => ({
      stack: [
        { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 34, color: C.navy }] },
        { text: 'PRIVATE CLIENT TAX PAYMENT SHEET', color: C.white, bold: true, fontSize: 8.5, characterSpacing: 0.4, absolutePosition: { x: MARGIN_X, y: 13 } },
      ],
    }),
    footer: (page: number) => ({
      columns: [
        { text: 'Verify all amounts and references against live HMRC accounts before payment', color: C.grey, fontSize: 8 },
        { text: `Page ${page}`, color: C.grey, fontSize: 8, alignment: 'right', width: 50 },
      ],
      margin: [MARGIN_X, 18, MARGIN_X, 0],
    }),
    content,
  }
  void CONTENT_W

  const bytes = await renderPdf(dd)
  return addBookmarks(
    bytes,
    [
      { title: 'Payments due', dest: 'payments' },
      { title: 'Company and personal information', dest: 'information' },
      ...(checks.length ? [{ title: 'Sense-check information', dest: 'sense-check' }] : []),
    ],
    { title: `Tax payments – ${clientName || stat.companyName}`, author: FIRM, subject: 'Private client tax payment sheet' },
  )
}
