import { Router } from "express";
import { authenticate } from "../middleware/auth.middleware.js";
import { MaterialPlanRevision, MaterialPlan } from "../models/index.js";
import { broadcast } from "../utils/broadcaster.js";
import { logAudit } from "../utils/audit.js";
import { getNextSequence } from "../utils/sequence.js";
import { createNotification } from "../utils/notification.js";
const router = Router();
const REVIEWER_ROLES = ["Super Admin", "Director", "Project Manager", "admin", "AGM", "Head"];
router.get("/", authenticate, async (req, res) => {
  try {
    const { status, planId } = req.query;
    const query = {};
    if (status) query.status = status;
    if (planId) query.planId = planId;
    const isReviewer = REVIEWER_ROLES.includes(req.user.role);
    if (!isReviewer) {
      query.engineerName = req.user.name;
    }
    const revisions = await MaterialPlanRevision.find(query).sort({ createdAt: -1 }).lean();
    res.json({ success: true, data: revisions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/", authenticate, async (req, res) => {
  try {
    const { planId, planItemSku, itemName, unit, currentAllocatedQty, requestedExtraQty, reason, project } = req.body;
    if (!planId || !planItemSku || !requestedExtraQty || !reason) {
      return res.status(400).json({ success: false, message: "planId, planItemSku, requestedExtraQty and reason are required." });
    }
    if (requestedExtraQty <= 0) {
      return res.status(400).json({ success: false, message: "requestedExtraQty must be greater than 0." });
    }
    const existing = await MaterialPlanRevision.findOne({
      planId,
      planItemSku,
      engineerName: req.user.name,
      status: "pending"
    });
    if (existing) {
      return res.status(400).json({ success: false, message: "A pending revision request for this item already exists." });
    }
    const plan = await MaterialPlan.findOne({ id: planId });
    const gmAgm = plan?.gmAgm || "";
    const seq = await getNextSequence("PLANREV");
    const id = `PLANREV-${(/* @__PURE__ */ new Date()).getFullYear()}-${seq}`;
    const revision = await MaterialPlanRevision.create({
      id,
      planId,
      planItemSku,
      itemName,
      unit,
      project,
      currentAllocatedQty: currentAllocatedQty || 0,
      requestedExtraQty,
      reason,
      engineerName: req.user.name,
      engineerId: req.user._id?.toString(),
      gmAgm,
      status: "pending"
    });
    broadcast({ type: "DATA_UPDATED", path: "plan-revisions" });
    logAudit(req.user, "CREATE", "PlanRevision", id, { planId, planItemSku, requestedExtraQty, reason });
    const notifyMsg = gmAgm ? `${req.user.name} requested +${requestedExtraQty} ${unit || ""} of "${itemName || planItemSku}" on plan ${planId}${gmAgm ? ` (assigned to ${gmAgm})` : ""}. Reason: ${reason}` : `${req.user.name} requested +${requestedExtraQty} ${unit || ""} of "${itemName || planItemSku}" on plan ${planId}. Reason: ${reason}`;
    await createNotification({
      message: notifyMsg,
      severity: "warning",
      path: "planning",
      senderId: req.user._id,
      targetRoles: ["Super Admin", "Director", "AGM", "Head", "Project Manager"]
    });
    res.json({ success: true, data: revision });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.put("/:id", authenticate, async (req, res) => {
  try {
    const isReviewer = REVIEWER_ROLES.includes(req.user.role);
    if (!isReviewer) {
      return res.status(403).json({ success: false, message: "Only GM / AGM / Project Manager can review revision requests." });
    }
    const { status, reviewNote } = req.body;
    if (!["approved", "rejected"].includes(status)) {
      return res.status(400).json({ success: false, message: 'status must be "approved" or "rejected".' });
    }
    const revision = await MaterialPlanRevision.findOne({ id: req.params.id });
    if (!revision) return res.status(404).json({ success: false, message: "Revision not found." });
    if (revision.status !== "pending") {
      return res.status(400).json({ success: false, message: "This revision has already been reviewed." });
    }
    revision.status = status;
    revision.reviewedBy = req.user.name;
    revision.reviewNote = reviewNote || "";
    revision.reviewedAt = (/* @__PURE__ */ new Date()).toISOString();
    await revision.save();
    if (status === "approved") {
      const plan = await MaterialPlan.findOne({ id: revision.planId });
      if (plan) {
        const item = plan.items.find((i) => i.sku === revision.planItemSku);
        if (item) {
          item.required = (item.required || 0) + (revision.requestedExtraQty || 0);
          await plan.save();
          broadcast({ type: "DATA_UPDATED", path: "planning" });
        }
      }
    }
    broadcast({ type: "DATA_UPDATED", path: "plan-revisions" });
    logAudit(req.user, status === "approved" ? "APPROVE" : "REJECT", "PlanRevision", req.params.id, {
      planId: revision.planId,
      planItemSku: revision.planItemSku,
      reviewNote
    });
    res.json({ success: true, data: revision });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
