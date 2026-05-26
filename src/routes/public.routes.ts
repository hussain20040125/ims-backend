import { Router } from "express";
import { SupplierModel, MaterialRequirement, Quotation } from "../models/index.js";
import { getNextSequence } from "../utils/sequence.js";
import { broadcast } from "../utils/broadcaster.js";
import { getRolesWithPermission, createNotification } from "../utils/notification.js";

const router = Router();

// GET /api/public/suppliers
router.get("/suppliers", async (req, res) => {
  try {
    const search = req.query.search as string;
    const limit = parseInt(req.query.limit as string) || 2000;
    let query: any = { status: "Active" };

    if (search) {
      query.$or = [
        { companyName: new RegExp(search, "i") },
        { name: new RegExp(search, "i") }
      ];
    }
    
    const suppliers = await SupplierModel.find(query).limit(limit).lean();
    res.json({ success: true, data: suppliers });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// GET /api/public/mr/:id
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

// POST /api/public/quotation
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
    const seq = await getNextSequence("QT");
    const customId = `QT-${year}-${seq}`;
    
    const quotation = await Quotation.create({
      ...data,
      id: customId,
      status: "Pending",
      date: new Date().toISOString().split("T")[0],
    });
    
    broadcast({ type: "DATA_UPDATED", path: "quotations" });
    
    res.json({ success: true, data: quotation });
  } catch (error: any) {
    res.status(400).json({ success: false, message: error.message });
  }
});

// POST /api/public/material-requirement
router.post("/material-requirement", async (req, res) => {
  try {
    const year = new Date().getFullYear();
    const seq = await getNextSequence("MR");
    const customId = `MR-${year}-${seq}`;

    const requirement = await MaterialRequirement.create({
      ...req.body,
      id: customId,
      mrNumber: customId,
      status: req.body.status || 'Store Pending',
      date: req.body.date || new Date().toISOString()
    });

    broadcast({ type: 'DATA_UPDATED', path: 'material-requirements' });

    const storeRoles = await getRolesWithPermission('APPROVE_MR_STORE');
    await createNotification({
      message: `New Material Requirement ${requirement.id} received from Public Portal for project ${requirement.project}. Store approval required.`,
      severity: 'warning',
      path: 'material-requirements',
      targetRoles: storeRoles
    });

    res.json({ success: true, data: requirement });
  } catch (error: any) {
    console.error('Error creating public material requirement:', error);
    res.status(400).json({ success: false, message: error.message });
  }
});

export default router;
