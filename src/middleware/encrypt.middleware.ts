import { Request, Response, NextFunction } from 'express';
import { encrypt, decrypt } from '../utils/encryption.js';

/**
 * Opt-in AES-256-CBC encryption layer.
 *
 * A request opts-in by including the header:  `x-enc: 1`
 *
 * Request (POST / PUT / PATCH):
 *   Body must be `{ __enc: "<ivHex>:<ciphertextHex>" }`.
 *   The middleware decrypts it and replaces req.body with the parsed JSON.
 *
 * Response:
 *   On `success: true` responses the middleware replaces res.json with an
 *   encrypted envelope: `{ __enc: "<ivHex>:<ciphertextHex>" }`.
 *   Error responses (`success: false`) are always sent plain so clients can
 *   display them even if decryption fails.
 *
 * Multipart / file uploads are never encrypted (Content-Type: multipart/…).
 */
export const encryptionMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Skip if the client hasn't opted-in
  if (req.headers['x-enc'] !== '1') {
    next();
    return;
  }

  // ── Decrypt inbound body ─────────────────────────────────────────────────
  const method      = req.method.toUpperCase();
  const isMultipart = (req.headers['content-type'] ?? '').includes('multipart');
  const hasCipher   = req.body && typeof req.body.__enc === 'string';

  if (['POST', 'PUT', 'PATCH'].includes(method) && !isMultipart && hasCipher) {
    try {
      req.body = JSON.parse(decrypt(req.body.__enc as string));
    } catch {
      res.status(400).json({ success: false, message: 'Invalid or tampered encrypted payload' });
      return;
    }
  }

  // ── Encrypt outbound body ────────────────────────────────────────────────
  const originalJson = res.json.bind(res);
  // Override res.json – must return Response to satisfy Express's type
  (res as any).json = (body: any): Response => {
    // Error responses travel unencrypted
    if (!body || body.success === false) {
      return originalJson(body);
    }
    try {
      return originalJson({ __enc: encrypt(JSON.stringify(body)) });
    } catch {
      // Encryption failure should not crash the response
      return originalJson(body);
    }
  };

  next();
};
