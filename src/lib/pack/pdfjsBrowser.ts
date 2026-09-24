// Lazy loader for pdf.js in the browser. The library and its worker are only
// downloaded when the Accounts Pack tab is used.

import type { PdfJsLike } from './pdfText'

let cached: Promise<PdfJsLike> | null = null

export function loadPdfJs(): Promise<PdfJsLike> {
  if (!cached) {
    cached = (async () => {
      const [mod, worker] = await Promise.all([import('pdfjs-dist'), import('pdfjs-dist/build/pdf.worker.min.js?url')])
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const lib: any = (mod as any).default ?? mod
      lib.GlobalWorkerOptions.workerSrc = worker.default
      return lib as PdfJsLike
    })()
    cached.catch(() => (cached = null))
  }
  return cached
}
