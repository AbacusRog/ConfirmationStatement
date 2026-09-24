// Builds "Accounts 2026.pdf": a reader-friendly re-layout of the statutory
// accounts with a linked contents page, bookmarks and a financial review.
// Every string from the statutory accounts is reproduced verbatim.

import type { Statutory, StatSection, Block, TableBlock } from './statutory'
import type { Review } from './review'
import { COLORS as C, renderPdf, addBookmarks, type DocDef, type Bookmark } from './pdfEnv'

const PAGE_W = 595.28
const MARGIN_X = 50
const CONTENT_W = PAGE_W - MARGIN_X * 2

const FIRM = 'Abacus Consultancy'
const FIRM_LINE = 'Mulberry Grove · PO Box 3653 · Wokingham · RG40 9NN'

// Categorical palette for the "where each £1 went" bar (validated for adjacent-pair separation).
const SEG = {
  direct: { fill: '#2a78d6', text: '#FFFFFF' },
  staff: { fill: '#eb6834', text: '#FFFFFF' },
  dep: { fill: '#1baf7a', text: '#0B2A20' },
  other: { fill: '#eda100', text: '#3A2A00' },
  tax: { fill: '#e87ba4', text: '#3A0F20' },
  profit: { fill: '#008300', text: '#FFFFFF' },
} as const

const secId = (s: StatSection) => `sec-${s.id}`

export async function buildAccountsPack(stat: Statutory, review: Review | null): Promise<Uint8Array> {
  const content: DocDef[] = []
  const bookmarks: Bookmark[] = [{ title: 'Cover', dest: 'cover' }, { title: 'Contents', dest: 'contents' }]
  if (review) bookmarks.push({ title: 'Financial review', dest: 'financial-review' })
  stat.sections.forEach((s) => bookmarks.push({ title: s.title, dest: secId(s) }))

  content.push(...coverPage(stat))
  content.push(...contentsPage(stat, !!review))
  if (review) content.push(...reviewPages(stat, review))
  for (const s of stat.sections) content.push(...sectionPage(s))

  const upper = stat.companyName.toUpperCase()
  const dd: DocDef = {
    pageSize: 'A4',
    pageMargins: [MARGIN_X, 76, MARGIN_X, 54],
    info: { title: `${stat.companyName} – Accounts`, author: FIRM },
    defaultStyle: { font: 'Roboto', fontSize: 10, color: C.ink, lineHeight: 1.25 },
    header: (page: number) =>
      page === 1
        ? null
        : {
            stack: [
              { canvas: [{ type: 'rect', x: 0, y: 0, w: PAGE_W, h: 44, color: C.navy }] },
              { text: upper, color: C.white, bold: true, fontSize: 8.5, characterSpacing: 0.4, absolutePosition: { x: MARGIN_X, y: 19 } },
              {
                text: 'Back to contents',
                color: C.white,
                fontSize: 8.5,
                linkToDestination: 'contents',
                decoration: 'underline',
                absolutePosition: { x: PAGE_W - MARGIN_X - 72, y: 19 },
              },
            ],
          },
    footer: (page: number, count: number) =>
      page === 1
        ? null
        : {
            columns: [
              { text: FIRM, color: C.grey, fontSize: 8 },
              { text: `Page ${page} of ${count}`, color: C.grey, fontSize: 8, alignment: 'right' },
            ],
            margin: [MARGIN_X, 22, MARGIN_X, 0],
          },
    styles: {
      h1: { fontSize: 22, bold: true, color: C.navy },
      sub: { fontSize: 11, color: C.grey },
    },
    content,
  }

  const bytes = await renderPdf(dd)
  return addBookmarks(bytes, bookmarks, {
    title: `${stat.companyName} – Accounts for the year ended ${stat.periodLabel}`,
    author: FIRM,
    subject: 'Reader-friendly copy of the statutory accounts with financial review',
  })
}

// ---------------- Cover ----------------

