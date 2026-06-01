import { Router } from "express";
import {
  SupplierModel,
  MaterialRequirement,
  Quotation,
  Inventory,
  Catalogue,
  Inward,
  Outward,
  Transaction,
  PurchaseOrder,
  GRN,
  InwardReturn,
  OutwardReturn,
} from "../models/index.js";
import { getNextSequence } from "../utils/sequence.js";
import { broadcast } from "../utils/broadcaster.js";
import { getRolesWithPermission, createNotification } from "../utils/notification.js";

const router = Router();

// ─── Helper: update inventory stock ──────────────────────────────────────────
const INWARD_TYPES = [
  "Inward", "Public Inward", "Public Transfer Inward",
  "Transfer Inward", "GRN", "Outward Return", "Public Outward Return"
];

const updatePublicStock = async (
  type: string,
  sku: string,
  itemName: string,
  qty: number,
  unit?: string,
  category?: string
) => {
  const isPositive = INWARD_TYPES.includes(type);
  const inv = await Inventory.findOne({ sku });

  if (inv) {
    if (isPositive) {
      inv.totalQty     = (inv.totalQty     || 0) + qty;
      inv.availableQty = (inv.availableQty || 0) + qty;
    } else {
      inv.totalQty     = Math.max(0, (inv.totalQty     || 0) - qty);
      inv.availableQty = Math.max(0, (inv.availableQty || 0) - qty);
    }
    inv.liveStock = (inv.availableQty || 0) + (inv.allocatedQty || 0);
    await inv.save();
  } else if (isPositive) {
    // Auto-create inventory entry for new items on inward
    await Inventory.create({
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
      condition: "New",
    });
  }
};

