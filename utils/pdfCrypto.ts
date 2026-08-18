// utils/pdfCrypto.ts — Stage 3 gap-filler: Protect PDF
//
// Native PDF Standard Security Handler encryption (V=2, R=3, 128-bit RC4),
// implemented from PDF 32000-1:2008 §7.6. pdf-lib has no encryption support,
// so this works as a post-processor: pdf-lib writes a complete, valid PDF;
// we then re-emit the file with every string and stream RC4-encrypted under
// per-object keys, a fresh /ID, and an /Encrypt dictionary.
//
// RC4-128 (R=3) is deprecated for new high-security designs — but it is the
// most widely supported PDF password scheme (every reader since Acrobat 5
// opens it, including Chrome/Safari/Preview/pdf.js). For defence-grade
// file-level encryption the app already ships AES-256-GCM (Encrypt tool).
// Zero-upload guarantee holds: everything below is pure local computation.

const PADDING = new Uint8Array([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56,
  0xff, 0xfa, 0x01, 0x08, 0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80,
  0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
])

// ─── MD5 (RFC 1321) ─────────────────────────────────────────────────────────
// Constants computed from the spec definition: K[i] = floor(2^32·|sin(i+1)|)
const MD5_K: number[] = Array.from({ length: 64 }, (_, i) =>
  Math.floor(Math.abs(Math.sin(i + 1)) * 4294967296) >>> 0)
const MD5_S = [
  7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22, 7, 12, 17, 22,
  5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20, 5, 9, 14, 20,
  4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23, 4, 11, 16, 23,
  6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21, 6, 10, 15, 21,
]

export function md5(input: Uint8Array): Uint8Array {
  const msgLen = input.length
  const bitLen = msgLen * 8
  const padded = ((msgLen + 8) >> 6 << 6) + 64
  const msg = new Uint8Array(padded)
  msg.set(input)
  msg[msgLen] = 0x80
  const dv = new DataView(msg.buffer)
  dv.setUint32(padded - 8, bitLen >>> 0, true)
  dv.setUint32(padded - 4, Math.floor(bitLen / 4294967296), true)

  let a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476
  for (let off = 0; off < padded; off += 64) {
    const M: number[] = []
    for (let i = 0; i < 16; i++) M.push(dv.getUint32(off + i * 4, true))
    let A = a0, B = b0, C = c0, D = d0
    for (let i = 0; i < 64; i++) {
      let F: number, g: number
      if (i < 16) { F = (B & C) | (~B & D); g = i }
      else if (i < 32) { F = (D & B) | (~D & C); g = (5 * i + 1) % 16 }
      else if (i < 48) { F = B ^ C ^ D; g = (3 * i + 5) % 16 }
      else { F = C ^ (B | ~D); g = (7 * i) % 16 }
      F = (F + A + MD5_K[i] + M[g]) >>> 0
      A = D; D = C; C = B
      B = (B + ((F << MD5_S[i]) | (F >>> (32 - MD5_S[i])))) >>> 0
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0
    c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0
  }
  const out = new Uint8Array(16)
  const odv = new DataView(out.buffer)
  odv.setUint32(0, a0, true); odv.setUint32(4, b0, true)
  odv.setUint32(8, c0, true); odv.setUint32(12, d0, true)
  return out
}

// ─── RC4 ────────────────────────────────────────────────────────────────────
export function rc4(key: Uint8Array, data: Uint8Array): Uint8Array {
  const S = new Uint8Array(256)
  for (let i = 0; i < 256; i++) S[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + S[i] + key[i % key.length]) & 0xff
    const t = S[i]; S[i] = S[j]; S[j] = t
  }
  const out = new Uint8Array(data.length)
  let i = 0; j = 0
  for (let n = 0; n < data.length; n++) {
    i = (i + 1) & 0xff; j = (j + S[i]) & 0xff
    const t = S[i]; S[i] = S[j]; S[j] = t
    out[n] = data[n] ^ S[(S[i] + S[j]) & 0xff]
  }
  return out
}

// ─── Standard Security Handler (R=3, 128-bit) ───────────────────────────────
const KEY_LEN = 16 // 128-bit

function padPassword(pw: string): Uint8Array {
  const raw = new TextEncoder().encode(pw).slice(0, 32)
  const out = new Uint8Array(32)
  out.set(raw); out.set(PADDING.slice(0, 32 - raw.length), raw.length)
  return out
}

