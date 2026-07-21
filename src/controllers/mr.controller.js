var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
import mongoose from "mongoose";
import { MRService } from "../services/mr.service.js";
import { serverHasPermission } from "../middleware/auth.middleware.js";
import { createNotification, getRolesWithPermission } from "../utils/notification.js";
import { broadcast } from "../utils/broadcaster.js";
class MRController {
  static {
    __name(this, "MRController");
  }
  static async query(req, res) {
    try {
      const { items, pagination } = await MRService.query(req.query);
      res.json({ success: true, data: items, pagination });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
  static async getById(req, res) {
    try {
      const mr = await MRService.getById(req.params.id);
      res.json({ success: true, data: mr });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
  static async create(req, res) {
    if (!await serverHasPermission(req.user, "CREATE_MATERIAL_REQUIREMENT")) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    try {
      const mr = await MRService.create(req.body, req.user.name);
      broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      const roles = await getRolesWithPermission("APPROVE_MR_STORE");
      await createNotification({
        message: `New MR ${mr.id} from ${mr.requesterName} submitted for Store Approval`,
        severity: "warning",
        path: "material-requirements",
        targetRoles: roles
      });
      res.json({ success: true, data: mr });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
  static async update(req, res) {
    try {
      const mr = await MRService.getById(req.params.id);
      const isStoreApproval = req.body.status === "Quotation Phase" && mr.status !== "Quotation Phase";
      const isAGMApproval = req.body.status === "Approved by AGM" && mr.status !== "Approved by AGM";
      if (isStoreApproval && !await serverHasPermission(req.user, "APPROVE_MATERIAL_REQUIREMENT")) {
        return res.status(403).json({ success: false, message: "Forbidden: Store approval permission required" });
      }
      if (isAGMApproval && !await serverHasPermission(req.user, "APPROVE_MATERIAL_REQUIREMENT")) {
        return res.status(403).json({ success: false, message: "Forbidden: AGM approval permission required" });
      }
      if (!isStoreApproval && !isAGMApproval && !await serverHasPermission(req.user, "EDIT_MATERIAL_REQUIREMENT")) {
        return res.status(403).json({ success: false, message: "Forbidden: Edit MR permission required" });
      }
      const updated = await MRService.update(req.params.id, req.body, req.user.name);
      broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      res.json({ success: true, data: updated });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
  static async delete(req, res) {
    if (!await serverHasPermission(req.user, "DELETE_MATERIAL_REQUIREMENT")) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    try {
      await MRService.delete(req.params.id, req.user.name);
      broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      res.json({ success: true });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
  // Stock allocation
  static async allocate(req, res) {
    if (!await serverHasPermission(req.user, "EDIT_INVENTORY")) {
      return res.status(403).json({ success: false, message: "Forbidden" });
    }
    try {
      const { mrId, items } = req.body;
      if (!mrId || !items) throw new Error("mrId and items array are required");
      await MRService.allocate(mrId, items, req.user.name);
      broadcast({ type: "DATA_UPDATED", path: "inventory" });
      broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      broadcast({ type: "DATA_UPDATED", path: "mr-allocations" });
      res.json({ success: true, message: "Material allocated successfully" });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
  // Allocation listing
  static async queryAllocations(req, res) {
    try {
      const { items, pagination } = await MRService.queryAllocations(req.query);
      res.json({ success: true, data: items, pagination });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
  static async getAllocationById(req, res) {
    try {
      const allocation = await MRService.getAllocationById(req.params.id);
      res.json({ success: true, data: allocation });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
  // Public/portal access
  static async queryPublic(req, res) {
    try {
      const unused = req.query.unused !== "false";
      let query = { status: { $in: ["Quotation Phase", "Approved by AGM", "Approved by Director", "Partially Issued"] } };
      if (unused) {
        const linkedMrIds = await mongoose.model("PurchaseOrder").find({ mrId: { $nin: [null, ""] } }).distinct("mrId");
        query.id = { $nin: linkedMrIds };
      }
      const { items } = await MRService.query({ ...req.query, filter: query });
      res.json({ success: true, data: items });
    } catch (error) {
      res.status(500).json({ success: false, message: error.message });
    }
  }
  static async getByIdPublic(req, res) {
    try {
      const mr = await MRService.getById(req.params.id);
      res.json({ success: true, data: mr });
    } catch (error) {
      res.status(404).json({ success: false, message: error.message });
    }
  }
  static async createPublic(req, res) {
    try {
      const mr = await MRService.create(req.body, "Public User");
      broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
      const roles = await getRolesWithPermission("APPROVE_MR_STORE");
      await createNotification({
        message: `New Public MR ${mr.id} from ${mr.requesterName} submitted for Store Approval`,
        severity: "warning",
        path: "material-requirements",
        targetRoles: roles
      });
      res.json({ success: true, data: mr });
    } catch (error) {
      res.status(400).json({ success: false, message: error.message });
    }
  }
}
export {
  MRController
};
