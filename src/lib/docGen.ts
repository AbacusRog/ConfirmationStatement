import { PDFDocument, PDFCheckBox } from 'pdf-lib'
import { saveAs } from 'file-saver'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import type { Client, Director } from '../supabaseClient'

import companyContentJson from '../assets/letter-content/company.json'
import directorContentJson from '../assets/letter-content/director.json'
import amlTemplateUrl from '../assets/Client_AML_Periodic_Review_Fillable.pdf?url'

pdfMake.vfs = pdfFonts

// A person or company selected to receive a document, flattened down to
// just what the templates need — whether they came from a client record
// (company or individual) or a Companies House-synced director.
export interface DocRecipient {
  key: string
  name: string
  address: string
  code: string // client reference — used on the AML form; blank for directors
  kind: 'company' | 'person' // picks which letter template applies; AML only ever runs for 'company'
}

export function addressForClient(
  c: Pick<Client, 'addr1' | 'addr2' | 'town' | 'county' | 'postcode'>
): string {
  return [c.addr1, c.addr2, c.town, c.county, c.postcode].filter(Boolean).join(', ')
}

export function addressForDirector(d: Director): string {
  return (d.letter_address || d.address || '').trim()
}

export function clientToRecipient(c: Client, kind: 'company' | 'person'): DocRecipient {
  return {
    key: c.id,
    name: c.client_name,
    address: addressForClient(c),
    code: c.client_code || '',
    kind,
  }
}

export function directorToRecipient(d: Director): DocRecipient {
  return {
    key: d.id,
    name: d.full_name,
    address: addressForDirector(d),
    code: '',
    kind: 'person',
  }
}

export function todayLong(): string {
  return new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function inOneYear(): string {
  const d = new Date()
  d.setFullYear(d.getFullYear() + 1)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function safeFilename(s: string): string {
  return s.replace(/[\\/:*?"<>|]/g, '').trim()
}

async function fetchArrayBuffer(url: string): Promise<ArrayBuffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Could not load template at ${url}`)
  return res.arrayBuffer()
}

type PdfNode = string | { [key: string]: unknown } | PdfNode[]

/** Recursively substitute {name}/{address}/{date} tokens in a pdfmake content tree. */
function substituteTokens(
  node: PdfNode,
  values: { name: string; address: string; date: string }
): PdfNode {
  if (Array.isArray(node)) return node.map((n) => substituteTokens(n, values))
  if (node && typeof node === 'object') {
    const out: { [key: string]: unknown } = {}
    for (const k of Object.keys(node)) out[k] = substituteTokens(node[k] as PdfNode, values)
    return out
  }
  if (typeof node === 'string') {
    return node
      .replace('{name}', values.name)
      .replace('{address}', values.address)
      .replace('{date}', values.date)
  }
  return node
}

/**
 * Render the letter's pdfmake content (pre-extracted from the Word template's
 * own paragraph/numbering data, so the numbered list structure is taken from
 * Word's ground truth rather than guessed at from converted HTML) with this
 * recipient's merge fields.
 */
export async function fillLetterPdf(
  kind: 'company' | 'person',
  data: { name: string; address: string; date: string }
): Promise<Blob> {
  const template = kind === 'company' ? companyContentJson : directorContentJson
  const content = substituteTokens(template as PdfNode, data)

  return pdfMake
    .createPdf({
      content: content as unknown as Record<string, unknown>,
      defaultStyle: { fontSize: 10.5, lineHeight: 1.15 },
      pageMargins: [56, 56, 56, 64],
      footer: (currentPage: number, pageCount: number) => ({
        text: `Page ${currentPage} of ${pageCount}`,
        alignment: 'right',
        margin: [0, 0, 56, 24],
        fontSize: 9,
        color: '#555555',
      }),
    })
    .getBlob()
}

/**
 * Fill the AML periodic review PDF's real AcroForm fields for one recipient.
 * Every Yes/No/N-A row defaults to Yes, overall risk to Low, and the
 * decision to "Continue without additional conditions" — all still live
 * checkboxes the reviewer can flip before sending.
 */
export async function fillAmlPdf(row: DocRecipient, reviewerName: string): Promise<Blob> {
  const buf = await fetchArrayBuffer(amlTemplateUrl)
  const pdfDoc = await PDFDocument.load(buf)
  const form = pdfDoc.getForm()

  const setText = (fname: string, val: string) => {
    try {
      form.getTextField(fname).setText(val || '')
    } catch {
      /* field not present in this template — skip */
    }
  }
  const check = (fname: string) => {
    try {
      form.getCheckBox(fname).check()
    } catch {
      /* field not present — skip */
    }
  }

  setText('detail_0', row.name) // Client name / legal entity
  setText('detail_1', '') // Trading name (if different)
  setText('detail_2', row.code) // Client reference
  setText('detail_3', '') // Company / charity / trust number
  setText('detail_4', row.address) // Registered / home address
  setText('detail_5', '') // Nature of business or occupation
  setText('detail_6', '') // Services provided by the practice
  setText('detail_7', '') // Relationship start date
  setText('detail_8', todayLong()) // Review date
  setText('detail_9', reviewerName) // Reviewer name

  // Section review-point checkboxes vary in row count per section (found by
  // inspecting the form), so match by name pattern rather than a fixed range.
  form.getFields().forEach((field) => {
    const fname = field.getName()
    if (/^s\d+_\d+_0$/.test(fname) && field instanceof PDFCheckBox) {
      field.check() // "Yes" column
    }
  })
  check('overall_risk_0') // Low
  check('decision_0') // Continue without additional conditions
  setText('next_review', inOneYear())
  setText('reviewer_sign', reviewerName)

  try {
    form.updateFieldAppearances()
  } catch {
    /* non-fatal — appearances regenerate on open in most viewers anyway */
  }

  const bytes = await pdfDoc.save()
  return new Blob([bytes as BlobPart], { type: 'application/pdf' })
}

function delay(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms))
}

export interface GenerateOptions {
  recipients: DocRecipient[]
  wantLetter: boolean
  wantAml: boolean
  reviewerName: string
  onProgress?: (message: string, isError?: boolean) => void
}

/** Generate and download every requested document for the selected recipients. */
export async function generateAll({
  recipients,
  wantLetter,
  wantAml,
  reviewerName,
  onProgress,
}: GenerateOptions): Promise<void> {
  const year = new Date().getFullYear()

  for (const row of recipients) {
    try {
      if (wantLetter) {
        const blob = await fillLetterPdf(row.kind, {
          name: row.name,
          address: row.address,
          date: todayLong(),
        })
        saveAs(blob, `Engagement Letter - ${safeFilename(row.name)} ${year}.pdf`)
        onProgress?.(`Engagement letter ready — ${row.name}`)
        await delay(250)
      }
      if (wantAml && row.kind === 'company') {
        // AML review only applies to the company itself, not directors or
        // other individuals selected alongside it.
        const blob = await fillAmlPdf(row, reviewerName)
        saveAs(blob, `AML Review - ${safeFilename(row.name)} ${year}.pdf`)
        onProgress?.(`AML review ready — ${row.name}`)
        await delay(250)
      }
    } catch (err) {
      onProgress?.(`Failed for ${row.name}: ${(err as Error).message}`, true)
    }
  }
}
