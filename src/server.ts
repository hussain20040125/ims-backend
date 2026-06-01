import dotenv from "dotenv";
dotenv.config();

import express from "express";
import path from "path";
import http from "http";
import fs from "fs";
import cors from "cors";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import mongoose from "mongoose";
import rateLimit from "express-rate-limit";
import compression from "compression";
import { logger } from "./utils/logger.js";

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

// ── Validate required environment variables at startup ────────────────────────
const IS_PROD = process.env.NODE_ENV === "production";
if (IS_PROD) {
  const required = ["MONGODB_URI", "JWT_SECRET", "ENCRYPTION_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length) {
    logger.error(`[STARTUP] Missing required env vars: ${missing.join(", ")}`);
    process.exit(1);
  }
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5000;

// ── Gzip compression (10-15x smaller responses) ───────────────────────────────
app.use(compression({ level: 6, threshold: 1024 }));

// ── Security headers ──────────────────────────────────────────────────────────
app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" }, // allow image loads from frontend
  contentSecurityPolicy: false, // CSP managed at CDN/Vercel level
}));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { success: false, message: "Too many login attempts. Please try again in 15 minutes." },
  standardHeaders: true,
  legacyHeaders: false,
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 300,
  message: { success: false, message: "Too many requests. Please slow down." },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use("/api/auth/login", authLimiter);
app.use("/api", apiLimiter);

// ── CORS ──────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = [
  "http://localhost:5173",
  "http://localhost:5174",
  "https://inventory-management-system-v1-fron.vercel.app",
  "https://inventory-management-system--v1.vercel.app",
  ...(process.env.ALLOWED_ORIGINS
    ? process.env.ALLOWED_ORIGINS.split(",").map((o) => o.trim())
    : []),
];

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    callback(new Error(`CORS: origin "${origin}" not allowed`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
  allowedHeaders: ["Content-Type", "Authorization", "x-enc"],
}));

// ── Body parsing & cookies ────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(cookieParser());
app.use(morgan(IS_PROD ? "combined" : "dev"));
app.use(encryptionMiddleware);

// ── Static uploads ────────────────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), "uploads");
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
app.use("/uploads", express.static(uploadDir));

// ── Connect DB & init broadcaster ─────────────────────────────────────────────
connectDB();
initBroadcaster(server);

// ── API routes ────────────────────────────────────────────────────────────────
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
app.use("/api", transactionRoutes);
app.use("/api/stock-check", stockCheckRoutes);
app.use("/api", settingRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/writeoffs", writeoffRoutes);
app.use("/api/public", publicRoutes);
app.use("/api", uploadRoutes);
app.use("/api/audit-logs", auditRoutes);

// ── Health check (used by keep-alive pings and load balancers) ────────────────
app.get("/api/health", (_req, res) => res.json({ status: "ok", ts: Date.now() }));

// ── n8n Incoming Webhook ──────────────────────────────────────────────────────
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

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("[Error]", err);
  const status = err.status || 500;
  const message = IS_PROD && status === 500 ? "Internal server error" : (err.message || "Internal server error");
  res.status(status).json({ success: false, message });
});

// ── Start server ──────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  logger.info(`IMS backend running on port ${PORT} [${process.env.NODE_ENV || "development"}]`);
});

// ── Graceful shutdown ─────────────────────────────────────────────────────────
const shutdown = async (signal: string) => {
  logger.info(`[${signal}] Shutting down gracefully...`);
  server.close(async () => {
    await mongoose.connection.close();
    logger.info("MongoDB connection closed. Bye.");
    process.exit(0);
  });
  setTimeout(() => { logger.error("Forced shutdown after timeout"); process.exit(1); }, 10000);
};

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
  logger.error("[unhandledRejection]", reason);
});
process.on("uncaughtException", (err) => {
  logger.error("[uncaughtException]", err);
  shutdown("uncaughtException");
});
