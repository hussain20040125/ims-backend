var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { encrypt, decrypt } from "../utils/encryption.js";
const encryptionMiddleware = /* @__PURE__ */ __name((req, res, next) => {
  if (req.headers["x-enc"] !== "1") {
    next();
    return;
  }
  const method = req.method.toUpperCase();
  const isMultipart = (req.headers["content-type"] ?? "").includes("multipart");
  const hasCipher = req.body && typeof req.body.__enc === "string";
  if (["POST", "PUT", "PATCH"].includes(method) && !isMultipart && hasCipher) {
    try {
      req.body = JSON.parse(decrypt(req.body.__enc));
    } catch {
      res.status(400).json({ success: false, message: "Invalid or tampered encrypted payload" });
      return;
    }
  }
  const originalJson = res.json.bind(res);
  res.json = (body) => {
    if (!body || body.success === false) {
      return originalJson(body);
    }
    try {
      return originalJson({ __enc: encrypt(JSON.stringify(body)) });
    } catch {
      return originalJson(body);
    }
  };
  next();
}, "encryptionMiddleware");
export {
  encryptionMiddleware
};
