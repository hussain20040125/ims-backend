var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { Router } from "express";
import { upload } from "../config/cloudinary.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { logger } from "../utils/logger.js";
const router = Router();
const handleUpload = /* @__PURE__ */ __name((multerMiddleware) => [
  (req, res, next) => {
    multerMiddleware(req, res, (err) => {
      if (err) {
        logger.error("[Upload] Multer error:", err.message);
        return res.status(400).json({ success: false, message: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({
          success: false,
          message: 'No file received. Ensure the field name is "image".'
        });
      }
      const file = req.file;
      let url = file.path || file.secure_url || file.url || file.location;
      if (file.filename && (!url || !url.startsWith("http"))) {
        url = `/uploads/${file.filename}`;
      }
      if (!url) {
        logger.error("[Upload] No URL returned from storage");
        return res.status(500).json({ success: false, message: "Failed to get image URL from storage" });
      }
      return res.status(200).json({ success: true, data: { url } });
    } catch (error) {
      logger.error("[Upload] Unexpected error:", error.message);
      return res.status(500).json({ success: false, message: "Internal server error during upload" });
    }
  }
], "handleUpload");
router.post("/upload", authenticate, ...handleUpload(upload.single("image")));
router.post("/public/upload", ...handleUpload(upload.single("image")));
var stdin_default = router;
export {
  stdin_default as default
};
