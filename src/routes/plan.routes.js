import { Router } from "express";
import { createCrudRoutes } from "../utils/crud.js";
import { MaterialPlan } from "../models/index.js";
import { authenticate, serverHasPermission } from "../middleware/auth.middleware.js";
import { logAudit } from "../utils/audit.js";
import { broadcast } from "../utils/broadcaster.js";
import { createNotification, getRolesWithPermission } from "../utils/notification.js";

const router = Router();
createCrudRoutes(router, MaterialPlan, "planning", "id", "MATERIAL_PLAN", "PLANNING");

const GM_ROLES = ["Super Admin", "superadmin", "admin", "Director", "GM"];

// AGM submits plan for GM approval
router.post("/:id/submit", authenticate, async (req, res) => {
  try {
    const plan = await MaterialPlan.findOne({ id: req.params.id });
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    if (!["Draft", "Open", "Rejected"].includes(plan.status)) {
      return res.status(400).json({ success: false, message: "Only Draft or Rejected plans can be submitted for approval" });
    }
    plan.status = "Pending Approval";
    plan.submittedBy = req.user.name;
    plan.submittedAt = new Date();
    await plan.save();
    broadcast({ type: "DATA_UPDATED", path: "planning" });
    logAudit(req.user, "UPDATE", "planning", plan.id, { action: "Submitted for GM approval", planId: plan.id });
    const gmRoles = await getRolesWithPermission("APPROVE_MATERIAL_PLAN");
    const targetRoles = gmRoles.length ? gmRoles : ["Director", "Super Admin"];
    await createNotification({
      message: `Material Plan ${plan.id} submitted for approval by ${req.user.name}`,
      severity: "warning",
      path: "planning",
      senderId: req.user._id,
      targetRoles
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GM approves the plan
router.post("/:id/approve", authenticate, async (req, res) => {
  try {
    const canApprove = GM_ROLES.includes(req.user.role) || await serverHasPermission(req.user, "APPROVE_MATERIAL_PLAN");
    if (!canApprove) {
      return res.status(403).json({ success: false, message: "Only GM / Director can approve material plans" });
    }
    const plan = await MaterialPlan.findOne({ id: req.params.id });
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    if (!["Pending Approval", "Rejected"].includes(plan.status)) {
      return res.status(400).json({ success: false, message: "Only Pending Approval or Rejected plans can be approved" });
    }
    plan.status = "Approved";
    plan.approvedBy = req.user.name;
    plan.approvedAt = new Date();
    plan.rejectionReason = undefined;
    plan.rejectedBy = undefined;
    plan.rejectedAt = undefined;
    await plan.save();
    broadcast({ type: "DATA_UPDATED", path: "planning" });
    logAudit(req.user, "APPROVE", "planning", plan.id, { action: "Plan approved", approvedBy: req.user.name });
    await createNotification({
      message: `Material Plan ${plan.id} has been approved by ${req.user.name}. MR can now be created.`,
      severity: "success",
      path: "planning",
      senderId: req.user._id
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GM rejects the plan with reason
router.post("/:id/reject", authenticate, async (req, res) => {
  try {
    const canReject = GM_ROLES.includes(req.user.role) || await serverHasPermission(req.user, "REJECT_MATERIAL_PLAN");
    if (!canReject) {
      return res.status(403).json({ success: false, message: "Only GM / Director can reject material plans" });
    }
    const { reason } = req.body;
    if (!reason?.trim()) {
      return res.status(400).json({ success: false, message: "Rejection reason is required" });
    }
    const plan = await MaterialPlan.findOne({ id: req.params.id });
    if (!plan) return res.status(404).json({ success: false, message: "Plan not found" });
    if (!["Pending Approval", "Approved"].includes(plan.status)) {
      return res.status(400).json({ success: false, message: "Only Pending Approval or Approved plans can be rejected" });
    }
    plan.status = "Rejected";
    plan.rejectedBy = req.user.name;
    plan.rejectedAt = new Date();
    plan.rejectionReason = reason.trim();
    await plan.save();
    broadcast({ type: "DATA_UPDATED", path: "planning" });
    logAudit(req.user, "REJECT", "planning", plan.id, { action: "Plan rejected", rejectedBy: req.user.name, reason: reason.trim() });
    await createNotification({
      message: `Material Plan ${plan.id} was rejected by ${req.user.name}: ${reason.trim()}`,
      severity: "error",
      path: "planning",
      senderId: req.user._id
    });
    res.json({ success: true, data: plan });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

var stdin_default = router;
export {
  stdin_default as default
};
