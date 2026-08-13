/**
 * Cryptographic Signing Utilities
 * Zero-knowledge e-signatures with audit trails
 * All operations use Web Crypto API - no server involved
 */

import type { 
  SignerIdentity, 
  SignatureField, 
  AuditEntry, 
  SigningCertificate 
} from '../types';

export class CryptoSigner {
  private keyPair: CryptoKeyPair | null = null;
  private signerId: string = '';

  async generateIdentity(name: string, email: string): Promise<SignerIdentity> {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'ECDSA',
        namedCurve: 'P-256',
      },
      true, // extractable
      ['sign', 'verify']
    );

    const publicKeyJwk = await crypto.subtle.exportKey('jwk', this.keyPair.publicKey);
    this.signerId = await this.hashString(email + Date.now().toString());

    return {
      id: this.signerId,
      name,
      email,
      publicKeyJwk,
      timestamp: Date.now(),
    };
  }

  async signDocument(pdfBytes: Uint8Array): Promise<{ signature: string; hash: string }> {
    if (!this.keyPair) throw new Error('Identity not generated');

    const hash = await this.hashBytes(pdfBytes);
    const signature = await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      this.keyPair.privateKey,
      pdfBytes as BufferSource
    );

    return {
      signature: this.arrayBufferToBase64(signature),
      hash,
    };
  }

  async createAuditEntry(
    action: AuditEntry['action'],
    identity: SignerIdentity,
    documentHash: string,
    details: Record<string, unknown> = {}
  ): Promise<AuditEntry> {
    const entry: AuditEntry = {
      action,
      actor: identity,
      timestamp: Date.now(),
      documentHash,
      details,
    };

    // Sign the audit entry itself
    const entryData = new TextEncoder().encode(JSON.stringify(entry));
    if (this.keyPair) {
      const sig = await crypto.subtle.sign(
        { name: 'ECDSA', hash: 'SHA-256' },
        this.keyPair.privateKey,
        entryData
      );
      entry.signature = this.arrayBufferToBase64(sig);
    }

    return entry;
  }

  async verifySignature(
    pdfBytes: Uint8Array,
    signature: string,
    publicKeyJwk: JsonWebKey
  ): Promise<boolean> {
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      publicKeyJwk,
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );

    return crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      publicKey,
      this.base64ToArrayBuffer(signature),
      pdfBytes as BufferSource
    );
  }

  async createCertificate(
    documentName: string,
    documentBytes: Uint8Array,
    signers: SignerIdentity[],
    fields: SignatureField[],
    auditTrail: AuditEntry[]
  ): Promise<SigningCertificate> {
    const hash = await this.hashBytes(documentBytes);
    const certId = await this.hashString(hash + Date.now().toString());

    return {
      documentHash: hash,
      documentName,
      createdAt: Date.now(),
      signers,
      auditTrail,
      signatureFields: fields,
      certificateId: certId,
    };
  }

  async verifyCertificate(cert: SigningCertificate, pdfBytes: Uint8Array): Promise<{
    valid: boolean;
    hashMatch: boolean;
    signaturesValid: boolean;
    details: string[];
  }> {
    const details: string[] = [];
    const currentHash = await this.hashBytes(pdfBytes);
    const hashMatch = currentHash === cert.documentHash;

    if (hashMatch) {
      details.push('✓ Document hash matches certificate');
    } else {
      details.push('✗ Document has been modified since signing');
    }

    let signaturesValid = true;
    for (const entry of cert.auditTrail) {
      if (entry.signature && entry.actor.publicKeyJwk) {
        const entryData = new TextEncoder().encode(
          JSON.stringify({ ...entry, signature: undefined })
        );
        const publicKey = await crypto.subtle.importKey(
          'jwk',
          entry.actor.publicKeyJwk,
          { name: 'ECDSA', namedCurve: 'P-256' },
          false,
          ['verify']
        );
        const valid = await crypto.subtle.verify(
          { name: 'ECDSA', hash: 'SHA-256' },
          publicKey,
          this.base64ToArrayBuffer(entry.signature),
          entryData
        );
        if (!valid) {
          signaturesValid = false;
          details.push(`✗ Invalid audit signature from ${entry.actor.name}`);
        } else {
          details.push(`✓ Valid audit signature from ${entry.actor.name}`);
        }
      }
    }

    return {
      valid: hashMatch && signaturesValid,
      hashMatch,
      signaturesValid,
      details,
    };
  }

  // Multi-party signing: encrypt state for next signer
  async encryptForNextSigner(
    data: unknown,
    recipientPublicKeyJwk: JsonWebKey
  ): Promise<{ encryptedData: string; wrappedKey: string }> {
    // Generate AES key
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    // Encrypt data
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const plaintext = new TextEncoder().encode(JSON.stringify(data));
    const ciphertext = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      plaintext
    );

    // Wrap AES key with recipient's public key using ECDH
    const recipientPublicKey = await crypto.subtle.importKey(
      'jwk',
      recipientPublicKeyJwk,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    // For ECDH, we need a temporary key pair
    const tempKeyPair = await crypto.subtle.generateKey(
      { name: 'ECDH', namedCurve: 'P-256' },
      true,
      ['deriveKey']
    );

    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: recipientPublicKey },
      tempKeyPair.privateKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['wrapKey', 'unwrapKey']
    );

    const wrappedKey = await crypto.subtle.wrapKey(
      'raw',
      aesKey,
      derivedKey,
      'AES-GCM'
    );

    const tempPublicKeyJwk = await crypto.subtle.exportKey('jwk', tempKeyPair.publicKey);

    return {
      encryptedData: this.arrayBufferToBase64(
        new Uint8Array([...iv, ...new Uint8Array(ciphertext)]).buffer
      ),
      wrappedKey: JSON.stringify({
        wrappedKey: this.arrayBufferToBase64(wrappedKey),
        tempPublicKey: tempPublicKeyJwk,
      }),
    };
  }

  async decryptFromPreviousSigner(
    encryptedData: string,
    wrappedKeyInfo: string,
    privateKey: CryptoKey
  ): Promise<unknown> {
    const { wrappedKey, tempPublicKey } = JSON.parse(wrappedKeyInfo);

    const tempPublicKeyCrypto = await crypto.subtle.importKey(
      'jwk',
      tempPublicKey,
      { name: 'ECDH', namedCurve: 'P-256' },
      false,
      []
    );

    const derivedKey = await crypto.subtle.deriveKey(
      { name: 'ECDH', public: tempPublicKeyCrypto },
      privateKey,
      { name: 'AES-GCM', length: 256 },
      true,
      ['wrapKey', 'unwrapKey']
    );

    const aesKey = await crypto.subtle.unwrapKey(
      'raw',
      this.base64ToArrayBuffer(wrappedKey),
      derivedKey,
      'AES-GCM',
      { name: 'AES-GCM', length: 256 },
      true,
      ['decrypt']
    );

    const data = this.base64ToArrayBuffer(encryptedData);
    const iv = data.slice(0, 12);
    const ciphertext = data.slice(12);

    const decrypted = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: new Uint8Array(iv) },
      aesKey,
      ciphertext
    );

    return JSON.parse(new TextDecoder().decode(decrypted));
  }

  private async hashBytes(data: Uint8Array): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', data as BufferSource);
    return Array.from(new Uint8Array(hash))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  private async hashString(str: string): Promise<string> {
    const encoder = new TextEncoder();
    return this.hashBytes(encoder.encode(str));
  }

  private arrayBufferToBase64(buffer: ArrayBuffer): string {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
  }

  private base64ToArrayBuffer(base64: string): ArrayBuffer {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
  }
}

export const cryptoSigner = new CryptoSigner();
