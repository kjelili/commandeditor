// utils/blob.ts — small typing helper for pdf-lib output
//
// pdf-lib's PDFDocument.save() returns Uint8Array<ArrayBufferLike>, but
// strict TypeScript (>=5.7) refuses to pass that directly into the Blob
// constructor because the lib.dom BlobPart type expects
// Uint8Array<ArrayBuffer>.
//
// This helper centralises the cast so we never have to repeat it.

/** Wrap pdf-lib Uint8Array bytes into a PDF Blob. */
export function pdfBlob(bytes: Uint8Array): Blob {
  // Cast to BlobPart so TS accepts the Uint8Array regardless of its
  // underlying ArrayBufferLike generic. At runtime this is a no-op.
  return new Blob([bytes as unknown as BlobPart], { type: 'application/pdf' })
}

/** Generic byte-blob helper for non-PDF outputs (zips, json, etc.) */
export function bytesBlob(bytes: Uint8Array, type: string): Blob {
  return new Blob([bytes as unknown as BlobPart], { type })
}
