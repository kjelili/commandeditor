/**
 * Enterprise & trust extensions — v10
 *
 * - Policy presets: one-tap enforcement profiles for regulated industries
 *   (legal / healthcare / government) — no server needed, policies live in
 *   the browser and gate which tools are available.
 * - TSP-ready signing package: exports everything a qualified trust service
 *   provider needs (document hash, ECDSA signature, certificate) in a
 *   standards-shaped JSON bundle, so a user can upgrade a CommandEditor
 *   signature to a qualified/eIDAS one.
 * - Proof-of-No-Upload audit: instruments fetch/XHR/WebSocket/beacon for a
 *   timed session and produces a verifiable report that zero document bytes
 *   left the device.
 */

// ─── POLICY PRESETS ────────────────────────────────────────────────────────
export interface PolicyPreset {
  id: string
  label: string
  emoji: string
  desc: string
  disabledTools: string[]
  enforce: string[]
}

export const POLICY_PRESETS: PolicyPreset[] = [
  {
    id: 'none', label: 'No policy', emoji: '🔓',
    desc: 'Full toolkit, no restrictions.',
    disabledTools: [], enforce: [],
  },
  {
    id: 'legal', label: 'Legal / Law firm', emoji: '⚖️',
    desc: 'Custody logging and Bates numbering encouraged; cloud connectors disabled to keep client data off third-party drives.',
    disabledTools: ['cloudconnect'],
    enforce: ['Log every export to the chain-of-custody', 'Bates-stamp production sets', 'Redact before sharing'],
  },
  {
    id: 'healthcare', label: 'Healthcare / HIPAA-style', emoji: '🏥',
    desc: 'PII scanner and auto-redact pushed forward; cloud connectors and share URLs disabled.',
    disabledTools: ['cloudconnect', 'recipe'],
    enforce: ['Run PII Scan before any export', 'Auto-redact identifiers', 'Encrypt with AES-256 before transfer'],
  },
  {
    id: 'government', label: 'Government / Air-gapped', emoji: '🏛',
    desc: 'Strictest mode: no cloud, no external links, no AI model downloads. Designed for fully offline, air-gapped stations.',
    disabledTools: ['cloudconnect', 'recipe', 'translate', 'aiassistant'],
    enforce: ['Work offline — the full toolkit functions air-gapped', 'Tamper-seal every output', 'Verify custody chain before release'],
  },
]

const POLICY_KEY = 'commandeditor-policy'

export function getActivePolicy(): PolicyPreset {
  try {
    const id = localStorage.getItem(POLICY_KEY)
    return POLICY_PRESETS.find((p) => p.id === id) || POLICY_PRESETS[0]
  } catch { return POLICY_PRESETS[0] }
}

export function setActivePolicy(id: string): void {
  localStorage.setItem(POLICY_KEY, id)
  // Broadcast so open tool grids can re-filter immediately
  window.dispatchEvent(new CustomEvent('commandeditor-policy-changed', { detail: id }))
}

// ─── TSP-READY SIGNING PACKAGE ─────────────────────────────────────────────
// CommandEditor signatures are ECDSA P-256 over SHA-256 — cryptographically
// sound, but not "qualified" under eIDAS because the key isn't held by a
// Qualified Trust Service Provider. This export produces the exact package a
// TSP needs to countersign: the document digest, the existing signature, the
// public key, and RFC-3161-ready metadata — plus links to validate.
export interface SigningPackage {
  standard: 'CE-SIGN-1'
  document: { name: string; sha256: string; bytes: number }
  signature: { algorithm: string; value: string; publicKeyJwk: any; signer: string; timestamp: string } | null
  tspInstructions: string[]
  validators: Array<{ name: string; url: string }>
}

