// Small readers for the covering letter and the invoice.

import type { TPage } from './pdfText'
import { toPence, type Pence } from './money'
import { parseLongDate } from './statutory'

export interface LetterInfo {
  ctAmount: Pence | null
  ctReference: string | null
  ctDueISO: string | null
}

export function parseLetter(pages: TPage[]): LetterInfo {
  const text = pages.map((p) => p.lines.map((l) => l.text).join(' ')).join(' ').replace(/\s+/g, ' ')
  const amt = text.match(/Corporation Tax liability of £\s*([\d,]+\.\d\d)/i)
  const ref = text.match(/Reference\s+(\d{10}[A-Z0-9]{5,10})\s*-\s*£\s*([\d,]+\.\d\d)/)
  const due = text.match(/liability is due by (\d{1,2}(?:st|nd|rd|th)?\s+\w+\s+\d{4})/i)
  return {
    ctAmount: amt ? toPence(amt[1]) : ref ? toPence(ref[2]) : null,
    ctReference: ref ? ref[1] : null,
    ctDueISO: due ? parseLongDate(due[1]) : null,
  }
}

export interface InvoiceInfo {
  number: string | null
  dateISO: string | null
  dueISO: string | null
  total: Pence | null
  billTo: string | null
}

const dmy = (s: string | undefined): string | null => {
  if (!s) return null
  const [d, m, y] = s.split('/')
  return `${y}-${m}-${d}`
}

export function parseInvoice(pages: TPage[]): InvoiceInfo {
  const text = pages.map((p) => p.lines.map((l) => l.text).join(' ')).join(' ').replace(/\s+/g, ' ')
  const total = text.match(/BALANCE DUE\s*£\s*([\d,]+\.\d\d)/i)
  return {
    number: text.match(/INVOICE NO\.?\s*(\d+)/i)?.[1] ?? null,
    dateISO: dmy(text.match(/(?<!DUE )DATE\s+(\d{2}\/\d{2}\/\d{4})/)?.[1]),
    dueISO: dmy(text.match(/DUE DATE\s+(\d{2}\/\d{2}\/\d{4})/)?.[1]),
    total: total ? toPence(total[1]) : null,
    billTo: null,
  }
}