function coverPage(stat: Statutory): DocDef[] {
  const [company, title, period] = [stat.coverLines[0] ?? stat.companyName.toUpperCase(), stat.coverLines[1] ?? 'FINANCIAL STATEMENTS', stat.coverLines[2] ?? '']
  const acc = stat.accountants.length ? stat.accountants : [FIRM, FIRM_LINE]
  return [
    { text: '', id: 'cover' },
    { canvas: [{ type: 'rect', x: 0, y: 0, w: CONTENT_W, h: 380, color: C.navy }], absolutePosition: { x: MARGIN_X, y: 190 } },
    { text: title, color: C.white, bold: true, fontSize: 30, lineHeight: 1.15, absolutePosition: { x: MARGIN_X + 40, y: 240 }, width: CONTENT_W - 80 },
    { text: period, color: '#C9D6E2', fontSize: 12.5, characterSpacing: 0.6, absolutePosition: { x: MARGIN_X + 40, y: 330 }, width: CONTENT_W - 80 },
    { text: company, color: C.white, bold: true, fontSize: 24, lineHeight: 1.2, absolutePosition: { x: MARGIN_X + 40, y: 470 }, width: CONTENT_W - 80 },
    ...(stat.preparedDate
      ? [{ text: `Prepared ${stat.preparedDate}`, color: C.navy, bold: true, fontSize: 12, absolutePosition: { x: MARGIN_X + 12, y: 600 } }]
      : []),
    { text: acc.join(' · '), color: C.grey, fontSize: 9.5, absolutePosition: { x: MARGIN_X + 12, y: 622 }, width: CONTENT_W - 24 },
    { text: '', pageBreak: 'after' },
  ]
}

// ---------------- Contents ----------------

function contentsPage(stat: Statutory, hasReview: boolean): DocDef[] {
  const link = (text: string, id: string, extra: DocDef = {}) => ({ text, color: C.teal, linkToDestination: id, ...extra })
  const rows: DocDef[][] = [
    [
      { text: 'Section', bold: true, color: C.white, fillColor: C.navy, margin: [6, 4, 0, 4] },
      { text: 'Page', bold: true, color: C.white, fillColor: C.navy, alignment: 'right', margin: [0, 4, 0, 4] },
      { text: 'Statutory accounts page', bold: true, color: C.white, fillColor: C.navy, alignment: 'right', margin: [0, 4, 6, 4] },
    ],
  ]
  const cell = (n: DocDef, extra: DocDef = {}) => ({ ...n, ...extra })
  if (hasReview) {
    rows.push([
      cell(link('Financial review', 'financial-review'), { margin: [6, 5, 0, 5] }),
      cell({ pageReference: 'financial-review', color: C.teal, alignment: 'right' }, { margin: [0, 5, 0, 5] }),
      cell({ text: '–', color: C.grey, alignment: 'right' }, { margin: [0, 5, 6, 5] }),
    ])
  }
  if (stat.contents.length) {
    for (const r of stat.contents) {
      const sec = r.page ? stat.sections.find((s) => s.statPage === r.page) : undefined
      if (r.page === null) {
        rows.push([
          { text: r.label, italics: true, color: C.grey, colSpan: 3, margin: [6, 5, 6, 5], fillColor: C.greyLight },
          {},
          {},
        ])
      } else if (sec) {
        rows.push([
          cell(link(r.label, secId(sec)), { margin: [6, 5, 0, 5] }),
          cell({ pageReference: secId(sec), color: C.teal, alignment: 'right' }, { margin: [0, 5, 0, 5] }),
          cell({ text: r.page, color: C.grey, alignment: 'right' }, { margin: [0, 5, 6, 5] }),
        ])
      } else {
        rows.push([
          cell({ text: r.label }, { margin: [6, 5, 0, 5] }),
          cell({ text: '' }),
          cell({ text: r.page, color: C.grey, alignment: 'right' }, { margin: [0, 5, 6, 5] }),
        ])
      }
    }
  } else {
    for (const s of stat.sections)
      rows.push([
        cell(link(s.title, secId(s)), { margin: [6, 5, 0, 5] }),
        cell({ pageReference: secId(s), color: C.teal, alignment: 'right' }, { margin: [0, 5, 0, 5] }),
        cell({ text: s.statPage ?? '–', color: C.grey, alignment: 'right' }, { margin: [0, 5, 6, 5] }),
      ])
  }
  return [
    { text: 'Contents', style: 'h1', id: 'contents' },
    { text: 'Statutory accounts and financial review', style: 'sub', margin: [0, 2, 0, 12] },
    {
      table: { headerRows: 1, widths: ['*', 50, 120], body: rows },
      layout: {
        hLineWidth: (i: number) => (i === 0 ? 0 : 0.6),
        vLineWidth: () => 0,
        hLineColor: () => C.line,
      },
    },
    {
      text: [
        'Click a section or page number to jump to it, or use the bookmarks panel in your PDF viewer. ',
        'This pack repeats the information in the statutory accounts in a layout that is easier to read; the statutory accounts themselves are provided as a separate document.',
      ],
      fontSize: 9,
      color: C.grey,
      margin: [0, 14, 0, 0],
    },
    { text: '', pageBreak: 'after' },
  ]
}

