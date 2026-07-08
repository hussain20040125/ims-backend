var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { logger } from "../utils/logger.js";
import { Router } from "express";
import { GRN, Inward, Transaction, Inventory, PurchaseOrder } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { getRolesWithPermission, createNotification } from "../utils/notification.js";
import { triggerN8nWebhook, checkAndFireLowStockWebhook } from "../utils/webhook.js";
import { broadcast } from "../utils/broadcaster.js";
import { logAudit } from "../utils/audit.js";
const router = Router();
router.get("/", authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 100, 500);
    const skip = (page - 1) * limit;
    const search = req.query.search;
    const filterStr = req.query.filter;
    let query = {};
    let parsedFilter = {};
    if (typeof filterStr === "string") {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {
      }
    } else if (filterStr && typeof filterStr === "object") {
      parsedFilter = filterStr;
    }
    const startDate = req.query.startDate || parsedFilter?.startDate;
    const endDate = req.query.endDate || parsedFilter?.endDate;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = typeof endDate === "string" && endDate.length === 10 ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }
    if (search) {
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      query.$or = [
        { id: searchRegex },
        { poId: searchRegex },
        { supplier: searchRegex },
        { vendor: searchRegex },
        { project: searchRegex },
        { "items.itemName": searchRegex },
        { "items.sku": searchRegex }
      ];
    }
    if (filterStr) {
      const { startDate: _, endDate: __, ...restFilter } = parsedFilter;
      query = { ...query, ...restFilter };
    }
    const [items, total] = await Promise.all([
      GRN.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      GRN.countDocuments(query).lean()
    ]);
    res.json({
      success: true,
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error) {
    logger.error("Error fetching grn:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});
router.post("/", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const grnData = {
      ...rawGrnData,
      items: (rawGrnData.items || []).map((item) => ({
        ...item,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      }))
    };
    if (!grnData.id) {
      const year = new Date().getFullYear();
      const allGRNs = await GRN.find({}, { id: 1 }).lean();
      const maxNum = allGRNs.reduce((max, g) => {
        const parts = (g.id || "").split("-");
        const num = parseInt(parts[parts.length - 1] || "0");
        return isNaN(num) ? max : Math.max(max, num);
      }, 0);
      grnData.id = `GRN-${year}-${String(maxNum + 1).padStart(3, "0")}`;
    }
    const grn = await GRN.create([grnData]);
    const inwardRecord = {
      id: `INW-${grnData.id}`,
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      type: "GRN",
      grnRef: grnData.id,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: grnData.items.map((item) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || "Unit",
        condition: item.condition
      }))
    };
    for (const item of grnData.items) {
      const qty = item.received || 0;
      const invItem = await Inventory.findOne({ sku: item.sku });
      if (invItem) {
        invItem.totalQty = (invItem.totalQty || 0) + qty;
        invItem.availableQty = (invItem.availableQty || 0) + qty;
        invItem.liveStock = (invItem.liveStock || 0) + qty;
        invItem.lastProject = grnData.project;
        if (grnData.store) {
          // Read current site stock from locationStock or sites[] fallback
          let curr = 0;
          if (invItem.locationStock?.has(grnData.store)) {
            curr = Number(invItem.locationStock.get(grnData.store));
          } else {
            const se = (invItem.sites || []).find(s => s.siteName === grnData.store);
            if (se) curr = Number(se.liveStock || 0);
          }
          const newQty = curr + qty;
          invItem.locationStock.set(grnData.store, newQty);
          invItem.markModified("locationStock");
          const siteEntry = (invItem.sites || []).find(s => s.siteName === grnData.store);
          if (siteEntry) { siteEntry.liveStock = newQty; } else { invItem.sites.push({ siteName: grnData.store, siteCode: "", openingStock: 0, liveStock: newQty }); }
          invItem.markModified("sites");
        }
        await invItem.save({});
      } else {
        await Inventory.create([{
          sku: item.sku,
          itemName: item.itemName,
          category: "General",
          subCategory: "General",
          unit: item.unit || "NOS",
          openingStock: 0,
          totalQty: qty,
          availableQty: qty,
          allocatedQty: 0,
          issuedQty: 0,
          liveStock: qty,
          condition: "New",
          lastProject: grnData.project,
          locationStock: grnData.store ? { [grnData.store]: qty } : {},
          sites: grnData.store ? [{ siteName: grnData.store, siteCode: "", openingStock: qty, liveStock: qty }] : [],
        }]);
      }
    }
    await Inward.create([inwardRecord]);
    const firstItem = grnData.items[0];
    const transactionData = {
      id: `TRX-${grnData.id}`,
      type: "Inward",
      date: grnData.date,
      project: grnData.project,
      destinationProject: grnData.destinationProject,
      gatePassNo: grnData.gatePassNo,
      personName: grnData.personName,
      personPhotoUrl: grnData.personPhotoUrl,
      personPhotos: grnData.personPhotos,
      vendor: grnData.supplier || grnData.vendor,
      supplier: grnData.supplier || grnData.vendor,
      remarks: `From GRN: ${grnData.id}`,
      sku: firstItem?.sku || "",
      itemName: firstItem?.itemName || "",
      qty: grnData.items.reduce((sum, i) => sum + (i.received || 0), 0),
      unit: firstItem?.unit || "Unit",
      items: grnData.items.map((item) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || "Unit",
        images: item.images || [],
        materialPhotoUrl: item.images?.[0] || ""
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      linkId: grnData.id,
      createdBy: req.user.name
    };
    await Transaction.create([transactionData]);
    if (grnData.poId) {
      const po = await PurchaseOrder.findOne({ id: grnData.poId });
      if (po) {
        const allGrns = await GRN.find({ poId: grnData.poId });
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = allGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }
        const newStatus = allFulfilled ? "GRN Fulfilled" : anyVariance ? "GRN Variance" : "GRN Pending";
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({});
        }
        if (allFulfilled) {
          const accountRoles = await getRolesWithPermission("REVIEW_PO_BILL");
          await createNotification({
            message: `PO ${po.id} is now GRN Fulfilled. Ready for account verification and payment.`,
            severity: "info",
            path: "pos",
            senderId: req.user._id,
            targetRoles: accountRoles.length ? accountRoles : ["Accountant", "Finance Manager", "Super Admin"]
          });
        }
        await createNotification({
          message: `GRN ${grn[0].id} created. PO ${grnData.poId} status: ${newStatus}`,
          severity: allFulfilled ? "success" : "warning",
          path: "grn",
          senderId: req.user._id
        });
        await triggerN8nWebhook("PO_APPROVAL", {
          poId: grnData.poId,
          newStatus,
          grnId: grn[0].id,
          changedBy: req.user.name
        });
      }
    } else {
      await createNotification({
        message: `New GRN ${grn[0].id} created`,
        severity: "success",
        path: "grn",
        senderId: req.user._id
      });
    }
    await session.commitTransaction();
    logAudit(req.user, "CREATE", "GRN", grn[0].id, { poId: grnData.poId, supplier: grnData.supplier, project: grnData.project });
    broadcast({ type: "DATA_UPDATED", path: "grn" });
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "pos" });
    await triggerN8nWebhook("GRN", {
      grnId: grn[0].id,
      poId: grnData.poId,
      vendor: grnData.supplier || grnData.vendor,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      items: grnData.items,
      createdBy: req.user.name
    });
    await checkAndFireLowStockWebhook(grnData.items.map((i) => i.sku));
    res.json({ success: true, data: grn[0] });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.put("/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const oldGRN = await GRN.findOne({ id: req.params.id });
    if (!oldGRN) throw new Error("GRN not found");
    const { _id, __v, createdAt, updatedAt, id: bodyId, ...grnData } = rawGrnData;
    const sanitizedItems = (rawGrnData.items || []).map((item) => {
      const { _id: itemId, ...itemWithoutId } = item;
      return {
        ...itemWithoutId,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      };
    });
    grnData.items = sanitizedItems;
    for (const item of oldGRN.items) {
      const inv = await Inventory.findOne({ sku: item.sku });
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({});
      }
    }
    for (const item of sanitizedItems) {
      const inv = await Inventory.findOne({ sku: item.sku });
      if (inv) {
        inv.liveStock = (inv.liveStock || 0) + (item.received || 0);
        inv.lastProject = grnData.project || oldGRN.project;
        await inv.save({});
      }
    }
    const grn = await GRN.findOneAndUpdate({ id: req.params.id }, grnData, { returnDocument: 'after' });
    await Inward.findOneAndUpdate({ grnRef: req.params.id }, {
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: sanitizedItems.map((item) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit,
        condition: item.condition
      }))
    });
    await Transaction.findOneAndUpdate({ linkId: req.params.id }, {
      date: grnData.date,
      project: grnData.project,
      supplier: grnData.supplier || grnData.vendor,
      items: sanitizedItems.map((item) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl
    });
    const poId = grnData.poId || oldGRN.poId;
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId });
      if (po) {
        const allGrns = await GRN.find({ poId });
        const updatedGrnsList = allGrns.map((g) => g.id === req.params.id ? grn : g);
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = updatedGrnsList.reduce((sum, g) => {
            const grnItem = g?.items?.find((i) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }
        const newStatus = allFulfilled ? "GRN Fulfilled" : anyVariance ? "GRN Variance" : "GRN Pending";
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({});
          broadcast({ type: "DATA_UPDATED", path: "pos" });
        }
      }
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "grn" });
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("GRN_UPDATE", {
      grnId: req.params.id,
      poId: grnData.poId || oldGRN.poId,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      items: sanitizedItems,
      updatedBy: req.user.name
    });
    await checkAndFireLowStockWebhook(sanitizedItems.map((i) => i.sku));
    res.json({ success: true, data: grn });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.post("/:id/receipt", authenticate, async (req, res) => {
  try {
    const grn = await GRN.findOne({ id: req.params.id });
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });
    const receipt = {
      date: new Date().toISOString(),
      challan: req.body.challan,
      mrNo: req.body.mrNo,
      docType: req.body.docType,
      personName: req.body.personName,
      challanPhotos: req.body.challanPhotos || [],
      personPhotos: req.body.personPhotos || [],
      items: (req.body.items || []).map((i) => ({
        sku: i.sku,
        itemName: i.itemName,
        received: i.received || 0,
        images: i.images || []
      }))
    };
    grn.receipts = grn.receipts || [];
    grn.receipts.push(receipt);
    // Recalculate cumulative received per SKU from all receipts
    const receivedBySKU = {};
    grn.receipts.forEach((r) => {
      (r.items || []).forEach((item) => {
        receivedBySKU[item.sku] = (receivedBySKU[item.sku] || 0) + (item.received || 0);
      });
    });
    grn.items = grn.items.map((item) => {
      const obj = item.toObject ? item.toObject() : { ...item };
      const totalReceived = receivedBySKU[item.sku] || obj.received || 0;
      return { ...obj, received: totalReceived, variance: totalReceived - (obj.ordered || 0) };
    });
    const hasShortage = grn.items.some((i) => i.received < i.ordered);
    const hasExcess = grn.items.some((i) => i.received > i.ordered);
    grn.status = hasShortage ? "Partial" : hasExcess ? "Over-Received" : "Confirmed";
    // Update inventory for newly received items (site-aware)
    const store = grn.store;
    for (const item of receipt.items) {
      const qty = item.received || 0;
      const inv = await Inventory.findOne({ sku: item.sku });
      if (inv) {
        inv.totalQty = (inv.totalQty || 0) + qty;
        inv.availableQty = (inv.availableQty || 0) + qty;
        inv.liveStock = (inv.liveStock || 0) + qty;
        if (store) {
          let curr = 0;
          if (inv.locationStock?.has(store)) { curr = Number(inv.locationStock.get(store)); }
          else { const se = (inv.sites || []).find(s => s.siteName === store); if (se) curr = Number(se.liveStock || 0); }
          const newQty = curr + qty;
          inv.locationStock.set(store, newQty);
          inv.markModified("locationStock");
          const se = (inv.sites || []).find(s => s.siteName === store);
          if (se) { se.liveStock = newQty; } else { inv.sites.push({ siteName: store, siteCode: "", openingStock: 0, liveStock: newQty }); }
          inv.markModified("sites");
        }
        await inv.save();
      }
    }
    await grn.save();
    // Update PO status
    if (grn.poId) {
      const po = await PurchaseOrder.findOne({ id: grn.poId });
      if (po) {
        const newPoStatus = grn.status === "Confirmed" || grn.status === "Over-Received"
          ? "GRN Fulfilled" : "GRN Variance";
        if (po.status !== newPoStatus) {
          po.status = newPoStatus;
          await po.save();
          broadcast({ type: "DATA_UPDATED", path: "pos" });
        }
      }
    }
    logAudit(req.user, "ADD_RECEIPT", "GRN", grn.id, { challan: receipt.challan, items: receipt.items.length });
    broadcast({ type: "DATA_UPDATED", path: "grn" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    res.json({ success: true, data: grn });
  } catch (error) {
    logger.error("Error adding GRN receipt:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});
router.put("/:id/receipt/:idx", authenticate, async (req, res) => {
  try {
    const idx = parseInt(req.params.idx);
    const grn = await GRN.findOne({ id: req.params.id });
    if (!grn) return res.status(404).json({ success: false, message: "GRN not found" });
    if (!grn.receipts || idx < 0 || idx >= grn.receipts.length)
      return res.status(404).json({ success: false, message: "Receipt not found" });

    const oldReceipt = grn.receipts[idx];
    const oldReceiptObj = oldReceipt.toObject ? oldReceipt.toObject() : { ...oldReceipt };

    // Build delta map: newQty - oldQty per SKU (for inventory adjustment)
    const newItems = req.body.items && Array.isArray(req.body.items) ? req.body.items : null;
    const deltaMap = {}; // sku -> delta
    if (newItems) {
      (oldReceiptObj.items || []).forEach(i => { deltaMap[i.sku] = -(i.received || 0); });
      newItems.forEach(i => { deltaMap[i.sku] = (deltaMap[i.sku] || 0) + (i.received || 0); });
    }

    // Update the receipt
    grn.receipts[idx] = {
      ...oldReceiptObj,
      challan: req.body.challan ?? oldReceiptObj.challan,
      personName: req.body.personName ?? oldReceiptObj.personName,
      items: newItems
        ? newItems.map(ni => {
            const old = (oldReceiptObj.items || []).find(oi => oi.sku === ni.sku) || {};
            return { ...old, received: ni.received ?? old.received ?? 0 };
          })
        : oldReceiptObj.items,
    };
    grn.markModified("receipts");

    if (newItems) {
      // Recalculate top-level items: initial received + sum of all receipt items per SKU
      const receiptSumBySKU = {};
      grn.receipts.forEach(r => {
        (r.items || []).forEach(ri => {
          receiptSumBySKU[ri.sku] = (receiptSumBySKU[ri.sku] || 0) + (ri.received || 0);
        });
      });
      grn.items = grn.items.map(item => {
        const obj = item.toObject ? item.toObject() : { ...item };
        const totalReceived = receiptSumBySKU[obj.sku] !== undefined ? receiptSumBySKU[obj.sku] : (obj.received || 0);
        return { ...obj, received: totalReceived, variance: totalReceived - (obj.ordered || 0) };
      });
      grn.markModified("items");

      // Recalculate GRN status
      const hasShortage = grn.items.some(i => i.received < i.ordered);
      const hasExcess = grn.items.some(i => i.received > i.ordered);
      grn.status = hasShortage ? "Partial" : hasExcess ? "Over-Received" : "Confirmed";

      // Adjust inventory by delta
      for (const [sku, delta] of Object.entries(deltaMap)) {
        if (delta === 0) continue;
        const inv = await Inventory.findOne({ sku });
        if (inv) {
          inv.liveStock = Math.max(0, (inv.liveStock || 0) + delta);
          await inv.save();
        }
      }

      // Update PO status
      if (grn.poId) {
        const po = await PurchaseOrder.findOne({ id: grn.poId });
        if (po) {
          const newPoStatus = grn.status === "Confirmed" || grn.status === "Over-Received"
            ? "GRN Fulfilled" : "GRN Variance";
          if (po.status !== newPoStatus) {
            po.status = newPoStatus;
            await po.save();
            broadcast({ type: "DATA_UPDATED", path: "pos" });
          }
        }
      }

      broadcast({ type: "DATA_UPDATED", path: "inventory" });
    }

    await grn.save();
    logAudit(req.user, "EDIT_RECEIPT", "GRN", grn.id, { receiptIdx: idx, challan: grn.receipts[idx].challan, itemsEdited: !!newItems });
    broadcast({ type: "DATA_UPDATED", path: "grn" });
    res.json({ success: true, data: grn });
  } catch (error) {
    logger.error("Error editing GRN receipt:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});
router.delete("/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const grn = await GRN.findOne({ id: req.params.id });
    if (!grn) throw new Error("GRN not found");
    const poId = grn.poId;
    for (const item of grn.items) {
      const inv = await Inventory.findOne({ sku: item.sku });
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({});
      }
    }
    await GRN.findOneAndDelete({ id: req.params.id });
    await Inward.deleteMany({ grnRef: req.params.id });
    await Transaction.deleteMany({ linkId: req.params.id });
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId });
      if (po) {
        const remainingGrns = await GRN.find({ poId });
        let allFulfilled = true;
        let anyVariance = false;
        let hasAnyReceipt = remainingGrns.length > 0;
        for (const poItem of po.items) {
          const totalReceived = remainingGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < (poItem.qty || 0)) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > (poItem.qty || 0)) {
            anyVariance = true;
          }
        }
        let newStatus = allFulfilled && hasAnyReceipt ? "GRN Fulfilled" : anyVariance ? "GRN Variance" : "GRN Pending";
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({});
          broadcast({ type: "DATA_UPDATED", path: "pos" });
        }
      }
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "grn" });
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("GRN_DELETE", {
      grnId: req.params.id,
      poId,
      deletedBy: req.user.name,
      itemSkus: grn.items.map((i) => i.sku)
    });
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
