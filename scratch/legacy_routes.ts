import express from 'express';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { 
  User, Inventory, Transaction, Catalogue, Supplier, 
  PurchaseOrder, MaterialPlan, GRN, Inward, Outward, 
  InwardReturn, OutwardReturn, WriteOff, StockCheckReport, 
  Notification, RolePermission, Settings, MaterialRequirement, MRAllocation, Quotation, AuditLog, Counter 
} from './models';
const Vendor = Supplier;
import { broadcast } from './broadcaster';
import { upload } from './cloudinary';

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'neoteric-secret-key';

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// N8N WEBHOOK HELPER
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// .env variables ΓÇö existing:
//   N8N_WEBHOOK_SECRET            ΓÇô shared secret (X-Webhook-Secret header)
//   N8N_WEBHOOK_NEW_PO            ΓÇô new PO created
//   N8N_WEBHOOK_GRN               ΓÇô new GRN created
//   N8N_WEBHOOK_LOW_STOCK         ΓÇô item stock dropped below minStock
//   N8N_WEBHOOK_SUPPLIER          ΓÇô new supplier registration / create
//   N8N_WEBHOOK_MATERIAL_REQ      ΓÇô new material requirement
//   N8N_WEBHOOK_INWARD            ΓÇô new inward transaction
//   N8N_WEBHOOK_OUTWARD           ΓÇô new outward transaction
//   N8N_WEBHOOK_STOCK_CHECK       ΓÇô new stock check report submitted
//   N8N_WEBHOOK_PO_APPROVAL       ΓÇô PO status changed
//   N8N_WEBHOOK_GENERIC           ΓÇô fallback for all events
//
// .env variables ΓÇö newly added:
//   N8N_WEBHOOK_LOGIN             ΓÇô user login
//   N8N_WEBHOOK_INVENTORY_CREATE  ΓÇô inventory item created
//   N8N_WEBHOOK_INVENTORY_UPDATE  ΓÇô inventory item updated
//   N8N_WEBHOOK_INVENTORY_DELETE  ΓÇô inventory item deleted
//   N8N_WEBHOOK_CATALOGUE_CREATE  ΓÇô catalogue item created
//   N8N_WEBHOOK_CATALOGUE_UPDATE  ΓÇô catalogue item updated
//   N8N_WEBHOOK_CATALOGUE_DELETE  ΓÇô catalogue item deleted
//   N8N_WEBHOOK_SUPPLIER_UPDATE   ΓÇô supplier updated
//   N8N_WEBHOOK_SUPPLIER_DELETE   ΓÇô supplier deleted
//   N8N_WEBHOOK_PO_UPDATE         ΓÇô PO updated (any field change)
//   N8N_WEBHOOK_PO_DELETE         ΓÇô PO deleted
//   N8N_WEBHOOK_PLANNING_CREATE   ΓÇô material plan created
//   N8N_WEBHOOK_PLANNING_UPDATE   ΓÇô material plan updated
//   N8N_WEBHOOK_PLANNING_DELETE   ΓÇô material plan deleted
//   N8N_WEBHOOK_MR_UPDATE         ΓÇô material requirement updated
//   N8N_WEBHOOK_MR_DELETE         ΓÇô material requirement deleted
//   N8N_WEBHOOK_QUOTATION_CREATE  ΓÇô quotation created (auth)
//   N8N_WEBHOOK_QUOTATION_UPDATE  ΓÇô quotation updated
//   N8N_WEBHOOK_QUOTATION_DELETE  ΓÇô quotation deleted
//   N8N_WEBHOOK_WRITEOFF_CREATE   ΓÇô write-off created
//   N8N_WEBHOOK_WRITEOFF_UPDATE   ΓÇô write-off updated
//   N8N_WEBHOOK_WRITEOFF_DELETE   ΓÇô write-off deleted
//   N8N_WEBHOOK_INWARD_UPDATE     ΓÇô inward updated
//   N8N_WEBHOOK_INWARD_DELETE     ΓÇô inward deleted
//   N8N_WEBHOOK_OUTWARD_UPDATE    ΓÇô outward updated
//   N8N_WEBHOOK_OUTWARD_DELETE    ΓÇô outward deleted
//   N8N_WEBHOOK_INWARD_RETURN     ΓÇô inward return created
//   N8N_WEBHOOK_INWARD_RETURN_UPDATE  ΓÇô inward return updated
//   N8N_WEBHOOK_INWARD_RETURN_DELETE  ΓÇô inward return deleted
//   N8N_WEBHOOK_OUTWARD_RETURN        ΓÇô outward return created
//   N8N_WEBHOOK_OUTWARD_RETURN_UPDATE ΓÇô outward return updated
//   N8N_WEBHOOK_OUTWARD_RETURN_DELETE ΓÇô outward return deleted
//   N8N_WEBHOOK_GRN_UPDATE        ΓÇô GRN updated
//   N8N_WEBHOOK_GRN_DELETE        ΓÇô GRN deleted
//   N8N_WEBHOOK_STOCK_CHECK_APPROVE ΓÇô stock check approved
//   N8N_WEBHOOK_STOCK_CHECK_REJECT  ΓÇô stock check rejected
//   N8N_WEBHOOK_USER_CREATE       ΓÇô user created
//   N8N_WEBHOOK_USER_UPDATE       ΓÇô user updated
//   N8N_WEBHOOK_USER_DELETE       ΓÇô user deleted
//   N8N_WEBHOOK_ROLE_PERMISSION   ΓÇô role permissions updated
//   N8N_WEBHOOK_SETTINGS          ΓÇô settings updated
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
async function triggerN8nWebhook(event: string, payload: Record<string, any>): Promise<void> {
  const eventEnvMap: Record<string, string | undefined> = {
    // ΓöÇΓöÇ existing ΓöÇΓöÇ
    NEW_PO:                process.env.N8N_WEBHOOK_NEW_PO,
    GRN:                   process.env.N8N_WEBHOOK_GRN,
    LOW_STOCK:             process.env.N8N_WEBHOOK_LOW_STOCK,
    SUPPLIER:              process.env.N8N_WEBHOOK_SUPPLIER,
    MATERIAL_REQ:          process.env.N8N_WEBHOOK_MATERIAL_REQ,
    INWARD:                process.env.N8N_WEBHOOK_INWARD,
    OUTWARD:               process.env.N8N_WEBHOOK_OUTWARD,
    STOCK_CHECK:           process.env.N8N_WEBHOOK_STOCK_CHECK,
    PO_APPROVAL:           process.env.N8N_WEBHOOK_PO_APPROVAL,
    // ΓöÇΓöÇ new ΓöÇΓöÇ
    LOGIN:                 process.env.N8N_WEBHOOK_LOGIN,
    INVENTORY_CREATE:      process.env.N8N_WEBHOOK_INVENTORY_CREATE,
    INVENTORY_UPDATE:      process.env.N8N_WEBHOOK_INVENTORY_UPDATE,
    INVENTORY_DELETE:      process.env.N8N_WEBHOOK_INVENTORY_DELETE,
    CATALOGUE_CREATE:      process.env.N8N_WEBHOOK_CATALOGUE_CREATE,
    CATALOGUE_UPDATE:      process.env.N8N_WEBHOOK_CATALOGUE_UPDATE,
    CATALOGUE_DELETE:      process.env.N8N_WEBHOOK_CATALOGUE_DELETE,
    SUPPLIER_UPDATE:       process.env.N8N_WEBHOOK_SUPPLIER_UPDATE,
    SUPPLIER_DELETE:       process.env.N8N_WEBHOOK_SUPPLIER_DELETE,
    PO_UPDATE:             process.env.N8N_WEBHOOK_PO_UPDATE,
    PO_DELETE:             process.env.N8N_WEBHOOK_PO_DELETE,
    PLANNING_CREATE:       process.env.N8N_WEBHOOK_PLANNING_CREATE,
    PLANNING_UPDATE:       process.env.N8N_WEBHOOK_PLANNING_UPDATE,
    PLANNING_DELETE:       process.env.N8N_WEBHOOK_PLANNING_DELETE,
    MR_UPDATE:             process.env.N8N_WEBHOOK_MR_UPDATE,
    MR_DELETE:             process.env.N8N_WEBHOOK_MR_DELETE,
    QUOTATION_CREATE:      process.env.N8N_WEBHOOK_QUOTATION_CREATE,
    QUOTATION_UPDATE:      process.env.N8N_WEBHOOK_QUOTATION_UPDATE,
    QUOTATION_DELETE:      process.env.N8N_WEBHOOK_QUOTATION_DELETE,
    WRITEOFF_CREATE:       process.env.N8N_WEBHOOK_WRITEOFF_CREATE,
    WRITEOFF_UPDATE:       process.env.N8N_WEBHOOK_WRITEOFF_UPDATE,
    WRITEOFF_DELETE:       process.env.N8N_WEBHOOK_WRITEOFF_DELETE,
    INWARD_UPDATE:         process.env.N8N_WEBHOOK_INWARD_UPDATE,
    INWARD_DELETE:         process.env.N8N_WEBHOOK_INWARD_DELETE,
    OUTWARD_UPDATE:        process.env.N8N_WEBHOOK_OUTWARD_UPDATE,
    OUTWARD_DELETE:        process.env.N8N_WEBHOOK_OUTWARD_DELETE,
    INWARD_RETURN:         process.env.N8N_WEBHOOK_INWARD_RETURN,
    INWARD_RETURN_UPDATE:  process.env.N8N_WEBHOOK_INWARD_RETURN_UPDATE,
    INWARD_RETURN_DELETE:  process.env.N8N_WEBHOOK_INWARD_RETURN_DELETE,
    OUTWARD_RETURN:        process.env.N8N_WEBHOOK_OUTWARD_RETURN,
    OUTWARD_RETURN_UPDATE: process.env.N8N_WEBHOOK_OUTWARD_RETURN_UPDATE,
    OUTWARD_RETURN_DELETE: process.env.N8N_WEBHOOK_OUTWARD_RETURN_DELETE,
    GRN_UPDATE:            process.env.N8N_WEBHOOK_GRN_UPDATE,
    GRN_DELETE:            process.env.N8N_WEBHOOK_GRN_DELETE,
    STOCK_CHECK_APPROVE:   process.env.N8N_WEBHOOK_STOCK_CHECK_APPROVE,
    STOCK_CHECK_REJECT:    process.env.N8N_WEBHOOK_STOCK_CHECK_REJECT,
    USER_CREATE:           process.env.N8N_WEBHOOK_USER_CREATE,
    USER_UPDATE:           process.env.N8N_WEBHOOK_USER_UPDATE,
    USER_DELETE:           process.env.N8N_WEBHOOK_USER_DELETE,
    ROLE_PERMISSION:       process.env.N8N_WEBHOOK_ROLE_PERMISSION,
    SETTINGS:              process.env.N8N_WEBHOOK_SETTINGS,
  };

  const webhookUrl = eventEnvMap[event] || process.env.N8N_WEBHOOK_GENERIC;
  if (!webhookUrl) return;

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (process.env.N8N_WEBHOOK_SECRET) {
      headers['X-Webhook-Secret'] = process.env.N8N_WEBHOOK_SECRET;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ event, timestamp: new Date().toISOString(), ...payload }),
      signal: controller.signal
    });
    clearTimeout(timeout);
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.error(`[n8n] Webhook for event "${event}" timed out after 5s`);
    } else {
      console.error(`[n8n] Failed to fire webhook for event "${event}":`, err);
    }
  }
}