// ---------------- Financial review ----------------

function reviewPages(stat: Statutory, r: Review): DocDef[] {
  const out: DocDef[] = []
  out.push({ text: 'Financial review', style: 'h1', id: 'financial-review' })
  out.push({
    text: `Comparison of the years ended ${stat.periodLabel} and ${priorPeriodLabel(stat)}`,
    style: 'sub',
    margin: [0, 2, 0, 12],
  })

  // Key figures
  const n = r.keyFigures.length
  out.push({
    table: {
      widths: Array(n).fill('*'),
      body: [
        r.keyFigures.map((k) => ({
          stack: [
            { text: k.label.toUpperCase(), fontSize: 7.5, bold: true, color: C.grey, characterSpacing: 0.4 },
            { text: k.value, fontSize: 19, bold: true, color: C.navy, margin: [0, 3, 0, 2] },
            { text: k.note, fontSize: 8.5, color: C.grey },
          ],
          fillColor: C.tealLight,
          margin: [8, 8, 6, 8],
        })),
      ],
    },
    layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 || i === n ? 0 : 3), vLineColor: () => C.white },
    margin: [0, 0, 0, 14],
  })

  // Commentary first: it is the part most people read.
  for (const p of r.paragraphs) {
    const runs: DocDef[] = [{ text: `${p.heading}. `, bold: true, color: C.navy }, { text: p.text }]
    if (p.linkId && stat.sections.some((s) => secId(s) === `sec-${p.linkId}`)) {
      runs.push({ text: '  ' })
      runs.push({ text: `See ${p.linkText}`, color: C.teal, linkToDestination: `sec-${p.linkId}`, fontSize: 9, decoration: 'underline' })
    }
    out.push({ text: runs, margin: [0, 0, 0, 8], lineHeight: 1.3 })
  }

  // Where each £1 went
  if (r.chart) out.push(...chartBlock(r))

  // Measures table on its own page
  out.push({ text: 'Measures in detail', style: 'h1', fontSize: 16, pageBreak: 'before', margin: [0, 0, 0, 10] })
  const head = (t: string, extra: DocDef = {}) => ({ text: t, bold: true, color: C.white, fillColor: C.navy, margin: [4, 4, 4, 4], ...extra })
  const body: DocDef[][] = [
    [head('Measure'), head('How it is worked out'), head(r.currentLabel, { alignment: 'right' }), head(r.priorLabel, { alignment: 'right' }), head('Change', { alignment: 'right' })],
    ...r.rows.map((row) => [
      { text: row.measure, margin: [4, 4, 4, 4] },
      { text: row.formula, color: C.grey, fontSize: 8.5, margin: [4, 4.5, 4, 4] },
      { text: row.cur, alignment: 'right', bold: true, margin: [4, 4, 4, 4] },
      { text: row.prior, alignment: 'right', margin: [4, 4, 4, 4] },
      { text: row.change, alignment: 'right', color: C.grey, margin: [4, 4, 4, 4] },
    ]),
  ]
  out.push({
    table: { headerRows: 1, widths: [112, '*', 50, 50, 82], body, dontBreakRows: true },
    layout: { hLineWidth: (i: number) => (i <= 1 ? 0 : 0.5), vLineWidth: () => 0, hLineColor: () => C.line },
    margin: [0, 0, 0, 12],
  })
  out.push({ text: r.footnote, fontSize: 8.5, color: C.grey })
  return out
}

