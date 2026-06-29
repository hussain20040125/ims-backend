import { Router } from "express";
import { Outward, Inward, Transaction } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/gate-passes/available
// Returns Transfer Outward gate passes that have not yet been received (no matching Transfer Inward)
router.get("/available", authenticate, async (req, res) => {
  try {
    const INVALID_GP = ["", "NA", "N/A", "na", "n/a", "null", "undefined"];
    const OUTWARD_TYPES = ["Transfer Outward", "Public Transfer Outward"];
    const INWARD_TYPES_TF = ["Transfer Inward", "Public Transfer Inward"];
    const [txOutwards, dbOutwards, txInwards, dbInwards] = await Promise.all([
      Transaction.find({ type: { $in: OUTWARD_TYPES }, gatePassNo: { $exists: true, $nin: INVALID_GP } }).lean(),
      Outward.find({ type: { $in: OUTWARD_TYPES }, gatePassNo: { $exists: true, $nin: INVALID_GP } }).lean(),
      Transaction.find({ type: { $in: INWARD_TYPES_TF }, gatePassNo: { $exists: true, $nin: INVALID_GP } }).lean(),
      Inward.find({ type: { $in: INWARD_TYPES_TF }, gatePassNo: { $exists: true, $nin: INVALID_GP } }).lean()
    ]);
    const seenOutward = new Set();
    const allOutwards = [...txOutwards, ...dbOutwards].filter((o) => {
      if (!o.gatePassNo || seenOutward.has(o.gatePassNo)) return false;
      seenOutward.add(o.gatePassNo);
      return true;
    });
    const receivedGPs = new Set([...txInwards, ...dbInwards].map((i) => i.gatePassNo).filter(Boolean));
    const available = allOutwards.filter((o) => !receivedGPs.has(o.gatePassNo));
    res.json({ success: true, data: available });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// GET /api/gate-passes/:gatePassNo
// Returns a specific Transfer Outward by gate pass number (searches both collections)
router.get("/:gatePassNo", authenticate, async (req, res) => {
  try {
    const gp = req.params.gatePassNo;
    const OUTWARD_TYPES = ["Transfer Outward", "Public Transfer Outward"];
    const [txResult, dbResult] = await Promise.all([
      Transaction.findOne({ gatePassNo: gp, type: { $in: OUTWARD_TYPES } }).lean(),
      Outward.findOne({ gatePassNo: gp, type: { $in: OUTWARD_TYPES } }).lean()
    ]);
    const result = txResult || dbResult;
    if (!result) {
      return res.status(404).json({ success: false, message: `Gate pass ${gp} not found` });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