// ─── GET /api/public/inventory ────────────────────────────────────────────────
router.get("/inventory", async (req, res) => {
  try {
    const search = (req.query.search as string || "").replace(/[.*+?^${}()|[]\]/g, "\$&");
    const filter = req.query.filter as string;
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 100;

    let query: any = {};
    if (search) {
      query.$or = [
        { itemName: new RegExp(search, "i") },
        { sku:      new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
      ];
    }
    if (filter) { try { Object.assign(query, JSON.parse(filter)); } catch {} }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Inventory.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Inventory.countDocuments(query),
    ]);

    res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/inventory (quick-add item) ──────────────────────────────
router.post("/inventory", async (req, res) => {
  try {
    const data = req.body;
    if (!data.sku) data.sku = `SKU-PUB-${Date.now()}`;
    const item = await Inventory.create(data);
    broadcast({ type: "DATA_UPDATED", path: "inventory" });
    res.json({ success: true, data: item });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: `SKU "${req.body.sku}" already exists in inventory.` });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/catalogue ────────────────────────────────────────────────
router.get("/catalogue", async (req, res) => {
  try {
    const search = (req.query.search as string || "").replace(/[.*+?^${}()|[]\]/g, "\$&");
    const filter = req.query.filter as string;
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 100;

    let query: any = {};
    if (search) {
      query.$or = [
        { itemName: new RegExp(search, "i") },
        { sku:      new RegExp(search, "i") },
        { category: new RegExp(search, "i") },
        { brand:    new RegExp(search, "i") },
      ];
    }
    if (filter) { try { Object.assign(query, JSON.parse(filter)); } catch {} }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Catalogue.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Catalogue.countDocuments(query),
    ]);

    res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/material-requirements ────────────────────────────────────
router.get("/material-requirements", async (req, res) => {
  try {
    const search = (req.query.search as string || "").replace(/[.*+?^${}()|[]\]/g, "\$&");
    const filter = req.query.filter as string;
    const unused = req.query.unused as string;
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 100;

    let query: any = {};
    if (search) {
      query.$or = [
        { id:            new RegExp(search, "i") },
        { project:       new RegExp(search, "i") },
        { requesterName: new RegExp(search, "i") },
      ];
    }
    if (filter) { try { Object.assign(query, JSON.parse(filter)); } catch {} }

    // unused=true → MRs not yet linked to any PO
    if (unused === "true") {
      const usedIds = (await PurchaseOrder.find({}, "mrId").lean())
        .map((po: any) => po.mrId)
        .filter(Boolean);
      query.id = { $nin: usedIds };
    }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      MaterialRequirement.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      MaterialRequirement.countDocuments(query),
    ]);

    res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/quotations ───────────────────────────────────────────────
router.get("/quotations", async (req, res) => {
  try {
    const filter = req.query.filter as string;
    const page   = parseInt(req.query.page  as string) || 1;
    const limit  = parseInt(req.query.limit as string) || 100;

    let query: any = {};
    if (filter) { try { Object.assign(query, JSON.parse(filter)); } catch {} }

    const skip = (page - 1) * limit;
    const [items, total] = await Promise.all([
      Quotation.find(query).sort({ updatedAt: -1 }).skip(skip).limit(limit).lean(),
      Quotation.countDocuments(query),
    ]);

    res.json({ success: true, data: items, pagination: { total, page, limit, pages: Math.ceil(total / limit) } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/suppliers ────────────────────────────────────────────────
router.get("/suppliers", async (req, res) => {
  try {
    const search = (req.query.search as string || "").replace(/[.*+?^${}()|[]\]/g, "\$&");
    const limit  = parseInt(req.query.limit as string) || 2000;
    let query: any = { status: "Active" };

    if (search) {
      query.$or = [
        { companyName: new RegExp(search, "i") },
        { name:        new RegExp(search, "i") },
      ];
    }

    const suppliers = await SupplierModel.find(query).limit(limit).lean();
    res.json({ success: true, data: suppliers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/mr/:id ───────────────────────────────────────────────────
router.get("/mr/:id", async (req, res) => {
  try {
    const mr = await MaterialRequirement.findOne({ id: req.params.id }).lean();
    if (!mr) {
      return res.status(404).json({ success: false, message: "Material Requirement not found" });
    }
    res.json({ success: true, data: mr });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── GET /api/public/tracking/:id ─────────────────────────────────────────────
router.get("/tracking/:id", async (req, res) => {
  try {
    const queryId = req.params.id;
    let mr: any = null;
    let po: any = null;
    let grns: any[] = [];
    let quotations: any[] = [];

    if (queryId.startsWith('PO-')) {
      po = await PurchaseOrder.findOne({ id: queryId }).lean();
      if (po?.mrId) mr = await MaterialRequirement.findOne({ id: po.mrId }).lean();
    } else if (queryId.startsWith('GRN-')) {
      const grn = await GRN.findOne({ id: queryId }).lean();
      if (grn) {
        if (grn.poId) {
          po = await PurchaseOrder.findOne({ id: grn.poId }).lean();
          if (po?.mrId) mr = await MaterialRequirement.findOne({ id: po.mrId }).lean();
        } else if (grn.mrNo) {
          mr = await MaterialRequirement.findOne({ id: grn.mrNo }).lean();
        }
      }
    }

    if (!mr) {
      mr = await MaterialRequirement.findOne({ id: queryId }).lean();
    }

    if (!mr) {
      return res.status(404).json({ success: false, message: "Document not found. Please check the ID." });
    }

    quotations = await Quotation.find({ mrId: mr.id }).lean();
    
    if (!po) {
      po = await PurchaseOrder.findOne({ mrId: mr.id }).lean();
    }

    if (po) {
      grns = await Inventory.find({ poId: po.id, transactionType: 'GRN' }).lean();
    } else {
      grns = await Inventory.find({ mrNo: mr.id, transactionType: 'GRN' }).lean();
    }

    return res.json({ success: true, data: { mr, po, quotations, grns } });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/inward ──────────────────────────────────────────────────
router.post("/inward", async (req, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error("At least one item is required");
    }

    const seq  = await getNextSequence("IN");
    const year = new Date().getFullYear();
    const id   = body.id || `IN-${year}-${seq}`;
    const type = body.type || "Public Inward";

    const data   = { ...body, id, type };
    const inward = await Inward.create(data);

    // Update inventory stock for each item
    for (const item of body.items) {
      await updatePublicStock(type, item.sku, item.itemName, item.qty, item.unit);
    }

    // Transaction record for full traceability
    await Transaction.create({ ...data });

    broadcast({ type: "DATA_UPDATED", path: "inward"       });
    broadcast({ type: "DATA_UPDATED", path: "inventory"    });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });

    const storeRoles = await getRolesWithPermission("APPROVE_MR_STORE");
    await createNotification({
      message:     `New Public Inward (${id}) recorded for project "${body.project || "N/A"}".`,
      severity:    "info",
      path:        "inward",
      targetRoles: storeRoles,
    });

    res.json({ success: true, data: inward });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/outward ─────────────────────────────────────────────────
router.post("/outward", async (req, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error("At least one item is required");
    }

    const seq  = await getNextSequence("OUT");
    const year = new Date().getFullYear();
    const id   = body.id || `OUT-${year}-${seq}`;
    const type = body.type || "Public Outward";

    const data    = { ...body, id, type };
    const outward = await Outward.create(data);

    // Deduct inventory stock for each item
    for (const item of body.items) {
      await updatePublicStock(type, item.sku, item.itemName, item.qty, item.unit);
    }

    // Transaction record
    await Transaction.create({ ...data });

    broadcast({ type: "DATA_UPDATED", path: "outward"      });
    broadcast({ type: "DATA_UPDATED", path: "inventory"    });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });

    const storeRoles = await getRolesWithPermission("APPROVE_MR_STORE");
    await createNotification({
      message:     `New Public Outward (${id}) recorded for project "${body.project || "N/A"}".`,
      severity:    "info",
      path:        "outward",
      targetRoles: storeRoles,
    });

    res.json({ success: true, data: outward });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/inward-returns ──────────────────────────────────────────────────
router.post("/inward-returns", async (req, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error("At least one item is required");
    }

    const seq  = await getNextSequence("INR");
    const year = new Date().getFullYear();
    const id   = body.id || `INR-${year}-${seq}`;
    const data = { ...body, id, type: "Public Inward Return", vendor: body.supplier || body.vendor };
    
    const inwardReturn = await InwardReturn.create(data);

    for (const item of body.items) {
      await updatePublicStock("Public Inward Return", item.sku, item.itemName, item.qty, item.unit);
    }

    await Transaction.create({ ...data, type: "Public Inward Return" });

    broadcast({ type: "DATA_UPDATED", path: "inward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory"    });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });

    const storeRoles = await getRolesWithPermission("APPROVE_MR_STORE");
    await createNotification({
      message: `New Public Inward Return (${id}) recorded for supplier "${body.supplier || "N/A"}".`,
      severity: "info",
      path: "inward-returns",
      targetRoles: storeRoles,
    });

    res.json({ success: true, data: inwardReturn });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/outward-returns ─────────────────────────────────────────────────
router.post("/outward-returns", async (req, res) => {
  try {
    const body = req.body;
    if (!body.items || !Array.isArray(body.items) || body.items.length === 0) {
      throw new Error("At least one item is required");
    }

    const seq  = await getNextSequence("OUTR");
    const year = new Date().getFullYear();
    const id   = body.id || `OUTR-${year}-${seq}`;
    const data = { ...body, id, type: "Public Outward Return" };

    const outwardReturn = await OutwardReturn.create(data);

    for (const item of body.items) {
      await updatePublicStock("Public Outward Return", item.sku, item.itemName, item.qty, item.unit);
    }

    await Transaction.create({ ...data, type: "Public Outward Return" });

    broadcast({ type: "DATA_UPDATED", path: "outward-returns" });
    broadcast({ type: "DATA_UPDATED", path: "inventory"    });
    broadcast({ type: "DATA_UPDATED", path: "transactions" });

    const storeRoles = await getRolesWithPermission("APPROVE_MR_STORE");
    await createNotification({
      message: `New Public Outward Return (${id}) recorded for project "${body.project || "N/A"}".`,
      severity: "info",
      path: "outward-returns",
      targetRoles: storeRoles,
    });

    res.json({ success: true, data: outwardReturn });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/po ──────────────────────────────────────────────────────
router.post("/po", async (req, res) => {
  try {
    const data = req.body;
    const year = new Date().getFullYear();
    const seq  = await getNextSequence("PO");
    const id   = data.id || `PO-${year}-${seq}`;

    const po = await PurchaseOrder.create({
      ...data,
      id,
      status: data.status || "Pending L1",
      date:   data.date   || new Date().toISOString().split("T")[0],
    });

    broadcast({ type: "DATA_UPDATED", path: "pos" });

    const l1Roles = await getRolesWithPermission("APPROVE_PO_L1");
    await createNotification({
      message:     `New Purchase Order (${id}) submitted via Public Portal for project "${data.project || "N/A"}". L1 approval required.`,
      severity:    "warning",
      path:        "pos",
      targetRoles: l1Roles,
    });

    res.json({ success: true, data: po });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: "A Purchase Order with this ID already exists." });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/quotation ───────────────────────────────────────────────
router.post("/quotation", async (req, res) => {
  try {
    const data = req.body;

    if (data.mrId) {
      const mr = await MaterialRequirement.findOne({ id: data.mrId });
      if (!mr) {
        return res.status(404).json({ success: false, message: "Material Requirement not found" });
      }
      if (mr.quotationLinkActive === false) {
        return res.status(400).json({ success: false, message: "This quotation link has been deactivated by the AGM." });
      }
    }

    const year = new Date().getFullYear();
    const seq  = await getNextSequence("QT");
    const customId = `QT-${year}-${seq}`;

    const quotation = await Quotation.create({
      ...data,
      id:     customId,
      status: "Pending",
      date:   new Date().toISOString().split("T")[0],
    });

    broadcast({ type: "DATA_UPDATED", path: "quotations" });

    res.json({ success: true, data: quotation });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/material-requirement ────────────────────────────────────
router.post("/material-requirement", async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const seq  = await getNextSequence("MR");
    const customId = `MR-${year}-${seq}`;

    const requirement = await MaterialRequirement.create({
      ...req.body,
      id:       customId,
      mrNumber: customId,
      status:   req.body.status || "Store Pending",
      date:     req.body.date   || new Date().toISOString(),
    });

    broadcast({ type: "DATA_UPDATED", path: "material-requirements" });

    const storeRoles = await getRolesWithPermission("APPROVE_MR_STORE");
    await createNotification({
      message:     `New Material Requirement (${requirement.id}) received from Public Portal for project "${requirement.project}". Store approval required.`,
      severity:    "warning",
      path:        "material-requirements",
      targetRoles: storeRoles,
    });

    res.json({ success: true, data: requirement });
  } catch (error: any) {
    console.error("Error creating public material requirement:", error);
    res.status(400).json({ success: false, message: error.message });
  }
});

// ─── POST /api/public/supplier-registration ───────────────────────────────────
router.post("/supplier-registration", async (req, res) => {
  try {
    const data = req.body;

    // Duplicate company name check (case-insensitive)
    if (data.companyName) {
      const existing = await SupplierModel.findOne({
        $or: [
          { companyName: new RegExp(`^${data.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
          { name:        new RegExp(`^${data.companyName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") },
        ],
      });
      if (existing) {
        return res.status(400).json({ success: false, message: `A supplier named "${data.companyName}" already exists.` });
      }
    }

    const seq = await getNextSequence("SUPPLIER");
    const id  = data.id || `VND_${String(seq).padStart(4, "0")}`;

    const supplier = await SupplierModel.create({
      ...data,
      id,
      name:     data.name     || data.companyName,
      contact:  data.contact  || data.ownerName,
      phone:    data.phone    || data.mobile,
      category: data.category || data.dealingProducts,
      gst:      data.gst      || data.gstNumber || "N/A",
      status:   "Active",
    });

    broadcast({ type: "DATA_UPDATED", path: "suppliers" });

    res.json({ success: true, data: supplier });
  } catch (error: any) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue || {})[0] || "name";
      const value = error.keyValue?.[field] || "";
      const label = field === "companyName" || field === "name" ? "Company name" : field;
      return res.status(400).json({ success: false, message: `${label} "${value}" already exists.` });
    }
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
