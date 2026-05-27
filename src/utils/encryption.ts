import crypto from 'crypto';

const ALGO = 'aes-256-cbc';

// ── Key derivation ─────────────────────────────────────────────────────────────
// Reads ENCRYPTION_KEY from env, pads / truncates to exactly 32 bytes.
// In production the env var is mandatory; in dev a warning is emitted.
function deriveKey(): Buffer {
  const raw = process.env.ENCRYPTION_KEY;

  if (!raw) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('[encryption] ENCRYPTION_KEY environment variable is required in production');
    }
    console.warn('[encryption] ENCRYPTION_KEY not set – using insecure fallback (dev only)');
  }

  const src = raw ?? 'neoteric-ims-aes-key-2024-secure';
  const key = Buffer.alloc(32, 0);
  Buffer.from(src, 'utf8').copy(key, 0, 0, Math.min(32, src.length));
  return key;
}

// Initialise key once at startup
const KEY: Buffer = deriveKey();

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Encrypts a plain-text string with AES-256-CBC.
 * Returns `"<ivHex>:<ciphertextHex>"` – the format expected by the frontend decrypt().
 */
export const encrypt = (plaintext: string): string => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, 'utf8')),
    cipher.final(),
  ]);
  return `${iv.toString('hex')}:${encrypted.toString('hex')}`;
};

/**
 * Decrypts a string produced by encrypt() or the frontend encrypt().
 * Expects `"<ivHex>:<ciphertextHex>"` format.
 */
export const decrypt = (ciphertext: string): string => {
  const sep = ciphertext.indexOf(':');
  if (sep === -1 || sep !== 32) {
    throw new Error('[encryption] Malformed ciphertext – expected "<32-char IV>:<hex data>"');
  }
  const iv        = Buffer.from(ciphertext.slice(0, 32), 'hex');
  const encrypted = Buffer.from(ciphertext.slice(33),    'hex');
  const decipher  = crypto.createDecipheriv(ALGO, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
};
