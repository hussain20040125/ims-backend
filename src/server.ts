import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import cors from "cors";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import mongoose from "mongoose";

import { connectDB } from "./config/db.js";
import { initBroadcaster, broadcast } from "./utils/broadcaster.js";
import { createNotification } from "./utils/notification.js";
import { StockCheckReport } from "./models/index.js";

// Import all routes
import authRoutes from "./routes/auth.routes.js";
import userRoutes from "./routes/user.routes.js";
import rolePermissionRoutes from "./routes/rolePermission.routes.js";
import catalogueRoutes from "./routes/catalogue.routes.js";
import supplierRoutes from "./routes/supplier.routes.js";
import inventoryRoutes from "./routes/inventory.routes.js";
import planRoutes from "./routes/plan.routes.js";
import mrRoutes from "./routes/mr.routes.js";
import poRoutes from "./routes/po.routes.js";
import quotationRoutes from "./routes/quotation.routes.js";
import grnRoutes from "./routes/grn.routes.js";
import transactionRoutes from "./routes/transaction.routes.js";
import stockCheckRoutes from "./routes/stockCheck.routes.js";
import settingRoutes from "./routes/setting.routes.js";
import notificationRoutes from "./routes/notification.routes.js";
import writeoffRoutes from "./routes/writeoff.routes.js";
import publicRoutes from "./routes/public.routes.js";
import uploadRoutes from "./routes/upload.routes.js";
import auditRoutes from "./routes/audit.routes.js";
import { encryptionMiddleware } from "./middleware/encrypt.middleware.js";

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// Connect to Database
connectDB();

// Init Broadcaster
initBroadcaster(server);

// Middleware
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://inventory-management-system-v1-fron.vercel.app",
  "https://inventory-management-system--v1.vercel.app",
  // Extra origins from env (comma-separated) — set on Render dashboard
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    // Allow server-to-server / Postman requests (no Origin header)
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-enc"],
}));
app.use(express.json());
app.use(cookieParser());
app.use(morgan("dev"));
// AES-256 request decrypt / response encrypt (opt-in via "x-enc: 1" header)
app.use(encryptionMiddleware);

// Serve static uploads
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use("/uploads", express.static(uploadDir));

// Mount Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/role-permissions", rolePermissionRoutes);
app.use("/api/catalogue", catalogueRoutes);
app.use("/api/suppliers", supplierRoutes);
app.use("/api/inventory", inventoryRoutes);
app.use("/api/planning", planRoutes);
app.use("/api/material-requirements", mrRoutes);
app.use("/api/pos", poRoutes);
app.use("/api/quotations", quotationRoutes);
app.use("/api/grn", grnRoutes);
app.use("/api", transactionRoutes); // Maps /transactions and /gate-passes
app.use("/api/stock-check", stockCheckRoutes);
app.use("/api", settingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/writeoffs", writeoffRoutes);
app.use("/api/public", publicRoutes);
app.use("/api", uploadRoutes);
app.use("/api/audit-logs", auditRoutes);

// Incoming Webhook (public)
app.post("/api/webhook/n8n", async (req, res) => {
  try {
    const signature = req.headers["x-webhook-secret"];
    if (process.env.N8N_WEBHOOK_SECRET && signature !== process.env.N8N_WEBHOOK_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const { action, payload } = req.body;
    if (!action) throw new Error("action is required");

    if (action === "UPDATE_PO_STATUS") {
      const { poId, status } = payload;
      const PurchaseOrder = mongoose.model("PurchaseOrder");
      const po = await PurchaseOrder.findOneAndUpdate({ id: poId }, { $set: { status } }, { new: true });
      if (!po) throw new Error(`PO ${poId} not found`);

      broadcast({ type: "DATA_UPDATED", path: "pos" });
      res.json({ success: true, message: `PO ${poId} status updated to ${status}` });
    } else if (action === "APPROVE_STOCK_CHECK") {
      const { reportId, approvedBy } = payload;
      const report = await StockCheckReport.findOneAndUpdate(
        { id: reportId },
        { $set: { status: "Approved", approvedBy, approvedAt: new Date() } },
        { new: true }
      );
      if (!report) throw new Error(`Report ${reportId} not found`);

      broadcast({ type: "DATA_UPDATED", path: "stock-check-reports" });
      res.json({ success: true, message: `Stock check ${reportId} approved` });
    } else if (action === "NOTIFY") {
      const { message, severity, path: notifPath, targetRoles } = payload;
      await createNotification({ message, severity, path: notifPath, targetRoles });
      res.json({ success: true, message: "Notification created" });
    } else if (action === "BROADCAST") {
      broadcast(payload);
      res.json({ success: true, message: "Broadcast sent" });
    } else {
      throw new Error(`Unsupported action ${action}`);
    }
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// Seed API Route
app.post("/api/seed", async (req, res) => {
  try {
    const { action } = req.body;
    if (action === "clear-cache") {
      res.json({ success: true, message: "Cache cleared" });
    } else {
      res.json({ success: true, message: "Seed complete" });
    }
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`IMS backend server running on port ${PORT}`);
});
// Nodemon reloaded database configuration


// Trigger nodemon restart

// Trigger nodemon restart 2

// Restart nodemon 3
