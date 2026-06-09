var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { Router } from "express";
import { Inward, Outward, InwardReturn, OutwardReturn, Transaction, Inventory, MRAllocation, MaterialRequirement } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { createNotification } from "../utils/notification.js";
import { triggerN8nWebhook, checkAndFireLowStockWebhook } from "../utils/webhook.js";
import { broadcast } from "../utils/broadcaster.js";
import { createCrudRoutes } from "../utils/crud.js";
import { logAudit } from "../utils/audit.js";
const router = Router();
async function updateStock(type, sku, itemName, qty, unit, category, session) {
  let isPositive = false;
  let isNegative = false;
  if (["Inward", "Outward Return", "Public Inward", "Public Outward Return", "Public Transfer Inward", "Transfer Inward", "GRN"].includes(type)) {
    isPositive = true;
  } else if (["Outward", "Inward Return", "Public Outward", "Public Inward Return", "Public Transfer Outward", "Transfer Outward"].includes(type)) {
    isNegative = true;
  }
  if (isPositive || isNegative) {
    const inv = session ? await Inventory.findOne({ sku }) : await Inventory.findOne({ sku });
    if (inv) {
      if (isPositive) {
        inv.totalQty = (inv.totalQty || 0) + qty;
        inv.availableQty = (inv.availableQty || 0) + qty;
      } else {
        inv.totalQty = (inv.totalQty || 0) - qty;
        inv.availableQty = (inv.availableQty || 0) - qty;
      }
      inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
      await inv.save(session ? {} : void 0);
    } else if (isPositive) {
      await Inventory.create(
        [{
          sku,
          itemName,
          category: category || "General",
          subCategory: "General",
          unit: unit || "NOS",
          openingStock: 0,
          totalQty: qty,
          availableQty: qty,
          allocatedQty: 0,
          issuedQty: 0,
          liveStock: qty,
          condition: "New"
        }],
        session ? {} : void 0
      );
    }
  }
}
__name(updateStock, "updateStock");
router.post("/inward", authenticate, async (req, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items)) throw new Error("Items array required");
    const data = { ...body, type: body.type || "Manual" };
    const inward = await Inward.create(data);
    for (const item of body.items) {
      await updateStock(
        data.type === "Transfer" ? "Transfer Inward" : "Inward",
        item.sku,
        item.itemName,
        item.qty,
        item.unit,
        body.category
      );
    }
    await Transaction.create({
      ...data,
      type: data.type === "Transfer" ? "Transfer Inward" : data.type || "Inward"
    });
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    logAudit(req.user, "CREATE", "Inward", data.id, { project: data.project, itemCount: body.items?.length });
    await createNotification({
      message: `New Inward transaction ${data.id} created by ${req.user.name}`,
      severity: "success",
      path: "inward",
      senderId: req.user._id
    });
    await triggerN8nWebhook("INWARD", { transactionId: data.id, ...data });
    await checkAndFireLowStockWebhook(body.items.map((i) => i.sku));
    res.json({ success: true, data: inward });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.put("/inward/:id", authenticate, async (req, res) => {
  try {
    const oldItem = await Inward.findOne({ id: req.params.id });
    if (!oldItem) throw new Error("Item not found");
    const newData = { ...req.body };
    delete newData._id;
    for (const item of oldItem.items) {
      await updateStock("Inward", item.sku, item.itemName, -item.qty, item.unit || "NOS", oldItem.category || "General");
    }
    for (const item of newData.items) {
      await updateStock("Inward", item.sku, item.itemName, item.qty, item.unit || "NOS", newData.category || "General");
    }
    const updated = await Inward.findOneAndUpdate({ id: req.params.id }, newData, { returnDocument: 'after' });
    await Transaction.findOneAndUpdate(
      { id: req.params.id },
      { ...newData, type: newData.type === "Transfer" ? "Transfer Inward" : newData.type || "Inward" }
    );
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("INWARD_UPDATE", {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: newData.items,
      project: newData.project
    });
    await checkAndFireLowStockWebhook(newData.items.map((i) => i.sku));
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
});
router.delete("/inward/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const item = await Inward.findOne({ id: req.params.id });
    if (item) {
      for (const it of item.items) {
        await updateStock("Inward", it.sku, it.itemName, -it.qty, it.unit || "NOS", item.category || "General", session);
      }
      await Inward.findOneAndDelete({ id: req.params.id });
      await Transaction.findOneAndDelete({ id: req.params.id });
      await createNotification({
        message: `Inward transaction ${req.params.id} was deleted by ${req.user.name}`,
        severity: "warning",
        path: "inward",
        senderId: req.user._id
      });
      await triggerN8nWebhook("INWARD_DELETE", {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i) => i.sku)
      });
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "inward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.post("/outward", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items)) throw new Error("Items array required");
    const data = {
      ...body,
      status: "Confirmed",
      type: body.type || (body.mrId ? "MR-Outward" : "Manual")
    };
    const outward = await Outward.create([data]);
    for (const item of body.items) {
      if (body.mrId) {
        let allocation = await MRAllocation.findOne({
          mrId: body.mrId,
          sku: item.sku
        });
        const mr = await MaterialRequirement.findOne({ id: body.mrId });
        if (!mr) throw new Error("Material Requirement not found");
        const mrItem = mr.items.find((i) => i.sku === item.sku);
        if (!mrItem) throw new Error(`Item ${item.sku} not found in MR ${body.mrId}`);
        const totalAfterThis = (mrItem.issuedQty || 0) + item.qty;
        if (totalAfterThis > mrItem.qty) {
          throw new Error(`Cannot issue ${item.qty} for ${item.itemName}. Total issued (${totalAfterThis}) would exceed requested quantity (${mrItem.qty}).`);
        }
        const inv = await Inventory.findOne({ sku: item.sku });
        if (!inv) throw new Error(`Inventory item not found for ${item.sku}`);
        let fromAllocation = 0;
        let fromAvailable = 0;
        if (allocation && allocation.remainingQty > 0) {
          fromAllocation = Math.min(item.qty, allocation.remainingQty);
          fromAvailable = item.qty - fromAllocation;
        } else {
          fromAvailable = item.qty;
        }
        if (fromAvailable > 0 && inv.availableQty < fromAvailable) {
          throw new Error(`Insufficient available stock for ${item.itemName}. Need ${fromAvailable} more, but only ${inv.availableQty} available.`);
        }
        if (allocation) {
          allocation.issuedQty = (allocation.issuedQty || 0) + fromAllocation;
          allocation.remainingQty = (allocation.remainingQty || 0) - fromAllocation;
          if (allocation.remainingQty === 0) allocation.status = "Closed";
          else allocation.status = "Partially Issued";
          await allocation.save({});
        }
        mrItem.issuedQty = (mrItem.issuedQty || 0) + item.qty;
        if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
        else mrItem.status = "Partial";
        const allItems = mr.items || [];
        const allClosed = allItems.length > 0 && allItems.every((i) => i.issuedQty >= i.qty);
        mr.status = allClosed ? "Closed" : "Partially Issued";
        await mr.save({});
        inv.liveStock = (inv.liveStock || 0) - item.qty;
        inv.allocatedQty = (inv.allocatedQty || 0) - fromAllocation;
        inv.issuedQty = (inv.issuedQty || 0) + item.qty;
        await inv.save({});
      } else {
        await updateStock(
          data.type === "Transfer" ? "Transfer Outward" : "Outward",
          item.sku,
          item.itemName,
          item.qty,
          item.unit,
          body.category || "General",
          session
        );
      }
    }
    await Transaction.create([{
      ...data,
      type: data.type === "Transfer" ? "Transfer Outward" : data.type || "Outward"
    }]);
    await session.commitTransaction();
    logAudit(req.user, "CREATE", "Outward", data.id, { mrId: body.mrId, project: data.project, itemCount: body.items?.length });
    broadcast({ type: "DATA_UPDATED", path: "outward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
    await createNotification({
      message: `New Outward transaction ${data.id} ${body.mrId ? `linked to MR ${body.mrId}` : ""} created by ${req.user.name}`,
      severity: "info",
      path: "outward",
      senderId: req.user._id
    });
    await triggerN8nWebhook("OUTWARD", { transactionId: data.id, ...data });
    await checkAndFireLowStockWebhook(body.items.map((i) => i.sku));
    res.json({ success: true, data: outward[0] });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.put("/outward/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const oldItem = await Outward.findOne({ id: req.params.id });
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    for (const it of oldItem.items) {
      await updateStock("Outward", it.sku, it.itemName, -it.qty, it.unit, oldItem.category || "General", session);
    }
    for (const it of data.items) {
      await updateStock("Outward", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }
    const item = await Outward.findOneAndUpdate({ id: req.params.id }, data, { returnDocument: 'after', session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, {
      ...data,
      type: data.type === "Transfer" ? "Transfer Outward" : data.type || "Outward"
    });
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "outward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("OUTWARD_UPDATE", {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project
    });
    await checkAndFireLowStockWebhook(data.items.map((i) => i.sku));
    res.json({ success: true, data: item });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.delete("/outward/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const item = await Outward.findOne({ id: req.params.id });
    if (item) {
      const effectiveMrId = item.mrId || item.mrNo;
      for (const it of item.items) {
        const inv = await Inventory.findOne({ sku: it.sku });
        if (inv) {
          let fromAllocation = 0;
          if (effectiveMrId) {
            const allocations = await MRAllocation.find({ mrId: effectiveMrId, sku: it.sku });
            let remainingToReturn = it.qty;
            for (const allocation of allocations) {
              if (remainingToReturn <= 0) break;
              const fromThisAlloc = Math.min(remainingToReturn, allocation.issuedQty || 0);
              allocation.issuedQty = Math.max(0, (allocation.issuedQty || 0) - fromThisAlloc);
              allocation.remainingQty = (allocation.remainingQty || 0) + fromThisAlloc;
              allocation.status = (allocation.issuedQty || 0) === 0 ? "Allocated" : "Partially Issued";
              await allocation.save({});
              fromAllocation += fromThisAlloc;
              remainingToReturn -= fromThisAlloc;
            }
            const mr = await MaterialRequirement.findOne({ id: effectiveMrId });
            if (mr) {
              const mrItem = mr.items.find((mi) => (mi.sku || "").toLowerCase() === (it.sku || "").toLowerCase());
              if (mrItem) {
                mrItem.issuedQty = Math.max(0, (mrItem.issuedQty || 0) - it.qty);
                mrItem.allocatedQty = (mrItem.allocatedQty || 0) + fromAllocation;
                const totalFulfilled = (mrItem.issuedQty || 0) + (mrItem.allocatedQty || 0);
                if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
                else if (totalFulfilled >= mrItem.qty) mrItem.status = "Allocated";
                else if (totalFulfilled > 0) mrItem.status = "Partial";
                else mrItem.status = "In Stock";
              }
              const allIssued = mr.items.length > 0 && mr.items.every((mi) => (mi.issuedQty || 0) >= mi.qty);
              const someIssued = mr.items.some((mi) => (mi.issuedQty || 0) > 0);
              const allAllocated = mr.items.every((mi) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) >= mi.qty);
              const someAllocated = mr.items.some((mi) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) > 0);
              if (allIssued) mr.status = "Closed";
              else if (someIssued) mr.status = "Partially Issued";
              else if (allAllocated) mr.status = "Allocated";
              else if (someAllocated) mr.status = "Store Pending";
              else mr.status = "Approved";
              await mr.save({});
            }
          }
          inv.liveStock = (inv.liveStock || 0) + it.qty;
          inv.issuedQty = Math.max(0, (inv.issuedQty || 0) - it.qty);
          inv.allocatedQty = (inv.allocatedQty || 0) + fromAllocation;
          await inv.save({});
        } else {
          await updateStock("Outward", it.sku, it.itemName, -it.qty, it.unit, item.category || "General", session);
        }
      }
      await Outward.findOneAndDelete({ id: req.params.id });
      await Transaction.findOneAndDelete({ id: req.params.id });
      await createNotification({
        message: `Outward transaction ${req.params.id} was deleted by ${req.user.name}`,
        severity: "warning",
        path: "outward",
        senderId: req.user._id
      });
      await triggerN8nWebhook("OUTWARD_DELETE", {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i) => i.sku)
      });
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "outward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
    broadcast({ type: "DATA_UPDATED", path: "mr-allocations" });
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.post("/inward-returns", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const data = req.body;
    if (!data.items || !Array.isArray(data.items)) throw new Error("Items array required");
    const item = await InwardReturn.create([data]);
    for (const it of data.items) {
      await updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }
    await Transaction.create([{ ...data, type: "Inward Return" }]);
    await session.commitTransaction();
    logAudit(req.user, "CREATE", "InwardReturn", data.id, { supplier: data.supplier, itemCount: data.items?.length });
    broadcast({ type: "DATA_UPDATED", path: "inward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await createNotification({
      message: `New Inward Return ${data.id} created by ${req.user.name}`,
      severity: "warning",
      path: "inward-returns",
      senderId: req.user._id
    });
    await triggerN8nWebhook("INWARD_RETURN", {
      transactionId: data.id,
      createdBy: req.user.name,
      items: data.items,
      project: data.project
    });
    await checkAndFireLowStockWebhook(data.items.map((i) => i.sku));
    res.json({ success: true, data: item[0] });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.put("/inward-returns/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const oldItem = await InwardReturn.findOne({ id: req.params.id });
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    for (const it of oldItem.items) {
      await updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
    }
    for (const it of data.items) {
      await updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, "General", session);
    }
    const item = await InwardReturn.findOneAndUpdate({ id: req.params.id }, data, { returnDocument: 'after', session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, { ...data, type: "Inward Return" });
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "inward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("INWARD_RETURN_UPDATE", {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project
    });
    await checkAndFireLowStockWebhook(data.items.map((i) => i.sku));
    res.json({ success: true, data: item });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.delete("/inward-returns/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const item = await InwardReturn.findOne({ id: req.params.id });
    if (item) {
      for (const it of item.items) {
        await updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
      }
      await InwardReturn.findOneAndDelete({ id: req.params.id });
      await Transaction.findOneAndDelete({ id: req.params.id });
      await createNotification({
        message: `Inward Return ${req.params.id} was deleted by ${req.user.name}`,
        severity: "warning",
        path: "inward-returns",
        senderId: req.user._id
      });
      await triggerN8nWebhook("INWARD_RETURN_DELETE", {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i) => i.sku)
      });
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "inward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.post("/outward-returns", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const data = req.body;
    if (!data.items || !Array.isArray(data.items)) throw new Error("Items array required");
    const item = await OutwardReturn.create([data]);
    for (const it of data.items) {
      await updateStock("Outward Return", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }
    await Transaction.create([{ ...data, type: "Outward Return" }]);
    await session.commitTransaction();
    logAudit(req.user, "CREATE", "OutwardReturn", data.id, { sourceSite: data.sourceSite, itemCount: data.items?.length });
    broadcast({ type: "DATA_UPDATED", path: "outward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await createNotification({
      message: `New Outward Return ${data.id} created by ${req.user.name}`,
      severity: "info",
      path: "outward-returns",
      senderId: req.user._id
    });
    await triggerN8nWebhook("OUTWARD_RETURN", {
      transactionId: data.id,
      createdBy: req.user.name,
      items: data.items,
      project: data.project
    });
    await checkAndFireLowStockWebhook(data.items.map((i) => i.sku));
    res.json({ success: true, data: item[0] });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.put("/outward-returns/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const oldItem = await OutwardReturn.findOne({ id: req.params.id });
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    const item = await OutwardReturn.findOneAndUpdate({ id: req.params.id }, data, { returnDocument: 'after', session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, { ...data, type: "Outward Return" });
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "outward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    await triggerN8nWebhook("OUTWARD_RETURN_UPDATE", {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project
    });
    res.json({ success: true, data: item });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.delete("/outward-returns/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const item = await OutwardReturn.findOne({ id: req.params.id });
    if (item) {
      for (const it of item.items) {
        await updateStock("Outward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
      }
      await OutwardReturn.findOneAndDelete({ id: req.params.id });
      await Transaction.findOneAndDelete({ id: req.params.id });
      await createNotification({
        message: `Outward Return ${req.params.id} was deleted by ${req.user.name}`,
        severity: "warning",
        path: "outward-returns",
        senderId: req.user._id
      });
      await triggerN8nWebhook("OUTWARD_RETURN_DELETE", {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i) => i.sku)
      });
    }
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "outward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    res.json({ success: true });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
const inwardCrudRouter = Router();
createCrudRoutes(inwardCrudRouter, Inward, "inward", "id", void 0, "INWARD");
router.use("/inward", inwardCrudRouter);
const outwardCrudRouter = Router();
createCrudRoutes(outwardCrudRouter, Outward, "outward", "id", void 0, "OUTWARD");
router.use("/outward", outwardCrudRouter);
const inwardReturnCrudRouter = Router();
createCrudRoutes(inwardReturnCrudRouter, InwardReturn, "inward-returns", "id", void 0, "INWARD_RETURN");
router.use("/inward-returns", inwardReturnCrudRouter);
const outwardReturnCrudRouter = Router();
createCrudRoutes(outwardReturnCrudRouter, OutwardReturn, "outward-returns", "id", void 0, "OUTWARD_RETURN");
router.use("/outward-returns", outwardReturnCrudRouter);
const mrAllocationsCrudRouter = Router();
createCrudRoutes(mrAllocationsCrudRouter, MRAllocation, "mr-allocations", "id", void 0, "MR_ALLOCATION");
router.use("/mr-allocations", mrAllocationsCrudRouter);
router.get("/transactions", authenticate, async (req, res) => {
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
      const searchRegex = new RegExp(search.replace(/[.*+?^${}()|[]\]/g, "$&"), "i");
      query.$or = [
        { id: searchRegex },
        { date: searchRegex },
        { project: searchRegex },
        { supplier: searchRegex },
        { handoverTo: searchRegex },
        { "items.itemName": searchRegex },
        { "items.sku": searchRegex }
      ];
    }
    if (filterStr) {
      const { startDate: _, endDate: __, ...restFilter } = parsedFilter;
      query = { ...query, ...restFilter };
    }
    const [items, total] = await Promise.all([
      Transaction.find(query).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Transaction.countDocuments(query).lean()
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
router.post("/transactions", authenticate, async (req, res) => {
  const session = await Transaction.startSession();
  session.startTransaction();
  try {
    const transactionData = { ...req.body };
    if (transactionData.condition && typeof transactionData.condition === "string") {
      transactionData.condition = transactionData.condition.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    }
    if (transactionData.items && Array.isArray(transactionData.items)) {
      transactionData.items = transactionData.items.map((item) => {
        if (item.condition && typeof item.condition === "string") {
          return { ...item, condition: item.condition.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) };
        }
        return item;
      });
    }
    for (const item of transactionData.items) {
      const invItem = await Inventory.findOne({ sku: item.sku });
      if (!invItem) throw new Error(`Item with SKU ${item.sku} not found in inventory`);
      let stockChange = 0;
      if (["Inward", "Public Inward", "Outward Return", "Transfer Inward"].includes(transactionData.type)) {
        stockChange = item.qty;
      } else if (["Outward", "Public Outward", "Inward Return", "Transfer Outward"].includes(transactionData.type)) {
        if (transactionData.type.includes("Outward") || transactionData.type === "Inward Return" || transactionData.type === "Transfer Outward") {
          if (invItem.liveStock < item.qty) {
            throw new Error(`Insufficient stock for ${invItem.itemName} (SKU: ${item.sku}). Available: ${invItem.liveStock}, Requested: ${item.qty}`);
          }
        }
        stockChange = -item.qty;
      }
      invItem.liveStock += stockChange;
      if (transactionData.project) invItem.lastProject = transactionData.project;
      await invItem.save({});
    }
    const transaction = await Transaction.create([transactionData]);
    await session.commitTransaction();
    logAudit(req.user, "CREATE", "Transaction", transactionData.id, { type: transactionData.type, project: transactionData.project, itemCount: transactionData.items?.length });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    const txType = (transactionData.type || "").toLowerCase();
    if (txType.includes("inward") && !txType.includes("return")) {
      await triggerN8nWebhook("INWARD", { transactionId: transactionData.id, ...transactionData });
    } else if (txType.includes("outward") && !txType.includes("return")) {
      await triggerN8nWebhook("OUTWARD", { transactionId: transactionData.id, ...transactionData });
    } else if (txType.includes("return")) {
      const evt = txType.includes("inward") ? "INWARD_RETURN" : "OUTWARD_RETURN";
      await triggerN8nWebhook(evt, { transactionId: transactionData.id, ...transactionData });
    }
    await checkAndFireLowStockWebhook(transactionData.items.map((i) => i.sku));
    res.json({ success: true, data: transaction[0] });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.delete("/transactions/:id", authenticate, async (req, res) => {
  const session = { startTransaction: /* @__PURE__ */ __name(() => {
  }, "startTransaction"), commitTransaction: /* @__PURE__ */ __name(async () => {
  }, "commitTransaction"), abortTransaction: /* @__PURE__ */ __name(async () => {
  }, "abortTransaction"), endSession: /* @__PURE__ */ __name(() => {
  }, "endSession") };
  session.startTransaction();
  try {
    const tx = await Transaction.findOne({ id: req.params.id });
    if (!tx) throw new Error("Transaction not found");
    const isOutward = ["Outward", "Transfer Outward", "Manual", "MR-Outward", "Public Outward", "Public Transfer Outward"].includes(tx.type) || tx.id.startsWith("OUT") || tx.type.toLowerCase().includes("outward");
    if (isOutward) {
      for (const it of tx.items || []) {
        if (!it.sku) continue;
        let fromAllocationTotal = 0;
        const effectiveMrId = tx.mrId || tx.mrNo;
        if (effectiveMrId) {
          const allocations = await MRAllocation.find({ mrId: effectiveMrId, sku: it.sku });
          let remainingToReturn = it.qty;
          for (const allocation of allocations) {
            if (remainingToReturn <= 0) break;
            const fromThisAlloc = Math.min(remainingToReturn, allocation.issuedQty || 0);
            allocation.issuedQty = Math.max(0, (allocation.issuedQty || 0) - fromThisAlloc);
            allocation.remainingQty = (allocation.remainingQty || 0) + fromThisAlloc;
            allocation.status = (allocation.issuedQty || 0) === 0 ? "Allocated" : "Partially Issued";
            await allocation.save({});
            fromAllocationTotal += fromThisAlloc;
            remainingToReturn -= fromThisAlloc;
          }
          const mr = await MaterialRequirement.findOne({ id: effectiveMrId });
          if (mr) {
            const mrItem = mr.items.find((mi) => (mi.sku || "").toLowerCase() === (it.sku || "").toLowerCase());
            if (mrItem) {
              mrItem.issuedQty = Math.max(0, (mrItem.issuedQty || 0) - it.qty);
              mrItem.allocatedQty = (mrItem.allocatedQty || 0) + fromAllocationTotal;
              const totalFulfilled = (mrItem.issuedQty || 0) + (mrItem.allocatedQty || 0);
              if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
              else if (totalFulfilled >= mrItem.qty) mrItem.status = "Allocated";
              else if (totalFulfilled > 0) mrItem.status = "Partial";
              else mrItem.status = "In Stock";
            }
            const allIssued = mr.items.length > 0 && mr.items.every((mi) => (mi.issuedQty || 0) >= mi.qty);
            const someIssued = mr.items.some((mi) => (mi.issuedQty || 0) > 0);
            const allAllocated = mr.items.every((mi) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) >= mi.qty);
            const someAllocated = mr.items.some((mi) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) > 0);
            if (allIssued) mr.status = "Closed";
            else if (someIssued) mr.status = "Partially Issued";
            else if (allAllocated) mr.status = "Allocated";
            else if (someAllocated) mr.status = "Store Pending";
            else mr.status = "Approved";
            await mr.save({});
          }
        }
        const inv = await Inventory.findOne({ sku: it.sku });
        if (inv) {
          inv.liveStock = (inv.liveStock || 0) + it.qty;
          inv.issuedQty = Math.max(0, (inv.issuedQty || 0) - it.qty);
          inv.allocatedQty = (inv.allocatedQty || 0) + fromAllocationTotal;
          await inv.save({});
        }
      }
    }
    await Transaction.findOneAndDelete({ id: req.params.id });
    await Outward.findOneAndDelete({ id: req.params.id });
    await session.commitTransaction();
    broadcast({ type: "DATA_UPDATED", path: "transactions" });
    broadcast({ type: "DATA_UPDATED", path: "outward" });
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
    broadcast({ type: "DATA_UPDATED", path: "mr-allocations" });
    await triggerN8nWebhook("INWARD_DELETE", {
      transactionId: req.params.id,
      type: tx.type,
      deletedBy: req.user?.name || "system"
    });
    res.json({ success: true });
  } catch (error) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});
router.get("/gate-passes/available", authenticate, async (req, res) => {
  try {
    const outwardTransfers = await Transaction.find({ type: "Transfer Outward" }).lean();
    const inwardTransfers = await Transaction.find({ type: "Transfer Inward" }).lean();
    const linkedGatePasses = new Set(inwardTransfers.map((it) => it.gatePassNo).filter(Boolean));
    const available = outwardTransfers.filter((ot) => ot.gatePassNo && !linkedGatePasses.has(ot.gatePassNo));
    res.json({ success: true, data: available });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});
router.get("/gate-passes/:gatePassNo", authenticate, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ gatePassNo: req.params.gatePassNo, type: "Transfer Outward" }).lean();
    if (!transaction) throw new Error("Gate Pass not found");
    res.json({ success: true, data: transaction });
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
});
var stdin_default = router;
export {
  stdin_default as default
};