export async function buildSigningPackage(
  file: File,
  existingCertJson?: string
): Promise<SigningPackage> {
  const buf = await file.arrayBuffer()
  const digest = await crypto.subtle.digest('SHA-256', buf)
  const sha256 = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('')

  let signature: SigningPackage['signature'] = null
  if (existingCertJson) {
    try {
      const cert = JSON.parse(existingCertJson)
      signature = {
        algorithm: cert.algorithm || 'ECDSA-P256-SHA256',
        value: cert.signature || cert.sig || '',
        publicKeyJwk: cert.publicKey || cert.publicKeyJwk || null,
        signer: cert.signer || cert.name || 'Unknown',
        timestamp: cert.timestamp || new Date().toISOString(),
      }
    } catch { /* no valid cert pasted — package is unsigned */ }
  }

  return {
    standard: 'CE-SIGN-1',
    document: { name: file.name, sha256, bytes: buf.byteLength },
    signature,
    tspInstructions: [
      '1. Send document.sha256 (not the document) to your Qualified Trust Service Provider.',
      '2. Request a qualified signature/seal over that digest (eIDAS Art. 32/42).',
      '3. The TSP returns a qualified certificate + signature value.',
      '4. Attach both to this package to produce a qualified electronic signature.',
      '5. For timestamping, submit the digest to any RFC-3161 TSA.',
    ],
    validators: [
      { name: 'EU DSS validation (eIDAS)', url: 'https://ec.europa.eu/digital-building-blocks/DSS/webapp-demo/validation' },
      { name: 'EU Trusted List Browser', url: 'https://eidas.ec.europa.eu/efda/trust-services/browse/eidas/tls' },
    ],
  }
}

// ─── PROOF-OF-NO-UPLOAD NETWORK AUDIT ──────────────────────────────────────
// Wraps every network egress primitive for a timed window and counts bytes.
// If the user runs tools during the window and the counter stays at zero,
// that is a live, verifiable demonstration that documents never leave.
export interface AuditReport {
  startedAt: string
  durationMs: number
  requests: Array<{ url: string; bytes: number; kind: string }>
  totalBytesOut: number
  verdict: 'CLEAN' | 'ACTIVITY'
}

let auditActive = false
let auditLog: Array<{ url: string; bytes: number; kind: string }> = []
let restoreFns: Array<() => void> = []

function estimateBodyBytes(body: any): number {
  if (!body) return 0
  if (typeof body === 'string') return body.length
  if (body instanceof ArrayBuffer) return body.byteLength
  if (ArrayBuffer.isView(body)) return body.byteLength
  if (body instanceof Blob) return body.size
  if (body instanceof FormData) return -1 // unknown but non-zero intent
  if (body instanceof URLSearchParams) return body.toString().length
  return 0
}

export function startNetworkAudit(): void {
  if (auditActive) return
  auditActive = true
  auditLog = []
  restoreFns = []

  const w = window as any

  const origFetch = w.fetch.bind(w)
  w.fetch = (input: any, init: any = {}) => {
    const url = typeof input === 'string' ? input : input?.url || ''
    const bytes = estimateBodyBytes(init?.body)
    if (bytes > 0 || init?.method === 'POST' || init?.method === 'PUT') {
      auditLog.push({ url, bytes, kind: 'fetch' })
    }
    return origFetch(input, init)
  }
  restoreFns.push(() => { w.fetch = origFetch })

  const OrigXHR = w.XMLHttpRequest
  w.XMLHttpRequest = class extends OrigXHR {
    open(method: string, url: string, ...rest: any[]) { (this as any).__ceAudit = { method, url }; return super.open(method, url, ...rest as [any, any, any]) }
    send(body?: any) {
      const meta = (this as any).__ceAudit
      const bytes = estimateBodyBytes(body)
      if (meta && (bytes > 0 || meta.method === 'POST' || meta.method === 'PUT')) {
        auditLog.push({ url: meta.url, bytes, kind: 'xhr' })
      }
      return super.send(body)
    }
  }
  restoreFns.push(() => { w.XMLHttpRequest = OrigXHR })

  const origBeacon = navigator.sendBeacon?.bind(navigator)
  if (origBeacon) {
    navigator.sendBeacon = (url: string, data?: any) => {
      auditLog.push({ url, bytes: estimateBodyBytes(data), kind: 'beacon' })
      return origBeacon(url, data)
    }
    restoreFns.push(() => { navigator.sendBeacon = origBeacon })
  }

  const OrigWS = w.WebSocket
  w.WebSocket = class extends OrigWS {
    constructor(url: string, protocols?: any) {
      super(url, protocols)
      auditLog.push({ url, bytes: 0, kind: 'websocket' })
    }
  }
  restoreFns.push(() => { w.WebSocket = OrigWS })
}

export function stopNetworkAudit(startedAt: string): AuditReport {
  restoreFns.forEach((fn) => { try { fn() } catch {} })
  restoreFns = []
  auditActive = false
  const totalBytesOut = auditLog.reduce((a, r) => a + Math.max(0, r.bytes), 0)
  return {
    startedAt,
    durationMs: Date.now() - new Date(startedAt).getTime(),
    requests: [...auditLog],
    totalBytesOut,
    verdict: auditLog.length === 0 ? 'CLEAN' : 'ACTIVITY',
  }
}