// Checks updated SKUs against catalogue minStock and fires LOW_STOCK webhook if needed
async function checkAndFireLowStockWebhook(skus: string[]): Promise<void> {
  try {
    const lowItems = await Inventory.aggregate([
      { $match: { sku: { $in: skus } } },
      { $lookup: { from: 'catalogues', localField: 'sku', foreignField: 'sku', as: 'catalogue' } },
      { $unwind: { path: '$catalogue', preserveNullAndEmptyArrays: false } },
      { $match: { $expr: { $lte: ['$liveStock', '$catalogue.minStock'] } } },
      { $project: { sku: 1, itemName: 1, liveStock: 1, minStock: '$catalogue.minStock', unit: 1 } },
    ]);

    for (const item of lowItems) {
      await createNotification({
        message: `Low Stock Alert: ${item.itemName} (${item.sku}) is at ${item.liveStock} ${item.unit} (Min: ${item.minStock})`,
        severity: 'warning',
        path: 'inventory'
      });

      await triggerN8nWebhook('LOW_STOCK', {
        sku: item.sku,
        itemName: item.itemName,
        liveStock: item.liveStock,
        minStock: item.minStock,
        unit: item.unit,
      });
    }
  } catch (err) {
    console.error('[n8n] Low stock check failed:', err);
  }
}

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// N8N INCOMING WEBHOOK  POST /webhook/n8n  (public, no auth)
// Secured by X-Webhook-Secret header (must match N8N_WEBHOOK_SECRET)
//
// Supported actions:
//   UPDATE_PO_STATUS    { poId, status, approvedBy? }
//   APPROVE_STOCK_CHECK { reportId, approvedBy?, reason? }
//   NOTIFY              { message, severity?, path? }
//   BROADCAST           { type, path? }
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
router.post('/webhook/n8n', async (req, res) => {
  const incomingSecret = req.headers['x-webhook-secret'];
  if (process.env.N8N_WEBHOOK_SECRET && incomingSecret !== process.env.N8N_WEBHOOK_SECRET) {
    return res.status(403).json({ success: false, message: 'Forbidden: invalid secret' });
  }

  const { action, ...data } = req.body;

  try {
    switch (action) {

      case 'UPDATE_PO_STATUS': {
        const { poId, status, approvedBy } = data;
        if (!poId || !status) throw new Error('poId and status are required');
        const po = await PurchaseOrder.findOneAndUpdate(
          { id: poId },
          { status, approvedBy: approvedBy || 'n8n Automation' },
          { new: true }
        );
        if (!po) throw new Error(`PO ${poId} not found`);
        broadcast({ type: 'DATA_UPDATED', path: 'pos' });
        await createNotification({
          message: `PO ${poId} status updated to "${status}" via n8n`,
          severity: status === 'Approved' || status === 'Fulfilled' ? 'success' : 'info',
          path: 'pos',
        });
        return res.json({ success: true, data: po });
      }

      case 'APPROVE_STOCK_CHECK': {
        const { reportId, approvedBy, reason } = data;
        if (!reportId) throw new Error('reportId is required');
        const report = await StockCheckReport.findOneAndUpdate(
          { id: reportId },
          { status: 'Approved', approvedBy: approvedBy || 'n8n Automation', approvalReason: reason || '' },
          { new: true }
        );
        if (!report) throw new Error(`Report ${reportId} not found`);
        for (const item of report.items) {
          const inv = await Inventory.findOne({ sku: item.sku });
          if (inv) {
            inv.liveStock = item.physicalStock;
            // Sync counts via save hook
            await inv.save();
          }
        }
        broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
        broadcast({ type: 'DATA_UPDATED', path: 'stock-check-reports' });
        await createNotification({
          message: `Stock Check ${reportId} approved via n8n`,
          severity: 'success',
          path: 'stock-check-reports',
        });
        return res.json({ success: true, data: report });
      }

      case 'NOTIFY': {
        const { message, severity, path: notifPath } = data;
        if (!message) throw new Error('message is required');
        const notif = await createNotification({ message, severity: severity || 'info', path: notifPath });
        return res.json({ success: true, data: notif });
      }

      case 'BROADCAST': {
        const { type: broadcastType, path: broadcastPath } = data;
        if (!broadcastType) throw new Error('type is required');
        broadcast({ type: broadcastType, path: broadcastPath });
        return res.json({ success: true });
      }

      default:
        return res.status(400).json({ success: false, message: `Unknown action: ${action}` });
    }
  } catch (error: any) {
    console.error('[n8n] Incoming webhook error:', error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

// Resource to Role Mapping for Notifications
const RESOURCE_ROLES: Record<string, string[]> = {
  'pos': ["Super Admin", "Director", "AGM", "Head", "Purchase coordinator", "Accountant", "Finance Manager"],
  'material-requirements': ["Purchase coordinator", "Inventory Manager", "Super Admin", "AGM", "Project Manager", "Site Engineer"],
  'inventory': ["Inventory Manager", "Store Incharge", "Super Admin", "Head", "Store Assistant"],
  'suppliers': ["Super Admin", "Purchase coordinator", "AGM", "Head"],
  'planning': ["Project Manager", "Purchase coordinator", "Super Admin", "Director", "AGM"],
  'grn': ["Inventory Manager", "Accountant", "Super Admin", "AGM", "Finance Manager", "Purchase coordinator"],
  'quotations': ["Purchase coordinator", "Head", "Super Admin", "AGM", "Director", "Inventory Manager", "manager", "admin", "staff"],
  'inward': ["Inventory Manager", "Store Incharge", "Super Admin", "Store Assistant", "AGM", "Purchase coordinator", "manager", "Accountant", "Project Manager", "Site Engineer"],
  'outward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager", "Site Engineer", "AGM", "Purchase coordinator", "Accountant"],
  'inward-returns': ["Inventory Manager", "Store Incharge", "Super Admin"],
  'outward-returns': ["Inventory Manager", "Store Incharge", "Super Admin"],
  'transfer-inward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager"],
  'transfer-outward': ["Inventory Manager", "Store Incharge", "Super Admin", "Project Manager"],
  'writeoffs': ["Super Admin", "Director", "AGM", "Head", "Inventory Manager"],
  'stock-check-reports': ["Inventory Manager", "Super Admin", "AGM", "Head"],
  'users': ["Super Admin", "Director"],
  'audit-logs': ["Super Admin", "Director"]
};

// --- Permission Helper ---
async function serverHasPermission(user: any, permission: string): Promise<boolean> {
  if (!user) return false;
  const roleLower = (user.role || "").toLowerCase().trim();
  if (roleLower === 'super admin' || roleLower === 'superadmin' || roleLower === 'admin') return true;
  
  // Case-insensitive role lookup
  const rolePerm = await RolePermission.findOne({ role: { $regex: new RegExp(`^${user.role}$`, 'i') } });
  if (rolePerm?.permissions.includes(permission)) return true;
  if (user.permissions?.includes(permission)) return true;
  
  return false;
}

// Helper for sequential IDs
async function getNextSequence(name: string): Promise<number> {
  const counter = await Counter.findOneAndUpdate(
    { name },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

async function getRolesWithPermission(permission: string): Promise<string[]> {
  const roles = await RolePermission.find({ permissions: permission }).distinct('role');
  return ["Super Admin", ...roles];
}

async function createNotification(data: { 
  message: string, 
  severity?: 'info' | 'success' | 'warning' | 'error', 
  path?: string, 
  senderId?: any,
  targetRoles?: string[]
}) {
  try {
    // Invalidate stats cache on data changes
    statsCache = null;
    const targetRoles = data.targetRoles || (data.path ? (RESOURCE_ROLES[data.path] || ["Super Admin", "admin"]) : ["Super Admin", "admin"]);
    
    const notifId = `NOTIF-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const notification = await Notification.create({
      id: notifId,
      message: data.message,
      severity: data.severity || 'info',
      senderId: data.senderId,
      path: data.path,
      targetRoles: targetRoles,
      readBy: []
    });

    broadcast({
      type: 'NOTIFICATION',
      id: notifId,
      message: data.message,
      severity: data.severity || 'info',
      path: data.path,
      senderId: data.senderId?.toString(),
      targetRoles: targetRoles
    });

    return notification;
  } catch (error) {
    console.error('Failed to create notification:', error);
  }
}

// --- Public Routes (Unauthenticated) ---
router.get('/public/inventory', async (req, res) => {
  try {
    const search = req.query.search as string;
    const filterStr = req.query.filter as string;
    const limit = parseInt(req.query.limit as string) || 2000;
    
    let query: any = {};
    if (search) {
      const keywords = search.trim().split(/\s+/).filter(k => k.length > 0);
      if (keywords.length > 0) {
        query.$and = keywords.map(kw => {
          const searchRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
          return {
            $or: [
              { itemName: searchRegex },
              { sku: searchRegex },
              { category: searchRegex },
              { subCategory: searchRegex }
            ]
          };
        });
      }
    }
    
    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
    }

    const items = await Inventory.find(query).sort({ itemName: 1 }).limit(Math.min(limit, 5000));
    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error("Error fetching public inventory:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/public/catalogue', async (req, res) => {
  try {
    const search = req.query.search as string;
    const filterStr = req.query.filter as string;
    const limit = parseInt(req.query.limit as string) || 2000;
    
    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { itemName: searchRegex },
        { sku: searchRegex },
        { category: searchRegex },
        { brand: searchRegex }
      ];
    }

    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
    }

    const items = await Catalogue.find(query).sort({ itemName: 1 }).limit(Math.min(limit, 5000));
    res.json({ success: true, data: items });
  } catch (error: any) {
    console.error("Error fetching public catalogue:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/public/inventory', async (req, res) => {
  try {
    const data = { ...req.body };
    if (data.condition && typeof data.condition === 'string') {
      data.condition = data.condition.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    const item = await Inventory.create(data);
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });

    await triggerN8nWebhook('INVENTORY_CREATE', {
      sku: item.sku,
      itemName: item.itemName,
      category: item.category,
      liveStock: item.liveStock,
      unit: item.unit,
      source: 'public'
    });

    res.json({ success: true, data: item });
  } catch (error: any) {
    console.error("Error creating public inventory item:", error);
    return res.status(400).json({ success: false, message: error.message });
  }
});

router.get('/public/suppliers', async (req, res) => {
  try {
    const search = req.query.search as string;
    const limit = parseInt(req.query.limit as string) || 2000;
    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { companyName: searchRegex },
        { ownerName: searchRegex },
        { dealingProducts: searchRegex },
        { email: searchRegex }
      ];
    }
    const suppliers = await Supplier.find(query).sort({ companyName: 1 }).limit(Math.min(limit, 5000));
    res.json({ success: true, data: suppliers });
  } catch (error: any) {
    console.error("Error fetching public suppliers:", error);
    return res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/public/inward', async (req, res) => {
  let session: any;
  try {
    console.log('Public Inward Payload:', JSON.stringify(req.body, null, 2));
    session = await mongoose.startSession();
    session.startTransaction();
    const type = req.body.type || 'Public Inward';
    const transactionData = { ...req.body, type, date: new Date().toISOString() };
    
    if (!transactionData.items || !Array.isArray(transactionData.items)) {
      throw new Error('Items array is required');
    }

    const recordData = { ...transactionData, status: "Confirmed" };

    if (type === "Public Inward" || type === "Public Transfer Inward") {
      await Inward.create([{ ...recordData, type: type === "Public Inward" ? "Inward" : "Transfer Inward" }], { session });
    } else if (type === "Public Inward Return") {
      await InwardReturn.create([recordData], { session });
    } else if (type === "Public Outward Return") {
      await OutwardReturn.create([recordData], { session });
    } else if (type === "Public Transfer Outward") {
      await Outward.create([{ ...recordData, type: "Transfer Outward" }], { session });
    }

    for (const item of transactionData.items) {
      await updateStock(
        type, item.sku, item.itemName, item.qty, item.unit,
        transactionData.category || "General", session
      );
    }

    const transaction = await Transaction.create([transactionData], { session });
    await session.commitTransaction();
    
    if (type === "Public Inward" || type === "Public Transfer Inward") broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    else if (type === "Public Inward Return") broadcast({ type: 'DATA_UPDATED', path: 'inward-returns' });
    else if (type === "Public Outward Return") broadcast({ type: 'DATA_UPDATED', path: 'outward-returns' });
    else if (type === "Public Transfer Outward") broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });

    await createNotification({
      message: `New ${type} received: ${transaction[0].id}`,
      severity: 'success',
      path: 'transactions',
    });

    await triggerN8nWebhook('INWARD', { transactionId: transaction[0].id, ...transactionData });
    await checkAndFireLowStockWebhook(transactionData.items.map((i: any) => i.sku));

    res.json({ success: true, data: transaction[0] });
  } catch (error: any) {
    console.error('Public Inward Error Details:', error);
    if (session) await session.abortTransaction();
    res.status(400).json({ 
      success: false, 
      message: error.message, 
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined 
    });
  } finally {
    if (session) session.endSession();
  }
});

router.post('/public/outward', async (req, res) => {
  let session: any;
  try {
    console.log('Public Outward Payload:', JSON.stringify(req.body, null, 2));
    session = await mongoose.startSession();
    session.startTransaction();
    const transactionData = { ...req.body, type: 'Public Outward', date: new Date().toISOString() };
    
    if (!transactionData.items || !Array.isArray(transactionData.items)) {
      throw new Error('Items array is required');
    }

    const outwardData = { ...transactionData, status: "Confirmed" };
    await Outward.create([outwardData], { session });

    for (const item of transactionData.items) {
      await updateStock(
        "Public Outward", item.sku, item.itemName, item.qty, item.unit,
        transactionData.category || "General", session
      );
    }

    const transaction = await Transaction.create([transactionData], { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });

    await createNotification({
      message: `New Public Outward created: ${transaction[0].id}`,
      severity: 'info',
      path: 'transactions',
    });

    await triggerN8nWebhook('OUTWARD', { transactionId: transaction[0].id, ...transactionData });
    await checkAndFireLowStockWebhook(transactionData.items.map((i: any) => i.sku));

    res.json({ success: true, data: transaction[0] });
  } catch (error: any) {
    console.error('Public Outward Error Details:', error);
    if (session) await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message, stack: error.stack });
  } finally {
    if (session) session.endSession();
  }
});

router.post('/public/po', async (req, res) => {
  try {
    const poData = req.body;
    const year = new Date().getFullYear();
    const seq = await getNextSequence('PO');
    const customId = `PO-${year}-${seq}`;

    const totalValue = poData.items?.reduce((sum: number, item: any) => sum + (item.totalWithGST || 0), 0) || 0;
    
    const po = await PurchaseOrder.create({
      ...poData,
      id: customId,
      totalValue,
      status: "Pending L1",
      approvalL1: "Pending",
      approvalL2: "Pending",
      createdBy: "Public User",
      date: new Date().toISOString().split('T')[0]
    });

    broadcast({ type: 'DATA_UPDATED', path: 'pos' });

    const roles = await getRolesWithPermission('APPROVE_PURCHASE_ORDER_L1');
    await createNotification({
      message: `New Public PO ${po.id} submitted. Requires L1 Approval.`,
      severity: 'warning',
      path: 'pos',
      targetRoles: roles
    });

    await triggerN8nWebhook('NEW_PO', {
      poId: po.id,
      vendor: po.supplier,
      supplier: po.supplier,
      totalValue,
      status: po.status,
      items: po.items,
      createdBy: 'Public User'
    });

    res.json({ success: true, data: po });
  } catch (error: any) {
    console.error("Public PO Error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/public/upload', (req, res, next) => {
  console.log('--- PUBLIC UPLOAD START ---');
  console.log('Headers:', req.headers);
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Public Multer Error:', err);
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    console.log('Multer finished. File:', req.file ? 'File found' : 'No file');
    next();
  });
}, (req, res) => {
  try {
    console.log('Public upload request body check:', req.body);
    
    if (!req.file) {
      console.error('Public Upload Error: No file in request. Body:', req.body);
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded in the request. Ensure the field name is "image".' 
      });
    }
    
    const file = req.file as any;
    console.log('File details:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      filename: file.filename,
      path: file.path
    });
    
    let url = file.path || file.secure_url || file.url || file.location;
    
    // If it's a local file, convert to a relative URL
    if (file.filename && (!url || !url.startsWith('http'))) {
      url = `/uploads/${file.filename}`;
    }

    if (!url) {
      console.error('Public Upload Error: No URL returned from storage. File info:', file);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get image URL from storage'
      });
    }

    console.log('Public Upload Success:', url);
    return res.status(200).json({ success: true, data: { url } });
  } catch (error: any) {
    console.error('Public Upload Route Catch Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error during upload' 
    });
  }
});

router.get('/public/material-requirements', async (req, res) => {
  try {
    const unused = req.query.unused !== 'false';
    let query: any = { status: { $in: ['Approved by Store', 'Approved by AGM', 'Approved by Director', 'Partially Issued'] } };

    if (unused) {
      const linkedMrIds = await PurchaseOrder.find({ mrId: { $ne: null, $ne: "" } }).distinct('mrId');
      query.id = { $nin: linkedMrIds };
    }
    
    const mrs = await MaterialRequirement.find(query).sort({ createdAt: -1 });
    res.json({ success: true, data: mrs });
  } catch (error: any) {
    console.error("Error fetching public material requirements:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/public/mr/:id', async (req, res) => {
  try {
    const mr = await MaterialRequirement.findOne({ id: req.params.id });
    if (!mr) {
      return res.status(404).json({ success: false, message: 'Material requirement not found' });
    }
    res.json({ success: true, data: mr });
  } catch (error: any) {
    console.error("Error fetching public MR:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/public/material-requirement', async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const seq = await getNextSequence('MR');
    const customId = `MR-${year}-${seq}`;

    const requirement = await MaterialRequirement.create({
      ...req.body,
      id: customId,
      mrNumber: customId,
      status: req.body.status === 'Approved by Store' ? 'Approved by Store' : 'Store Pending',
      date: req.body.date || new Date().toISOString()
    });
    
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    
    await createNotification({
      message: `New Public MR ${requirement.id} from ${requirement.requesterName} submitted for Store Approval`,
      severity: 'warning',
      path: 'material-requirements',
      targetRoles: await getRolesWithPermission('APPROVE_MR_STORE')
    });

    await triggerN8nWebhook('MATERIAL_REQ', {
      requirementId: requirement.id,
      requesterName: requirement.requesterName,
      project: requirement.project,
      items: requirement.items,
      location: requirement.location
    });

    res.json({ success: true, data: requirement });
  } catch (error: any) {
    console.error("Error creating public material requirement:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/public/quotations', async (req, res) => {
  try {
    const mrId = req.query.mrId as string;
    const filterStr = req.query.filter as string;
    let query: any = {};
    if (mrId) query.mrId = mrId;
    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
    }
    const quotes = await Quotation.find(query).sort({ updatedAt: -1 }).limit(100);
    res.json({ success: true, data: quotes });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/public/quotation', async (req, res) => {
  try {
    const quotation = await Quotation.create({
      ...req.body,
      id: `QTN-PUB-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      status: 'Pending',
      date: new Date().toISOString()
    });

    await createNotification({
      message: `New Quotation from ${quotation.supplierName} for MR ${quotation.mrId} submitted for review`,
      severity: 'info',
      path: 'quotations',
      targetRoles: await getRolesWithPermission('VIEW_QUOTATIONS')
    });

    await triggerN8nWebhook('QUOTATION_CREATE', {
      quotationId: quotation.id,
      supplierName: quotation.supplierName,
      mrId: quotation.mrId,
      status: quotation.status,
      source: 'public'
    });

    res.json({ success: true, data: quotation });
  } catch (error: any) {
    console.error("Error creating public quotation:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/public/supplier-registration', async (req, res) => {
  try {
    const supplier = await Supplier.create({
      ...req.body,
      id: req.body.id || `S-PUB-${Date.now()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`,
      status: 'Active'
    });

    await createNotification({
      message: `New Supplier Registration: ${supplier.companyName || supplier.name}`,
      severity: 'info',
      path: 'suppliers'
    });

    await triggerN8nWebhook('SUPPLIER', {
      supplierId: supplier.id,
      name: supplier.companyName || supplier.name,
      status: supplier.status,
      email: supplier.email,
      phone: supplier.phone
    });

    res.json({ success: true, data: supplier });
  } catch (error: any) {
    console.error("Error in public supplier registration:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// --- Auth Middleware ---
const authenticate = async (req: any, res: any, next: any) => {
  let token = req.headers.authorization?.split(' ')[1] || req.cookies.token;
  
  // Handle literal "null" or "undefined" strings that might come from client storage errors
  if (token === 'null' || token === 'undefined') {
    token = null;
  }

  if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = await User.findById(decoded.id);
    if (!req.user || !req.user.isActive) return res.status(401).json({ success: false, message: 'Unauthorized' });
    next();
  } catch (error) {
    res.status(401).json({ success: false, message: 'Unauthorized' });
  }
};

// --- Auth Routes ---
router.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '24h' });
  
  const rolePerms = await RolePermission.findOne({ role: user.role });
  const userData = user.toObject();
  userData.rolePermissions = rolePerms ? rolePerms.permissions : [];

  res.cookie('token', token, { 
    httpOnly: true, 
    secure: true, 
    sameSite: 'none',
    maxAge: 24 * 60 * 60 * 1000 
  });

  // n8n: fire login webhook (non-blocking)
  await triggerN8nWebhook('LOGIN', {
    userId: user._id.toString(),
    email: user.email,
    name: user.name,
    role: user.role,
  });
  
  res.json({ success: true, data: { user: userData, token } });
});

router.post('/auth/logout', (req, res) => {
  res.clearCookie('token', {
    httpOnly: true,
    secure: true,
    sameSite: 'none'
  });
  res.json({ success: true });
});

router.get('/auth/me', authenticate, async (req: any, res) => {
  const rolePerms = await RolePermission.findOne({ role: req.user.role });
  const userData = req.user.toObject();
  userData.rolePermissions = rolePerms ? rolePerms.permissions : [];
  
  // Return a fresh token to ensure client-side storage (localStorage) stays in sync with cookie
  const token = jwt.sign({ id: req.user._id }, JWT_SECRET, { expiresIn: '24h' });
  
  res.json({ success: true, data: { user: userData, token } });
});

// --- Role Permissions Routes ---
router.get('/role-permissions', authenticate, async (req: any, res) => {
  // Allow all authenticated users to read permissions for correct UI state
  try {
    const rolePerms = await RolePermission.find();
    res.json({ success: true, data: rolePerms });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/role-permissions', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { role, permissions } = req.body;
    const rolePerm = await RolePermission.findOneAndUpdate(
      { role },
      { role, permissions },
      { upsert: true, new: true }
    );
    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    broadcast({ type: 'PERMISSIONS_CHANGED', role });

    await triggerN8nWebhook('ROLE_PERMISSION', {
      role,
      permissions,
      updatedBy: req.user.name,
    });

    res.json({ success: true, data: rolePerm });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/role-permissions/:role', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { role } = req.params;
    
    // Prevent deleting Super Admin
    if (role === 'Super Admin' || role === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Cannot delete Super Admin role' });
    }

    const result = await RolePermission.deleteOne({ role });
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Role not found' });
    }

    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    
    res.json({ success: true, message: 'Role deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/role-permissions-rename', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { oldRole, newRole } = req.body;
    if (!oldRole || !newRole) {
       return res.status(400).json({ success: false, message: 'Missing old or new role name' });
    }
    
    // Prevent renaming Super Admin
    if (oldRole === 'Super Admin' || oldRole === 'superadmin') {
      return res.status(400).json({ success: false, message: 'Cannot rename Super Admin role' });
    }

    // Check if newRole already exists
    const exists = await RolePermission.findOne({ role: newRole });
    if (exists) {
      return res.status(400).json({ success: false, message: 'New role name already exists' });
    }

    // 1. Update RolePermission
    await RolePermission.findOneAndUpdate({ role: oldRole }, { role: newRole });
    
    // 2. Update all Users with this role
    await User.updateMany({ role: oldRole }, { role: newRole });
    
    broadcast({ type: 'DATA_UPDATED', path: 'role-permissions' });
    broadcast({ type: 'DATA_UPDATED', path: 'users' });
    
    res.json({ success: true, message: 'Role renamed successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Cascade Deletion Helpers ---
const cascadeDeletePO = async (poId: string) => {
  // 1. Delete associated GRNs and their Inwards
  const grns = await GRN.find({ poId });
  for (const grn of grns) {
    await Inward.deleteMany({ grnRef: grn.id });
    await GRN.deleteOne({ id: grn.id });
  }
  // 2. Delete associated Transactions
  await Transaction.deleteMany({ poId });
  // 3. Delete associated Outwards
  await Outward.deleteMany({ poId });
  // 4. Update parent MR if exists (reset status and approvedQuotationId to allow re-quoting/deletion)
  const po = await PurchaseOrder.findOne({ id: poId });
  if (po && po.mrId) {
    // Check if other POs still exist for this MR (partial POs)
    const otherPOs = await PurchaseOrder.find({ mrId: po.mrId, id: { $ne: poId } });
    if (otherPOs.length === 0) {
      await MaterialRequirement.updateOne(
        { id: po.mrId },
        { 
          $set: { 
            status: 'Approved by AGM', 
            approvedQuotationId: '', 
            approvedSupplier: '' 
          } 
        }
      );
      broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    }
  }

  // 5. Delete the PO itself
  await PurchaseOrder.deleteOne({ id: poId });
  
  broadcast({ type: 'DATA_UPDATED', path: 'pos' });
  broadcast({ type: 'DATA_UPDATED', path: 'grn' });
  broadcast({ type: 'DATA_UPDATED', path: 'inward' });
  broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
  broadcast({ type: 'DATA_UPDATED', path: 'outward' });
};

const cascadeDeleteMR = async (mrId: string) => {
  // 1. Delete associated Quotations
  await Quotation.deleteMany({ mrId });
  // 2. Delete associated Allocations
  await MRAllocation.deleteMany({ mrId });
  // 3. Delete associated POs (and their cascades)
  const pos = await PurchaseOrder.find({ mrId });
  for (const po of pos) {
    await cascadeDeletePO(po.id);
  }
  // 4. Delete the MR itself
  await MaterialRequirement.deleteOne({ id: mrId });
  
  broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
  broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
  broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });
};

// --- Generic CRUD Factory ---
// webhookEventPrefix (optional): e.g. "INVENTORY" ΓåÆ fires INVENTORY_CREATE / INVENTORY_UPDATE / INVENTORY_DELETE
const createCrudRoutes = (
  path: string,
  model: any,
  resourceName: string,
  idField: string = 'id',
  overrideBasePerm?: string,
  webhookEventPrefix?: string
) => {
  const basePerm = overrideBasePerm || resourceName.toUpperCase().replace(/-/g, '_');
  const singularPerm = basePerm.endsWith('S') ? basePerm.slice(0, -1) : basePerm;
  
  // GET (list)
  router.get(`/${path}`, authenticate, async (req, res) => {
    try {
      if (!(await serverHasPermission(req.user, `VIEW_${basePerm}`))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 10000;
      const skip = (page - 1) * limit;
      const search = req.query.search as string;
      const filterStr = req.query.filter as string;
      let crudFilter: any = {};
      
      if (typeof filterStr === 'string') {
        try {
          crudFilter = JSON.parse(filterStr);
        } catch (e) {}
      } else if (filterStr && typeof filterStr === 'object') {
        crudFilter = filterStr;
      }
      
      let query: any = {};
      
      // Date filtering
      const startDate = (req.query.startDate as string) || (crudFilter?.startDate);
      const endDate = (req.query.endDate as string) || (crudFilter?.endDate);
      if (startDate || endDate) {
        query.date = {};
        if (startDate) {
          query.date.$gte = startDate;
        }
        if (endDate) {
          query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
        }
      }

      if (search) {
        const keywords = search.trim().split(/\s+/).filter(k => k.length > 0);
        if (keywords.length > 0) {
          const schemaPaths = Object.keys(model.schema.paths);
          const searchFields = schemaPaths.filter(p => {
            const instance = model.schema.paths[p].instance;
            return instance === 'String';
          });

          if (searchFields.length > 0) {
            query.$and = keywords.map(kw => {
              const searchRegex = new RegExp(kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
              return {
                $or: searchFields.map(field => ({ [field]: searchRegex }))
              };
            });
          }
        }
      }
      
      if (filterStr) {
        const { startDate: _, endDate: __, ...restFilter } = crudFilter;
        query = { ...query, ...restFilter };
      }

      const [items, total] = await Promise.all([
        model.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
        model.countDocuments(query).lean()
      ]);

      res.json({ 
        success: true, 
        data: items,
        pagination: { total, page, limit, pages: Math.ceil(total / limit) }
      });
    } catch (error: any) {
      console.error(`Error fetching ${path}:`, error);
      res.status(500).json({ success: false, message: error.message });
    }
  });

  // POST (create)
  router.post(`/${path}`, authenticate, async (req: any, res) => {
    try {
      if (!(await serverHasPermission(req.user, `CREATE_${singularPerm}`))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const data = { ...req.body };
      if (resourceName === 'material-requirements') {
        const seq = await getNextSequence('MR');
        data.id = `MR-2026-${seq.toString().padStart(4, '0')}`;
        data.mrNumber = data.id;
      }
      if (data.condition && typeof data.condition === 'string') {
        data.condition = data.condition.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      }
      const item = await model.create(data);
      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      
      await createNotification({
        message: `New ${resourceName.toUpperCase()} created by ${req.user.name}`,
        severity: 'success',
        path: resourceName,
        senderId: req.user._id
      });

      // Targeted notifications for approvals
      if (resourceName === 'material-requirements' && item.status === 'Store Pending') {
        const roles = await getRolesWithPermission('APPROVE_MR_STORE');
        await createNotification({
          message: `New MR ${item.id} submitted for Store Approval`,
          severity: 'warning',
          path: 'material-requirements',
          targetRoles: roles
        });
      }

      if (resourceName === 'material-requirements' && item.status === 'Store Pending') {
        const roles = await getRolesWithPermission('APPROVE_MR_STORE');
        await createNotification({
          message: `New Material Requirement ${item.id} received from ${item.requesterName}. Store approval required.`,
          severity: 'warning',
          path: 'material-requirements',
          senderId: req.user._id,
          targetRoles: roles
        });
      }

      if (resourceName === 'quotations' && item.status === 'Pending') {
        const roles = await getRolesWithPermission('VIEW_QUOTATIONS');
        await createNotification({
          message: `New Internal Quotation for MR ${item.mrId} submitted for review`,
          severity: 'info',
          path: 'quotations',
          targetRoles: roles
        });
      }

      // Special handling for PO L1 Approval notification
      if (resourceName === 'pos' && item.status === 'Pending L1') {
        const roles = await getRolesWithPermission('APPROVE_PURCHASE_ORDER_L1');
        await createNotification({
          message: `PO ${item.id} created and requires L1 Approval`,
          severity: 'warning',
          path: 'pos',
          senderId: req.user._id,
          targetRoles: roles
        });
      }

      // n8n webhook
      if (webhookEventPrefix) {
        if (webhookEventPrefix === 'PURCHASE_ORDER') {
          // Use NEW_PO for PO creates
          await triggerN8nWebhook('NEW_PO', {
            poId: item[idField] || item.id,
            supplier: item.supplier,
            totalValue: item.totalValue,
            status: item.status,
            items: item.items,
            createdBy: req.user.name,
          });
        } else {
          await triggerN8nWebhook(`${webhookEventPrefix}_CREATE`, {
            id: item[idField] || item.id,
            resourceName,
            createdBy: req.user.name,
            data: item.toObject ? item.toObject() : item,
          });
        }
      }

      res.json({ success: true, data: item });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // PUT (update)
  router.put(`/${path}/:id`, authenticate, async (req: any, res) => {
    try {
      // Special override for Purchase Order or Material Requirement approvals
      if (path === 'pos' || path === 'material-requirements') {
        const updateKeys = Object.keys(req.body);
        const isReject = req.body.status === 'Blocked' || req.body.status === 'Rejected';

        let allowed = await serverHasPermission(req.user, `EDIT_${singularPerm}`);

        if (path === 'pos') {
          const isApprovalL1 = updateKeys.includes('approvalL1') || updateKeys.includes('approvalL1At');
          const isApprovalL2 = updateKeys.includes('approvalL2') || updateKeys.includes('approvalL2At');
          const isApprovalL3 = updateKeys.includes('approvalL3') || updateKeys.includes('approvalL3At');
          const isAccountUpdate = updateKeys.includes('accountStatus') || updateKeys.includes('payment') || updateKeys.includes('invoice');

          if (!allowed && isApprovalL1 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L1')) allowed = true;
          if (!allowed && isApprovalL2 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L2')) allowed = true;
          if (!allowed && isApprovalL3 && await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_L3')) allowed = true;
          if (!allowed && isAccountUpdate && (req.user.role === 'Accountant' || req.user.role === 'Finance Manager' || await serverHasPermission(req.user, 'APPROVE_PURCHASE_ORDER_BILL'))) allowed = true;
          if (!allowed && isReject && await serverHasPermission(req.user, 'REJECT_PURCHASE_ORDER')) allowed = true;
        }

        if (path === 'material-requirements') {
          const isStatusUpdate = updateKeys.includes('status');
          if (!allowed && isStatusUpdate && await serverHasPermission(req.user, 'APPROVE_MR_STORE')) allowed = true;
        }

        if (!allowed) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      } else {
        if (!(await serverHasPermission(req.user, `EDIT_${singularPerm}`))) {
          return res.status(403).json({ success: false, message: 'Forbidden' });
        }
      }

      const oldItem = await model.findOne({ [idField]: req.params.id });
      if (!oldItem) return res.status(404).json({ success: false, message: 'Not found' });

      // Consistency check for Updates
      if (resourceName === 'material-requirements') {
        const poExists = await PurchaseOrder.findOne({ mrId: req.params.id });
        if (poExists) {
          // Check if user is trying to change critical fields
          const criticalFields = ['items', 'project', 'location', 'mrNumber'];
          const tryingToChangeCritical = Object.keys(req.body).some(key => criticalFields.includes(key));
          
          if (tryingToChangeCritical) {
            return res.status(400).json({ 
              success: false, 
              message: `Cannot modify items or project for Material Requirement ${req.params.id} because a Purchase Order (${poExists.id}) has already been created for it.` 
            });
          }
        }
      }

      if (resourceName === 'pos') {
        const financialFields = ['items', 'totalValue', 'supplier', 'vendorBankDetails', 'total', 'grandTotal', 'totalWithGST'];
        const tryingToChangeFinancial = Object.keys(req.body).some(key => financialFields.includes(key));
        
        if (tryingToChangeFinancial) {
          // If financial data is changed, force reset approval status so it must be re-approved
          req.body.status = 'Pending L1';
          req.body.approvalL1 = 'Pending';
          req.body.approvalL2 = 'Pending';
          req.body.approvalL3 = 'Pending';
          req.body.approvalL1At = null;
          req.body.approvalL2At = null;
          req.body.approvalL3At = null;
        }
      }

      if (resourceName === 'quotations') {
        const quote = oldItem;
        const mr = await MaterialRequirement.findOne({ id: quote.mrId });
        
        // Check if ANY PO exists for this MR and Supplier
        const poExists = await PurchaseOrder.findOne({ mrId: quote.mrId, supplier: quote.supplierName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot modify Quotation ${req.params.id} because a Purchase Order (${poExists.id}) has already been created against it. Please delete the Purchase Order first.` 
          });
        }

        // Check if it's the approved quotation for the MR
        if (mr && mr.approvedQuotationId === req.params.id && (req.body.items || req.body.supplierName || req.body.totalAmount)) {
          // If critical fields change, we force re-approval by setting status to Pending
          req.body.status = 'Pending';
        }
      }

      const data = { ...req.body };
      if (data.condition && typeof data.condition === 'string') {
        data.condition = data.condition.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
      }
      
      Object.assign(oldItem, data);
      const item = await oldItem.save();
      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      
      if (oldItem && item && oldItem.status !== item.status) {
        await createNotification({
          message: `${resourceName.toUpperCase()} ${item[idField] || item.id} status changed to ${item.status} by ${req.user.name}`,
          severity: item.status === 'Approved' || item.status === 'Fulfilled' ? 'success' : 'info',
          path: resourceName,
          senderId: req.user._id
        });

        // n8n: PO status change
        if (resourceName === 'pos') {
          await triggerN8nWebhook('PO_APPROVAL', {
            poId: item[idField] || item.id,
            previousStatus: oldItem.status,
            newStatus: item.status,
            changedBy: req.user.name
          });
          
          let nextPermission = '';
          if (item.status === 'Pending L2') nextPermission = 'APPROVE_PURCHASE_ORDER_L2';
          else if (item.status === 'Pending L3') nextPermission = 'APPROVE_PURCHASE_ORDER_L3';
          else if (item.status === 'Approved') {
            // Notify Store and Procurement that PO is ready
            const procurementRoles = await getRolesWithPermission('VIEW_PURCHASE_ORDERS');
            await createNotification({
              message: `PO ${item.id} has been FINAL APPROVED. Procurement can now proceed.`,
              severity: 'success',
              path: 'pos',
              senderId: req.user._id,
              targetRoles: procurementRoles.length ? procurementRoles : ["Purchase coordinator", "Super Admin"]
            });
          } else if (item.status === 'Rejected' || item.status === 'Blocked') {
            await createNotification({
              message: `Purchase Order ${item.id} was ${item.status} by ${req.user.name}.`,
              severity: 'error',
              path: 'pos',
              targetRoles: ["Super Admin", "admin", "Purchase coordinator"]
            });
          }
          
          if (nextPermission) {
            const roles = await getRolesWithPermission(nextPermission);
            await createNotification({
              message: `PO ${item.id} moved to ${item.status}. Approval required.`,
              severity: 'warning',
              path: 'pos',
              senderId: req.user._id,
              targetRoles: roles
            });
          }
        }

        if (resourceName === 'material-requirements') {
          let nextPermission = '';
          let message = '';
          
          if (item.status === 'Approved by Store') {
            nextPermission = 'APPROVE_MR_AGM';
            message = `MR ${item.id} approved by Store. Now requires AGM Approval.`;
          } else if (item.status === 'Approved by AGM') {
            nextPermission = 'CREATE_PO'; // Or whoever handles quotations/procurement
            message = `MR ${item.id} approved by AGM. It is now in Quotation/Procurement phase.`;
          } else if (item.status === 'Rejected') {
            // Notify the requester about rejection
            await createNotification({
              message: `Your Material Requirement ${item.id} was rejected.`,
              severity: 'error',
              path: 'material-requirements',
              targetRoles: ['Super Admin', 'admin', 'Store Manager', 'Project Manager'] // Fallback or search for requester's role
            });
          }
          
          if (nextPermission) {
            const roles = await getRolesWithPermission(nextPermission);
             await createNotification({
              message: message,
              severity: 'warning',
              path: 'material-requirements',
              senderId: req.user._id,
              targetRoles: roles
            });
          }
        }
      }

      // n8n: update webhook ΓÇö PO ke liye PO_UPDATE, baaki ke liye PREFIX_UPDATE
      if (webhookEventPrefix) {
        const updateEvent = webhookEventPrefix === 'PURCHASE_ORDER'
          ? 'PO_UPDATE'
          : `${webhookEventPrefix}_UPDATE`;

        await triggerN8nWebhook(updateEvent, {
          id: item ? (item[idField] || item.id) : req.params.id,
          resourceName,
          updatedBy: req.user.name,
          previousStatus: oldItem?.status,
          newStatus: item?.status,
          changedFields: Object.keys(req.body),
          data: item?.toObject ? item.toObject() : item,
        });
      }
      
      // Generic Notification for ANY status change that sounds like approval is needed
      if (oldItem && item && oldItem.status !== item.status && item.status.includes('Pending')) {
        const resourcePerm = resourceName.toUpperCase().replace(/-/g, '_');
        const singularPerm = resourcePerm.endsWith('S') ? resourcePerm.slice(0, -1) : resourcePerm;
        
        let roles = await getRolesWithPermission(`APPROVE_${resourcePerm}`);
        if (roles.length === 0) {
          roles = await getRolesWithPermission(`APPROVE_${singularPerm}`);
        }
        
        if (roles.length > 0) {
           await createNotification({
            message: `${resourceName.toUpperCase()} ${item[idField] || item.id} moved to ${item.status}. Approval required.`,
            severity: 'warning',
            path: resourceName,
            senderId: req.user._id,
            targetRoles: roles
          });
        }
      }

      res.json({ success: true, data: item });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });

  // DELETE
  router.delete(`/${path}/:id`, authenticate, async (req: any, res) => {
    try {
      if (!(await serverHasPermission(req.user, `DELETE_${singularPerm}`))) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      // Consistency Check for Deletion
      const itemToDelete = await model.findOne({ [idField]: req.params.id });
      if (!itemToDelete) return res.status(404).json({ success: false, message: 'Not found' });

      const deletedItem = itemToDelete;
      const isSuperAdmin = req.user.role === 'Super Admin' || req.user.role === 'superadmin';

      if (resourceName === 'material-requirements') {
        const poExists = await PurchaseOrder.findOne({ mrId: req.params.id });
        if (poExists && !isSuperAdmin) {
          return res.status(403).json({ 
            success: false, 
            message: `Cannot delete Material Requirement ${req.params.id} because a Purchase Order (${poExists.id}) has already been created for it. Only Super Admin can delete.` 
          });
        }
        await cascadeDeleteMR(req.params.id);
      } else if (resourceName === 'pos') {
        const po = itemToDelete;
        const isLocked = po.accountStatus === 'Paid' || po.status === 'PO Closed' || (po.paymentStatus === 'Paid');
        if (isLocked && !isSuperAdmin) {
          return res.status(403).json({ 
            success: false, 
            message: `Cannot delete Purchase Order ${req.params.id} because payment has been processed or the PO is closed. Only Super Admin can delete.` 
          });
        }
        await cascadeDeletePO(req.params.id);
      } else if (resourceName === 'suppliers') {
        const poExists = await PurchaseOrder.findOne({ supplier: itemToDelete.companyName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Supplier ${itemToDelete.companyName} because Purchase Orders exist for this supplier.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else if (resourceName === 'inventory') {
        const transactionExists = await Transaction.findOne({ "items.sku": itemToDelete.sku });
        if (transactionExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Inventory item ${itemToDelete.sku} because it has transaction history.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else if (resourceName === 'quotations') {
        const quote = itemToDelete;
        const poExists = await PurchaseOrder.findOne({ mrId: quote.mrId, supplier: quote.supplierName });
        if (poExists) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Quotation ${req.params.id} because a Purchase Order (${poExists.id}) has already been created against it. Please delete the Purchase Order first.` 
          });
        }

        const mrApproved = await MaterialRequirement.findOne({ approvedQuotationId: req.params.id });
        if (mrApproved) {
          return res.status(400).json({ 
            success: false, 
            message: `Cannot delete Quotation ${req.params.id} because it is the currently approved quotation for Material Requirement ${mrApproved.id}. Change the approved quotation first.` 
          });
        }
        await model.findOneAndDelete({ [idField]: req.params.id });
      } else {
        await model.findOneAndDelete({ [idField]: req.params.id });
      }

      broadcast({ type: 'DATA_UPDATED', path: resourceName });
      
      await createNotification({
        message: `${resourceName.toUpperCase()} ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: resourceName,
        senderId: req.user._id
      });

      // n8n webhook
      if (webhookEventPrefix) {
        const eventName = webhookEventPrefix === 'PURCHASE_ORDER' ? 'PO_DELETE' : `${webhookEventPrefix}_DELETE`;
        await triggerN8nWebhook(eventName, {
          id: req.params.id,
          resourceName,
          deletedBy: req.user.name,
          snapshot: deletedItem?.toObject ? deletedItem.toObject() : deletedItem,
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(400).json({ success: false, message: error.message });
    }
  });
};

// --- Material Requirements GET (custom, with unused filter) ---
router.get('/material-requirements', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10000;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const unused = req.query.unused === 'true';
    const filterStr = req.query.filter as string;
    
    let query: any = {};
    
    // Date filtering
    const startDate = (req.query.startDate as string) || (typeof req.query.filter === 'string' ? (JSON.parse(req.query.filter as string).startDate) : (req.query.filter as any)?.startDate);
    const endDate = (req.query.endDate as string) || (typeof req.query.filter === 'string' ? (JSON.parse(req.query.filter as string).endDate) : (req.query.filter as any)?.endDate);
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }

    const userRole = (req as any).user.role;
    const rolePerm = await RolePermission.findOne({ role: userRole });
    const perms = rolePerm?.permissions || [];
    
    // Role-based filtering for MR workflow based on permissions
    if (userRole !== 'Super Admin' && userRole !== 'Director') {
      const allowedStatuses = new Set<string>();
      
      // Store Incharge / Inventory Managers see 'Store Pending'
      const canApproveStore = perms.includes('APPROVE_MR_STORE') || 
                             userRole === 'Store Incharge' ||
                             userRole === 'Inventory Manager' ||
                             userRole === 'Store Assistant';

      if (canApproveStore) {
        allowedStatuses.add("Store Pending");
      }

      // Everyone with VIEW permission sees approved MRs
      if (perms.includes('VIEW_MATERIAL_REQUIREMENT') || perms.includes('CREATE_MATERIAL_REQUIREMENT')) {
        ["Approved by Store", "Approved by AGM", "Approved by Director", "Allocated", "Partially Allocated", "Partially Issued", "Closed", "Quotation Phase"].forEach(s => allowedStatuses.add(s));
      }

      // Requesters see their own MRs regardless of status
      query.$or = [
        { status: { $in: Array.from(allowedStatuses) } },
        { engineerId: req.user._id.toString() },
        { requesterName: req.user.name }
      ];
    }
    
    if (unused) {
      const linkedMrIds = await PurchaseOrder.find({ mrId: { $ne: null, $ne: "" } }).distinct('mrId');
      query.id = { $nin: linkedMrIds };
    }
    
    if (search) {
      const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const searchRegex = new RegExp(escapedSearch, 'i');
      query.$or = [
        { id: searchRegex },
        { mrNumber: searchRegex },
        { project: searchRegex },
        { requesterName: searchRegex },
        { location: searchRegex },
        { "items.materialName": searchRegex },
        { "items.sku": searchRegex }
      ];
    }
    
    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
    }

    const [items, total] = await Promise.all([
      MaterialRequirement.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      MaterialRequirement.countDocuments(query).lean()
    ]);

    res.json({ 
      success: true, 
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error(`Error fetching material-requirements:`, error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// MATERIAL REQUIREMENTS POST (authenticated)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
router.post('/material-requirements', authenticate, async (req: any, res) => {
  try {
    if (!(await serverHasPermission(req.user, 'CREATE_MATERIAL_REQUIREMENT'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const year = new Date().getFullYear();
    const seq = await getNextSequence('MR');
    const customId = `MR-${year}-${seq}`;

    const requirement = await MaterialRequirement.create({
      ...req.body,
      id: customId,
      mrNumber: customId,
      status: req.body.status || 'Store Pending',
      date: req.body.date || new Date().toISOString()
    });

    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });

    // Notify Store Team
    const storeRoles = await getRolesWithPermission('APPROVE_MR_STORE');
    await createNotification({
      message: `New Material Requirement ${requirement.id} received for project ${requirement.project}. Store approval required.`,
      severity: 'warning',
      path: 'material-requirements',
      senderId: req.user._id,
      targetRoles: storeRoles
    });

    await triggerN8nWebhook('MATERIAL_REQ', {
      requirementId: requirement.id,
      requesterName: requirement.requesterName || req.user.name,
      project: requirement.project,
      items: requirement.items,
      location: requirement.location,
      createdBy: req.user.name
    });

    res.json({ success: true, data: requirement });
  } catch (error: any) {
    console.error('Error creating material requirement:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
// PURCHASE ORDERS POST (authenticated)
// ΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇΓöÇ
router.post('/pos', authenticate, async (req: any, res) => {
  try {
    if (!(await serverHasPermission(req.user, 'CREATE_PURCHASE_ORDER'))) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    const year = new Date().getFullYear();
    const seq = await getNextSequence('PO');
    const customId = `PO-${year}-${seq}`;

    const data = { ...req.body };
    const totalValue = data.items?.reduce((sum: number, item: any) => sum + (item.totalWithGST || 0), 0) || 0;
    
    const item = await PurchaseOrder.create({
      ...data,
      id: customId,
      totalValue,
      status: data.status || 'Pending L1',
      createdBy: req.user.name,
      date: data.date || new Date().toISOString().split('T')[0]
    });

    broadcast({ type: 'DATA_UPDATED', path: 'pos' });
    
    await createNotification({
      message: `New PURCHASE ORDER created by ${req.user.name}`,
      severity: 'success',
      path: 'pos',
      senderId: req.user._id
    });

    if (item.status === 'Pending L1') {
      const roles = await getRolesWithPermission('APPROVE_PURCHASE_ORDER_L1');
      await createNotification({
        message: `PO ${item.id} created and requires L1 Approval`,
        severity: 'warning',
        path: 'pos',
        senderId: req.user._id,
        targetRoles: roles
      });
    }

    // n8n webhook
    await triggerN8nWebhook('NEW_PO', {
      poId: item.id,
      supplier: item.supplier,
      totalValue: item.totalValue,
      status: item.status,
      items: item.items,
      createdBy: req.user.name,
    });

    res.json({ success: true, data: item });
  } catch (error: any) {
    console.error('Error creating PO:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

createCrudRoutes('inventory',            Inventory,           'inventory',            'sku', undefined,             'INVENTORY');
createCrudRoutes('catalogue',            Catalogue,           'catalogue',            'sku', undefined,             'CATALOGUE');
createCrudRoutes('suppliers',            Supplier,            'suppliers',            'id',  undefined,             'SUPPLIER');
createCrudRoutes('vendors',              Supplier,            'suppliers',            'id',  undefined,             'SUPPLIER');  // Alias
createCrudRoutes('pos',                  PurchaseOrder,       'pos',                  'id',  'PURCHASE_ORDERS',     'PURCHASE_ORDER');
createCrudRoutes('planning',             MaterialPlan,        'planning',             'id',  'MATERIAL_PLAN',       'PLANNING');
createCrudRoutes('material-requirements',MaterialRequirement, 'material-requirements','id',  'MATERIAL_REQUIREMENT','MR');
createCrudRoutes('mr-allocations',      MRAllocation,        'mr-allocations',      'id',  'MATERIAL_REQUIREMENT','ALLOCATION');
createCrudRoutes('writeoffs',            WriteOff,            'writeoffs',            'id',  undefined,             'WRITEOFF');

// MR Allocation Logic (Operation 1)
router.post('/mr/allocate', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { mrId, items } = req.body; // items: Array of { sku, qty }
    
    const mr = await MaterialRequirement.findOne({ id: mrId }).session(session);
    if (!mr) throw new Error("Material Requisition not found");

    for (const allocReq of items) {
      if (!allocReq.sku || !allocReq.qty || allocReq.qty <= 0) continue;

      const mrItem = mr.items.find((i: any) => i.sku === allocReq.sku);
      if (!mrItem) continue;

      const needed = Math.max(0, mrItem.qty - (mrItem.allocatedQty || 0));
      const finalAllocQty = Math.min(allocReq.qty, needed);
      
      if (finalAllocQty <= 0) continue;

      const inv = await Inventory.findOne({ sku: allocReq.sku }).session(session);
      if (!inv) throw new Error(`Item ${allocReq.sku} not found in inventory`);
      
      const actualAvailable = Math.max(0, (inv.liveStock || 0) - (inv.allocatedQty || 0));
      if (actualAvailable < finalAllocQty) {
        throw new Error(`Insufficient available stock for ${inv.itemName} (${allocReq.sku}). Available: ${actualAvailable}, Requested: ${finalAllocQty}`);
      }

      // Layer 1 & 2 Shift
      inv.allocatedQty = (inv.allocatedQty || 0) + finalAllocQty;
      // liveStock remains same (it is available + allocated)
      // availableQty will be recalculated in save hook if we have one, but let's set it manually too for safety
      inv.availableQty = Math.max(0, (inv.liveStock || 0) - inv.allocatedQty);
      inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);

      await inv.save({ session });

      // Core Allocation Record
      await MRAllocation.create([{
        id: `ALC-${mr.id}-${allocReq.sku}-${Date.now()}`,
        mrId: mr.id,
        mrNumber: mr.mrNumber || mr.id,
        engineerName: mr.requesterName,
        projectName: mr.project,
        sku: allocReq.sku,
        itemName: inv.itemName,
        allocatedQty: finalAllocQty,
        remainingQty: finalAllocQty,
        issuedQty: 0,
        allocatedBy: req.user.name,
        allocationDate: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0]
      }], { session });

      // Update MR Item record
      mrItem.allocatedQty = (mrItem.allocatedQty || 0) + finalAllocQty;
      if (mrItem.allocatedQty >= mrItem.qty) {
        mrItem.status = "Allocated";
      } else {
        mrItem.status = "Partial";
      }
    }

    const allAllocated = mr.items.every((i: any) => i.status === "Allocated" || i.status === "Issued");
    mr.status = allAllocated ? "Allocated" : "Partially Allocated";
    await mr.save({ session });

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    
    res.json({ success: true, message: "Material allocated successfully" });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Allocation Error:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// Permission Sync: Ensure key roles have new MR permissions
const syncPerms = async () => {
    try {
        console.log("[Migration] Running Role-Permission sync...");
        const rolesToUpdate = [
          { role: 'Store Incharge', perms: ['ALLOCATE_MR', 'APPROVE_MR_STORE', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_INVENTORY', 'VIEW_SUPPLIERS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_INWARD_RETURN', 'VIEW_OUTWARD_RETURN', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_GRN'] },
          { role: 'Inventory Manager', perms: ['ALLOCATE_MR', 'APPROVE_MR_STORE', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_INVENTORY', 'MANAGE_INVENTORY', 'EDIT_INVENTORY', 'VIEW_SUPPLIERS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_INWARD_RETURN', 'VIEW_OUTWARD_RETURN', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_GRN'] },
          { role: 'Super Admin', perms: ['ALLOCATE_MR', 'APPROVE_MR_STORE', 'APPROVE_MR_AGM', 'GET_QUOTATION_LINK', 'APPROVE_PURCHASE_ORDER_L1', 'APPROVE_PURCHASE_ORDER_L2', 'APPROVE_PURCHASE_ORDER_L3', 'VERIFY_BILL', 'REJECT_BILL', 'MAKE_PAYMENT', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_DAILY_REPORT', 'VIEW_REPORTS', 'VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_PURCHASE_ORDERS', 'VIEW_CATALOGUE', 'VIEW_MATERIAL_PLAN', 'VIEW_GRN', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_QUOTATIONS', 'VIEW_WRITEOFF', 'VIEW_STOCK_CHECK_REPORTS', 'VIEW_USERS', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS'] },
          { role: 'admin', perms: ['ALLOCATE_MR', 'APPROVE_MR_STORE', 'APPROVE_MR_AGM', 'GET_QUOTATION_LINK', 'APPROVE_PURCHASE_ORDER_L1', 'APPROVE_PURCHASE_ORDER_L2', 'APPROVE_PURCHASE_ORDER_L3', 'VERIFY_BILL', 'REJECT_BILL', 'MAKE_PAYMENT', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_DAILY_REPORT', 'VIEW_REPORTS', 'VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_PURCHASE_ORDERS', 'VIEW_CATALOGUE', 'VIEW_MATERIAL_PLAN', 'VIEW_GRN', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_QUOTATIONS', 'VIEW_WRITEOFF', 'VIEW_STOCK_CHECK_REPORTS', 'VIEW_USERS', 'MANAGE_USERS', 'VIEW_AUDIT_LOGS'] },
          { role: 'staff', perms: ['VIEW_INVENTORY', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_SUPPLIERS', 'VIEW_CATALOGUE', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_PURCHASE_ORDERS', 'VIEW_QUOTATIONS', 'VIEW_USERS'] },
          { role: 'AGM', perms: ['APPROVE_MR_AGM', 'APPROVE_QUOTATION', 'GET_QUOTATION_LINK', 'APPROVE_PURCHASE_ORDER_L1', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_REPORTS', 'VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Purchase coordinator', perms: ['VIEW_SUPPLIERS', 'CREATE_SUPPLIER', 'EDIT_SUPPLIER', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_INVENTORY', 'VIEW_CATALOGUE', 'CREATE_PURCHASE_ORDER', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Head', perms: ['VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_QUOTATIONS', 'VIEW_CATALOGUE', 'APPROVE_PURCHASE_ORDER_L2', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Director', perms: ['VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_CATALOGUE', 'APPROVE_PURCHASE_ORDER_L3', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'manager', perms: ['VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Project Manager', perms: ['VIEW_SUPPLIERS', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_INVENTORY', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_PURCHASE_ORDERS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Site Engineer', perms: ['VIEW_SUPPLIERS', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_INVENTORY', 'VIEW_CATALOGUE', 'VIEW_QUOTATIONS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN'] },
          { role: 'Accountant', perms: ['VIEW_SUPPLIERS', 'VIEW_PURCHASE_ORDERS', 'VIEW_REPORTS', 'VIEW_QUOTATIONS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN', 'VERIFY_BILL', 'REJECT_BILL', 'MAKE_PAYMENT'] },
          { role: 'Finance Manager', perms: ['VIEW_SUPPLIERS', 'VIEW_PURCHASE_ORDERS', 'VIEW_REPORTS', 'VIEW_QUOTATIONS', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_GRN', 'VERIFY_BILL', 'REJECT_BILL', 'MAKE_PAYMENT'] },
          { role: 'Store Assistant', perms: ['VIEW_SUPPLIERS', 'VIEW_INVENTORY', 'VIEW_INWARD', 'VIEW_OUTWARD', 'VIEW_QUOTATIONS', 'VIEW_MATERIAL_REQUIREMENT', 'VIEW_GRN'] }
        ];

        for (const target of rolesToUpdate) {
          await RolePermission.findOneAndUpdate(
            { role: target.role },
            { $addToSet: { permissions: { $each: target.perms } } },
            { upsert: true, new: true }
          );
          console.log(`[Migration] Synced permissions for role: ${target.role}`);
        }
        console.log("[Migration] Role-Permission sync complete.");
    } catch (err) {
        console.error("[Migration] Error during permission sync:", err);
    }
};

// Migration: Sync availableQty with liveStock for all items
(async () => {
  try {
    // Run permission sync immediately
    await syncPerms();
    
    setTimeout(async () => {
      try {
        const items = await Inventory.find({});
        if (items.length > 0) {
          let fixedCount = 0;
          for (const item of items) {
            const alc = item.allocatedQty || 0;
            const isu = item.issuedQty || 0;
            const live = item.liveStock || 0;
            const targetAvail = Math.max(0, live - alc);
            const targetTotal = live + isu;
            
            if (item.availableQty !== targetAvail || item.totalQty !== targetTotal) {
              item.availableQty = targetAvail;
              item.totalQty = targetTotal;
              await item.save();
              fixedCount++;
            }
          }
          if (fixedCount > 0) {
            console.log(`[Migration] Fixed ${fixedCount} out-of-sync inventory items.`);
          }
          console.log("[Migration] Inventory sync check complete.");
        }
      } catch (err) {
        console.error("[Migration] Error during stock sync:", err);
      }
    }, 5000);
  } catch (err) {
    console.error("[Migration] Outer error:", err);
  }
})();

// Custom Quotation update to handle MR approval
router.put('/quotations/:id', authenticate, async (req: any, res) => {
  try {
    const data = { ...req.body };
    const oldQuote = await Quotation.findOne({ id: req.params.id });
    const quote = await Quotation.findOneAndUpdate({ id: req.params.id }, data, { new: true });
    
    if (!quote) return res.status(404).json({ success: false, message: 'Quotation not found' });

    broadcast({ type: 'DATA_UPDATED', path: 'quotations' });
    
    if (oldQuote && oldQuote.status !== quote.status) {
      await createNotification({
        message: `QUOTATION ${quote.id} status changed to ${quote.status} by ${req.user.name}`,
        severity: quote.status === 'Approved' ? 'success' : 'info',
        path: 'quotations',
        senderId: req.user._id
      });

      // If quotation is approved, automatically approve the MR
      if (quote.status === "Approved" && quote.mrId) {
        await MaterialRequirement.findOneAndUpdate(
          { id: quote.mrId },
          { status: "Approved by AGM", approvedQuotationId: quote.id, approvedSupplier: quote.supplierName }
        );
        broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
        await createNotification({
          message: `MR ${quote.mrId} approved by AGM as Quotation ${quote.id} was selected`,
          severity: "success",
          path: "material-requirements",
        });
      }

      // If quotation was Approved but now is Rejected or Pending, reset MR
      if (oldQuote?.status === "Approved" && quote.status !== "Approved" && quote.mrId) {
        const mr = await MaterialRequirement.findOne({ id: quote.mrId });
        if (mr && mr.approvedQuotationId === quote.id) {
          await MaterialRequirement.findOneAndUpdate(
            { id: quote.mrId },
            { status: "Store Pending", $unset: { approvedQuotationId: "", approvedSupplier: "" } }
          );
          broadcast({ type: "DATA_UPDATED", path: "material-requirements" });
          await createNotification({
            message: `MR ${quote.mrId} reset to Pending because approved Quotation ${quote.id} was ${quote.status}`,
            severity: "warning",
            path: "material-requirements",
          });
        }
      }
    }

    // n8n
    await triggerN8nWebhook('QUOTATION_UPDATE', {
      quotationId: quote.id,
      mrId: quote.mrId,
      supplierName: quote.supplierName,
      previousStatus: oldQuote?.status,
      newStatus: quote.status,
      updatedBy: req.user.name,
    });

    res.json({ success: true, data: quote });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

createCrudRoutes('quotations', Quotation, 'quotations', 'id', undefined, 'QUOTATION');

// --- User Management Routes ---
router.get('/users', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const users = await User.find().select('-password');
    res.json({ success: true, data: users });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/users', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { password, ...rest } = req.body;
    const userCount = await User.countDocuments();
    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      ...rest, 
      password: hashedPassword,
      role: userCount === 0 ? 'Super Admin' : (rest.role || 'staff')
    });
    broadcast({ type: 'DATA_UPDATED', path: 'users' });

    await triggerN8nWebhook('USER_CREATE', {
      userId: user._id.toString(),
      name: user.name,
      email: user.email,
      role: user.role,
      createdBy: req.user.name,
    });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.patch('/users/:id', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { password, ...rest } = req.body;
    let updateData = { ...rest };
    if (password) {
      updateData.password = await bcrypt.hash(password, 10);
    }
    const user = await User.findByIdAndUpdate(req.params.id, updateData, { new: true }).select('-password');
    broadcast({ type: 'DATA_UPDATED', path: 'users' });

    await triggerN8nWebhook('USER_UPDATE', {
      userId: req.params.id,
      name: user?.name,
      email: user?.email,
      role: user?.role,
      updatedBy: req.user.name,
      changedFields: Object.keys(rest),
    });

    res.json({ success: true, data: user });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/users/:id', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'MANAGE_USERS'))) {
    console.warn(`[AUTH] User ${req.user.email} attempted to delete user without MANAGE_USERS permission`);
    return res.status(403).json({ success: false, message: 'Forbidden: You do not have MANAGE_USERS permission' });
  }

  const { id } = req.params;
  if (!id || id === 'undefined') {
    return res.status(400).json({ success: false, message: 'Invalid User ID' });
  }

  // Prevent self-deletion if you want, but for now just log it
  if (req.user._id.toString() === id) {
    console.log(`[USER] User ${req.user.email} is deleting their own account`);
  }

  try {
    console.log(`[USER] Attempting delete for ID: ${id} by ${req.user.email}`);
    // Determine if we should query by ObjectId casting or direct string
    const query = mongoose.Types.ObjectId.isValid(id) ? { _id: id } : { _id: id };
    
    const userToDelete = await User.findOne(query).select('-password');
    if (!userToDelete) {
      console.log(`[USER] Delete failed: User ${id} not found in database`);
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    await User.deleteOne({ _id: id });
    console.log(`[USER] Deleted user: ${userToDelete.email} (ID: ${id}) by ${req.user.email}`);
    broadcast({ type: 'DATA_UPDATED', path: 'users' });

    // Non-blocking webhook call
    triggerN8nWebhook('USER_DELETE', {
      userId: id,
      name: userToDelete.name,
      email: userToDelete.email,
      role: userToDelete.role,
      deletedBy: req.user.name,
    }).catch(err => console.error('[WEBHOOK] USER_DELETE failed:', err));

    res.json({ success: true });
  } catch (error: any) {
    console.error(`[ERROR] Failed to delete user ${id}:`, error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// --- Audit Logs Route ---
router.get('/audit-logs', authenticate, async (req: any, res) => {
  if (!(await serverHasPermission(req.user, 'VIEW_AUDIT_LOGS'))) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  try {
    const { search } = req.query;
    let query: any = {};
    if (search) {
      const searchRegex = new RegExp(search as string, 'i');
      query.$or = [
        { userName: searchRegex },
        { userEmail: searchRegex },
        { action: searchRegex },
        { resource: searchRegex }
      ];
    }
    const logs = await AuditLog.find(query).sort({ createdAt: -1 }).limit(10000);
    res.json({ success: true, data: logs });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- GRN Routes ---
router.get('/grn', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10000;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const filterStr = req.query.filter as string;
    
    let query: any = {};
    
    // Date filtering
    let parsedFilter: any = {};
    if (typeof filterStr === 'string') {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {}
    } else if (filterStr && typeof filterStr === 'object') {
      parsedFilter = filterStr;
    }

    const startDate = (req.query.startDate as string) || parsedFilter?.startDate;
    const endDate = (req.query.endDate as string) || parsedFilter?.endDate;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { id: searchRegex },
        { poId: searchRegex },
        { supplier: searchRegex },
        { vendor: searchRegex },
        { project: searchRegex },
        { challan: searchRegex },
        { mrNo: searchRegex }
      ];
    }
    
    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
    }

    const [items, total] = await Promise.all([
      GRN.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit),
      GRN.countDocuments(query)
    ]);

    res.json({ 
      success: true, 
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    console.error("Error fetching grn:", error);
    res.status(500).json({ success: false, message: error.message });
  }
});

// Custom GRN POST route
router.post('/grn', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const grnData = {
      ...rawGrnData,
      items: (rawGrnData.items || []).map((item: any) => ({
        ...item,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      }))
    };
    
    if (!grnData.id) {
      const lastGRN = await GRN.findOne().sort({ createdAt: -1 });
      let nextId = 1;
      if (lastGRN) {
        const parts = lastGRN.id.split('-');
        nextId = parseInt(parts[parts.length - 1] || '0') + 1;
      }
      grnData.id = `GRN-${String(nextId).padStart(4, '0')}`;
    }

    const grn = await GRN.create([grnData], { session });

    const inwardRecord = {
      id: `INW-${grnData.id}`,
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      type: 'GRN',
      grnRef: grnData.id,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: grnData.items.map((item: any) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || 'Unit',
        condition: item.condition
      }))
    };

    for (const item of grnData.items) {
      const invItem = await Inventory.findOne({ sku: item.sku }).session(session);
      if (invItem) {
        invItem.liveStock = (invItem.liveStock || 0) + item.received;
        invItem.lastProject = grnData.project;
        await invItem.save({ session });
      } else {
        await Inventory.create([{
          sku: item.sku,
          itemName: item.itemName,
          category: "General",
          subCategory: "General",
          unit: item.unit || "NOS",
          liveStock: item.received,
          lastProject: grnData.project
        }], { session });
      }
    }

    await Inward.create([inwardRecord], { session });

    const firstItem = grnData.items[0];
    const transactionData = {
      id: `TRX-${grnData.id}`,
      type: 'Inward',
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
      sku: firstItem?.sku || '',
      itemName: firstItem?.itemName || '',
      qty: grnData.items.reduce((sum: number, i: any) => sum + (i.received || 0), 0),
      unit: firstItem?.unit || 'Unit',
      items: grnData.items.map((item: any) => ({
        sku: item.sku,
        itemName: item.itemName,
        qty: item.received,
        unit: item.unit || 'Unit',
        images: item.images || [],
        materialPhotoUrl: item.images?.[0] || "",
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      linkId: grnData.id,
      createdBy: req.user.name,
    };
    await Transaction.create([transactionData], { session });

    if (grnData.poId) {
      const po = await PurchaseOrder.findOne({ id: grnData.poId }).session(session);
      if (po) {
        const allGrns = await GRN.find({ poId: grnData.poId }).session(session);
        
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = allGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          
          if (totalReceived < poItem.qty) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > poItem.qty) {
            anyVariance = true;
          }
        }

        const newStatus = allFulfilled ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({ session });
        }

        if (allFulfilled) {
          // Notify Accounts for Payment
          const accountRoles = await getRolesWithPermission('REVIEW_PO_BILL');
          await createNotification({
            message: `PO ${po.id} is now GRN Fulfilled. Ready for account verification and payment.`,
            severity: 'info',
            path: 'pos',
            senderId: req.user._id,
            targetRoles: accountRoles.length ? accountRoles : ["Accountant", "Finance Manager", "Super Admin"]
          });
        }

        await createNotification({
          message: `GRN ${grn[0].id} created. PO ${grnData.poId} status: ${newStatus}`,
          severity: allFulfilled ? 'success' : 'warning',
          path: 'grn',
          senderId: req.user._id
        });

        await triggerN8nWebhook('PO_APPROVAL', { 
          poId: grnData.poId, newStatus, grnId: grn[0].id, changedBy: req.user.name 
        });
      }
    } else {
      await createNotification({
        message: `New GRN ${grn[0].id} created`,
        severity: 'success',
        path: 'grn',
        senderId: req.user._id
      });
    }

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'pos' });

    await triggerN8nWebhook('GRN', { 
      grnId: grn[0].id, 
      poId: grnData.poId, 
      vendor: grnData.supplier || grnData.vendor, 
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project, 
      items: grnData.items, 
      createdBy: req.user.name 
    });
    await checkAndFireLowStockWebhook(grnData.items.map((i: any) => i.sku));

    res.json({ success: true, data: grn[0] });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// GRN Update
router.put('/grn/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const rawGrnData = req.body;
    const oldGRN = await GRN.findOne({ id: req.params.id }).session(session);
    if (!oldGRN) throw new Error("GRN not found");
    
    const { _id, __v, createdAt, updatedAt, id: bodyId, ...grnData } = rawGrnData;

    const sanitizedItems = (rawGrnData.items || []).map((item: any) => {
      const { _id: itemId, ...itemWithoutId } = item;
      return {
        ...itemWithoutId,
        itemName: item.itemName || "Unknown Item",
        unit: item.unit || "NOS"
      };
    });
    grnData.items = sanitizedItems;

    // 1. Revert old stock
    for (const item of oldGRN.items) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({ session });
      }
    }

    // 2. Apply new stock
    for (const item of sanitizedItems) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = (inv.liveStock || 0) + (item.received || 0);
        inv.lastProject = grnData.project || oldGRN.project;
        await inv.save({ session });
      }
    }

    // 3. Update GRN
    const grn = await GRN.findOneAndUpdate({ id: req.params.id }, grnData, { new: true, session });
    
    // 4. Update linked Inwards
    await Inward.findOneAndUpdate({ grnRef: req.params.id }, {
      date: grnData.date,
      challanNo: grnData.challan,
      mrNo: grnData.mrNo,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
      items: sanitizedItems.map((item: any) => ({
        sku: item.sku, itemName: item.itemName,
        qty: item.received, unit: item.unit, condition: item.condition
      }))
    }, { session });

    // 5. Update Transaction
    await Transaction.findOneAndUpdate({ linkId: req.params.id }, {
      date: grnData.date,
      project: grnData.project,
      supplier: grnData.supplier || grnData.vendor,
      items: sanitizedItems.map((item: any) => ({
        sku: item.sku, itemName: item.itemName, qty: item.received, unit: item.unit,
      })),
      materialPhotoUrl: grnData.materialImageUrl,
      challanPhotoUrl: grnData.challanImageUrl,
    }, { session });

    // 6. Update PO Status
    const poId = grnData.poId || oldGRN.poId;
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId }).session(session);
      if (po) {
        const allGrns = await GRN.find({ poId }).session(session);
        const updatedGrnsList = allGrns.map(g => g.id === req.params.id ? grn : g);
        
        let allFulfilled = true;
        let anyVariance = false;
        for (const poItem of po.items) {
          const totalReceived = updatedGrnsList.reduce((sum, g) => {
            const grnItem = g?.items?.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < poItem.qty) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > poItem.qty) {
            anyVariance = true;
          }
        }

        const newStatus = allFulfilled ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');
        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({ session });
          broadcast({ type: 'DATA_UPDATED', path: 'pos' });
        }
      }
    }

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    // n8n
    await triggerN8nWebhook('GRN_UPDATE', {
      grnId: req.params.id,
      poId: grnData.poId || oldGRN.poId,
      supplier: grnData.supplier || grnData.vendor,
      project: grnData.project,
      items: sanitizedItems,
      updatedBy: req.user.name,
    });
    await checkAndFireLowStockWebhook(sanitizedItems.map((i: any) => i.sku));

    res.json({ success: true, data: grn });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// GRN Delete
router.delete('/grn/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const grn = await GRN.findOne({ id: req.params.id }).session(session);
    if (!grn) throw new Error("GRN not found");
    
    const poId = grn.poId;

    // 1. Revert stock
    for (const item of grn.items) {
      const inv = await Inventory.findOne({ sku: item.sku }).session(session);
      if (inv) {
        inv.liveStock = Math.max(0, (inv.liveStock || 0) - (item.received || 0));
        await inv.save({ session });
      }
    }

    // 2. Delete linked records
    await GRN.findOneAndDelete({ id: req.params.id }).session(session);
    await Inward.deleteMany({ grnRef: req.params.id }).session(session);
    await Transaction.deleteMany({ linkId: req.params.id }).session(session);

    // 3. Update PO status
    if (poId) {
      const po = await PurchaseOrder.findOne({ id: poId }).session(session);
      if (po) {
        const remainingGrns = await GRN.find({ poId }).session(session);
        
        let allFulfilled = true;
        let anyVariance = false;
        let hasAnyReceipt = remainingGrns.length > 0;
        
        for (const poItem of po.items) {
          const totalReceived = remainingGrns.reduce((sum, g) => {
            const grnItem = g.items.find((i: any) => i.sku === poItem.sku);
            return sum + (grnItem?.received || 0);
          }, 0);
          if (totalReceived < poItem.qty) {
            allFulfilled = false;
            if (totalReceived > 0) anyVariance = true;
          } else if (totalReceived > poItem.qty) {
            anyVariance = true;
          }
        }

        let newStatus = allFulfilled && hasAnyReceipt ? 'GRN Fulfilled' : (anyVariance ? 'GRN Variance' : 'GRN Pending');

        if (po.status !== newStatus) {
          po.status = newStatus;
          await po.save({ session });
          broadcast({ type: 'DATA_UPDATED', path: 'pos' });
        }
      }
    }

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'grn' });
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    // n8n
    await triggerN8nWebhook('GRN_DELETE', {
      grnId: req.params.id,
      poId,
      deletedBy: req.user.name,
      itemSkus: grn.items.map((i: any) => i.sku),
    });

    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// --- Stock Update Helper ---
async function updateStock(
  type: string, sku: string, itemName: string, qty: number,
  unit: string, category: string, session?: any
) {
  let isPositive = false;
  let isNegative = false;

  if (["Inward", "Outward Return", "Public Inward", "Public Outward Return", "Public Transfer Inward", "Transfer Inward", "GRN"].includes(type)) {
    isPositive = true;
  } else if (["Outward", "Inward Return", "Public Outward", "Public Inward Return", "Public Transfer Outward", "Transfer Outward"].includes(type)) {
    isNegative = true;
  }

  if (isPositive || isNegative) {
    const inv = session
      ? await Inventory.findOne({ sku }).session(session)
      : await Inventory.findOne({ sku });

    if (inv) {
      if (isPositive) {
        // Operation 3 / Inward: available increases
        inv.totalQty = (inv.totalQty || 0) + qty;
        inv.availableQty = (inv.availableQty || 0) + qty;
      } else {
        // Manual Outward logic: deduct from available if not otherwise specified
        // (The /outward route will handle MR-linked deductions directly)
        inv.totalQty = (inv.totalQty || 0) - qty;
        inv.availableQty = (inv.availableQty || 0) - qty;
      }
      inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
      await inv.save(session ? { session } : undefined);
    } else if (isPositive) {
      await Inventory.create(
        [{ 
          sku, itemName, 
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
        session ? { session } : undefined
      );
    }
  }
}

// --- Inward Routes ---
router.post('/inward', authenticate, async (req: any, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items)) throw new Error("Items array required");

    const data = { ...body, type: body.type || "Manual" };
    const inward = await Inward.create(data);

    for (const item of body.items) {
      await updateStock(
        data.type === "Transfer" ? "Transfer Inward" : "Inward",
        item.sku, item.itemName, item.qty, item.unit, body.category
      );
    }

    await Transaction.create({
      ...data,
      type: data.type === "Transfer" ? "Transfer Inward" : (data.type || "Inward")
    });

    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await createNotification({
      message: `New Inward transaction ${data.id} created by ${req.user.name}`,
      severity: 'success',
      path: 'inward',
      senderId: req.user._id
    });

    await triggerN8nWebhook('INWARD', { transactionId: data.id, ...data });
    await checkAndFireLowStockWebhook(body.items.map((i: any) => i.sku));

    res.json({ success: true, data: inward });
  } catch (error: any) {
    console.log("ERROR:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.put('/inward/:id', authenticate, async (req: any, res) => {
  try {
    const oldItem = await Inward.findOne({ id: req.params.id });
    if (!oldItem) throw new Error("Item not found");

    const newData = { ...req.body };
    delete newData._id;

    // Revert old stock
    for (const item of oldItem.items) {
      await updateStock("Inward", item.sku, item.itemName, -item.qty, item.unit, oldItem.category);
    }
    // Apply new stock
    for (const item of newData.items) {
      await updateStock("Inward", item.sku, item.itemName, item.qty, item.unit, newData.category);
    }

    const updated = await Inward.findOneAndUpdate({ id: req.params.id }, newData, { new: true });
    await Transaction.findOneAndUpdate(
      { id: req.params.id },
      { ...newData, type: newData.type === "Transfer" ? "Transfer Inward" : (newData.type || "Inward") }
    );

    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await triggerN8nWebhook('INWARD_UPDATE', {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: newData.items,
      project: newData.project,
    });
    await checkAndFireLowStockWebhook(newData.items.map((i: any) => i.sku));

    res.json({ success: true, data: updated });
  } catch (error: any) {
    console.log("UPDATE ERROR:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/inward/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const item = await Inward.findOne({ id: req.params.id }).session(session);
    if (item) {
      for (const it of item.items) {
        await updateStock("Inward", it.sku, it.itemName, -it.qty, it.unit, item.category || "General", session);
      }
      await Inward.findOneAndDelete({ id: req.params.id }).session(session);
      await Transaction.findOneAndDelete({ id: req.params.id }).session(session);

      await createNotification({
        message: `Inward transaction ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: 'inward',
        senderId: req.user._id
      });

      await triggerN8nWebhook('INWARD_DELETE', {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i: any) => i.sku),
      });
    }
    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'inward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// --- Outward Routes ---
router.post('/outward', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items)) throw new Error("Items array required");

    const data = { 
      ...body, 
      status: "Confirmed", 
      type: body.type || (body.mrId ? "MR-Outward" : "Manual") 
    };
    const outward = await Outward.create([data], { session });

    for (const item of body.items) {
      if (body.mrId) {
        // OPERATION 2: Outward from Allocation
        // Find allocation record
        let allocation = await MRAllocation.findOne({ 
          mrId: body.mrId, 
          sku: item.sku
        }).session(session);

        const mr = await MaterialRequirement.findOne({ id: body.mrId }).session(session);
        if (!mr) throw new Error("Material Requirement not found");
        
        const mrItem = mr.items.find((i: any) => i.sku === item.sku);
        if (!mrItem) throw new Error(`Item ${item.sku} not found in MR ${body.mrId}`);

        // Check if total issued would exceed requested
        const totalAfterThis = (mrItem.issuedQty || 0) + item.qty;
        if (totalAfterThis > mrItem.qty) {
          throw new Error(`Cannot issue ${item.qty} for ${item.itemName}. Total issued (${totalAfterThis}) would exceed requested quantity (${mrItem.qty}).`);
        }

        const inv = await Inventory.findOne({ sku: item.sku }).session(session);
        if (!inv) throw new Error(`Inventory item not found for ${item.sku}`);

        // Logic: 
        // 1. Use allocated qty first if available
        // 2. Use available qty for the rest
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

        // STEP 2 ΓÇö Update MR Allocation if exists
        if (allocation) {
          allocation.issuedQty = (allocation.issuedQty || 0) + fromAllocation;
          allocation.remainingQty = (allocation.remainingQty || 0) - fromAllocation;
          if (allocation.remainingQty === 0) allocation.status = "Closed";
          else allocation.status = "Partially Issued";
          await allocation.save({ session });
        }

        // STEP 3 ΓÇö Update mr_items
        mrItem.issuedQty = (mrItem.issuedQty || 0) + item.qty;
        if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
        else mrItem.status = "Partial";
        
        // Update overall MR status
        const allItems = mr.items || [];
        const allClosed = allItems.length > 0 && allItems.every((i: any) => i.issuedQty >= i.qty);
        mr.status = allClosed ? 'Closed' : 'Partially Issued';
        await mr.save({ session });

        // STEP 4 ΓÇö Update inventory
        // Always deduct from liveStock (physical)
        // Deduct from allocatedQty and availableQty appropriately
        inv.liveStock = (inv.liveStock || 0) - item.qty;
        inv.allocatedQty = (inv.allocatedQty || 0) - fromAllocation;
        inv.issuedQty = (inv.issuedQty || 0) + item.qty;
        // inv.availableQty and inv.totalQty will be synced by the pre-save hook
        await inv.save({ session });
      } else {
        // Fallback to manual outward logic
        await updateStock(
          data.type === "Transfer" ? "Transfer Outward" : "Outward",
          item.sku, item.itemName, item.qty, item.unit, body.category || "General", session
        );
      }
    }

    await Transaction.create([{
      ...data,
      type: data.type === "Transfer" ? "Transfer Outward" : (data.type || "Outward")
    }], { session });

    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });

    await createNotification({
      message: `New Outward transaction ${data.id} ${body.mrId ? `linked to MR ${body.mrId}` : ""} created by ${req.user.name}`,
      severity: 'info',
      path: 'outward',
      senderId: req.user._id
    });

    await triggerN8nWebhook('OUTWARD', { transactionId: data.id, ...data });
    await checkAndFireLowStockWebhook(body.items.map((i: any) => i.sku));

    res.json({ success: true, data: outward[0] });
  } catch (error: any) {
    await session.abortTransaction();
    console.error("Outward Error:", error);
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.put('/outward/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const oldItem = await Outward.findOne({ id: req.params.id }).session(session);
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    
    for (const it of oldItem.items) {
      await updateStock("Outward", it.sku, it.itemName, -it.qty, it.unit, oldItem.category || "General", session);
    }
    for (const it of data.items) {
      await updateStock("Outward", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }

    const item = await Outward.findOneAndUpdate({ id: req.params.id }, data, { new: true, session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, {
      ...data,
      type: data.type === "Transfer" ? "Transfer Outward" : (data.type || "Outward")
    }, { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await triggerN8nWebhook('OUTWARD_UPDATE', {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project,
    });
    await checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku));

    res.json({ success: true, data: item });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.delete('/outward/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const item = await Outward.findOne({ id: req.params.id }).session(session);
    if (item) {
      const effectiveMrId = (item as any).mrId || (item as any).mrNo;
      for (const it of item.items) {
        const inv = await Inventory.findOne({ sku: it.sku }).session(session);
        if (inv) {
          let fromAllocation = 0;
          if (effectiveMrId) {
            // Priority: First rollback MR Allocation records to see how much was issued from which allocation
            const allocations = await MRAllocation.find({ mrId: effectiveMrId, sku: it.sku }).session(session);
            let remainingToReturn = it.qty;
            for (const allocation of allocations) {
              if (remainingToReturn <= 0) break;
              const fromThisAlloc = Math.min(remainingToReturn, allocation.issuedQty || 0);
              allocation.issuedQty = Math.max(0, (allocation.issuedQty || 0) - fromThisAlloc);
              allocation.remainingQty = (allocation.remainingQty || 0) + fromThisAlloc;
              allocation.status = (allocation.issuedQty || 0) === 0 ? "Allocated" : "Partially Issued";
              await allocation.save({ session });
              fromAllocation += fromThisAlloc;
              remainingToReturn -= fromThisAlloc;
            }

            // Then rollback Material Requirement counts
            const mr = await MaterialRequirement.findOne({ id: effectiveMrId }).session(session);
            if (mr) {
              const mrItem = mr.items.find((mi: any) => (mi.sku || "").toLowerCase() === (it.sku || "").toLowerCase());
              if (mrItem) {
                mrItem.issuedQty = Math.max(0, (mrItem.issuedQty || 0) - it.qty);
                // Restore allocated quantity in MR item
                mrItem.allocatedQty = (mrItem.allocatedQty || 0) + fromAllocation;
                
                // Correctly determine item status based on remaining quantities
                const totalFulfilled = (mrItem.issuedQty || 0) + (mrItem.allocatedQty || 0);
                if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
                else if (totalFulfilled >= mrItem.qty) mrItem.status = "Allocated";
                else if (totalFulfilled > 0) mrItem.status = "Partial";
                else mrItem.status = "In Stock";
              }
              // Update overall MR status accurately
              const allIssued = mr.items.length > 0 && mr.items.every((mi: any) => (mi.issuedQty || 0) >= mi.qty);
              const someIssued = mr.items.some((mi: any) => (mi.issuedQty || 0) > 0);
              const allAllocated = mr.items.every((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) >= mi.qty);
              const someAllocated = mr.items.some((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) > 0);
              
              if (allIssued) mr.status = 'Closed';
              else if (someIssued) mr.status = 'Partially Issued';
              else if (allAllocated) mr.status = 'Allocated';
              else if (someAllocated) mr.status = 'Partially Allocated';
              else mr.status = 'Approved'; 
              
              await mr.save({ session });
            }
          }

          // Finally rollback Inventory levels
          inv.liveStock = (inv.liveStock || 0) + it.qty;
          inv.issuedQty = Math.max(0, (inv.issuedQty || 0) - it.qty);
          // Restore allocatedQty reserve in inventory
          inv.allocatedQty = (inv.allocatedQty || 0) + fromAllocation;
          
          await inv.save({ session });
        } else {
          // Fallback if inventory record is missing
          await updateStock("Outward", it.sku, it.itemName, -it.qty, it.unit, item.category || "General", session);
        }
      }
      await Outward.findOneAndDelete({ id: req.params.id }).session(session);
      await Transaction.findOneAndDelete({ id: req.params.id }).session(session);

      await createNotification({
        message: `Outward transaction ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: 'outward',
        senderId: req.user._id
      });

      await triggerN8nWebhook('OUTWARD_DELETE', {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i: any) => i.sku),
      });
    }
    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });
    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// --- Inward Returns Routes ---
router.post('/inward-returns', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const data = req.body;
    if (!data.items || !Array.isArray(data.items)) throw new Error("Items array required");

    const item = await InwardReturn.create([data], { session });

    for (const it of data.items) {
      await updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }

    await Transaction.create([{ ...data, type: "Inward Return" }], { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'inward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await createNotification({
      message: `New Inward Return ${data.id} created by ${req.user.name}`,
      severity: 'warning',
      path: 'inward-returns',
      senderId: req.user._id
    });

    await triggerN8nWebhook('INWARD_RETURN', {
      transactionId: data.id,
      createdBy: req.user.name,
      items: data.items,
      project: data.project,
    });
    await checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku));

    res.json({ success: true, data: item[0] });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.put('/inward-returns/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const oldItem = await InwardReturn.findOne({ id: req.params.id }).session(session);
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    
    for (const it of oldItem.items) {
      await updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
    }
    for (const it of data.items) {
      await updateStock("Inward Return", it.sku, it.itemName, it.qty, it.unit, "General", session);
    }

    const item = await InwardReturn.findOneAndUpdate({ id: req.params.id }, data, { new: true, session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, { ...data, type: "Inward Return" }, { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'inward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await triggerN8nWebhook('INWARD_RETURN_UPDATE', {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project,
    });
    await checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku));

    res.json({ success: true, data: item });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.delete('/inward-returns/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const item = await InwardReturn.findOne({ id: req.params.id }).session(session);
    if (item) {
      for (const it of item.items) {
        await updateStock("Inward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
      }
      await InwardReturn.findOneAndDelete({ id: req.params.id }).session(session);
      await Transaction.findOneAndDelete({ id: req.params.id }).session(session);

      await createNotification({
        message: `Inward Return ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: 'inward-returns',
        senderId: req.user._id
      });

      await triggerN8nWebhook('INWARD_RETURN_DELETE', {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i: any) => i.sku),
      });
    }
    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'inward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// --- Outward Returns Routes ---
router.post('/outward-returns', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const data = req.body;
    if (!data.items || !Array.isArray(data.items)) throw new Error("Items array required");

    const item = await OutwardReturn.create([data], { session });

    for (const it of data.items) {
      await updateStock("Outward Return", it.sku, it.itemName, it.qty, it.unit, data.category || "General", session);
    }

    await Transaction.create([{ ...data, type: "Outward Return" }], { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'outward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await createNotification({
      message: `New Outward Return ${data.id} created by ${req.user.name}`,
      severity: 'info',
      path: 'outward-returns',
      senderId: req.user._id
    });

    await triggerN8nWebhook('OUTWARD_RETURN', {
      transactionId: data.id,
      createdBy: req.user.name,
      items: data.items,
      project: data.project,
    });
    await checkAndFireLowStockWebhook(data.items.map((i: any) => i.sku));

    res.json({ success: true, data: item[0] });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.put('/outward-returns/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const oldItem = await OutwardReturn.findOne({ id: req.params.id }).session(session);
    if (!oldItem) throw new Error("Item not found");
    const data = req.body;
    // User requested: "edit krne pr bhi inventory m changes nhi honge"
    const item = await OutwardReturn.findOneAndUpdate({ id: req.params.id }, data, { new: true, session });
    await Transaction.findOneAndUpdate({ id: req.params.id }, { ...data, type: "Outward Return" }, { session });
    await session.commitTransaction();

    broadcast({ type: 'DATA_UPDATED', path: 'outward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });

    await triggerN8nWebhook('OUTWARD_RETURN_UPDATE', {
      transactionId: req.params.id,
      updatedBy: req.user.name,
      items: data.items,
      project: data.project,
    });

    res.json({ success: true, data: item });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.delete('/outward-returns/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const item = await OutwardReturn.findOne({ id: req.params.id }).session(session);
    if (item) {
      // User requested: "delete krne pr wapas se inventory m add ho jyega"
      for (const it of item.items) {
        await updateStock("Outward Return", it.sku, it.itemName, -it.qty, it.unit, "General", session);
      }
      await OutwardReturn.findOneAndDelete({ id: req.params.id }).session(session);
      await Transaction.findOneAndDelete({ id: req.params.id }).session(session);

      await createNotification({
        message: `Outward Return ${req.params.id} was deleted by ${req.user.name}`,
        severity: 'warning',
        path: 'outward-returns',
        senderId: req.user._id
      });

      await triggerN8nWebhook('OUTWARD_RETURN_DELETE', {
        transactionId: req.params.id,
        deletedBy: req.user.name,
        itemSkus: item.items.map((i: any) => i.sku),
      });
    }
    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'outward-returns' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    res.json({ success: true });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

createCrudRoutes('inward',          Inward,        'inward',          'id', undefined, 'INWARD');
createCrudRoutes('outward',         Outward,       'outward',         'id', undefined, 'OUTWARD');
createCrudRoutes('inward-returns',  InwardReturn,  'inward-returns',  'id', undefined, 'INWARD_RETURN');
createCrudRoutes('outward-returns', OutwardReturn, 'outward-returns', 'id', undefined, 'OUTWARD_RETURN');

// --- Transactions Route ---
router.get('/transactions', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 10000;
    const skip = (page - 1) * limit;
    const search = req.query.search as string;
    const filterStr = req.query.filter as string;

    let query: any = {};
    
    // Date filtering
    let parsedFilter: any = {};
    if (typeof filterStr === 'string') {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {}
    } else if (filterStr && typeof filterStr === 'object') {
      parsedFilter = filterStr;
    }

    const startDate = (req.query.startDate as string) || parsedFilter?.startDate;
    const endDate = (req.query.endDate as string) || parsedFilter?.endDate;
    if (startDate || endDate) {
      query.date = {};
      if (startDate) {
        query.date.$gte = startDate;
      }
      if (endDate) {
        query.date.$lte = (typeof endDate === 'string' && endDate.length === 10) ? `${endDate}T23:59:59.999Z` : endDate;
      }
    }

    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { id: searchRegex },
        { date: searchRegex },
        { project: searchRegex },
        { supplier: searchRegex },
        { handoverTo: searchRegex },
        { 'items.itemName': searchRegex },
        { 'items.sku': searchRegex }
      ];
    }

    if (filterStr) {
      try {
        const filter = JSON.parse(filterStr);
        query = { ...query, ...filter };
      } catch (e) {}
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
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/transactions', authenticate, async (req: any, res) => {
  const session = await Transaction.startSession();
  session.startTransaction();
  try {
    const transactionData = { ...req.body };
    
    if (transactionData.condition && typeof transactionData.condition === 'string') {
      transactionData.condition = transactionData.condition.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    }
    
    if (transactionData.items && Array.isArray(transactionData.items)) {
      transactionData.items = transactionData.items.map((item: any) => {
        if (item.condition && typeof item.condition === 'string') {
          return { ...item, condition: item.condition.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()) };
        }
        return item;
      });
    }
    
    for (const item of transactionData.items) {
      const invItem = await Inventory.findOne({ sku: item.sku }).session(session);
      if (!invItem) throw new Error(`Item with SKU ${item.sku} not found in inventory`);

      let stockChange = 0;
      if (['Inward', 'Public Inward', 'Outward Return', 'Transfer Inward'].includes(transactionData.type)) {
        stockChange = item.qty;
      } else if (['Outward', 'Public Outward', 'Inward Return', 'Transfer Outward'].includes(transactionData.type)) {
        if (transactionData.type.includes('Outward') || transactionData.type === 'Inward Return' || transactionData.type === 'Transfer Outward') {
          if (invItem.liveStock < item.qty) {
            throw new Error(`Insufficient stock for ${invItem.itemName} (SKU: ${item.sku}). Available: ${invItem.liveStock}, Requested: ${item.qty}`);
          }
        }
        stockChange = -item.qty;
      }

      invItem.liveStock += stockChange;
      if (transactionData.project) invItem.lastProject = transactionData.project;
      await invItem.save({ session });
    }

    const transaction = await Transaction.create([transactionData], { session });
    await session.commitTransaction();
    
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });

    // Fire appropriate webhook based on transaction type
    const txType = (transactionData.type || '').toLowerCase();
    if (txType.includes('inward') && !txType.includes('return')) {
      await triggerN8nWebhook('INWARD', { transactionId: transactionData.id, ...transactionData });
    } else if (txType.includes('outward') && !txType.includes('return')) {
      await triggerN8nWebhook('OUTWARD', { transactionId: transactionData.id, ...transactionData });
    } else if (txType.includes('return')) {
      const evt = txType.includes('inward') ? 'INWARD_RETURN' : 'OUTWARD_RETURN';
      await triggerN8nWebhook(evt, { transactionId: transactionData.id, ...transactionData });
    }
    await checkAndFireLowStockWebhook(transactionData.items.map((i: any) => i.sku));
    
    res.json({ success: true, data: transaction[0] });
  } catch (error: any) {
    await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

router.delete('/transactions/:id', authenticate, async (req: any, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const tx = await Transaction.findOne({ id: req.params.id }).session(session);
    if (!tx) throw new Error("Transaction not found");

    // ROLLBACK Logic if this is an Outward transaction to revert MR and Stock
    const isOutward = ["Outward", "Transfer Outward", "Manual", "MR-Outward", "Public Outward", "Public Transfer Outward"].includes(tx.type) || 
                     tx.id.startsWith("OUT") || 
                     tx.type.toLowerCase().includes("outward");
    
    if (isOutward) {
      for (const it of tx.items || []) {
        if (!it.sku) continue;

        let fromAllocationTotal = 0;

        // Rollback MR item issued quantity
        const effectiveMrId = tx.mrId || (tx as any).mrNo;
        if (effectiveMrId) {
          // Priority: Rollback MR Allocation records first
          const allocations = await MRAllocation.find({ mrId: effectiveMrId, sku: it.sku }).session(session);
          let remainingToReturn = it.qty;
          for (const allocation of allocations) {
            if (remainingToReturn <= 0) break;
            const fromThisAlloc = Math.min(remainingToReturn, allocation.issuedQty || 0);
            allocation.issuedQty = Math.max(0, (allocation.issuedQty || 0) - fromThisAlloc);
            allocation.remainingQty = (allocation.remainingQty || 0) + fromThisAlloc;
            allocation.status = (allocation.issuedQty || 0) === 0 ? "Allocated" : "Partially Issued";
            await allocation.save({ session });
            fromAllocationTotal += fromThisAlloc;
            remainingToReturn -= fromThisAlloc;
          }

          const mr = await MaterialRequirement.findOne({ id: effectiveMrId }).session(session);
          if (mr) {
            const mrItem = mr.items.find((mi: any) => (mi.sku || "").toLowerCase() === (it.sku || "").toLowerCase());
            if (mrItem) {
              mrItem.issuedQty = Math.max(0, (mrItem.issuedQty || 0) - it.qty);
              // Restore allocated quantity in MR item
              mrItem.allocatedQty = (mrItem.allocatedQty || 0) + fromAllocationTotal;
              
              const totalFulfilled = (mrItem.issuedQty || 0) + (mrItem.allocatedQty || 0);
              if (mrItem.issuedQty >= mrItem.qty) mrItem.status = "Issued";
              else if (totalFulfilled >= mrItem.qty) mrItem.status = "Allocated";
              else if (totalFulfilled > 0) mrItem.status = "Partial";
              else mrItem.status = "In Stock";
            }
            
            const allIssued = mr.items.length > 0 && mr.items.every((mi: any) => (mi.issuedQty || 0) >= mi.qty);
            const someIssued = mr.items.some((mi: any) => (mi.issuedQty || 0) > 0);
            const allAllocated = mr.items.every((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) >= mi.qty);
            const someAllocated = mr.items.some((mi: any) => (mi.issuedQty || 0) + (mi.allocatedQty || 0) > 0);
            
            if (allIssued) mr.status = 'Closed';
            else if (someIssued) mr.status = 'Partially Issued';
            else if (allAllocated) mr.status = 'Allocated';
            else if (someAllocated) mr.status = 'Partially Allocated';
            else mr.status = 'Approved';
            
            await mr.save({ session });
          }
        }

        // Rollback Inventory levels
        const inv = await Inventory.findOne({ sku: it.sku }).session(session);
        if (inv) {
          inv.liveStock = (inv.liveStock || 0) + it.qty;
          inv.issuedQty = Math.max(0, (inv.issuedQty || 0) - it.qty);
          // Restore allocated quantity reserve in inventory
          inv.allocatedQty = (inv.allocatedQty || 0) + fromAllocationTotal;
          await inv.save({ session });
        }
      }
    }

    await Transaction.findOneAndDelete({ id: req.params.id }).session(session);
    await Outward.findOneAndDelete({ id: req.params.id }).session(session);
    
    await session.commitTransaction();
    broadcast({ type: 'DATA_UPDATED', path: 'transactions' });
    broadcast({ type: 'DATA_UPDATED', path: 'outward' });
    broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });
    broadcast({ type: 'DATA_UPDATED', path: 'mr-allocations' });

    await triggerN8nWebhook('INWARD_DELETE', {
      transactionId: req.params.id,
      type: tx.type,
      deletedBy: req.user?.name || 'system',
    });

    res.json({ success: true });
  } catch (error: any) {
    if (session.inTransaction()) await session.abortTransaction();
    res.status(400).json({ success: false, message: error.message });
  } finally {
    session.endSession();
  }
});

// --- Gate Pass / Transfer Routes ---
router.get('/gate-passes/available', authenticate, async (req, res) => {
  try {
    // Find Transfer Outward transactions that are not yet linked to a Transfer Inward
    const outwardTransfers = await Transaction.find({ type: 'Transfer Outward' }).lean();
    const inwardTransfers = await Transaction.find({ type: 'Transfer Inward' }).lean();
    
    const linkedGatePasses = new Set(inwardTransfers.map(it => it.gatePassNo).filter(Boolean));
    const available = outwardTransfers.filter(ot => ot.gatePassNo && !linkedGatePasses.has(ot.gatePassNo));
    
    res.json({ success: true, data: available });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/gate-passes/:gatePassNo', authenticate, async (req, res) => {
  try {
    const transaction = await Transaction.findOne({ gatePassNo: req.params.gatePassNo, type: 'Transfer Outward' }).lean();
    if (!transaction) throw new Error("Gate Pass not found");
    res.json({ success: true, data: transaction });
  } catch (error: any) {
    res.status(404).json({ success: false, message: error.message });
  }
});

// --- Stock Check Routes ---
router.get('/stock-check-reports', authenticate, async (req, res) => {
  try {
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 100;
    const skip = (page - 1) * limit;
    const search = (req.query.search as string) || "";
    const filterStr = req.query.filter as string;
    let parsedFilter: any = {};
    if (typeof filterStr === 'string') {
      try {
        parsedFilter = JSON.parse(filterStr);
      } catch (e) {}
    } else if (filterStr && typeof filterStr === 'object') {
      parsedFilter = filterStr;
    }

    let query: any = {};
    if (search) {
      query.$or = [
        { id: { $regex: search, $options: 'i' } },
        { category: { $regex: search, $options: 'i' } },
        { performedBy: { $regex: search, $options: 'i' } }
      ];
    }

    if (parsedFilter.startDate || parsedFilter.endDate) {
      query.date = {};
      if (parsedFilter.startDate) query.date.$gte = new Date(parsedFilter.startDate);
      if (parsedFilter.endDate) {
        const ed = new Date(parsedFilter.endDate);
        ed.setHours(23, 59, 59, 999);
        query.date.$lte = ed;
      }
    }

    const [items, total] = await Promise.all([
      StockCheckReport.find(query).sort({ date: -1 }).skip(skip).limit(limit),
      StockCheckReport.countDocuments(query)
    ]);

    res.json({ 
      success: true, 
      data: items,
      pagination: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/stock-check', authenticate, async (req: any, res) => {
  try {
    const report = await StockCheckReport.create({ ...req.body, performedBy: req.user.name });
    broadcast({ type: 'DATA_UPDATED', path: 'stock-check-reports' });

    await createNotification({
      message: `New Stock Check Report ${report.id} submitted by ${req.user.name}`,
      severity: 'info',
      path: 'stock-check-reports',
      senderId: req.user._id
    });

    await triggerN8nWebhook('STOCK_CHECK', {
      reportId: report.id,
      performedBy: req.user.name,
      itemCount: report.items?.length || 0,
      status: report.status
    });

    if (report.status === 'Pending Approval') {
      const roles = await getRolesWithPermission('APPROVE_STOCK_CHECK');
      await createNotification({
        message: `New Stock Check Report ${report.id} requires approval.`,
        severity: 'warning',
        path: 'stock-check-reports',
        senderId: req.user._id,
        targetRoles: roles.length ? roles : ["Super Admin", "Head", "AGM"]
      });
    }

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/stock-check/:id/approve', authenticate, async (req: any, res) => {
  try {
    const report = await StockCheckReport.findOneAndUpdate(
      { id: req.params.id }, 
      { status: 'Approved', approvedBy: req.user.name, approvalReason: req.body.reason },
      { new: true }
    );
    
    if (report) {
      for (const item of report.items) {
        const inventory = await Inventory.findOne({ sku: item.sku });
        if (inventory) {
          inventory.liveStock = item.physicalStock;
          await inventory.save();
        }
      }
      broadcast({ type: 'DATA_UPDATED', path: 'inventory' });
    }
    
    broadcast({ type: 'DATA_UPDATED', path: 'stock-check-reports' });

    await createNotification({
      message: `Stock Check Report ${report?.id} was APPROVED by ${req.user.name}`,
      severity: 'success',
      path: 'stock-check-reports',
      senderId: req.user._id
    });

    await triggerN8nWebhook('STOCK_CHECK_APPROVE', {
      reportId: req.params.id,
      approvedBy: req.user.name,
      reason: req.body.reason,
      itemCount: report?.items?.length || 0,
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.post('/stock-check/:id/reject', authenticate, async (req: any, res) => {
  try {
    const report = await StockCheckReport.findOneAndUpdate(
      { id: req.params.id }, 
      { status: 'Rejected', approvedBy: req.user.name, approvalReason: req.body.reason },
      { new: true }
    );
    broadcast({ type: 'DATA_UPDATED', path: 'stock-check-reports' });

    await createNotification({
      message: `Stock Check Report ${report?.id} was REJECTED by ${req.user.name}`,
      severity: 'error',
      path: 'stock-check-reports',
      senderId: req.user._id
    });

    await triggerN8nWebhook('STOCK_CHECK_REJECT', {
      reportId: req.params.id,
      rejectedBy: req.user.name,
      reason: req.body.reason,
    });

    res.json({ success: true, data: report });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

router.delete('/stock-check-reports/:id', authenticate, async (req: any, res) => {
  try {
    const report = await StockCheckReport.findOne({ id: req.params.id });
    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }
    
    await StockCheckReport.findOneAndDelete({ id: req.params.id });
    broadcast({ type: 'DATA_UPDATED', path: 'stock-check-reports' });
    
    await createNotification({
      message: `Stock Check Report ${req.params.id} was deleted by ${req.user.name}`,
      severity: 'warning',
      path: 'stock-check-reports',
      senderId: req.user._id
    });

    res.json({ success: true, message: 'Report deleted successfully' });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Stats Route Cache ---
let statsCache: { data: any, timestamp: number } | null = null;
const STATS_CACHE_TTL = 30000; // 30 seconds

// --- Stats Route ---
router.get('/stats', authenticate, async (req, res) => {
  try {
    const now = Date.now();
    if (statsCache && (now - statsCache.timestamp < STATS_CACHE_TTL)) {
      return res.json({ success: true, data: statsCache.data, cached: true });
    }

    const [
      totalSKUs, totalStock, availableStock, allocatedStock, issuedStock,
      reusable, pendingPOs,
      lowStockCount, pendingWriteOffs, outOfStock, categoriesCount,
      stockByCategory, todayInward, todayOutward
    ] = await Promise.all([
      Inventory.countDocuments().lean(),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$totalQty", { $add: ["$liveStock", "$issuedQty"] }] } } } }]).then(res => res[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$availableQty", { $subtract: ["$liveStock", "$allocatedQty"] }] } } } }]).then(res => res[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$allocatedQty", 0] } } } }]).then(res => res[0]?.total || 0),
      Inventory.aggregate([{ $group: { _id: null, total: { $sum: { $ifNull: ["$issuedQty", 0] } } } }]).then(res => res[0]?.total || 0),
      Inventory.countDocuments({ condition: { $in: ["Good", "Needs Repair", "GOOD", "NEEDS REPAIR"] } }).lean(),
      PurchaseOrder.aggregate([
        { $match: { status: { $in: ["Pending", "Pending L1", "Pending L2", "Pending L3"] } } },
        { $group: { _id: null, total: { $sum: "$totalValue" } } }
      ]).then(res => res[0]?.total || 0),
      Inventory.aggregate([
        { $lookup: { from: 'catalogues', localField: 'sku', foreignField: 'sku', as: 'catalogue' } },
        { $unwind: { path: '$catalogue', preserveNullAndEmptyArrays: false } },
        { 
          $addFields: {
            currentAvail: { $ifNull: ["$availableQty", { $subtract: ["$liveStock", { $ifNull: ["$allocatedQty", 0] }] }] }
          }
        },
        { $match: { $and: [
          { $expr: { $lte: ['$currentAvail', '$catalogue.minStock'] } },
          { $expr: { $gt: ['$currentAvail', 0] } }
        ] } },
        { $count: 'count' }
      ]).then(res => res[0]?.count || 0),
      WriteOff.countDocuments({ status: "Pending" }).lean(),
      Inventory.countDocuments({ 
        $or: [
          { availableQty: 0 },
          { $and: [{ availableQty: { $exists: false } }, { liveStock: 0 }] }
        ]
      }).lean(),
      Inventory.distinct('category').then(cats => cats.length),
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
            date: new Date().toISOString().split('T')[0],
            type: { $in: ["Inward", "Inward Return", "Public Inward", "Public Inward Return", "Transfer Inward", "Public Transfer Inward", "GRN"] }
          }
        },
        { $unwind: "$items" },
        { $group: { _id: null, total: { $sum: "$items.qty" } } }
      ]).then(res => res[0]?.total || 0),
      Transaction.aggregate([
        {
          $match: {
            date: new Date().toISOString().split('T')[0],
            type: { $in: ["Outward", "Outward Return", "Public Outward", "Public Outward Return", "Transfer Outward", "Public Transfer Outward"] }
          }
        },
        { $unwind: "$items" },
        { $group: { _id: null, total: { $sum: "$items.qty" } } }
      ]).then(res => res[0]?.total || 0)
    ]);

    const statsData = { 
      totalSKUs, totalStock, availableStock, allocatedStock, issuedStock,
      reusable, pendingPOs, 
      lowStockCount, pendingWriteOffs, outOfStock, 
      categoriesCount, stockByCategory,
      todayInward, todayOutward
    };

    statsCache = { data: statsData, timestamp: now };

    res.json({ 
      success: true, 
      data: statsData
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// --- Notifications Routes ---
router.get('/notifications', authenticate, async (req: any, res) => {
  try {
    const query: any = {};
    if (req.user.role !== 'Super Admin' && req.user.role !== 'admin') {
      query.targetRoles = { $in: [req.user.role] };
    }
    
    const notifications = await Notification.find(query).sort({ createdAt: -1 }).limit(100);
    
    const mapped = notifications.map(n => ({
      ...n.toObject(),
      read: n.readBy?.some(id => id.toString() === req.user._id.toString()) || false
    }));
    
    res.json({ success: true, data: mapped });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.post('/notifications/:id/read', authenticate, async (req: any, res) => {
  await Notification.findOneAndUpdate(
    { id: req.params.id },
    { $addToSet: { readBy: req.user._id } }
  );
  res.json({ success: true });
});

router.post('/notifications/read-all', authenticate, async (req: any, res) => {
  await Notification.updateMany({}, { $addToSet: { readBy: req.user._id } });
  res.json({ success: true });
});

// --- Settings Routes ---
router.get('/public-settings', async (req, res) => {
  try {
    let settings = await Settings.findOne();
    if (!settings) settings = await Settings.create({});
    res.json({ success: true, data: settings });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/settings', authenticate, async (req, res) => {
  let settings = await Settings.findOne();
  if (!settings) settings = await Settings.create({});
  res.json({ success: true, data: settings });
});

router.put('/settings', authenticate, async (req: any, res) => {
  const settings = await Settings.findOneAndUpdate({}, req.body, { new: true, upsert: true });

  broadcast({ type: 'DATA_UPDATED', path: 'settings' });

  await triggerN8nWebhook('SETTINGS', {
    updatedBy: req.user?.name || 'system',
    changedFields: Object.keys(req.body),
  });

  res.json({ success: true, data: settings });
});

// --- Upload Route ---
router.post('/upload', authenticate, (req, res, next) => {
  console.log('--- AUTHENTICATED UPLOAD START ---');
  console.log('User:', (req as any).user?.id);
  upload.single('image')(req, res, (err) => {
    if (err) {
      console.error('Authenticated Multer Error:', err);
      return res.status(400).json({ success: false, message: err.message || 'Upload failed' });
    }
    console.log('Multer finished. File:', req.file ? 'File found' : 'No file');
    next();
  });
}, (req, res) => {
  try {
    console.log('Authenticated upload request body check:', req.body);
    
    if (!req.file) {
      console.error('Authenticated Upload Error: No file in request. Body:', req.body);
      return res.status(400).json({ 
        success: false, 
        message: 'No file uploaded in the request. Ensure the field name is "image".' 
      });
    }
    
    const file = req.file as any;
    console.log('File details:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      filename: file.filename,
      path: file.path
    });

    let url = file.path || file.secure_url || file.url || file.location;
    
    // If it's a local file, convert to a relative URL
    if (file.filename && (!url || !url.startsWith('http'))) {
      url = `/uploads/${file.filename}`;
    }

    if (!url) {
      console.error('Authenticated Upload Error: No URL returned from storage. File info:', file);
      return res.status(500).json({ 
        success: false, 
        message: 'Failed to get image URL from storage'
      });
    }

    console.log('Authenticated Upload Success:', url);
    return res.status(200).json({ success: true, data: { url } });
  } catch (error: any) {
    console.error('Authenticated Upload Route Catch Error:', error);
    return res.status(500).json({ 
      success: false, 
      message: error.message || 'Internal server error during upload' 
    });
  }
});

// --- Seed Route ---
router.post('/seed', authenticate, async (req, res) => {
  try {
    const seedData = req.body;
    
    const modelMap: any = {
      SEED_INVENTORY: Inventory, SEED_CATALOGUE: Catalogue, SEED_SUPPLIERS: Supplier,
      SEED_POS: PurchaseOrder, SEED_PLANS: MaterialPlan, SEED_GRNS: GRN,
      SEED_INWARDS: Inward, SEED_OUTWARDS: Outward, SEED_INWARD_RETURNS: InwardReturn,
      SEED_OUTWARD_RETURNS: OutwardReturn, SEED_WRITEOFFS: WriteOff,
      SEED_TRANSACTIONS: Transaction, SEED_QUOTATIONS: Quotation,
      inventory: Inventory, catalogue: Catalogue, suppliers: Supplier,
      pos: PurchaseOrder, planning: MaterialPlan, grn: GRN,
      inward: Inward, outward: Outward,
      'inward-returns': InwardReturn, 'outward-returns': OutwardReturn,
      writeoffs: WriteOff, transactions: Transaction,
      'material-requirements': MaterialRequirement, quotations: Quotation, 'audit-logs': AuditLog
    };

    if (!seedData.resource && !seedData.data) {
      console.log('Starting multi-resource seed...');
      for (const [key, data] of Object.entries(seedData)) {
        const model = modelMap[key];
        if (model) {
          console.log(`Seeding resource: ${key} with ${Array.isArray(data) ? data.length : 0} items`);
          await model.deleteMany({});
          await model.insertMany(data);
        } else {
          console.warn(`No model found for seed key: ${key}`);
        }
      }
    } else {
      const { resource, data } = seedData;
      const model = modelMap[resource];
      if (!model) return res.status(400).json({ success: false, message: 'Invalid resource' });
      await model.deleteMany({});
      await model.insertMany(data);
    }

    broadcast({ type: 'DATA_UPDATED', path: 'all' });
    res.json({ success: true });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;
