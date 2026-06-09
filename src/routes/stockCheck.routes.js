import { Router } from "express";
import { StockCheckReport, Inventory } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { getRolesWithPermission, createNotification } from "../utils/notification.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
import { broadcast } from "../utils/broadcaster.js";
const router = Router();
router.get("/", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 100;
    const skip = (page - 1) * limit;
    const search = req.query.search || "";
    const filterStr = req.query.filter;
    let parsedFilter = {};
    if (typeof filterStr === "string") {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {
      }
    } else if (filterStr && typeof filterStr === "object") {
      parsedFilter = filterStr;
    }
    let query = {};
    if (search) {
      query.$or = [
        { id: { $regex: search, $options: "i" } },
        { category: { $regex: search, $options: "i" } },
        { performedBy: { $regex: search, $options: "i" } }
      ];
    }
    if (parsedFilter.startDate || parsedFilter.endDate) {
      query.date = {};
      if (parsedFilter.startDate) query.date.$gte = new Date(parsedFilter.startDate);
      if (parsedFilter.endDate) {
        const ed = new Date(parsedFilter.endDate);
        ed.setHours(23, 59, 59, 999);
        query.date.$lte = ed;
      }
    }
    const [items, total] = await Promise.all([
      StockCheckReport.find(query).sort({ date: -1 }).skip(skip).limit(limit),
      StockCheckReport.countDocuments(query)
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/", authenticate, async (req, res) => {
  try {
    const report = await StockCheckReport.create({ ...req.body, performedBy: req.user.name });
    broadcast({ type: "DATA_UPDATED", path: "stock-check-reports" });
    await createNotification({
      message: `New Stock Check Report ${report.id} submitted by ${req.user.name}`,
      severity: "info",
      path: "stock-check-reports",
      senderId: req.user._id
    });
    await triggerN8nWebhook("STOCK_CHECK", {
      reportId: report.id,
      performedBy: req.user.name,
      itemCount: report.items?.length || 0,
      status: report.status
    });
    if (report.status === "Pending Approval") {
      const roles = await getRolesWithPermission("APPROVE_STOCK_CHECK");
      await createNotification({
        message: `New Stock Check Report ${report.id} requires approval.`,
        severity: "warning",
        path: "stock-check-reports",
        senderId: req.user._id,
        targetRoles: roles.length ? roles : ["Super Admin", "Head", "AGM"]
      });
    }
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.post("/:id/approve", authenticate, async (req, res) => {
  try {
    const report = await StockCheckReport.findOneAndUpdate(
      { id: req.params.id },
      { status: "Approved", approvedBy: req.user.name, approvalReason: req.body.reason },
      { returnDocument: 'after' }
    );
    if (report) {
      for (const item of report.items) {
        const inventory = await Inventory.findOne({ sku: item.sku });
        if (inventory) {
          inventory.liveStock = item.physicalStock;
          await inventory.save();
        }
      }
      broadcast({ type: "DATA_UPDATED", path: "inventory" });
    }
    broadcast({ type: "DATA_UPDATED", path: "stock-check-reports" });
    await createNotification({
      message: `Stock Check Report ${report?.id} was APPROVED by ${req.user.name}`,
      severity: "success",
      path: "stock-check-reports",
      senderId: req.user._id
    });
    await triggerN8nWebhook("STOCK_CHECK_APPROVE", {
      reportId: req.params.id,
      approvedBy: req.user.name,
      reason: req.body.reason,
      itemCount: report?.items?.length || 0
    });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.post("/:id/reject", authenticate, async (req, res) => {
  try {
    const report = await StockCheckReport.findOneAndUpdate(
      { id: req.params.id },
      { status: "Rejected", approvedBy: req.user.name, approvalReason: req.body.reason },
      { returnDocument: 'after' }
    );
    broadcast({ type: "DATA_UPDATED", path: "stock-check-reports" });
    await createNotification({
      message: `Stock Check Report ${report?.id} was REJECTED by ${req.user.name}`,
      severity: "error",
      path: "stock-check-reports",
      senderId: req.user._id
    });
    await triggerN8nWebhook("STOCK_CHECK_REJECT", {
      reportId: req.params.id,
      rejectedBy: req.user.name,
      reason: req.body.reason
    });
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.delete("/:id", authenticate, async (req, res) => {
  try {
    const report = await StockCheckReport.findOne({ id: req.params.id });
    if (!report) {
      return res.status(404).json({ success: false, message: "Report not found" });
    }
    await StockCheckReport.findOneAndDelete({ id: req.params.id });
    broadcast({ type: "DATA_UPDATED", path: "stock-check-reports" });
    await createNotification({
      message: `Stock Check Report ${req.params.id} was deleted by ${req.user.name}`,
      severity: "warning",
      path: "stock-check-reports",
      senderId: req.user._id
    });
    res.json({ success: true, message: "Report deleted successfully" });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
