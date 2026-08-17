# Security Notes

## Threat model

CommandEditor's security rests on an architectural guarantee rather than a
promise: **document processing has no server component.** All parsing,
rendering, editing, signing, encryption, and AI inference execute in the
user's browser tab. Since v9 the entire app (including the pdf.js engine) is
cached by a service worker, so it can be used with the network physically
disconnected — the strongest possible demonstration that files cannot leak.

## Cryptography

| Feature | Primitive | Implementation |
|---|---|---|
| File encryption | AES-256-GCM, PBKDF2 (150k iterations) | Web Crypto API |
| E-signatures | ECDSA P-256 over SHA-256 | Web Crypto API |
| Tamper seals | SHA-256 + timestamp | Web Crypto API |
| Chain of custody | SHA-256 hash-chained entries | Web Crypto API |
| Time-locked docs | AES-256 + availability window | Web Crypto API |

All keys are generated and used in-browser; private keys never leave the
device.

## E-signature scope (honest)

CommandEditor signatures are cryptographically verifiable but are **not**
eIDAS "qualified" signatures, because the private key is not held by a
Qualified Trust Service Provider. The v10 **TSP-ready package export**
(`ESignatureWorkflow → Export TSP-Ready Package`) bridges this: it packages
the document digest, signature, and public key with instructions for a TSP
to countersign, upgrading to qualified status.

## Verifying "no upload" yourself

- **Tools → Proof of No Upload**: instruments `fetch`/`XHR`/`WebSocket`/
  `sendBeacon` during a session and reports every byte of egress.
- Browser DevTools → Network tab while processing any file.
- Disconnect from the network entirely — everything keeps working.

## Known limitations

- The Plugin SDK executes third-party plugin code with page privileges;
  only install plugins from sources you trust and review.
- Browser-based speech recognition (Chrome) sends audio to Google's speech
  service; the v10 **on-device Whisper beta** avoids this.
- Optional AI features download model files from HuggingFace on first use.
  Document content is never sent — only the model travels, inbound.

## Reporting

Report vulnerabilities to hello@commandeditor.com. Please do not open public
issues for unpatched vulnerabilities.
