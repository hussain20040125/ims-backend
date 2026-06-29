import { Router } from "express";
import { Outward, Inward } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/gate-passes/available
// Returns Transfer Outward gate passes that have not yet been received (no matching Transfer Inward)
router.get("/available", authenticate, async (req, res) => {
  try {
    const outwards = await Outward.find({
      type: { $in: ["Transfer Outward", "Public Transfer Outward"] },
      gatePassNo: { $exists: true, $ne: "" }
    }).lean();

    // Find gate pass numbers already received via Transfer Inward
    const inwards = await Inward.find({
      type: { $in: ["Transfer Inward", "Public Transfer Inward"] },
      gatePassNo: { $exists: true, $ne: "" }
    }).lean();

    const receivedGatePasses = new Set(inwards.map((i) => i.gatePassNo).filter(Boolean));

    const available = outwards.filter((o) => o.gatePassNo && !receivedGatePasses.has(o.gatePassNo));

    res.json({ success: true, data: available });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/gate-passes/:gatePassNo
// Returns a specific Transfer Outward by gate pass number
router.get("/:gatePassNo", authenticate, async (req, res) => {
  try {
    const outward = await Outward.findOne({
      gatePassNo: req.params.gatePassNo,
      type: { $in: ["Transfer Outward", "Public Transfer Outward"] }
    }).lean();

    if (!outward) {
      return res.status(404).json({ success: false, message: `Gate pass ${req.params.gatePassNo} not found` });
    }

    res.json({ success: true, data: outward });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
