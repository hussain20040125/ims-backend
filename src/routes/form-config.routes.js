import { Router } from "express";
import { FormConfig } from "../models/index.js";
import { authenticate } from "../middleware/auth.middleware.js";
import { broadcast } from "../utils/broadcaster.js";

const router = Router();

export const DEFAULT_FORM_CONFIGS = [
  {
    formId: "inward-transaction",
    formName: "Inward Transaction",
    section: "Transactions",
    description: "Form for recording inward material receipts",
    fields: [
      { fieldId: "project",       label: "Project",                  originalLabel: "Project",                  type: "select",   required: true,  visible: true,  order: 1,  isCore: true },
      { fieldId: "store",         label: "Store / Godown",           originalLabel: "Store / Godown",           type: "select",   required: true,  visible: true,  order: 2,  isCore: true },
      { fieldId: "supplier",      label: "Supplier",                 originalLabel: "Supplier",                 type: "select",   required: false, visible: true,  order: 3,  isCore: true },
      { fieldId: "challanNo",     label: "Challan / Invoice No.",    originalLabel: "Challan / Invoice No.",    type: "text",     required: true,  visible: true,  order: 4,  isCore: true },
      { fieldId: "challanPhotos", label: "Challan / Invoice Photos", originalLabel: "Challan / Invoice Photos", type: "file",     required: true,  visible: true,  order: 5,  isCore: true },
      { fieldId: "gatePassNo",    label: "Gate Pass No.",            originalLabel: "Gate Pass No.",            type: "text",     required: false, visible: true,  order: 6,  isCore: true },
      { fieldId: "remarks",       label: "Remarks",                  originalLabel: "Remarks",                  type: "textarea", required: false, visible: true,  order: 7,  isCore: true },
    ],
  },
  {
    formId: "outward-transaction",
    formName: "Outward Transaction",
    section: "Transactions",
    description: "Form for recording outward material issues",
    fields: [
      { fieldId: "project",    label: "Project",        originalLabel: "Project",        type: "select",   required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "store",      label: "Store / Godown", originalLabel: "Store / Godown", type: "select",   required: true,  visible: true, order: 2, isCore: true },
      { fieldId: "personName", label: "Person Name",    originalLabel: "Person Name",    type: "text",     required: true,  visible: true, order: 3, isCore: true },
      { fieldId: "gatePassNo", label: "Gate Pass No.",  originalLabel: "Gate Pass No.",  type: "text",     required: true,  visible: true, order: 4, isCore: true },
      { fieldId: "remarks",    label: "Remarks",        originalLabel: "Remarks",        type: "textarea", required: false, visible: true, order: 5, isCore: true },
    ],
  },
  {
    formId: "material-requirement",
    formName: "Material Requirement",
    section: "Procurement",
    description: "Form for creating material requirement requests",
    fields: [
      { fieldId: "project",         label: "Project",           originalLabel: "Project",           type: "select",   required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "location",        label: "Delivery Location", originalLabel: "Delivery Location", type: "text",     required: true,  visible: true, order: 2, isCore: true },
      { fieldId: "priority",        label: "Priority",          originalLabel: "Priority",          type: "select",   required: false, visible: true, order: 3, isCore: true, options: ["Low", "Medium", "High", "Critical"] },
      { fieldId: "requirementDate", label: "Required By Date",  originalLabel: "Required By Date",  type: "date",     required: false, visible: true, order: 4, isCore: true },
      { fieldId: "remarks",         label: "Remarks",           originalLabel: "Remarks",           type: "textarea", required: false, visible: true, order: 5, isCore: true },
    ],
  },
  {
    formId: "purchase-order",
    formName: "Purchase Order",
    section: "Procurement",
    description: "Form for creating purchase orders",
    fields: [
      { fieldId: "supplier",     label: "Supplier",                originalLabel: "Supplier",                type: "select",   required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "deliveryDate", label: "Expected Delivery Date",  originalLabel: "Expected Delivery Date",  type: "date",     required: true,  visible: true, order: 2, isCore: true },
      { fieldId: "paymentTerms", label: "Payment Terms",           originalLabel: "Payment Terms",           type: "text",     required: false, visible: true, order: 3, isCore: true },
      { fieldId: "notes",        label: "Notes / Remarks",         originalLabel: "Notes / Remarks",         type: "textarea", required: false, visible: true, order: 4, isCore: true },
    ],
  },
  {
    formId: "grn",
    formName: "GRN Receipt",
    section: "Inventory",
    description: "Goods Received Note form",
    fields: [
      { fieldId: "store",      label: "Store / Godown",   originalLabel: "Store / Godown",   type: "select",   required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "vendor",     label: "Vendor / Supplier", originalLabel: "Vendor / Supplier", type: "select",  required: false, visible: true, order: 2, isCore: true },
      { fieldId: "personName", label: "Received By",      originalLabel: "Received By",      type: "text",     required: false, visible: true, order: 3, isCore: true },
      { fieldId: "remarks",    label: "Remarks",          originalLabel: "Remarks",          type: "textarea", required: false, visible: true, order: 4, isCore: true },
    ],
  },
  {
    formId: "quotation",
    formName: "Quotation",
    section: "Procurement",
    description: "Form for filling quotations from suppliers",
    fields: [
      { fieldId: "supplier",       label: "Supplier / Company Name",  originalLabel: "Supplier / Company Name",  type: "select",   required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "deliveryDate",   label: "Expected Delivery Date",   originalLabel: "Expected Delivery Date",   type: "date",     required: true,  visible: true, order: 2, isCore: true },
      { fieldId: "freightAmount",  label: "Freight Charges (₹)",      originalLabel: "Freight Charges (₹)",      type: "number",   required: false, visible: true, order: 3, isCore: true },
      { fieldId: "loadingAmount",  label: "Loading Charges (₹)",      originalLabel: "Loading Charges (₹)",      type: "number",   required: false, visible: true, order: 4, isCore: true },
      { fieldId: "unloadingAmount",label: "Unloading Charges (₹)",    originalLabel: "Unloading Charges (₹)",    type: "number",   required: false, visible: true, order: 5, isCore: true },
      { fieldId: "remarks",        label: "Additional Remarks",       originalLabel: "Additional Remarks",       type: "textarea", required: false, visible: true, order: 6, isCore: true },
    ],
  },
  {
    formId: "supplier",
    formName: "Supplier / Vendor",
    section: "Master Data",
    description: "Form for adding and editing suppliers",
    fields: [
      { fieldId: "companyName", label: "Company Name",   originalLabel: "Company Name",   type: "text",     required: true,  visible: true, order: 1, isCore: true },
      { fieldId: "ownerName",   label: "Contact Person", originalLabel: "Contact Person", type: "text",     required: false, visible: true, order: 2, isCore: true },
      { fieldId: "mobile",      label: "Mobile Number",  originalLabel: "Mobile Number",  type: "tel",      required: false, visible: true, order: 3, isCore: true },
      { fieldId: "email",       label: "Email Address",  originalLabel: "Email Address",  type: "email",    required: false, visible: true, order: 4, isCore: true },
      { fieldId: "gstNumber",   label: "GST Number",     originalLabel: "GST Number",     type: "text",     required: false, visible: true, order: 5, isCore: true },
      { fieldId: "panNumber",   label: "PAN Number",     originalLabel: "PAN Number",     type: "text",     required: false, visible: true, order: 6, isCore: true },
      { fieldId: "address",     label: "Address",        originalLabel: "Address",        type: "textarea", required: false, visible: true, order: 7, isCore: true },
      { fieldId: "category",    label: "Category",       originalLabel: "Category",       type: "select",   required: false, visible: true, order: 8, isCore: true },
    ],
  },
];

