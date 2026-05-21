/**
 * AES-256-GCM Field-Level Encryption via Web Crypto API
 * 
 * Client-side stub for encrypting PHI fields before writing to Firestore.
 * Each field gets its own random IV. Key is generated per-session in memory.
 * 
 * TODO: Replace with Cloud Function key endpoint before production.
 * The Cloud Function should issue a per-case key only to matching role/UID.
 */

// ── Key Management (client-side stub) ────────────────────────

let sessionKey: CryptoKey | null = null;

/**
 * Generate a random AES-256-GCM key for this session.
 * In production, this key should come from an authenticated Cloud Function endpoint.
 * // TODO: Replace with Cloud Function key endpoint before production
 */
export async function getOrCreateSessionKey(): Promise<CryptoKey> {
  if (sessionKey) return sessionKey;

  sessionKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true, // extractable — needed for export if key sharing is required
    ['encrypt', 'decrypt']
  );

  return sessionKey;
}

/**
 * Export the current session key as a base64 string (for storage/sharing).
 * // TODO: Replace with Cloud Function key endpoint before production
 */
export async function exportSessionKey(): Promise<string> {
  const key = await getOrCreateSessionKey();
  const rawKey = await crypto.subtle.exportKey('raw', key);
  return btoa(String.fromCharCode(...new Uint8Array(rawKey)));
}

/**
 * Import a base64-encoded key.
 * // TODO: Replace with Cloud Function key endpoint before production
 */
export async function importKey(base64Key: string): Promise<CryptoKey> {
  const rawKey = Uint8Array.from(atob(base64Key), c => c.charCodeAt(0));
  return crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  );
}

// ── Encrypt / Decrypt ────────────────────────────────────────

export interface EncryptedField {
  iv: string;         // base64-encoded IV
  ciphertext: string; // base64-encoded ciphertext
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Each call generates a unique random IV.
 */
export async function encryptField(plaintext: string, key?: CryptoKey): Promise<EncryptedField> {
  const cryptoKey = key || await getOrCreateSessionKey();
  const iv = crypto.getRandomValues(new Uint8Array(12)); // 96-bit IV for GCM
  const encoded = new TextEncoder().encode(plaintext);

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    encoded
  );

  return {
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext))),
  };
}

/**
 * Decrypt an encrypted field back to plaintext.
 */
export async function decryptField(encrypted: EncryptedField, key?: CryptoKey): Promise<string> {
  const cryptoKey = key || await getOrCreateSessionKey();
  const iv = Uint8Array.from(atob(encrypted.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(encrypted.ciphertext), c => c.charCodeAt(0));

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    cryptoKey,
    ciphertext
  );

  return new TextDecoder().decode(decrypted);
}

// ── Bulk encrypt/decrypt for alert PHI fields ────────────────

/** Fields that contain PHI and must be encrypted before Firestore write */
const PHI_STRING_FIELDS = ['patientName', 'patientAge', 'notes'] as const;
const PHI_ARRAY_FIELDS = ['treatments', 'allergies'] as const;

/**
 * Encrypt all PHI fields in an alert object before writing to Firestore.
 * Returns a new object with encrypted PHI fields; non-PHI fields are untouched.
 */
export async function encryptAlertPHI(alert: Record<string, any>, key?: CryptoKey): Promise<Record<string, any>> {
  const cryptoKey = key || await getOrCreateSessionKey();
  const encrypted = { ...alert };

  // Encrypt string fields
  for (const field of PHI_STRING_FIELDS) {
    if (alert[field] != null && typeof alert[field] === 'string') {
      encrypted[field] = await encryptField(alert[field], cryptoKey);
    }
  }

  // Encrypt array fields (serialize as JSON string, then encrypt)
  for (const field of PHI_ARRAY_FIELDS) {
    if (Array.isArray(alert[field])) {
      encrypted[field] = await encryptField(JSON.stringify(alert[field]), cryptoKey);
    }
  }

  // Encrypt vitals array (serialize entire array as JSON)
  if (Array.isArray(alert.vitals)) {
    encrypted.vitals = await encryptField(JSON.stringify(alert.vitals), cryptoKey);
  }

  return encrypted;
}

/**
 * Decrypt all PHI fields in an alert object after reading from Firestore.
 */
export async function decryptAlertPHI(alert: Record<string, any>, key?: CryptoKey): Promise<Record<string, any>> {
  const cryptoKey = key || await getOrCreateSessionKey();
  const decrypted = { ...alert };

  // Decrypt string fields
  for (const field of PHI_STRING_FIELDS) {
    if (alert[field] && typeof alert[field] === 'object' && alert[field].iv && alert[field].ciphertext) {
      try {
        decrypted[field] = await decryptField(alert[field] as EncryptedField, cryptoKey);
      } catch {
        decrypted[field] = '[Decryption failed]';
      }
    }
  }

  // Decrypt array fields
  for (const field of PHI_ARRAY_FIELDS) {
    if (alert[field] && typeof alert[field] === 'object' && alert[field].iv && alert[field].ciphertext) {
      try {
        const json = await decryptField(alert[field] as EncryptedField, cryptoKey);
        decrypted[field] = JSON.parse(json);
      } catch {
        decrypted[field] = [];
      }
    }
  }

  // Decrypt vitals
  if (alert.vitals && typeof alert.vitals === 'object' && alert.vitals.iv && alert.vitals.ciphertext) {
    try {
      const json = await decryptField(alert.vitals as EncryptedField, cryptoKey);
      decrypted.vitals = JSON.parse(json);
    } catch {
      decrypted.vitals = [];
    }
  }

  return decrypted;
}
