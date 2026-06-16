var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { logger } from "../utils/logger.js";
import { Router } from "express";
import path from "path";
import fs from "fs";
import multer from "multer";
import { PurchaseOrder, Quotation, MaterialRequirement } from "../models/index.js";
import { authenticate, serverHasPermission } from "../middleware/auth.middleware.js";
import { getRolesWithPermission, createNotification } from "../utils/notification.js";
import { triggerN8nWebhook, sendSlackFile } from "../utils/webhook.js";
import { broadcast } from "../utils/broadcaster.js";
import { getNextSequence } from "../utils/sequence.js";
import { createCrudRoutes } from "../utils/crud.js";
import { logAudit } from "../utils/audit.js";

const pdfUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => cb(null, file.mimetype === "application/pdf"),
});
const router = Router();
router.get("/occupied-mrs", authenticate, async (req, res) => {
  try {
    const activePOs = await PurchaseOrder.find(
      { mrId: { $exists: true, $ne: "" }, status: { $nin: ["Rejected", "Blocked", "Cancelled"] } },
      { mrId: 1, workType: 1, _id: 0 }
    ).lean();
    res.json({ success: true, data: activePOs });
  } catch (error) {
    logger.error("Error fetching occupied MRs:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/", authenticate, async (req, res) => {
  try {
    if (!await serverHasPermission(req.user, "CREATE_PURCHASE_ORDER")) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const seq = await getNextSequence("PO");
    const customId = `PO-${year}-${seq}`;
    const data = { ...req.body };
    const calcCharge = /* @__PURE__ */ __name((amt, pct, type) => {
      if (!amt) return 0;
      return type === "Exclusive" ? amt * (1 + pct / 100) : amt;
    }, "calcCharge");
    const itemsTotal = data.items?.reduce((sum, item2) => sum + (item2.totalWithGST || 0), 0) || 0;
    const freightTotal = calcCharge(data.freightAmount || 0, data.freightGstPct || 0, data.freightGstType || "Exclusive");
    const loadingTotal = calcCharge(data.loadingAmount || 0, data.loadingGstPct || 0, data.loadingGstType || "Exclusive");
    const unloadingTotal = calcCharge(data.unloadingAmount || 0, data.unloadingGstPct || 0, data.unloadingGstType || "Exclusive");
    const totalValue = itemsTotal + freightTotal + loadingTotal + unloadingTotal;
    const item = await PurchaseOrder.create({
      ...data,
      id: customId,
      totalValue,
      status: data.status || "Pending L1",
      createdBy: req.user.name,
      date: data.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    });
    broadcast({ type: "DATA_UPDATED", path: "pos" });
    logAudit(req.user, "CREATE", "PurchaseOrder", item.id, { supplier: item.supplier, totalValue: item.totalValue, status: item.status });
    await createNotification({
      message: `New PURCHASE ORDER created by ${req.user.name}`,
      severity: "success",
      path: "pos",
      senderId: req.user._id
    });
    if (item.status === "Pending L1") {
      const roles = await getRolesWithPermission("APPROVE_PURCHASE_ORDER_L1");
      await createNotification({
        message: `PO ${item.id} created and requires L1 Approval`,
        severity: "warning",
        path: "pos",
        senderId: req.user._id,
        targetRoles: roles
      });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    logger.error("Error creating PO:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});
router.put("/:id/cancel", authenticate, async (req, res) => {
  try {
    const { cancelNote } = req.body;
    if (!cancelNote || !String(cancelNote).trim()) {
      return res.status(400).json({ success: false, message: "Cancellation note is required" });
    }
    const roleLower = (req.user.role || "").toLowerCase().trim();
    const isSuperAdmin = ["super admin", "superadmin", "admin"].includes(roleLower);
    const isAGM = roleLower === "agm";
    if (!isSuperAdmin && !isAGM) {
      return res.status(403).json({ success: false, message: "Only AGM can cancel approved Purchase Orders" });
    }
    const po = await PurchaseOrder.findOne({ id: req.params.id });
    if (!po) return res.status(404).json({ success: false, message: "Purchase Order not found" });
    if (po.status !== "Approved") {
      return res.status(400).json({ success: false, message: `PO is currently "${po.status}". Only Approved POs can be cancelled.` });
    }
    const cancelledAt = (/* @__PURE__ */ new Date()).toISOString();
    await PurchaseOrder.findOneAndUpdate(
      { id: req.params.id },
      { status: "Cancelled", cancelNote: String(cancelNote).trim(), cancelledBy: req.user.name, cancelledAt }
    );
    let quotationReset = false;
    if (po.mrId) {
      const mr = await MaterialRequirement.findOne({ id: po.mrId });
      if (mr) {
        let quotationId = mr.approvedQuotationId;
        if (!quotationId && Array.isArray(mr.approvals) && mr.approvals.length > 0) {
          const match = mr.approvals.find((a) => a.category === po.workType);
          if (match) quotationId = match.quotationId;
        }
        if (quotationId) {
          const newToken = `QT-TOKEN-${quotationId}-${Date.now()}`;
          await Quotation.findOneAndUpdate(
            { id: quotationId },
            { status: "Pending", token: newToken }
          );
          quotationReset = true;
          broadcast({ type: "DATA_UPDATED", path: "quotations" });
        }
        await MaterialRequirement.findOneAndUpdate(
          { id: po.mrId },
          { status: "Store Pending", $unset: { approvedQuotationId: "", approvedSupplier: "" } }
        );
        broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      }
    }
    broadcast({ type: "DATA_UPDATED", path: "pos" });
    logAudit(req.user, "CANCEL", "PurchaseOrder", po.id, { reason: String(cancelNote).trim() });
    await createNotification({
      message: `PO ${po.id} cancelled by ${req.user.name}. Reason: ${String(cancelNote).trim()}`,
      severity: "warning",
      path: "pos",
      senderId: req.user._id
    });
    await triggerN8nWebhook("PO_CANCELLED", {
      poId: po.id,
      cancelledBy: req.user.name,
      cancelNote: String(cancelNote).trim(),
      quotationReset
    });
    res.json({
      success: true,
      message: `PO cancelled successfully${quotationReset ? ". Linked quotation reset to Pending." : ""}`,
      data: { id: req.params.id, cancelledAt }
    });
  } catch (error) {
    logger.error("Error cancelling PO:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});
router.post("/:id/pdf-slack", authenticate, pdfUpload.single("pdf"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: "PDF file required" });

    const po = await PurchaseOrder.findOne({ id: req.params.id }).lean();
    if (!po) return res.status(404).json({ success: false, message: "PO not found" });

    // Upload PDF file directly to Slack
    const fmtRs = (n) => Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const slackCaption = `📋 *New PO: ${po.id}* | Supplier: ${po.supplier || "N/A"} | ₹${fmtRs(po.totalValue)} | ${po.status}`;
    const pdfBuffer = req.file.buffer;
    sendSlackFile(pdfBuffer, `${po.id}.pdf`, slackCaption).catch(err =>
      logger.error("[Slack] sendSlackFile failed:", err)
    );

    // Fire NEW_PO webhook to N8N with complete payload
    await triggerN8nWebhook("NEW_PO", {
      timestamp: new Date().toISOString(),
      poId: po.id,
      supplier: po.supplier,
      totalValue: po.totalValue,
      status: po.status,
      items: po.items,
      createdBy: po.createdBy,
      workType: po.workType,
      project: po.project,
      mrId: po.mrId,
      priority: po.priority
    });

    res.json({ success: true, message: "Sent to Slack successfully" });
  } catch (error) {
    logger.error("Error in pdf-slack endpoint:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

createCrudRoutes(router, PurchaseOrder, "pos", "id", "PURCHASE_ORDERS", "PURCHASE_ORDER");
var stdin_default = router;
export {
  stdin_default as default
};
