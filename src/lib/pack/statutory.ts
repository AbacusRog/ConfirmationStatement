// Parses a set of statutory accounts PDF (as produced by the practice
// software) into structured sections, keeping every string verbatim so the
// re-laid-out pack carries exactly the same information.

import type { TPage, TLine } from './pdfText'

// ---------- Model ----------

export interface TableRow {
  label: string
  vals: string[] // one per numeric column, '' where blank
  bold: boolean
  italic: boolean
  indent: number // points relative to the table's left edge
  heading: boolean // label-only row inside a table (e.g. "TURNOVER", "Premises expenses:")
}
export interface TableBlock {
  type: 'table'
  ncols: number
  groups: { text: string; span: number }[]
  sub: string[] // per-column sub-header, e.g. "£"
  headerLines: string[] // header text we could not map onto columns (kept, never dropped)
  rows: TableRow[]
}
export interface HeadingBlock {
  type: 'heading'
  text: string
}
export interface ParaBlock {
  type: 'para'
  lines: string[] // each entry is one visual line (wrapped source lines already joined)
}
export interface KvBlock {
  type: 'kv'
  rows: { label: string; lines: string[] }[]
}
export type Block = TableBlock | HeadingBlock | ParaBlock | KvBlock

export interface StatSection {
  id: string
  title: string
  subtitle: string
  statPage: string | null // the page number printed on the statutory accounts
  statutory: boolean // false for pages the accounts say "do not form part of the statutory accounts"
  blocks: Block[]
  sourcePdfPage: number
}

export interface ContentsRow {
  label: string
  page: string | null // printed page number, null for a note/divider row
}

export type Pair = [number, number] // [current year, prior year]

export interface Figures {
  turnover?: Pair
  directCosts?: Pair
  staff?: Pair
  depreciation?: Pair
  other?: Pair
  pbt?: Pair
  tax?: Pair
  netProfit?: Pair
  fixedAssets?: Pair
  currentAssets?: Pair
  creditors?: Pair
  netCurrent?: Pair
  totalAssetsLessCL?: Pair
  accruals?: Pair
  netAssets?: Pair
  reserves?: Pair
}

export interface TradingLine {
  label: string
  cur: number | null
  prior: number | null
  kind: 'detail' | 'total' | 'heading'
}

export interface Statutory {
  companyName: string
  coverLines: string[]
  periodEnd: string | null // ISO
  periodLabel: string // e.g. "31 March 2026"
  priorLabel: string | null // e.g. "31 March 2025" if found in column headers
  companyNumber: string | null
  directors: string[]
  registeredOffice: string[]
  accountants: string[]
  preparedDate: string | null // e.g. "25th September 2026" as printed
  contents: ContentsRow[]
  sections: StatSection[]
  figures: Figures
  trading: TradingLine[]
  warnings: string[]
  /** every word on the statutory content pages, for the completeness check */
  sourceWords: string[]
}

// ---------- Helpers ----------

const MONTHS = [
  'january',
  'february',
  'march',
  'april',
  'may',
  'june',
  'july',
  'august',
  'september',
  'october',
  'november',
  'december',
]

export function parseLongDate(s: string): string | null {
  const m = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})/i)
  if (!m) return null
  const mm = MONTHS.indexOf(m[2].toLowerCase()) + 1
  return `${m[3]}-${String(mm).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`
}

const NUM_TOKEN = /^\(?-?£?\d[\d,]*(\.\d+)?\)?$/
function isNumTok(s: string): boolean {
  const t = s.trim()
  return NUM_TOKEN.test(t) || t === '-' || t === '–'
}

