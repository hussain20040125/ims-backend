var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import crypto from "crypto";
const ALGO = "aes-256-cbc";
function deriveKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("[encryption] ENCRYPTION_KEY environment variable is required in production");
    }
    console.warn("[encryption] ENCRYPTION_KEY not set \u2013 using insecure fallback (dev only)");
  }
  const src = raw ?? "neoteric-ims-aes-key-2024-secure";
  const key = Buffer.alloc(32, 0);
  Buffer.from(src, "utf8").copy(key, 0, 0, Math.min(32, src.length));
  return key;
}
__name(deriveKey, "deriveKey");
const KEY = deriveKey();
const encrypt = /* @__PURE__ */ __name((plaintext) => {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv(ALGO, KEY, iv);
  const encrypted = Buffer.concat([
    cipher.update(Buffer.from(plaintext, "utf8")),
    cipher.final()
  ]);
  return `${iv.toString("hex")}:${encrypted.toString("hex")}`;
}, "encrypt");
const decrypt = /* @__PURE__ */ __name((ciphertext) => {
  const sep = ciphertext.indexOf(":");
  if (sep === -1 || sep !== 32) {
    throw new Error('[encryption] Malformed ciphertext \u2013 expected "<32-char IV>:<hex data>"');
  }
  const iv = Buffer.from(ciphertext.slice(0, 32), "hex");
  const encrypted = Buffer.from(ciphertext.slice(33), "hex");
  const decipher = crypto.createDecipheriv(ALGO, KEY, iv);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}, "decrypt");
export {
  decrypt,
  encrypt
};