function xorKey(key: Uint8Array, i: number): Uint8Array {
  const k = key.slice()
  for (let n = 0; n < k.length; n++) k[n] ^= i
  return k
}

function computeO(ownerPad: Uint8Array, userPad: Uint8Array): Uint8Array {
  let digest = md5(ownerPad)
  for (let i = 0; i < 50; i++) digest = md5(digest)
  const key = digest.slice(0, KEY_LEN)
  let data = rc4(key, userPad)
  for (let i = 1; i <= 19; i++) data = rc4(xorKey(key, i), data)
  return data
}

export interface ProtectionKeys { O: Uint8Array; U: Uint8Array; fileKey: Uint8Array; P: number; fileId: Uint8Array }

export function computeKeys(userPassword: string, ownerPassword: string, P: number, fileId: Uint8Array): ProtectionKeys {
  const userPad = padPassword(userPassword)
  const ownerPad = padPassword(ownerPassword || userPassword)
  const O = computeO(ownerPad, userPad)

  const ple = new Uint8Array(4)
  new DataView(ple.buffer).setInt32(0, P, true)
  const kInput = new Uint8Array(32 + 32 + 4 + 16)
  kInput.set(userPad, 0); kInput.set(O, 32); kInput.set(ple, 64); kInput.set(fileId, 68)
  let digest = md5(kInput)
  for (let i = 0; i < 50; i++) digest = md5(digest.slice(0, KEY_LEN))
  const fileKey = digest.slice(0, KEY_LEN)

  const uInput = new Uint8Array(32 + 16)
  uInput.set(PADDING, 0); uInput.set(fileId, 32)
  let U = rc4(fileKey, md5(uInput))
  for (let i = 1; i <= 19; i++) U = rc4(xorKey(fileKey, i), U)
  const U32 = new Uint8Array(32)
  U32.set(U, 0) // last 16 bytes arbitrary (spec says random) — zeros are fine
  return { O, U: U32, fileKey, P, fileId }
}

function objectKey(fileKey: Uint8Array, objNum: number, genNum: number): Uint8Array {
  const ext = new Uint8Array(fileKey.length + 5)
  ext.set(fileKey, 0)
  ext[fileKey.length] = objNum & 0xff
  ext[fileKey.length + 1] = (objNum >> 8) & 0xff
  ext[fileKey.length + 2] = (objNum >> 16) & 0xff
  ext[fileKey.length + 3] = genNum & 0xff
  ext[fileKey.length + 4] = (genNum >> 8) & 0xff
  return md5(ext).slice(0, Math.min(fileKey.length + 5, 16))
}

// ─── Post-processor ─────────────────────────────────────────────────────────
const latin1 = new TextDecoder('latin1')
const enc = new TextEncoder()

function toLatin1(bytes: Uint8Array): string { return latin1.decode(bytes) }

function hexOf(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
}

interface PdfObject { num: number; gen: number; body: Uint8Array }

/** Parse a pdf-lib-produced file into header + indirect objects + trailer dict
 *  text. Uses the xref table for offsets (safe against stream content that
 *  happens to contain keywords like "endobj"). */
function dissect(bytes: Uint8Array): { header: string; objects: PdfObject[]; trailer: string } {
  const text = toLatin1(bytes)
  // xref table
  const xrefPos = text.lastIndexOf('\nxref')
  if (xrefPos < 0) throw new Error('No xref table found')
  const startxrefPos = text.lastIndexOf('startxref')
  const trailerPos = text.indexOf('trailer', xrefPos)
  const trailerDict = text.slice(trailerPos + 7, text.indexOf('startxref', trailerPos)).trim()

  // header: everything up to the first "N 0 obj" — keep through the binary marker line
  const firstObj = text.search(/\n?\d+ \d+ obj/)
  const header = text.slice(0, firstObj)

  const objects: PdfObject[] = []
  const xrefText = text.slice(xrefPos, trailerPos)
  const lines = xrefText.trim().split(/\r?\n/).slice(1) // drop "xref" keyword line
  let li = 0
  while (li < lines.length) {
    const hdr = lines[li++].trim()
    if (!hdr || hdr.startsWith('trailer')) break
    const [first, count] = hdr.split(/\s+/).map(Number)
    if (isNaN(first) || isNaN(count)) break
    for (let i = 0; i < count; i++, li++) {
      const parts = (lines[li] || '').trim().split(/\s+/)
      if (parts.length < 3 || parts[2] !== 'n') continue
      const offset = Number(parts[0])
      const objNum = first + i
      const endobj = text.indexOf('endobj', offset)
      if (endobj < 0) throw new Error(`Object ${objNum}: no endobj`)
      objects.push({ num: objNum, gen: Number(parts[1]) || 0, body: bytes.slice(offset, endobj + 6) })
    }
  }
  if (objects.length === 0) throw new Error('No objects parsed from xref')
  return { header, objects, trailer: trailerDict }
}

