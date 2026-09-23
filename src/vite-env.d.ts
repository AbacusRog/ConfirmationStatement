/// <reference types="vite/client" />

declare module '*.pdf?url' {
  const src: string
  export default src
}

declare module 'pdfmake/build/pdfmake' {
  interface PdfDoc {
    getBlob(): Promise<Blob>
    download(filename?: string): Promise<void>
  }
  interface PdfMakeStatic {
    vfs: { [file: string]: string }
    createPdf(docDefinition: Record<string, unknown>): PdfDoc
  }
  const pdfMake: PdfMakeStatic
  export default pdfMake
}

declare module 'pdfmake/build/vfs_fonts' {
  const vfs: { [file: string]: string }
  export default vfs
}