/** "(1,258)" -> -1258, "-" -> 0, "" -> null */
export function num(s: string | undefined | null): number | null {
  if (s == null) return null
  const t = s.trim()
  if (t === '') return null
  if (t === '-' || t === '–') return 0
  const neg = /^\(.*\)$/.test(t) || t.startsWith('-')
  const d = t.replace(/[()£,\-\s]/g, '')
  if (!/^\d+(\.\d+)?$/.test(d)) return null
  return neg ? -Number(d) : Number(d)
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

function isBoldLine(l: TLine, page: TPage): boolean {
  return l.items.every((i) => i.font === page.boldFont)
}

// ---------- Numeric tables ----------

interface NumericInfo {
  labelItems: TLine['items']
  numItems: TLine['items']
}

function numericInfo(l: TLine, page: TPage): NumericInfo | null {
  const items = l.items
  let k = items.length
  while (k > 0 && isNumTok(items[k - 1].str) && items[k - 1].x1 > page.width * 0.5) k--
  const numItems = items.slice(k)
  if (numItems.length === 0) return null
  const labelItems = items.slice(0, k)
  // A "£" only line, or a line of bare numbers with no label, is still a numeric row
  // (sub-total rows have no label), but a lone small integer at the far left is not.
  return { labelItems, numItems }
}

function clusterColumns(xs: number[]): number[] {
  const sorted = [...xs].sort((a, b) => a - b)
  const clusters: number[][] = []
  for (const x of sorted) {
    const last = clusters[clusters.length - 1]
    if (last && x - last[last.length - 1] <= 9) last.push(x)
    else clusters.push([x])
  }
  return clusters.map((c) => c.reduce((a, b) => a + b, 0) / c.length)
}

function nearest(centers: number[], x: number): number {
  let best = 0
  let bd = Infinity
  centers.forEach((c, i) => {
    const d = Math.abs(c - x)
    if (d < bd) {
      bd = d
      best = i
    }
  })
  return best
}

function buildTable(lines: TLine[], page: TPage): TableBlock {
  // Split off header lines: leading lines that hold no label (everything right of 35% of the page).
  const headerLines: TLine[] = []
  let i = 0
  while (i < lines.length) {
    const l = lines[i]
    const rightOnly = l.items.every((it) => it.x0 > page.width * 0.35)
    const allPounds = l.items.every((it) => it.str.trim() === '£')
    const hasLetters = l.items.some((it) => /[A-Za-z]/.test(it.str))
    if (rightOnly && (allPounds || hasLetters)) {
      headerLines.push(l)
      i++
    } else break
  }
  const bodyLines = lines.slice(i)

  const numeric = bodyLines.map((l) => numericInfo(l, page))
  const xs: number[] = []
  numeric.forEach((n) => n?.numItems.forEach((it) => xs.push(it.x1)))
  const centers = clusterColumns(xs)
  const ncols = centers.length

  const leftEdge = Math.min(...bodyLines.map((l) => l.x0))
  const rows: TableRow[] = bodyLines.map((l, idx) => {
    const n = numeric[idx]
    const vals: string[] = new Array(ncols).fill('')
    let labelItems = l.items
    if (n) {
      labelItems = n.labelItems
      for (const it of n.numItems) {
        const c = nearest(centers, it.x1)
        vals[c] = vals[c] ? `${vals[c]} ${it.str}` : it.str
      }
    }
    const label = labelItems
      .map((it) => it.str)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    const boldLabel = labelItems.length > 0 && labelItems.every((it) => it.font === page.boldFont)
    const italicLabel =
      labelItems.length > 0 && labelItems.every((it) => it.font !== page.boldFont && it.font !== page.bodyFont)
    return {
      label,
      vals,
      bold: boldLabel,
      italic: italicLabel,
      indent: labelItems.length ? Math.max(0, labelItems[0].x0 - leftEdge) : 0,
      heading: !n,
    }
  })

  // Column headers: "£" markers and date/text headers over the number columns.
  const poundLine = headerLines.find((l) => l.items.every((it) => it.str.trim() === '£'))
  const sub: string[] = new Array(ncols).fill('')
  if (poundLine && poundLine.items.length === ncols) poundLine.items.forEach((it, k) => (sub[k] = it.str.trim()))
  const textHeaders = headerLines.filter((l) => l !== poundLine)
  const groups: { text: string; span: number }[] = []
  const leftover: string[] = []
  for (const l of textHeaders) {
    const n = l.items.length
    if (n > 0 && ncols % n === 0) {
      const span = ncols / n
      l.items.forEach((it) => groups.push({ text: it.str.trim(), span }))
    } else leftover.push(l.text)
  }
  // more than one header line collapses into one group row; keep the extra lines as text
  let finalGroups = groups
  if (textHeaders.length > 1) {
    finalGroups = []
    leftover.length = 0
    // Keep it simple and lossless: put every header line into headerLines text.
    textHeaders.forEach((l) => leftover.push(l.text))
  }

  return { type: 'table', ncols, groups: finalGroups, sub, headerLines: leftover, rows }
}

// ---------- Text blocks ----------

function textBlocks(lines: TLine[], page: TPage): Block[] {
  if (lines.length === 0) return []
  const blocks: Block[] = []

  // Key/value layout (Company Information): bold label at the left, value further right.
  const kvLines = lines.filter((l) => isKvStart(l, page))
  if (kvLines.length >= 2) {
    const kv: KvBlock = { type: 'kv', rows: [] }
    const rest: TLine[] = []
    let cur: { label: string; lines: string[] } | null = null
    for (const l of lines) {
      if (isKvStart(l, page)) {
        const [first, ...others] = l.items
        cur = { label: first.str.trim(), lines: [others.map((o) => o.str).join(' ').trim()] }
        kv.rows.push(cur)
      } else if (cur && l.x0 > 120) {
        cur.lines.push(l.text)
      } else {
        rest.push(l)
        cur = null
      }
    }
    blocks.push(kv)
    return blocks.concat(rest.length ? textBlocks(rest, page) : [])
  }

  const bodyWidths = lines.filter((l) => l.text.length > 60).map((l) => l.x1 - l.x0)
  const fullWidth = bodyWidths.length ? Math.max(...bodyWidths) : 0

  // group into blocks by vertical gap
  const groups: TLine[][] = []
  for (const l of lines) {
    const g = groups[groups.length - 1]
    const prev = g?.[g.length - 1]
    const h = l.items[0].h || 8
    if (prev && prev.y - l.y <= h * 1.55) g.push(l)
    else groups.push([l])
  }

  for (const g of groups) {
    // numbered heading: "1." + bold title
    if (g.length === 1) {
      const l = g[0]
      if (l.items.length >= 2 && /^\d+\.$/.test(l.items[0].str.trim()) && l.items.slice(1).every((i) => i.font === page.boldFont)) {
        blocks.push({ type: 'heading', text: l.text })
        continue
      }
      if (isBoldLine(l, page)) {
        blocks.push({ type: 'heading', text: l.text })
        continue
      }
    }
    const out: string[] = []
    let prev: TLine | null = null
    for (const l of g) {
      const prevLong = prev && fullWidth > 0 && prev.x1 - prev.x0 >= fullWidth * 0.82
      if (prev && prevLong) out[out.length - 1] = `${out[out.length - 1]} ${l.text}`
      else out.push(l.text)
      prev = l
    }
    blocks.push({ type: 'para', lines: out })
  }
  return blocks
}

function isKvStart(l: TLine, page: TPage): boolean {
  if (l.items.length < 2) return false
  const first = l.items[0]
  return first.font === page.boldFont && first.x0 < 120 && l.items.slice(1).every((i) => i.x0 > 120)
}

// ---------- Page parsing ----------

const FOOTER = /^Page (\d+)$/

function parseContentPage(page: TPage): {
  company: string
  title: string
  subtitle: string
  statPage: string | null
  blocks: Block[]
  bodyLines: TLine[]
} {
  const lines = [...page.lines]
  // header = leading bold lines near the top (max 3)
  const header: TLine[] = []
  while (lines.length && header.length < 3 && isBoldLine(lines[0], page) && lines[0].y > page.height - 110) header.push(lines.shift()!)
  // footer
  let statPage: string | null = null
  const fi = lines.findIndex((l) => FOOTER.test(l.text) && l.y < 80)
  if (fi >= 0) {
    statPage = lines[fi].text.match(FOOTER)![1]
    lines.splice(fi, 1)
  }

  // split into table runs and text runs
  const info = lines.map((l) => numericInfo(l, page))
  const isNum = info.map((n) => !!n && !(n.labelItems.length === 0 && n.numItems.every((it) => it.str.trim() === '£')))
  const blocks: Block[] = []
  let idx = 0
  let textRun: TLine[] = []
  const flushText = () => {
    if (textRun.length) blocks.push(...textBlocks(textRun, page))
    textRun = []
  }
  while (idx < lines.length) {
    // does a table start here? (header lines directly above a numeric row, or a numeric row)
    let firstNum = -1
    for (let k = idx; k < lines.length; k++) {
      if (isNum[k]) {
        firstNum = k
        break
      }
    }
    if (firstNum < 0) {
      textRun.push(...lines.slice(idx))
      break
    }
    // Work back from the first numeric row over (a) up to two short bold/italic heading lines
    // and (b) column-header lines that sit only over the number columns.
    const rightOnly = (l: TLine) => l.items.every((it) => it.x0 > page.width * 0.35)
    const styledHeading = (l: TLine) =>
      l.x1 < page.width * 0.62 && l.items.every((it) => it.font !== page.bodyFont) && !rightOnly(l)
    let start = firstNum
    let h = 0
    while (start - 1 >= idx && h < 2 && styledHeading(lines[start - 1])) {
      start--
      h++
    }
    let hs = start
    while (hs - 1 >= idx && rightOnly(lines[hs - 1])) hs--
    if (hs < start || h > 0) start = hs
    textRun.push(...lines.slice(idx, start))
    flushText()
    // extend through following numeric rows, allowing <=2 short label-only lines between numeric rows
    let end = firstNum
    let k = firstNum + 1
    while (k < lines.length) {
      if (isNum[k]) {
        end = k
        k++
        continue
      }
      // look ahead for the next numeric row within 3 lines through short label-only lines
      let j = k
      while (j < lines.length && !isNum[j] && j - k < 3 && lines[j].x1 < page.width * 0.62) j++
      if (j < lines.length && isNum[j] && j - k <= 2) {
        k = j
        continue
      }
      break
    }
    blocks.push(buildTable(lines.slice(start, end + 1), page))
    idx = end + 1
  }
  flushText()

  return {
    company: header[0]?.text ?? '',
    title: header[1]?.text ?? '',
    subtitle: header[2]?.text ?? '',
    statPage,
    blocks,
    bodyLines: lines,
  }
}

// ---------- Whole document ----------

export function parseStatutory(pages: TPage[]): Statutory {
  const warnings: string[] = []
  const first = pages[0]
  const coverLines = first ? first.lines.map((l) => l.text) : []
  const companyName = titleCase(coverLines[0] ?? '')

  // contents page
  const contents: ContentsRow[] = []
  const contentsPage = pages.find((p) => p.lines.length > 1 && p.lines[1].text.trim().toLowerCase() === 'contents')
  if (contentsPage) {
    const body = contentsPage.lines.slice(2)
    for (const l of body) {
      const t = l.text.trim()
      if (t.toLowerCase() === 'page') continue
      const last = l.items[l.items.length - 1]
      if (l.items.length >= 2 && /^\d+$/.test(last.str.trim()) && last.x0 > contentsPage.width * 0.6) {
        contents.push({ label: l.items.slice(0, -1).map((i) => i.str).join(' ').trim(), page: last.str.trim() })
      } else contents.push({ label: t, page: null })
    }
  } else warnings.push('No contents page found in the statutory accounts.')

  // Which printed pages sit after a "do not form part" note?
  const nonStatPages = new Set<string>()
  let afterNote = false
  for (const r of contents) {
    if (r.page === null && /do not form part/i.test(r.label)) afterNote = true
    else if (r.page && afterNote) nonStatPages.add(r.page)
  }

  const sections: StatSection[] = []
  const sourceWords: string[] = []
  let headerCompany = ''
  let periodLabel = ''
  for (const page of pages) {
    if (page === first || page === contentsPage) continue
    const parsed = parseContentPage(page)
    if (!parsed.title) continue
    if (!headerCompany) headerCompany = parsed.company
    if (!periodLabel && parsed.subtitle) periodLabel = parsed.subtitle
    const id = slug(parsed.title) || `page-${page.num}`
    sections.push({
      id,
      title: parsed.title,
      subtitle: parsed.subtitle,
      statPage: parsed.statPage,
      statutory: !(parsed.statPage && nonStatPages.has(parsed.statPage)),
      blocks: parsed.blocks,
      sourcePdfPage: page.num,
    })
    for (const l of parsed.bodyLines) for (const w of l.text.split(/\s+/)) if (w) sourceWords.push(w)
  }

  // period end
  let periodEnd: string | null = null
  for (const t of [...coverLines, periodLabel, ...sections.map((s) => s.subtitle)]) {
    const d = parseLongDate(t)
    if (d) {
      periodEnd = d
      break
    }
  }
  const periodLabelText = periodEnd
    ? new Date(periodEnd + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    : ''

  // company info
  const kv = new Map<string, string[]>()
  for (const s of sections)
    for (const b of s.blocks)
      if (b.type === 'kv') for (const r of b.rows) kv.set(r.label.toLowerCase(), r.lines)
  const pick = (re: RegExp): string[] => {
    for (const [k, v] of kv) if (re.test(k)) return v
    return []
  }
  const directors = pick(/^directors?$/)
  const registeredOffice = pick(/registered office/)
  const accountants = pick(/^accountants?$/)
  const companyNumber = pick(/company number/)[0] ?? null

  // date the accounts were approved / report signed: first standalone date line in the accountant's report
  let preparedDate: string | null = null
  const rep = sections.find((s) => /accountant.?s report/i.test(s.title))
  if (rep)
    for (const b of rep.blocks)
      if (b.type === 'para')
        for (const ln of b.lines)
          if (!preparedDate && /^\d{1,2}(st|nd|rd|th)? [A-Za-z]+ \d{4}$/.test(ln.trim())) preparedDate = ln.trim()

  // Figures and trading lines
  const figures: Figures = {}
  const trading: TradingLine[] = []
  let priorLabel: string | null = null
  for (const s of sections) {
    const isTrading = /trading/i.test(s.title)
    const isPL = /profit and loss/i.test(s.title) && !isTrading
    const isBS = /balance sheet/i.test(s.title)
    for (const b of s.blocks) {
      if (b.type !== 'table') continue
      if (b.groups.length >= 2 && !priorLabel && (isPL || isBS)) priorLabel = b.groups[1].text
      if (isTrading) {
        for (const r of b.rows) {
          if (r.heading) trading.push({ label: r.label, cur: null, prior: null, kind: 'heading' })
          else {
            const blank = r.label === ''
            const detail = !blank && (r.vals[0] !== '' || r.vals[2] !== '')
            trading.push({
              label: r.label,
              cur: num(detail ? r.vals[0] : blank ? r.vals[0] || r.vals[1] : r.vals[1]),
              prior: num(detail ? r.vals[2] : blank ? r.vals[2] || r.vals[3] : r.vals[3]),
              kind: detail ? 'detail' : 'total',
            })
          }
        }
      } else if (isPL || isBS) {
        for (const r of b.rows) {
          if (r.heading || b.ncols < 2) continue
          const a = num(r.vals[0])
          const p = num(r.vals[1])
          if (a === null && p === null) continue
          const pair: Pair = [a ?? 0, p ?? 0]
          const L = r.label.toLowerCase()
          const set = (k: keyof Figures) => {
            if (!figures[k]) figures[k] = pair
          }
          if (isPL) {
            if (/^turnover$/.test(L)) set('turnover')
            else if (/cost of (raw materials|sales|goods)|^direct costs/.test(L)) set('directCosts')
            else if (/^staff costs|^wages|^employment costs/.test(L)) set('staff')
            else if (/depreciation/.test(L)) set('depreciation')
            else if (/^other charges|^administrative expenses|^other operating/.test(L)) set('other')
            else if (/profit.*before tax|loss.*before tax/.test(L)) set('pbt')
            else if (/^tax\b|taxation on|tax on (profit|loss)/.test(L)) set('tax')
            else if (/^net (profit|loss)|profit for the (financial )?year|(profit|loss) for the (financial )?year|profit.*after tax/.test(L)) set('netProfit')
          } else {
            if (/^fixed assets/.test(L)) set('fixedAssets')
            else if (/^current assets/.test(L)) set('currentAssets')
            else if (/^creditors.*within one year|falling due within/.test(L)) set('creditors')
            else if (/^net current/.test(L)) set('netCurrent')
            else if (/^total assets less current/.test(L)) set('totalAssetsLessCL')
            else if (/^accruals|^creditors.*after more than one year|^provisions/.test(L)) set('accruals')
            else if (/^net (\(?liabilities\)?\/?)?(assets|liabilities)|^net assets|^net liabilities/.test(L)) set('netAssets')
            else if (/^capital and reserves|^shareholders|^total equity/.test(L)) set('reserves')
          }
        }
      }
    }
  }

  return {
    companyName: headerCompany || companyName,
    coverLines,
    periodEnd,
    periodLabel: periodLabelText,
    priorLabel,
    companyNumber,
    directors,
    registeredOffice,
    accountants,
    preparedDate,
    contents,
    sections,
    figures,
    trading,
    warnings,
    sourceWords,
  }
}

/** "CHILD AND FAMILY ADVISORY SERVICE LIMITED" -> "Child And Family Advisory Service Limited" */
function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ')
}

/** Every word rendered from the parsed sections (used to check nothing was dropped). */
export function modelWords(sections: StatSection[]): string[] {
  const out: string[] = []
  const add = (s: string) => s.split(/\s+/).forEach((w) => w && out.push(w))
  for (const s of sections)
    for (const b of s.blocks) {
      if (b.type === 'heading') add(b.text)
      else if (b.type === 'para') b.lines.forEach(add)
      else if (b.type === 'kv') b.rows.forEach((r) => (add(r.label), r.lines.forEach(add)))
      else {
        b.groups.forEach((g) => add(g.text))
        b.sub.forEach(add)
        b.headerLines.forEach(add)
        b.rows.forEach((r) => (add(r.label), r.vals.forEach(add)))
      }
    }
  return out
}

/** Compare source vs. rendered words as multisets. Returns words missing from / extra in the model. */
export function compareWords(source: string[], model: string[]): { missing: string[]; extra: string[] } {
  const count = (arr: string[]) => {
    const m = new Map<string, number>()
    arr.forEach((w) => m.set(w, (m.get(w) ?? 0) + 1))
    return m
  }
  const a = count(source)
  const b = count(model)
  const missing: string[] = []
  const extra: string[] = []
  for (const [w, n] of a) {
    const d = n - (b.get(w) ?? 0)
    for (let i = 0; i < d; i++) missing.push(w)
  }
  for (const [w, n] of b) {
    const d = n - (a.get(w) ?? 0)
    for (let i = 0; i < d; i++) extra.push(w)
  }
  return { missing, extra }
}
