import { Router } from "express";
import { upload } from "../config/cloudinary.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// POST /api/upload (authenticated)
router.post(
  "/upload",
  authenticate,
  (req, res, next) => {
    console.log("--- AUTHENTICATED UPLOAD START ---");
    upload.single("image")(req, res, (err) => {
      if (err) {
        console.error("Authenticated Multer Error:", err);
        return res.status(400).json({ success: false, message: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        console.error("Authenticated Upload Error: No file in request.");
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded in the request. Ensure the field name is "image".' 
        });
      }
      
      const file = req.file as any;
      let url = file.path || file.secure_url || file.url || file.location;
      
      if (file.filename && (!url || !url.startsWith("http"))) {
        url = `/uploads/${file.filename}`;
      }

      if (!url) {
        console.error("Authenticated Upload Error: No URL returned from storage.");
        return res.status(500).json({ success: false, message: "Failed to get image URL from storage" });
      }

      console.log("Authenticated Upload Success:", url);
      return res.status(200).json({ success: true, data: { url } });
    } catch (error: any) {
      console.error("Authenticated Upload Route Catch Error:", error);
      return res.status(500).json({ success: false, message: error.message || "Internal server error during upload" });
    }
  }
);

// POST /api/public/upload (unauthenticated)
router.post(
  "/public/upload",
  (req, res, next) => {
    console.log("--- PUBLIC UPLOAD START ---");
    upload.single("image")(req, res, (err) => {
      if (err) {
        console.error("Public Multer Error:", err);
        return res.status(400).json({ success: false, message: err.message || "Upload failed" });
      }
      next();
    });
  },
  (req, res) => {
    try {
      if (!req.file) {
        console.error("Public Upload Error: No file in request.");
        return res.status(400).json({ 
          success: false, 
          message: 'No file uploaded in the request. Ensure the field name is "image".' 
        });
      }
      
      const file = req.file as any;
      let url = file.path || file.secure_url || file.url || file.location;
      
      if (file.filename && (!url || !url.startsWith("http"))) {
        url = `/uploads/${file.filename}`;
      }

      if (!url) {
        console.error("Public Upload Error: No URL returned from storage.");
        return res.status(500).json({ success: false, message: "Failed to get image URL from storage" });
      }

      console.log("Public Upload Success:", url);
      return res.status(200).json({ success: true, data: { url } });
    } catch (error: any) {
      console.error("Public Upload Route Catch Error:", error);
      return res.status(500).json({ success: false, message: error.message || "Internal server error during upload" });
    }
  }
);

export default router;
