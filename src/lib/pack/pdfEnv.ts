// Shared PDF plumbing: render a pdfmake document, then add a bookmark
// (outline) panel using named destinations that pdfmake wrote for us.

import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { PDFDocument, PDFName, PDFDict, PDFArray, PDFHexString, PDFRef } from 'pdf-lib'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(pdfMake as any).vfs = pdfFonts

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocDef = any

export const COLORS = {
  navy: '#193650',
  teal: '#2B7A78',
  tealLight: '#E8F1F0',
  ink: '#1F2933',
  grey: '#5F6B7A',
  greyLight: '#F2F5F7',
  line: '#D5DBE1',
  white: '#FFFFFF',
  red: '#A61B1B',
  redLight: '#FBE9E9',
  amber: '#FFF0B3',
  amberDark: '#8A5A00',
  blueLink: '#0B6BB8',
}

export async function renderPdf(dd: DocDef): Promise<Uint8Array> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (pdfMake as any).createPdf(dd).getBuffer()
}

export interface Bookmark {
  title: string
  dest: string // a pdfmake node id
}

/** Reads pdfmake's named destinations -> page refs. */
function namedDestinations(doc: PDFDocument): Map<string, PDFRef> {
  const out = new Map<string, PDFRef>()
  const names = doc.catalog.lookupMaybe(PDFName.of('Names'), PDFDict)
  const dests = names?.lookupMaybe(PDFName.of('Dests'), PDFDict)
  if (!dests) return out
  const walk = (node: PDFDict) => {
    const arr = node.lookupMaybe(PDFName.of('Names'), PDFArray)
    if (arr) {
      for (let i = 0; i + 1 < arr.size(); i += 2) {
        const key = arr.lookup(i)
        const val = arr.lookup(i + 1, PDFArray)
        const name = key && 'decodeText' in key ? (key as PDFHexString).decodeText() : String(key)
        const pageRef = val?.get(0)
        if (pageRef instanceof PDFRef) out.set(name, pageRef)
      }
    }
    const kids = node.lookupMaybe(PDFName.of('Kids'), PDFArray)
    if (kids) for (let i = 0; i < kids.size(); i++) walk(kids.lookup(i, PDFDict))
  }
  walk(dests)
  return out
}

export async function addBookmarks(
  bytes: Uint8Array,
  bookmarks: Bookmark[],
  meta: { title: string; author: string; subject?: string },
): Promise<Uint8Array> {
  const doc = await PDFDocument.load(bytes)
  doc.setTitle(meta.title)
  doc.setAuthor(meta.author)
  if (meta.subject) doc.setSubject(meta.subject)
  doc.setCreator(meta.author)

  const dests = namedDestinations(doc)
  const items = bookmarks.filter((b) => dests.has(b.dest))
  if (items.length) {
    const ctx = doc.context
    const outlinesRef = ctx.nextRef()
    const refs = items.map(() => ctx.nextRef())
    items.forEach((b, i) => {
      const dict = ctx.obj({
        Title: PDFHexString.fromText(b.title),
        Parent: outlinesRef,
        Dest: [dests.get(b.dest)!, PDFName.of('Fit')],
        ...(i > 0 ? { Prev: refs[i - 1] } : {}),
        ...(i < items.length - 1 ? { Next: refs[i + 1] } : {}),
      })
      ctx.assign(refs[i], dict)
    })
    ctx.assign(
      outlinesRef,
      ctx.obj({ Type: 'Outlines', First: refs[0], Last: refs[refs.length - 1], Count: items.length }),
    )
    doc.catalog.set(PDFName.of('Outlines'), outlinesRef)
    doc.catalog.set(PDFName.of('PageMode'), PDFName.of('UseOutlines'))
  }
  return doc.save()
}