function priorPeriodLabel(stat: Statutory): string {
  if (stat.priorLabel) return stat.priorLabel
  if (stat.periodEnd) {
    const y = Number(stat.periodEnd.slice(0, 4)) - 1
    return stat.periodLabel.replace(/\d{4}$/, String(y))
  }
  return 'the previous year'
}

function chartBlock(r: Review): DocDef[] {
  if (!r.chart) return []
  const segs = r.chart.segments
  const BAR_W = 420
  const bar = (year: string, get: (s: (typeof segs)[number]) => number) => {
    const widths = segs.map((s) => Math.max(get(s), 0) * BAR_W)
    return {
      columns: [
        { text: year, bold: true, width: 34, margin: [0, 5, 0, 0] },
        {
          width: BAR_W + 2 * (segs.length - 1),
          table: {
            widths: widths.map((w) => Math.max(w, 1)),
            heights: 22,
            body: [
              segs.map((s, i) => {
                const v = get(s)
                const w = widths[i]
                const colors = SEG[s.key as keyof typeof SEG]
                return {
                  text: w >= 34 ? `${(v * 100).toFixed(0)}%` : '',
                  fillColor: colors.fill,
                  color: colors.text,
                  bold: true,
                  fontSize: 9,
                  alignment: 'center',
                  margin: [0, 5, 0, 0],
                }
              }),
            ],
          },
          layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 || i === segs.length ? 0 : 2), vLineColor: () => C.white, paddingLeft: () => 0, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 },
        },
      ],
      margin: [0, 0, 0, 5],
    }
  }
  const legendRows = segs.map((s) => {
    const colors = SEG[s.key as keyof typeof SEG]
    return [
      { canvas: [{ type: 'rect', x: 0, y: 2, w: 9, h: 9, color: colors.fill }], margin: [4, 0, 0, 0] },
      { text: s.label, margin: [0, 1, 0, 1] },
      { text: `${(s.cur * 100).toFixed(1)}%`, alignment: 'right', bold: true, margin: [0, 1, 0, 1] },
      { text: `${(s.prior * 100).toFixed(1)}%`, alignment: 'right', margin: [0, 1, 0, 1] },
    ]
  })
  return [
    { text: 'Where each £1 of turnover went', bold: true, color: C.navy, fontSize: 11, margin: [0, 0, 0, 6] },
    bar(r.currentLabel, (s) => s.cur),
    bar(r.priorLabel, (s) => s.prior),
    {
      table: {
        widths: [18, '*', 50, 50],
        body: [
          [{}, {}, { text: r.currentLabel, alignment: 'right', bold: true, fontSize: 8.5, color: C.grey }, { text: r.priorLabel, alignment: 'right', bold: true, fontSize: 8.5, color: C.grey }],
          ...legendRows,
        ],
      },
      layout: { hLineWidth: () => 0, vLineWidth: () => 0 },
      fontSize: 9,
      margin: [34, 4, 0, 16],
      unbreakable: true,
    },
  ]
}

// ---------------- Statutory pages ----------------

function sectionPage(s: StatSection): DocDef[] {
  const out: DocDef[] = []
  out.push({ text: s.title, style: 'h1', id: secId(s), pageBreak: 'before' })
  if (s.subtitle) out.push({ text: s.subtitle, style: 'sub', margin: [0, 2, 0, 0] })
  const tag = [s.statPage ? `Statutory accounts page ${s.statPage}` : null, !s.statutory ? 'This page does not form part of the statutory accounts.' : null].filter(Boolean).join(' · ')
  out.push({ text: tag || ' ', fontSize: 8.5, color: C.grey, margin: [0, 2, 0, 12] })
  for (const b of s.blocks) out.push(...renderBlock(b))
  return out
}

