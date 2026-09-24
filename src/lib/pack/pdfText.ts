// Positioned text extraction from PDFs, shared by the Statutory Accounts and
// Self Assessment parsers. The pdf.js module itself is injected (the app
// passes the browser build, the tests pass the Node build) so this file has
// no DOM or bundler dependency.

export interface TItem {
  str: string
  x0: number
  x1: number
  y: number
  h: number
  font: string
}

export interface TLine {
  y: number
  items: TItem[]
  text: string
  x0: number
  x1: number
}

export interface TPage {
  num: number
  width: number
  height: number
  lines: TLine[]
  /** font id used for bold text on this page (the font of the page's top header line) */
  boldFont: string
  /** font id used for the bulk of body text */
  bodyFont: string
}

// Minimal structural type for the parts of pdf.js we use.
export interface PdfJsLike {
  getDocument: (src: { data: Uint8Array; isEvalSupported?: boolean }) => {
    promise: Promise<{
      numPages: number
      getPage: (n: number) => Promise<{
        getViewport: (o: { scale: number }) => { width: number; height: number }
        getTextContent: () => Promise<{
          items: Array<{
            str: string
            transform: number[]
            width: number
            height: number
            fontName: string
          }>
        }>
      }>
    }>
  }
}

const Y_TOL = 2.5

export async function extractPdf(pdfjs: PdfJsLike, data: Uint8Array): Promise<TPage[]> {
  // isEvalSupported:false closes off the font-eval code path in older pdf.js builds.
  const doc = await pdfjs.getDocument({ data: data.slice(), isEvalSupported: false }).promise
  const pages: TPage[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const vp = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const items: TItem[] = []
    for (const it of tc.items) {
      if (!it.str || !it.str.trim()) continue
      items.push({
        str: it.str,
        x0: it.transform[4],
        x1: it.transform[4] + it.width,
        y: it.transform[5],
        h: it.height,
        font: it.fontName,
      })
    }
    items.sort((a, b) => b.y - a.y || a.x0 - b.x0)

    const lines: TLine[] = []
    for (const it of items) {
      const last = lines[lines.length - 1]
      if (last && Math.abs(last.y - it.y) <= Y_TOL) {
        last.items.push(it)
      } else {
        lines.push({ y: it.y, items: [it], text: '', x0: 0, x1: 0 })
      }
    }
    for (const l of lines) {
      l.items.sort((a, b) => a.x0 - b.x0)
      l.x0 = l.items[0].x0
      l.x1 = Math.max(...l.items.map((i) => i.x1))
      let t = ''
      let prev: TItem | null = null
      for (const it of l.items) {
        if (prev) {
          const gap = it.x0 - prev.x1
          t += gap > Math.max(1.2, it.h * 0.12) ? ' ' : ''
        }
        t += it.str
        prev = it
      }
      l.text = t.replace(/\s+/g, ' ').trim()
    }

    // Bold = the font of the top header line; body = most common font by characters.
    const counts = new Map<string, number>()
    for (const it of items) counts.set(it.font, (counts.get(it.font) ?? 0) + it.str.length)
    let bodyFont = ''
    let best = -1
    for (const [f, n] of counts) if (n > best) ((best = n), (bodyFont = f))
    const boldFont = lines.length ? lines[0].items[0].font : bodyFont

    pages.push({ num: p, width: vp.width, height: vp.height, lines, boldFont, bodyFont })
  }
  return pages
}

/** Whole-document plain text, one line per text line, page breaks marked. */
export function pagesToText(pages: TPage[]): string {
  return pages.map((p) => p.lines.map((l) => l.text).join('\n')).join('\n\f\n')
}
