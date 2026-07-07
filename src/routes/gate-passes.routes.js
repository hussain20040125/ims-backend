import { Router } from "express";
import { Outward, Inward, Transaction } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";

const router = Router();

// GET /api/gate-passes/available
// Returns Transfer Outward gate passes that have not yet been received (no matching Transfer Inward)
router.get("/available", authenticate, async (req, res) => {
  try {
    const INVALID_GP = ["", "NA", "N/A", "na", "n/a", "null", "undefined"];
    const OUTWARD_TYPES = ["Transfer Outward", "Public Transfer Outward", "Transfer"];
    const INWARD_TYPES_TF = ["Transfer Inward", "Public Transfer Inward", "Transfer"];
    const GP_FILTER = { gatePassNo: { $exists: true, $nin: INVALID_GP } };
    const [txOutwards, dbOutwards, txInwards, dbInwards, allInwardsWithGP] = await Promise.all([
      Transaction.find({ type: { $in: OUTWARD_TYPES }, ...GP_FILTER }).lean(),
      Outward.find({ type: { $in: OUTWARD_TYPES }, ...GP_FILTER }).lean(),
      Transaction.find({ type: { $in: INWARD_TYPES_TF }, ...GP_FILTER }).lean(),
      // Inward collection is dedicated — exclude ANY doc with a gatePassNo regardless of type
      Inward.find(GP_FILTER).lean(),
      // Also catch Transfer Inwards stored in Transaction with any type variant
      Transaction.find({ ...GP_FILTER, type: { $regex: /inward/i } }).lean()
    ]);
    const seenOutward = new Set();
    const allOutwards = [...txOutwards, ...dbOutwards].filter((o) => {
      if (!o.gatePassNo || seenOutward.has(o.gatePassNo)) return false;
      seenOutward.add(o.gatePassNo);
      return true;
    });
    const receivedGPs = new Set(
      [...txInwards, ...dbInwards, ...allInwardsWithGP]
        .map((i) => i.gatePassNo)
        .filter(Boolean)
    );
    const available = allOutwards.filter((o) => !receivedGPs.has(o.gatePassNo));
    res.json({ success: true, data: available });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/gate-passes/:gatePassNo
// Returns a specific Transfer Outward by gate pass number (searches both collections)
router.get("/:gatePassNo", authenticate, async (req, res) => {
  try {
    const gp = req.params.gatePassNo;
    const OUTWARD_TYPES = ["Transfer Outward", "Public Transfer Outward", "Transfer"];
    const [txResult, dbResult] = await Promise.all([
      Transaction.findOne({ gatePassNo: gp, type: { $in: OUTWARD_TYPES } }).lean(),
      Outward.findOne({ gatePassNo: gp, type: { $in: OUTWARD_TYPES } }).lean()
    ]);
    let result = txResult || dbResult;
    if (!result) {
      // Fallback: search by gatePassNo without type restriction
      const [txFallback, dbFallback] = await Promise.all([
        Transaction.findOne({ gatePassNo: gp }).lean(),
        Outward.findOne({ gatePassNo: gp }).lean()
      ]);
      result = txFallback || dbFallback;
    }
    if (!result) {
      return res.status(404).json({ success: false, message: `Gate pass ${gp} not found` });
    }
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