function renderBlock(b: Block): DocDef[] {
  switch (b.type) {
    case 'heading':
      return [{ text: b.text, bold: true, color: C.navy, fontSize: 11, margin: [0, 10, 0, 4] }]
    case 'para':
      return [{ text: b.lines.join('\n'), margin: [0, 0, 0, 8], lineHeight: 1.3 }]
    case 'kv':
      return [
        {
          table: {
            widths: [130, '*'],
            body: b.rows.map((r) => [
              { text: r.label, bold: true, color: C.navy, margin: [6, 6, 0, 6] },
              { text: r.lines.join('\n'), margin: [0, 6, 6, 6] },
            ]),
          },
          layout: { hLineWidth: (i: number, n: { table: { body: unknown[] } }) => (i === 0 || i === n.table.body.length ? 0 : 0.6), vLineWidth: () => 0, hLineColor: () => C.line },
          margin: [0, 0, 0, 10],
        },
      ]
    case 'table':
      return [tableBlock(b)]
  }
}

function tableBlock(t: TableBlock): DocDef {
  const long = t.rows.length > 24
  const pad = long ? 1.7 : 3.5
  const colW = t.ncols <= 2 ? 78 : 62
  const widths: (string | number)[] = ['*', ...Array(t.ncols).fill(colW)]
  const body: DocDef[][] = []
  const hdr = (text: string, extra: DocDef = {}) => ({ text, bold: true, color: C.white, fillColor: C.navy, alignment: 'right', margin: [0, 3, 6, 3], ...extra })

  if (t.groups.length) {
    const row: DocDef[] = [{ text: '', fillColor: C.navy }]
    t.groups.forEach((g) => {
      row.push(hdr(g.text, { colSpan: g.span, alignment: 'center', margin: [0, 4, 0, 2] }))
      for (let k = 1; k < g.span; k++) row.push({})
    })
    body.push(row)
  }
  if (t.sub.some(Boolean)) {
    body.push([{ text: '', fillColor: C.navy }, ...t.sub.map((s) => hdr(s, { alignment: 'right', margin: [0, 0, 6, 4], bold: false }))])
  } else if (!t.groups.length && t.headerLines.length === 0) {
    // no header at all
  }
  const headerRows = body.length
  for (const line of t.headerLines) {
    body.push([{ text: line, colSpan: t.ncols + 1, italics: true, color: C.grey, margin: [6, 3, 0, 3] }, ...Array(t.ncols).fill({})])
  }

  for (const r of t.rows) {
    const hasVals = r.vals.some((v) => v !== '')
    const keyRow = r.bold && hasVals
    const subtotal = r.label === '' && hasVals
    const fill = keyRow ? C.tealLight : undefined
    const border = subtotal ? [false, true, false, false] : [false, false, false, false]
    const label: DocDef = {
      text: r.label,
      bold: r.bold,
      italics: r.italic,
      color: r.heading && r.bold ? C.navy : C.ink,
      fillColor: fill,
      margin: [6 + Math.min(r.indent, 40), r.heading && r.bold ? pad + (long ? 2.5 : 3) : pad, 0, pad],
      border,
      borderColor: [C.line, C.ink, C.line, C.line],
    }
    const vals = r.vals.map((v) => ({
      text: v,
      alignment: 'right',
      bold: r.bold,
      fillColor: fill,
      margin: [0, pad, 6, pad],
      border,
      borderColor: [C.line, C.ink, C.line, C.line],
    }))
    body.push([label, ...vals])
  }
  return {
    table: { headerRows, widths, body, dontBreakRows: true },
    fontSize: long ? 9 : 10,
    layout: {
      hLineWidth: () => 0,
      vLineWidth: () => 0,
      paddingLeft: () => 0,
      paddingRight: () => 0,
      paddingTop: () => 0,
      paddingBottom: () => 0,
    },
    margin: [0, 0, 0, 10],
  }
}
