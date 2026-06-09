var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import { WriteOff, Inventory } from "../models/index.js";
import { getNextSequence } from "../utils/sequence.js";
import { triggerN8nWebhook } from "../utils/webhook.js";
class WriteOffService {
  static {
    __name(this, "WriteOffService");
  }
  static async query(params) {
    const page = parseInt(params.page) || 1;
    const limit = parseInt(params.limit) || 100;
    const skip = (page - 1) * limit;
    const search = params.search || "";
    let query = {};
    if (search) {
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const searchRegex = new RegExp(escaped, "i");
      query.$or = [
        { id: searchRegex },
        { sku: searchRegex },
        { itemName: searchRegex },
        { reason: searchRegex }
      ];
    }
    const [items, total] = await Promise.all([
      WriteOff.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      WriteOff.countDocuments(query).lean()
    ]);
    return {
      items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    };
  }
  static async getById(id) {
    const item = await WriteOff.findOne({ id });
    if (!item) throw new Error("WriteOff not found");
    return item;
  }
  static async create(data, createdBy) {
    const year = (/* @__PURE__ */ new Date()).getFullYear();
    const seq = await getNextSequence("WRITEOFF");
    const customId = `WR-${year}-${seq}`;
    if (data.sku) {
      const inv = await Inventory.findOne({ sku: data.sku });
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (Number(data.qty) || 0));
        inv.availableQty = Math.max(0, (inv.availableQty || 0) - (Number(data.qty) || 0));
        inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);
        await inv.save();
      }
    }
    const writeoff = await WriteOff.create({
      ...data,
      id: customId,
      requestedBy: data.requestedBy || createdBy,
      date: data.date || (/* @__PURE__ */ new Date()).toISOString().split("T")[0]
    });
    triggerN8nWebhook("WRITEOFF_CREATE", {
      writeoffId: writeoff.id,
      sku: writeoff.sku,
      itemName: writeoff.itemName,
      qty: writeoff.qty,
      reason: writeoff.reason,
      createdBy
    }).catch((err) => console.error("[WriteOffService] Webhook failed:", err));
    return writeoff;
  }
  static async delete(id, deletedBy) {
    const writeoff = await WriteOff.findOne({ id });
    if (!writeoff) throw new Error("WriteOff not found");
    if (writeoff.sku && writeoff.qty) {
      const inv = await Inventory.findOne({ sku: writeoff.sku });
      if (inv) {
        inv.liveStock = (inv.liveStock || 0) + writeoff.qty;
        inv.availableQty = (inv.availableQty || 0) + writeoff.qty;
        inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);
        await inv.save();
      }
    }
    await WriteOff.findOneAndDelete({ id });
    triggerN8nWebhook("WRITEOFF_DELETE", {
      writeoffId: id,
      deletedBy
    }).catch((err) => console.error("[WriteOffService] Webhook failed:", err));
    return true;
  }
}
export {
  WriteOffService
};