/** Encrypt every literal string, hex string, and stream inside one object
 *  body. Byte-level scan: parens nesting + escapes handled for literals;
 *  `<<`/`>>` excluded from hex detection. Stream bytes encrypted wholesale. */
function encryptObjectBody(body: Uint8Array, key: Uint8Array): Uint8Array {
  const s = toLatin1(body)
  const out: number[] = []
  const pushStr = (str: string) => { for (let i = 0; i < str.length; i++) out.push(str.charCodeAt(i) & 0xff) }
  const pushBytes = (b: Uint8Array) => { for (let i = 0; i < b.length; i++) out.push(b[i]) }

  // locate stream region first so we never tokenize inside it
  let streamStart = -1, streamEnd = -1, streamKwStart = -1, endstreamEnd = -1
  const stmIdx = s.indexOf('stream')
  if (stmIdx >= 0) {
    streamKwStart = stmIdx
    let dataStart = stmIdx + 6
    if (s[dataStart] === '\r' && s[dataStart + 1] === '\n') dataStart += 2
    else if (s[dataStart] === '\n' || s[dataStart] === '\r') dataStart += 1
    const esIdx = s.lastIndexOf('endstream')
    if (esIdx > dataStart) {
      streamStart = dataStart
      streamEnd = esIdx // keep the EOL before endstream unencrypted… trim it
      // back off the EOL immediately preceding endstream
      if (s[streamEnd - 1] === '\n') streamEnd--
      if (s[streamEnd - 1] === '\r') streamEnd--
      endstreamEnd = esIdx + 9
    }
  }

  const scanEnd = streamKwStart >= 0 ? streamKwStart : s.length
  let i = 0
  while (i < scanEnd) {
    const c = s[i]
    if (c === '(') {
      // literal string: find matching close paren
      let depth = 1, j = i + 1
      while (j < s.length && depth > 0) {
        const ch = s[j]
        if (ch === '\\') { j += 2; continue }
        if (ch === '(') depth++
        else if (ch === ')') depth--
        j++
      }
      const raw = body.slice(i + 1, j - 1) // inner bytes (escapes intact)
      const encrypted = rc4(key, raw)
      pushStr('(')
      // re-emit as escaped literal (encrypted bytes may be ( ) \ or controls)
      for (const b of encrypted) {
        if (b === 0x28 || b === 0x29 || b === 0x5c) { out.push(0x5c); out.push(b) }
        else if (b < 0x20 || b > 0x7e) pushStr('\\' + b.toString(8).padStart(3, '0'))
        else out.push(b)
      }
      pushStr(')')
      i = j
    } else if (c === '<' && s[i + 1] !== '<') {
      const end = s.indexOf('>', i + 1)
      if (end < 0) { pushStr(c); i++; continue }
      const hex = s.slice(i + 1, end).replace(/\s+/g, '')
      if (!/^[0-9a-fA-F]*$/.test(hex)) { pushStr(c); i++; continue }
      const padded = hex.length % 2 ? hex + '0' : hex
      const raw = new Uint8Array(padded.length / 2)
      for (let k = 0; k < raw.length; k++) raw[k] = parseInt(padded.substr(k * 2, 2), 16)
      pushStr('<' + hexOf(rc4(key, raw)) + '>')
      i = end + 1
    } else {
      out.push(s.charCodeAt(i) & 0xff)
      i++
    }
  }

  if (streamStart >= 0) {
    pushStr(s.slice(scanEnd, streamStart)) // "stream" + EOL
    pushBytes(rc4(key, body.slice(streamStart, streamEnd)))
    pushStr(s.slice(streamEnd)) // EOL + endstream + endobj
  } else {
    pushStr(s.slice(scanEnd))
  }
  return new Uint8Array(out)
}