export async function seedFormConfigs() {
  try {
    const count = await FormConfig.countDocuments();
    if (count === 0) {
      await FormConfig.insertMany(DEFAULT_FORM_CONFIGS);
      console.log("[FormConfig] Default form configs seeded");
    }
  } catch (err) {
    console.error("[FormConfig] Seed error:", err.message);
  }
}

// GET all form configs
router.get("/", authenticate, async (req, res) => {
  try {
    const configs = await FormConfig.find({}).sort({ section: 1, formName: 1 });
    res.json({ success: true, data: configs });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// PUT update a form config (fields array, label, description)
router.put("/:formId", authenticate, async (req, res) => {
  try {
    const { fields, formName, description } = req.body;
    const update = {};
    if (formName) update.formName = formName;
    if (description !== undefined) update.description = description;
    if (fields) update.fields = fields;
    const config = await FormConfig.findOneAndUpdate(
      { formId: req.params.formId },
      update,
      { new: true, runValidators: true }
    );
    if (!config) return res.status(404).json({ success: false, message: "Form config not found" });
    broadcast({ type: "DATA_UPDATED", path: "form-configs" });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST add a custom field to a form
router.post("/:formId/fields", authenticate, async (req, res) => {
  try {
    const { fieldId, label, type, required, options, placeholder, helpText } = req.body;
    if (!fieldId || !label) return res.status(400).json({ success: false, message: "fieldId and label are required" });
    const config = await FormConfig.findOne({ formId: req.params.formId });
    if (!config) return res.status(404).json({ success: false, message: "Form config not found" });
    if (config.fields.some(f => f.fieldId === fieldId)) {
      return res.status(400).json({ success: false, message: "Field ID already exists in this form" });
    }
    const maxOrder = config.fields.reduce((m, f) => Math.max(m, f.order || 0), 0);
    config.fields.push({
      fieldId, label, originalLabel: label,
      type: type || "text",
      required: required || false,
      visible: true,
      order: maxOrder + 1,
      options: options || [],
      placeholder: placeholder || "",
      helpText: helpText || "",
      isCore: false,
      isCustom: true,
    });
    await config.save();
    broadcast({ type: "DATA_UPDATED", path: "form-configs" });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// DELETE remove a custom field
router.delete("/:formId/fields/:fieldId", authenticate, async (req, res) => {
  try {
    const config = await FormConfig.findOne({ formId: req.params.formId });
    if (!config) return res.status(404).json({ success: false, message: "Form not found" });
    const fld = config.fields.find(f => f.fieldId === req.params.fieldId);
    if (!fld) return res.status(404).json({ success: false, message: "Field not found" });
    if (fld.isCore) return res.status(400).json({ success: false, message: "Cannot delete a core system field" });
    config.fields = config.fields.filter(f => f.fieldId !== req.params.fieldId);
    await config.save();
    broadcast({ type: "DATA_UPDATED", path: "form-configs" });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

// POST reset a form to factory defaults
router.post("/:formId/reset", authenticate, async (req, res) => {
  try {
    const def = DEFAULT_FORM_CONFIGS.find(c => c.formId === req.params.formId);
    if (!def) return res.status(404).json({ success: false, message: "No default config for this form" });
    const config = await FormConfig.findOneAndUpdate(
      { formId: req.params.formId },
      { fields: def.fields, formName: def.formName, description: def.description },
      { new: true }
    );
    broadcast({ type: "DATA_UPDATED", path: "form-configs" });
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
});

export default router;
