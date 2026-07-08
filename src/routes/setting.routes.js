import { Router } from "express";
import { Settings, Inventory, PurchaseOrder, WriteOff, Transaction } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { broadcast } from "../utils/broadcaster.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
const router = Router();
let statsCache = null;
const STATS_CACHE_TTL = 3e4;
router.get("/stats", authenticate, async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && now - statsCache.timestamp < STATS_CACHE_TTL) {
      return res.json({ success: true, data: statsCache.data, cached: true });
    }
    const [
      totalSKUs,
      totalStock,
      availableStock,
      allocatedStock,
      issuedStock,
      reusable,
      pendingPOs,
      lowStockCount,
      pendingWriteOffs,
      outOfStock,
      categoriesCount,
      stockByCategory,
      todayInward,
      todayOutward
    ] = await Promise.all([
      Inventory.countDocuments().lean(),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$totalQty", { $add: ["$liveStock", "$issuedQty"] }] } } } }]).then((res2) => res2[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$availableQty", { $subtract: ["$liveStock", "$allocatedQty"] }] } } } }]).then((res2) => res2[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$allocatedQty", 0] } } } }]).then((res2) => res2[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$issuedQty", 0] } } } }]).then((res2) => res2[0]?.total || 0),
      Inventory.countDocuments({ condition: { $in: ["Good", "Needs Repair", "GOOD", "NEEDS REPAIR"] } }).lean(),
      PurchaseOrder.aggregate([
        { $match: { status: { $in: ["Pending", "Pending L1", "Pending L2", "Pending L3"] } } },
        { $group: { _id: null, total: { $sum: "$totalValue" } } }
      ]).then((res2) => res2[0]?.total || 0),
      Inventory.aggregate([
        { $lookup: { from: "catalogues", localField: "sku", foreignField: "sku", as: "catalogue" } },
        { $unwind: { path: "$catalogue", preserveNullAndEmptyArrays: false } },
        {
          $addFields: {
            currentAvail: { $ifNull: ["$availableQty", { $subtract: ["$liveStock", { $ifNull: ["$allocatedQty", 0] }] }] }
          }
        },
        { $match: { $and: [
          { $expr: { $lte: ["$currentAvail", "$catalogue.minStock"] } },
          { $expr: { $gt: ["$currentAvail", 0] } }
        ] } },
        { $count: "count" }
      ]).then((res2) => res2[0]?.count || 0),
      WriteOff.countDocuments({ status: "Pending" }).lean(),
      Inventory.countDocuments({
        $or: [
          { availableQty: 0 },
          { $and: [{ availableQty: { $exists: false } }, { liveStock: 0 }] }
        ]
      }).lean(),
      Inventory.distinct("category").then((cats) => cats.length),
      Inventory.aggregate([
        { $group: {
          _id: "$category",
          count: { $sum: 1 },
          totalStock: { $sum: { $ifNull: ["$totalQty", "$liveStock"] } },
          availableStock: { $sum: { $ifNull: ["$availableQty", "$liveStock"] } },
          allocatedStock: { $sum: { $ifNull: ["$allocatedQty", 0] } },
          outOfStock: {
            $sum: { $cond: [{ $lte: [{ $ifNull: ["$availableQty", "$liveStock"] }, 0] }, 1, 0] }
          }
        } },
        { $sort: { count: -1 } },
        { $limit: 8 }
      ]),
      Transaction.aggregate([
        {
          $match: {
            date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
            type: { $in: ["Inward", "Inward Return", "Public Inward", "Public Inward Return", "Transfer Inward", "Public Transfer Inward", "GRN"] }
          }
        },
        { $unwind: "$items" },
        { $group: { _id: null, total: { $sum: "$items.qty" } } }
      ]).then((res2) => res2[0]?.total || 0),
      Transaction.aggregate([
        {
          $match: {
            date: (/* @__PURE__ */ new Date()).toISOString().split("T")[0],
            type: { $in: ["Outward", "Outward Return", "Public Outward", "Public Outward Return", "Transfer Outward", "Public Transfer Outward"] }
          }
        },
        { $unwind: "$items" },
        { $group: { _id: null, total: { $sum: "$items.qty" } } }
      ]).then((res2) => res2[0]?.total || 0)
    ]);
    const statsData = {
      totalSKUs,
      totalStock,
      availableStock,
      allocatedStock,
      issuedStock,
      reusable,
      pendingPOs,
      lowStockCount,
      pendingWriteOffs,
      outOfStock,
      categoriesCount,
      stockByCategory,
      todayInward,
      todayOutward
    };
    statsCache = { data: statsData, timestamp: now };
    res.json({
      success: true,
      data: statsData
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
const DEFAULT_GST_RATES = ["0%", "5%", "12%", "18%", "28%"];

async function getOrInitSettings() {
  let settings = await Settings.findOne();
  if (!settings) return Settings.create({});
  let dirty = false;
  if (!settings.gstRates?.length) { settings.gstRates = DEFAULT_GST_RATES; dirty = true; }

  // One-time migration: if sites is empty, populate it (stores first, then inventory)
  if (!settings.sites || settings.sites.length === 0) {
    if (settings.stores?.length > 0) {
      settings.sites = settings.stores.map(storeName => ({ siteName: storeName, siteCode: "" }));
      settings.markModified("sites");
      dirty = true;
    } else {
      // Discover from inventory (only runs once — after this, user manages sites manually)
      const allInv = await Inventory.find({}, { locationStock: 1, "sites.siteName": 1 }).lean();
      const discovered = new Set();
      for (const item of allInv) {
        (item.sites || []).forEach(s => s.siteName && discovered.add(s.siteName));
        const locStock = item.locationStock;
        if (locStock) {
          const keys = locStock instanceof Map ? [...locStock.keys()] : Object.keys(locStock);
          keys.forEach(k => k && discovered.add(k));
        }
      }
      if (discovered.size > 0) {
        settings.sites = [...discovered].sort().map(n => ({ siteName: n, siteCode: "" }));
        settings.markModified("sites");
        dirty = true;
      }
    }
  }

  if (dirty) await settings.save();
  return settings;
}

router.get("/public-settings", async (req, res) => {
  try {
    const settings = await getOrInitSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get("/settings", authenticate, async (req, res) => {
  try {
    const settings = await getOrInitSettings();
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.put("/settings", authenticate, async (req, res) => {
  try {
    const settings = await Settings.findOneAndUpdate({}, req.body, { returnDocument: 'after', upsert: true });
    statsCache = null;
    broadcast({ type: "DATA_UPDATED", path: "settings" });
    await triggerN8nWebhook("SETTINGS", {
      updatedBy: req.user?.name || "system",
      changedFields: Object.keys(req.body)
    });
    res.json({ success: true, data: settings });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
