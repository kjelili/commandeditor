/**
 * Time-Based Document Access Control — reworked for correctness.
 *
 * The original module's key handling could never round-trip (splitKey was a
 * placeholder; reconstructKey returned HKDF material that is not an AES key).
 * This version produces a portable .tlock JSON bundle:
 *   - AES-256-GCM encryption, key derived from the password via PBKDF2
 *     (210k iterations, random salt) — decryption REQUIRES the password.
 *   - notBefore/expiresAt window and maxOpens are stored in the bundle and
 *     enforced by this viewer. Honest caveat: without a server, time and
 *     open-count checks are advisory — the cryptography only enforces the
 *     password. Treat expiry as policy, not proof.
 */

const PBKDF2_ITERATIONS = 210000;

class TimeAccessControl {
  async createTimeLock(fileBytes, options = {}) {
    const { expiresAt = null, notBefore = null, maxOpens = null, password, fileName = 'document.pdf', recipient = null } = options;
    if (!password) throw new Error('A password is required — it is what actually protects the file');

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const key = await this.deriveKey(password, salt);
    const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, fileBytes);

    return {
      format: 'commandeditor-timelock',
      version: 2,
      fileName,
      recipient,
      createdAt: new Date().toISOString(),
      notBefore: notBefore ? new Date(notBefore).toISOString() : null,
      expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
      maxOpens,
      openCount: 0,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: this.toB64(salt) },
      cipher: { name: 'AES-256-GCM', iv: this.toB64(iv) },
      ciphertext: this.toB64(new Uint8Array(ciphertext)),
    };
  }

  /** Returns { fileBytes, fileName, bundle } or throws with a reason. */
  async openDocument(bundle, password) {
    if (bundle?.format !== 'commandeditor-timelock') throw new Error('Not a CommandEditor time-lock file');
    const now = new Date();
    if (bundle.notBefore && now < new Date(bundle.notBefore)) {
      throw new Error(`Not available until ${new Date(bundle.notBefore).toLocaleString()}`);
    }
    if (bundle.expiresAt && now > new Date(bundle.expiresAt)) {
      throw new Error(`Expired ${new Date(bundle.expiresAt).toLocaleString()}`);
    }
    if (bundle.maxOpens != null && bundle.openCount >= bundle.maxOpens) {
      throw new Error('Maximum opens reached');
    }
    const key = await this.deriveKey(password, this.fromB64(bundle.kdf.salt));
    let plain;
    try {
      plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.fromB64(bundle.cipher.iv) }, key, this.fromB64(bundle.ciphertext));
    } catch {
      throw new Error('Wrong password (or the file is corrupted)');
    }
    bundle.openCount = (bundle.openCount || 0) + 1;
    return { fileBytes: new Uint8Array(plain), fileName: bundle.fileName || 'document.pdf', bundle };
  }

  async deriveKey(password, salt) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
    return crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: salt, iterations: PBKDF2_ITERATIONS, hash: 'SHA-256' },
      material, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  }

  toB64(bytes) {
    let s = '';
    const arr = new Uint8Array(bytes);
    for (let i = 0; i < arr.length; i += 0x8000) s += String.fromCharCode.apply(null, arr.subarray(i, i + 0x8000));
    return btoa(s);
  }

  fromB64(b64) {
    const s = atob(b64);
    const arr = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) arr[i] = s.charCodeAt(i);
    return arr;
  }
}

export { TimeAccessControl };
export default TimeAccessControl;
