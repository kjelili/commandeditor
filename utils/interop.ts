/**
 * Interoperability extensions — v10
 *
 * - PDF → EPUB 3 (reflowable ebook for Kindle/Kobo/e-readers — no other
 *   free in-browser tool does this)
 * - WebDAV upload (Nextcloud/ownCloud/NAS — pure HTTP PUT, no server of ours)
 * - File System Access "save to folder" (local drive or network share mount)
 */

import { pdfBlob } from './blob'

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ─── PDF → EPUB ────────────────────────────────────────────────────────────
export async function pdfToEpub(file: File, title?: string): Promise<Blob> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const { default: JSZip } = await import('jszip')

  const pdf = await pdfjsLib.getDocument({ standardFontDataUrl: '/pdf-standard-fonts/', data: await file.arrayBuffer() }).promise
  const bookTitle = (title || file.name.replace(/\.pdf$/i, '')).slice(0, 120)
  const id = 'urn:commandeditor:' + Date.now().toString(36)

  const chapters: Array<{ name: string; body: string }> = []
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p)
    const tc = await page.getTextContent()
    // Reconstruct paragraphs from positioned text items
    let lastY = -1
    let html = ''
    let para = ''
    for (const item of tc.items as any[]) {
      const y = Math.round(item.transform?.[5] || 0)
      if (lastY !== -1 && Math.abs(y - lastY) > 6 && para.trim()) {
        html += `<p>${escapeXml(para.trim())}</p>`
        para = ''
      }
      para += item.str + ' '
      lastY = y
    }
    if (para.trim()) html += `<p>${escapeXml(para.trim())}</p>`
    chapters.push({
      name: `page${p}.xhtml`,
      body: `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Page ${p}</title></head>
<body><section><h2>Page ${p}</h2>${html || '<p>[No text layer]</p>'}</section></body></html>`,
    })
  }

  const zip = new JSZip()
  zip.file('mimetype', 'application/epub+zip', { compression: 'STORE' }) // must be first, uncompressed
  zip.file('META-INF/container.xml', `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`)
  zip.file('OEBPS/content.opf', `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" unique-identifier="bookid" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:identifier id="bookid">${escapeXml(id)}</dc:identifier>
    <dc:title>${escapeXml(bookTitle)}</dc:title>
    <dc:language>en</dc:language>
    <dc:creator>CommandEditor</dc:creator>
    <meta property="dcterms:modified">${new Date().toISOString().replace(/\.\d+Z$/, 'Z')}</meta>
  </metadata>
  <manifest>
    ${chapters.map((c) => `<item id="${c.name}" href="${c.name}" media-type="application/xhtml+xml"/>`).join('\n    ')}
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
  </manifest>
  <spine>
    ${chapters.map((c) => `<itemref idref="${c.name}"/>`).join('\n    ')}
  </spine>
</package>`)
  zip.file('OEBPS/nav.xhtml', `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<head><title>${escapeXml(bookTitle)}</title></head>
<body><nav epub:type="toc"><h1>${escapeXml(bookTitle)}</h1><ol>
${chapters.map((c, i) => `<li><a href="${c.name}">Page ${i + 1}</a></li>`).join('\n')}
</ol></nav></body></html>`)
  chapters.forEach((c) => zip.file(`OEBPS/${c.name}`, c.body))

  return zip.generateAsync({
    type: 'blob',
    mimeType: 'application/epub+zip',
    compression: 'DEFLATE',
  })
}

// ─── WebDAV UPLOAD ─────────────────────────────────────────────────────────
// Works with Nextcloud, ownCloud, Synology/QNAP NAS, or any WebDAV endpoint
// that permits CORS. Credentials go straight from the user's browser to
// *their* server — CommandEditor never sees them.
export async function webdavUpload(
  url: string, username: string, password: string, fileName: string, blob: Blob
): Promise<void> {
  const target = url.replace(/\/+$/, '') + '/' + encodeURIComponent(fileName)
  const res = await fetch(target, {
    method: 'PUT',
    headers: { Authorization: 'Basic ' + btoa(`${username}:${password}`) },
    body: blob,
  })
  if (!res.ok) throw new Error(`WebDAV upload failed: HTTP ${res.status} ${res.statusText}`)
}

// ─── FILE SYSTEM ACCESS: save straight to a folder ─────────────────────────
// Chrome/Edge: lets the user pick a local folder (including mounted network
// shares) and writes the file there directly — no download dance.
export function canUseFsAccess(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

export async function saveToFolder(blob: Blob, fileName: string): Promise<string> {
  const dir = await (window as any).showDirectoryPicker({ mode: 'readwrite' })
  const handle = await dir.getFileHandle(fileName, { create: true })
  const writable = await handle.createWritable()
  await writable.write(blob)
  await writable.close()
  return dir.name
}

// ─── WATCH FOLDER ──────────────────────────────────────────────────────────
// Polls a user-picked directory for new PDFs and hands them to a callback —
// the browser equivalent of a watched hot-folder in desktop automation.
export interface WatchHandle { stop: () => void; dirName: string }

export async function watchFolder(
  onNewFiles: (files: File[]) => Promise<void>,
  intervalMs = 4000
): Promise<WatchHandle> {
  const dir = await (window as any).showDirectoryPicker({ mode: 'read' })
  const seen = new Set<string>()
  let stopped = false

  // Prime with existing files so only *new* arrivals trigger processing
  for await (const [name, handle] of (dir as any).entries()) {
    if (handle.kind === 'file' && name.toLowerCase().endsWith('.pdf')) seen.add(name)
  }

  const tick = async () => {
    if (stopped) return
    const fresh: File[] = []
    for await (const [name, handle] of (dir as any).entries()) {
      if (handle.kind === 'file' && name.toLowerCase().endsWith('.pdf') && !seen.has(name)) {
        seen.add(name)
        try { fresh.push(await handle.getFile()) } catch {}
      }
    }
    if (fresh.length) await onNewFiles(fresh)
    if (!stopped) setTimeout(tick, intervalMs)
  }
  setTimeout(tick, intervalMs)

  return { stop: () => { stopped = true }, dirName: dir.name }
}

// ─── PWA SHARE TARGET: pick up a file handed to the installed app ──────────
// The service worker intercepts the POST /share-target navigation, stashes
// the file in the Cache API, and redirects to /?shared=1. This retrieves it.
export async function getShareTargetFile(): Promise<File | null> {
  try {
    const cache = await caches.open('ce-share-target')
    const res = await cache.match('/share-target-file')
    if (!res) return null
    const blob = await res.blob()
    const name = res.headers.get('x-file-name') || 'shared.pdf'
    await cache.delete('/share-target-file')
    return new File([blob], name, { type: blob.type || 'application/pdf' })
  } catch { return null }
}
