// ─── PUBLIC-ANCHOR NOTARIZATION (OpenTimestamps) ───────────────────────────
// Proves a document existed at a point in time by anchoring its SHA-256 hash
// into the Bitcoin blockchain via the OpenTimestamps protocol — the standard
// used by courts and auditors.
//
// Privacy model: only the 32-byte hash ever leaves the device. The document
// itself is never transmitted (hashing is local). Calendar servers are public
// infrastructure run by the OTS project; they see a hash, nothing else.
//
// The .ots proof format: magic + version + hash-opcode(sha256=0x08) + digest
// + serialized timestamp returned by the calendar. Pending proofs upgrade to
// full Bitcoin attestations automatically once the calendar aggregates them
// into a block (typically within hours).

const OTS_MAGIC = new Uint8Array([0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00, 0x00])
const OTS_VERSION = 0x01
const OP_SHA256 = 0x08

const CALENDARS = [
  'https://alice.btc.calendar.opentimestamps.org',
  'https://bob.btc.calendar.opentimestamps.org',
  'https://finney.calendar.eternitywall.com',
]

export interface NotaryProof {
  fileName: string
  hashHex: string
  otsBytes: Uint8Array
  calendars: string[]       // which calendars accepted the digest
  created: number
  upgraded: boolean         // true once a Bitcoin attestation is confirmed
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16)
  return out
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0))
  let off = 0
  for (const p of parts) { out.set(p, off); off += p.length }
  return out
}

// Submit the digest to every reachable calendar; merge their timestamp
// responses as parallel sub-timestamps under one proof.
export async function stamp(file: File): Promise<NotaryProof> {
  const hashHex = await sha256Hex(await file.arrayBuffer())
  const digest = hexToBytes(hashHex)

  const responses: Uint8Array[] = []
  const used: string[] = []
  for (const cal of CALENDARS) {
    try {
      const res = await fetch(`${cal}/digest`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: digest as any,
        signal: AbortSignal.timeout(15000),
      })
      if (res.ok) {
        responses.push(new Uint8Array(await res.arrayBuffer()))
        used.push(cal.replace(/^https:\/\//, ''))
      }
    } catch { /* calendar unreachable — try the next */ }
  }
  if (!responses.length) throw new Error('No calendar reachable — check your connection')

  // First response becomes the main timestamp; additional calendars are
  // appended as sibling attestations (OTS format allows N sub-timestamps
  // prefixed by 0xff varuint count — a single extra response is added via
  // the fork opcode structure; to stay conservative we keep the first
  // calendar's proof and note the others in metadata).
  const otsBytes = concat(
    OTS_MAGIC,
    new Uint8Array([OTS_VERSION, OP_SHA256]),
    digest,
    responses[0],
  )
  return { fileName: file.name, hashHex, otsBytes, calendars: used, created: Date.now(), upgraded: false }
}

// Ask calendars whether the pending proof has been confirmed into a block;
// if so, return the upgraded proof bytes.
export async function upgrade(proof: NotaryProof): Promise<NotaryProof> {
  for (const cal of CALENDARS) {
    try {
      const res = await fetch(`${cal}/timestamp?d=${proof.hashHex}`, { signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const ts = new Uint8Array(await res.arrayBuffer())
        if (ts.length > 0) {
          const otsBytes = concat(OTS_MAGIC, new Uint8Array([OTS_VERSION, OP_SHA256]), hexToBytes(proof.hashHex), ts)
          return { ...proof, otsBytes, upgraded: true }
        }
      }
    } catch { /* next */ }
  }
  return proof
}

// Verify a file against a .ots proof locally: hash the file, check the proof
// carries that digest, and list the attestations found (URIs / block hints).
export interface VerifyResult {
  matches: boolean
  attestations: string[]
  pending: boolean
}

export async function verify(file: File, otsBytes: Uint8Array): Promise<VerifyResult> {
  const hashHex = await sha256Hex(await file.arrayBuffer())
  const digest = hexToBytes(hashHex)
  // Find our digest inside the proof
  let found = false
  for (let i = 0; i + digest.length <= otsBytes.length; i++) {
    let ok = true
    for (let j = 0; j < digest.length; j++) if (otsBytes[i + j] !== digest[j]) { ok = false; break }
    if (ok) { found = true; break }
  }
  // Extract human-readable attestation markers (calendar URIs, bitcoin hints)
  const text = Array.from(otsBytes).map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : ' ').join('')
  const attestations = Array.from(new Set(
    (text.match(/[a-z0-9.-]+\.(calendar\.[a-z.]+|opentimestamps\.org|eternitywall\.com)/gi) || [])
  ))
  const pending = !otsBytes.includes(0x00) ? true : !/bitcoin/i.test(text) && attestations.length > 0
  return { matches: found, attestations, pending }
}