function buildEncryptDict(objNum: number, keys: ProtectionKeys): string {
  return `${objNum} 0 obj\n<<\n/Filter /Standard\n/V 2\n/R 3\n/Length 128\n` +
    `/P ${keys.P}\n/O <${hexOf(keys.O)}>\n/U <${hexOf(keys.U)}>\n>>\nendobj\n`
}

export interface ProtectOptions {
  allowPrint?: boolean    // default true
  allowCopy?: boolean     // default true
  allowModify?: boolean   // default false
  allowAnnotate?: boolean // default true
  ownerPassword?: string  // defaults to user password
}

/** Password-protect a PDF with the native Standard security handler.
 *  Readers will prompt for the password on open. Pure client-side. */
export async function protectPDF(file: File, userPassword: string, opts: ProtectOptions = {}): Promise<Blob> {
  if (!userPassword) throw new Error('A user password is required')
  const { PDFDocument } = await import('pdf-lib')
  const doc = await PDFDocument.load(await file.arrayBuffer(), { ignoreEncryption: true } as any)
  // useObjectStreams:false → classic xref table + plain indirect objects,
  // which the post-processor can dissect and re-emit deterministically.
  const saved = await doc.save({ useObjectStreams: false })

  // Permissions: bits 1-2 reserved 0; 3 print, 4 modify, 5 copy, 6 annotate; 7+ reserved 1
  let P = 0xffffff00
  if (opts.allowPrint !== false) P |= 0x04
  if (opts.allowModify) P |= 0x08
  if (opts.allowCopy !== false) P |= 0x10
  if (opts.allowAnnotate !== false) P |= 0x20
  P = P | 0 // keep as int32; toInt32 via DataView when serialising
  const Psigned = P > 0x7fffffff ? P - 0x100000000 : P

  const fileId = crypto.getRandomValues(new Uint8Array(16))
  const keys = computeKeys(userPassword, opts.ownerPassword || userPassword, Psigned, fileId)

  const { header, objects, trailer } = dissect(saved)
  const rootMatch = trailer.match(/\/Root\s+(\d+)\s+(\d+)\s+R/)
  const infoMatch = trailer.match(/\/Info\s+(\d+)\s+(\d+)\s+R/)
  if (!rootMatch) throw new Error('Could not locate document catalog')

  const maxObj = Math.max(...objects.map(o => o.num))
  const encryptObjNum = maxObj + 1
  const infoObjNum = infoMatch ? Number(infoMatch[1]) : 0

  const chunks: Uint8Array[] = []
  const offsets: number[] = []
  let pos = 0
  const push = (u8: Uint8Array) => { chunks.push(u8); pos += u8.length }

  push(enc.encode(header))
  for (const obj of objects.sort((a, b) => a.num - b.num)) {
    offsets[obj.num] = pos
    const key = objectKey(keys.fileKey, obj.num, obj.gen)
    push(encryptObjectBody(obj.body, key))
  }
  offsets[encryptObjNum] = pos
  const dictStr = buildEncryptDict(encryptObjNum, { ...keys, P: Psigned })
  push(enc.encode(dictStr))

  const size = encryptObjNum + 1
  const xrefPos = pos
  let xref = `xref\n0 ${size}\n0000000000 65535 f \n`
  for (let n = 1; n <= maxObj; n++) {
    xref += offsets[n] !== undefined
      ? String(offsets[n]).padStart(10, '0') + ' 00000 n \n'
      : '0000000000 65535 f \n'
  }
  xref += String(offsets[encryptObjNum]).padStart(10, '0') + ' 00000 n \n'
  push(enc.encode(xref))

  const idHex = hexOf(fileId)
  const trailerOut = `trailer\n<<\n/Size ${size}\n/Root ${rootMatch[1]} ${rootMatch[2]} R\n` +
    (infoObjNum ? `/Info ${infoObjNum} 0 R\n` : '') +
    `/ID [<${idHex}> <${idHex}>]\n/Encrypt ${encryptObjNum} 0 R\n>>\n` +
    `startxref\n${xrefPos}\n%%EOF\n`
  push(enc.encode(trailerOut))

  const total = new Uint8Array(pos)
  let off = 0
  for (const c of chunks) { total.set(c, off); off += c.length }
  return new Blob([total as unknown as BlobPart], { type: 'application/pdf' })
}
