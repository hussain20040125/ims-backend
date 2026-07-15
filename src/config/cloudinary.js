var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { v2 as cloudinary } from "cloudinary";
import { CloudinaryStorage } from "multer-storage-cloudinary";
import multer from "multer";
import dotenv from "dotenv";
import path from "path";
import fs from "fs";
dotenv.config();
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});
const isCloudinaryConfigured = !!(process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET);
if (!isCloudinaryConfigured) {
  console.warn("Cloudinary environment variables are missing. Falling back to local storage.");
}
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const diskStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, file.fieldname + "-" + uniqueSuffix + path.extname(file.originalname));
  }
});

let storage;
if (isCloudinaryConfigured) {
  const cloudinaryStorage = new CloudinaryStorage({
    cloudinary,
    params: { folder: "IMS", allowed_formats: ["jpg", "png", "jpeg", "webp", "heic", "heif"] }
  });
  // Fallback to disk when Cloudinary is unreachable (ENOTFOUND / network error)
  storage = {
    _handleFile(req, file, cb) {
      cloudinaryStorage._handleFile(req, file, (err, info) => {
        if (err && (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED" || err.code === "ETIMEDOUT")) {
          console.warn("[Upload] Cloudinary unreachable, falling back to disk storage");
          diskStorage._handleFile(req, file, cb);
        } else {
          cb(err, info);
        }
      });
    },
    _removeFile(req, file, cb) {
      if (file.path && file.path.startsWith("http")) {
        cloudinaryStorage._removeFile(req, file, cb);
      } else {
        diskStorage._removeFile(req, file, cb);
      }
    }
  };
} else {
  storage = diskStorage;
}
const upload = multer({ storage });
var stdin_default = cloudinary;
export {
  stdin_default as default,
  upload
};
