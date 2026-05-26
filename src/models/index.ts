import mongoose, { Schema } from 'mongoose';

// Inventory Model
const InventorySchema = new Schema({
  sku: { type: String, required: true, unique: true },
  itemName: { type: String, required: true },
  category: { type: String, required: true },
  subCategory: { type: String, required: true },
  unit: { type: String, required: true },
  openingStock: { type: Number, default: 0 },
  totalQty: { type: Number, default: 0 }, // total_qty = available + allocated + issued
  availableQty: { type: Number, default: 0 }, // Layer 1: Free stock
  allocatedQty: { type: Number, default: 0 }, // Layer 2: Reserved/Locked for MR
  issuedQty: { type: Number, default: 0 }, // Layer 3: Physically moved out
  liveStock: { type: Number, default: 0 }, // Legacy/Compatibility
  condition: { type: String, enum: ["New", "Good", "Needs Repair", "Damaged", "NEW", "GOOD", "NEEDS REPAIR", "DAMAGED"], default: "New" },
  sourceSite: String,
  lastProject: String,
}, { timestamps: true });

InventorySchema.pre('save', function(next) {
  const inv = this as any;
  if (inv.liveStock !== undefined) {
    inv.availableQty = Math.max(0, (inv.liveStock || 0) - (inv.allocatedQty || 0));
    inv.totalQty = (inv.liveStock || 0) + (inv.issuedQty || 0);
  }
  (next as any)();
});

InventorySchema.index({ sku: 1 });
InventorySchema.index({ itemName: 1 });
InventorySchema.index({ category: 1 });
InventorySchema.index({ updatedAt: -1 });

export const Inventory = mongoose.model('Inventory', InventorySchema);

// Catalogue Model
const CatalogueSchema = new Schema({
  sku: { type: String, required: true, unique: true },
  itemName: { type: String, required: true },
  brand: { type: String, required: true },
  description: { type: String, required: true },
  category: { type: String, required: true },
  uom: { type: String, required: true },
  location: { type: String, required: true },
  minStock: { type: Number, default: 0 },
  imageUrl: String,
  status: { type: String, enum: ["Draft", "Approved"], default: "Draft" },
}, { timestamps: true });

CatalogueSchema.index({ sku: 1 });
CatalogueSchema.index({ itemName: 1 });
CatalogueSchema.index({ category: 1 });
CatalogueSchema.index({ updatedAt: -1 });

export const Catalogue = mongoose.model('Catalogue', CatalogueSchema);

// Supplier Model
const SupplierSchema = new Schema({
  id: { type: String, required: true, unique: true },
  email: { type: String, required: true, unique: true },
  companyName: { type: String, required: true },
  ownerName: { type: String, required: true },
  mobile: { type: String, required: true, unique: true },
  altMobile: String,
  website: String,
  address: { type: String, required: true },
  dealingProducts: { type: String, required: true },
  references: String,
  avgTurnover: String,
  additionalInfo: String,
  accountHolderName: { type: String, required: true },
  bankName: { type: String, required: true },
  accountNumber: { type: String, required: true },
  ifscCode: { type: String, required: true },
  branch: { type: String, required: true },
  panNumber: { type: String, required: true },
  gstNumber: String,
  gstCertificateUrl: String,
  panCardUrl: { type: String, required: true },
  bankProofUrl: { type: String, required: true },
  businessCardUrl: String,
  processCoordinator: String,
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
  name: { type: String, required: true }, // Map to companyName
  contact: { type: String, required: true }, // Map to ownerName
  phone: { type: String, required: true }, // Map to mobile
  category: { type: String, required: true }, // Map to dealingProducts
  gst: { type: String }, // Map to gstNumber
}, { timestamps: true });

SupplierSchema.index({ id: 1 });
SupplierSchema.index({ companyName: 1 });
SupplierSchema.index({ name: 1 });
SupplierSchema.index({ ownerName: 1 });
SupplierSchema.index({ email: 1 });
SupplierSchema.index({ mobile: 1 });
SupplierSchema.index({ contact: 1 });
SupplierSchema.index({ phone: 1 });
SupplierSchema.index({ updatedAt: -1 });

export const Supplier = mongoose.model('Supplier', SupplierSchema);
export const Vendor = Supplier;

// Purchase Order Model
const POLineItemSchema = new Schema({
  sku: String,
  itemName: String,
  qty: Number,
  unit: String,
  rate: Number,
  gstPct: Number,
  gstType: { type: String, enum: ["Inclusive", "Exclusive"], default: "Exclusive" },
  total: Number,
  totalWithGST: Number,
  currentStock: Number,
  category: String,
  requirementQty: Number,
  uqc: String,
  condition: String,
});

const PaymentTimelineSchema = new Schema({
  date: String,
  type: String,
  mode: String,
  amount: Number,
  gstPct: String,
  ifPayable: Number,
});

const POSchema = new Schema({
  id: { type: String, required: true, unique: true },
  mrId: String,
  project: String,
  phase: String,
  workType: String,
  milestone: String,
  supplier: String,
  items: [POLineItemSchema],
  totalValue: Number,
  status: { type: String, enum: ["Approved", "Cancelled", "Pending", "Pending GRN", "Pending L1", "Pending L2", "Pending L3", "Fulfilled", "Blocked", "Draft", "GRN Pending", "GRN Fulfilled", "GRN Variance", "Ready for Payment", "PO Closed"], default: "Draft" },
  approvalL1: { type: String, enum: ["N/A", "Pending", "Approved"], default: "Pending" },
  approvalL2: { type: String, enum: ["N/A", "Pending", "Approved"], default: "Pending" },
  approvalL3: { type: String, enum: ["N/A", "Pending", "Approved"], default: "Pending" },
  approvalL1At: String,
  approvalL2At: String,
  approvalL3At: String,
  justification: String,
  createdBy: String,
  date: String,
  priority: { type: String, enum: ["Urgent", "Normal", "Low"], default: "Normal" },
  applicatedArea: String,
  requirementBy: String,
  location: String,
  vendorBankDetails: {
    accountHolder: String,
    bankName: String,
    accountNo: String,
    branchIFSC: String,
  },
  deliveryDetails: {
    location: String,
    deliveryDate: String,
    contactPerson: String,
  },
  paymentTimelines: [PaymentTimelineSchema],
  priceComparison: {
    vendors: [{
      name: String,
      gstType: String,
      gstPct: Number,
    }],
    items: [{
      materialName: String,
      unit: String,
      qty: Number,
      rates: [Number],
      gstPcts: [Number],
    }],
    remarks: String,
  },
  remark: String,
  panNo: String,
  gstNo: String,
  companyName: String,
  companyGst: String,
  companyAddress: String,
  vendorContact: String,
  vendorEmail: String,
  vendorAddress: String,
  accountStatus: String,
  billApprovedBy: String,
  billApprovedDate: String,
  billRejectedBy: String,
  billRejectedDate: String,
  rejectionReason: String,
  invoice: {
    number: String,
    amount: Number,
    gst: Number,
    date: String,
    filename: String
  },
  grn: {
    number: String,
    qty: String,
    receivedBy: String,
    date: String,
    remark: String
  },
  payment: {
    amountPaid: Number,
    date: String,
    mode: String,
    utr: String,
    chequeNo: String,
    chequeDate: String,
    screenshotUrl: String,
    screenshotName: String,
    paidBy: String,
    fromCompany: String,
    toCompany: String,
    bank: String,
    ref: String,
    remarks: String,
    vendorBankDetails: {
      accountHolder: String,
      bankName: String,
      accountNo: String,
      branchIFSC: String,
    }
  },
  auditTrail: [Schema.Types.Mixed],
  // Cancellation fields (set when AGM cancels an approved PO)
  cancelNote: String,
  cancelledBy: String,
  cancelledAt: String,
  // Other Charges (Freight / Loading / Unloading)
  freightAmount: { type: Number, default: 0 },
  freightGstPct: { type: Number, default: 0 },
  freightGstType: { type: String, enum: ["Inclusive", "Exclusive"], default: "Exclusive" },
  loadingAmount: { type: Number, default: 0 },
  loadingGstPct: { type: Number, default: 0 },
  loadingGstType: { type: String, enum: ["Inclusive", "Exclusive"], default: "Exclusive" },
  unloadingAmount: { type: Number, default: 0 },
  unloadingGstPct: { type: Number, default: 0 },
  unloadingGstType: { type: String, enum: ["Inclusive", "Exclusive"], default: "Exclusive" },
}, { timestamps: true });

POSchema.index({ id: 1 });
POSchema.index({ project: 1 });
POSchema.index({ supplier: 1 });
POSchema.index({ status: 1 });
POSchema.index({ updatedAt: -1 });

export const PurchaseOrder = mongoose.model('PurchaseOrder', POSchema);

// Material Plan Model
const PlanLineItemSchema = new Schema({
  sku: String,
  itemName: String,
  required: Number,
  unit: String,
  available: Number,
  reusable: Number,
  shortage: Number,
  priority: { type: String, enum: ["High", "Medium", "Low"] },
  delivery: String,
  activity: String,
});

const MaterialPlanSchema = new Schema({
  id: { type: String, required: true, unique: true },
  project: String,
  milestone: String,
  workType: String,
  date: String,
  status: { type: String, enum: ["Open", "PO Raised", "Fulfilled"], default: "Open" },
  items: [PlanLineItemSchema],
}, { timestamps: true });

MaterialPlanSchema.index({ id: 1 });
MaterialPlanSchema.index({ project: 1 });
MaterialPlanSchema.index({ status: 1 });
MaterialPlanSchema.index({ updatedAt: -1 });

export const MaterialPlan = mongoose.model('MaterialPlan', MaterialPlanSchema);

// GRN Model
const GRNItemSchema = new Schema({
  sku: String,
  itemName: String,
  ordered: Number,
  received: Number,
  variance: Number,
  unit: String,
  condition: String,
  images: [String],
});

const GRNSchema = new Schema({
  id: { type: String, required: true, unique: true },
  poId: String,
  project: String,
  destinationProject: String,
  supplier: String,
  date: String,
  challan: String,
  mrNo: String,
  gatePassNo: String,
  docType: { type: String, enum: ["Challan", "Invoice", "Bilty", "Gate Pass", "Without Challan", "Without Gate Pass"] },
  items: [GRNItemSchema],
  status: { type: String, enum: ["Draft", "Confirmed"], default: "Draft" },
  materialImageUrl: String,
  challanImageUrl: String,
  challanPhotos: [String],
  personName: String,
  personPhotoUrl: String,
  personPhotos: [String],
}, { timestamps: true });

GRNSchema.index({ id: 1 });
GRNSchema.index({ poId: 1 });
GRNSchema.index({ project: 1 });
GRNSchema.index({ supplier: 1 });
GRNSchema.index({ updatedAt: -1 });

export const GRN = mongoose.model('GRN', GRNSchema);

// Inward Model
const InwardItemSchema = new Schema({
  sku: { type: String, required: true },
  itemName: { type: String, required: true },
  qty: { type: Number, required: true },
  unit: String,
  remarks: String,
  images: [String],
  materialPhotoUrl: String,
  challanNo: String,
  mrNo: String,
  challanPhotoUrl: String,
  challanPhotos: [String],
  condition: String
});

const InwardSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: String,
  challanNo: String,
  mrNo: String,
  supplier: String,
  project: String,
  destinationProject: String,
  gatePassNo: String,
  personPhotoUrl: String,
  personPhotos: [String],
  batchId: String,
  status: String,
  type: { type: String, enum: ["Manual", "Transfer", "GRN", "Public Inward", "Public Transfer Inward", "Inward", "Transfer Inward"], default: "Manual" },
  challanPhotoUrl: String,
  challanPhotos: [String],
  materialPhotoUrl: String,
  grnRef: String,
  items: {
    type: [InwardItemSchema],
    required: true
  }
}, { 
  timestamps: true,
  collection: 'inwards'
});

InwardSchema.index({ id: 1 });
InwardSchema.index({ project: 1 });
InwardSchema.index({ updatedAt: -1 });

export const Inward = mongoose.model('Inward', InwardSchema);

// Transaction Item Schema (Shared)
const TransactionItemSchema = new Schema({
  sku: { type: String, required: true },
  itemName: { type: String, required: true },
  qty: { type: Number, required: true },
  outwardQty: { type: Number },
  variance: { type: Number },
  unit: { type: String, required: true },
  remarks: String,
  images: [String],
  challanNo: String,
  mrNo: String,
  challanPhotoUrl: String,
  challanPhotos: [String],
  condition: String
});

// Outward Model
const OutwardSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: String,
  location: String,
  handoverTo: String,
  batchId: String,
  project: String,
  destinationProject: String,
  gatePassNo: String,
  category: String,
  type: { type: String, enum: ["Manual", "Transfer", "Public Outward", "Public Transfer Outward", "Outward", "Transfer Outward"], default: "Manual" },
  materialPhotoUrl: String,
  handoverPhotoUrl: String,
  personPhotoUrl: String,
  personPhotos: [String],
  personName: String,
  items: { type: [TransactionItemSchema], required: true },
  mrId: String,
  poId: String
}, { timestamps: true });

OutwardSchema.index({ id: 1 });
OutwardSchema.index({ project: 1 });
OutwardSchema.index({ updatedAt: -1 });

export const Outward = mongoose.model('Outward', OutwardSchema);

// Inward Return Model
const InwardReturnSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  condition: { type: String, enum: ["New", "Good", "Needs Repair", "Damaged", "NEW", "GOOD", "NEEDS REPAIR", "DAMAGED"], default: "Good" },
  supplier: { type: String, required: true },
  remarks: String,
  handoverTo: String,
  materialPhotoUrl: String,
  challanPhotoUrl: String,
  items: { type: [TransactionItemSchema], required: true }
}, { timestamps: true });

export const InwardReturn = mongoose.model('InwardReturn', InwardReturnSchema);

// Outward Return Model
const OutwardReturnSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: { type: String, required: true },
  condition: { type: String, enum: ["New", "Good", "Needs Repair", "Damaged", "NEW", "GOOD", "NEEDS REPAIR", "DAMAGED"], default: "Good" },
  sourceSite: { type: String, required: true },
  remarks: String,
  handoverFrom: String,
  personName: String,
  personPhotoUrl: String,
  personPhotos: [String],
  materialPhotoUrl: String,
  items: { type: [TransactionItemSchema], required: true }
}, { timestamps: true });

export const OutwardReturn = mongoose.model('OutwardReturn', OutwardReturnSchema);

// Write Off Model
const WriteOffSchema = new Schema({
  id: { type: String, required: true, unique: true },
  sku: String,
  itemName: String,
  qty: Number,
  unit: String,
  reason: String,
  requestedBy: String,
  date: String,
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
}, { timestamps: true });

export const WriteOff = mongoose.model('WriteOff', WriteOffSchema);

// Stock Check Report Model
const StockCheckItemSchema = new Schema({
  sku: { type: String, required: true },
  itemName: { type: String, required: true },
  systemStock: { type: Number, required: true },
  physicalStock: { type: Number, required: true },
  variance: { type: Number, required: true },
  unit: { type: String, required: true },
});

const StockCheckReportSchema = new Schema({
  id: { type: String, required: true, unique: true },
  date: { type: Date, required: true },
  category: { type: String, required: true },
  performedBy: { type: String, required: true },
  items: [StockCheckItemSchema],
  status: { type: String, enum: ["Completed", "Pending Approval", "Approved", "Rejected"], default: "Completed" },
  approvalReason: String,
  approvedBy: String,
}, { timestamps: true });

StockCheckReportSchema.index({ id: 1 });
StockCheckReportSchema.index({ date: 1 });
StockCheckReportSchema.index({ category: 1 });

export const StockCheckReport = mongoose.model('StockCheckReport', StockCheckReportSchema);

// Transaction Model
const TransactionSchema = new Schema({
  id: { type: String, required: true, unique: true },
  type: { 
    type: String, 
    required: true, 
    enum: [
      "Inward", "Outward", 
      "Inward Return", "Outward Return", 
      "Public Inward", "Public Outward",
      "Public Inward Return", "Public Outward Return",
      "Transfer Inward", "Transfer Outward",
      "Public Transfer Inward", "Public Transfer Outward",
      "Transfer", "GRN"
    ] 
  },
  date: { type: String, required: true },
  items: {
    type: [TransactionItemSchema],
    required: true
  },
  project: String,
  destinationProject: String,
  gatePassNo: String,
  supplier: String,
  location: String,
  handoverTo: String,
  handoverFrom: String,
  sourceSite: String,
  createdBy: String,
  status: { type: String, default: "Completed" },
  linkId: String,
  materialPhotoUrl: String,
  challanPhotoUrl: String,
  challanPhotos: [String],
  handoverPhotoUrl: String,
  personPhotoUrl: String,
  personPhotos: [String],
  personName: String,
  mrId: String,
  poId: String,
}, { timestamps: true });

TransactionSchema.index({ id: 1 });
TransactionSchema.index({ type: 1 });
TransactionSchema.index({ date: -1 });
TransactionSchema.index({ updatedAt: -1 });

export const Transaction = mongoose.model('Transaction', TransactionSchema);

// Audit Log Model
const AuditLogSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  userName: String,
  userEmail: String,
  action: { type: String, required: true },
  resource: { type: String, required: true },
  resourceId: String,
  details: Schema.Types.Map,
}, { timestamps: true });

export const AuditLog = mongoose.model('AuditLog', AuditLogSchema);

// User Model
const UserSchema = new Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, default: "staff" },
  permissions: { type: [String], default: [] },
  isActive: { type: Boolean, default: true },
  status: { type: String, enum: ["Active", "Inactive"], default: "Active" },
}, { timestamps: true });

UserSchema.index({ email: 1 });

export const User = mongoose.model('User', UserSchema);

// Role Permission Model
const RolePermissionSchema = new Schema({
  role: { type: String, required: true, unique: true },
  permissions: { type: [String], default: [] },
}, { timestamps: true });

export const RolePermission = mongoose.model('RolePermission', RolePermissionSchema);

// Notification Model
const NotificationSchema = new Schema({
  id: { type: String, required: true, unique: true },
  message: { type: String, required: true },
  severity: { type: String, enum: ["info", "success", "warning", "error"], default: "info" },
  senderId: { type: Schema.Types.ObjectId, ref: 'User' },
  readBy: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  targetRoles: { type: [String], default: [] },
  type: { type: String, default: 'NOTIFICATION' },
  path: String,
}, { timestamps: true });

NotificationSchema.index({ id: 1 });
NotificationSchema.index({ createdAt: -1 });

export const Notification = mongoose.model('Notification', NotificationSchema);

// Settings Model
const SettingsSchema = new Schema({
  poThreshold: { type: Number, default: 25000 },
  minQuotesLow: { type: Number, default: 2 },
  minQuotesHigh: { type: Number, default: 3 },
  projects: { type: [String], default: [] },
  requesters: { type: [String], default: [] },
  categories: { type: [String], default: [] },
  units: { type: [String], default: [] },
  workTypes: { type: [String], default: [] },
  companies: [{
    name: String,
    gstin: String,
    address: String
  }],
  appName: { type: String, default: 'Garden City' },
  logoUrl: { type: String, default: '' },
  faviconUrl: { type: String, default: '' },
  themeColor: { type: String, default: '#F97316' },
  fontFamily: { type: String, default: 'Inter' }
}, { timestamps: true });

export const Settings = mongoose.model('Settings', SettingsSchema);

// Counter Model
const CounterSchema = new Schema({
  name: { type: String, required: true, unique: true },
  seq: { type: Number, default: 0 },
}, { timestamps: true });

export const Counter = mongoose.model('Counter', CounterSchema);

// Material Requirement Model
const MaterialRequirementItemSchema = new Schema({
  materialName: { type: String, required: true },
  sku: { type: String, required: false },
  category: { type: String },
  qty: { type: Number, required: true },
  unit: String,
  allocatedQty: { type: Number, default: 0 },
  issuedQty: { type: Number, default: 0 },
  availableInStock: { type: Number, default: 0 },
  remainingQty: { type: Number, default: 0 },
  condition: { type: String, default: "New" },
  status: { type: String, enum: ["In Stock", "Needs Purchase", "Partial", "Allocated", "Issued"], default: "Needs Purchase" }
});

const MaterialRequirementSchema = new Schema({
  id: { type: String, required: true, unique: true },
  mrNumber: String,
  engineerId: String,
  requesterName: { type: String, required: true },
  project: { type: String, required: true },
  projectName: String,
  location: { type: String, required: false },
  workType: String,
  requirementDate: String,
  date: { type: String, required: true },
  items: { type: [MaterialRequirementItemSchema], required: true },
  status: { type: String, enum: ["Draft", "Pending", "Rejected", "Allocated", "Partially Allocated", "Partially Issued", "Closed", "Approved by Store", "Approved by AGM", "Store Pending", "Quotation Phase"], default: "Store Pending" },
  approvedSupplier: String,
  approvedQuotationId: String,
  approvals: [{
    category: String,
    quotationId: String,
    supplierName: String,
    approvedAt: { type: Date, default: Date.now }
  }],
  quotationLinkActive: { type: Boolean, default: true }
}, { timestamps: true });

MaterialRequirementSchema.index({ id: 1 });
MaterialRequirementSchema.index({ project: 1 });
MaterialRequirementSchema.index({ requesterName: 1 });
MaterialRequirementSchema.index({ updatedAt: -1 });

export const MaterialRequirement = mongoose.model('MaterialRequirement', MaterialRequirementSchema);

// MR Allocation Model
const MRAllocationSchema = new Schema({
  id: { type: String, required: true, unique: true },
  mrId: { type: String, required: true },
  mrNumber: String,
  engineerName: String,
  projectName: String,
  itemId: String,
  sku: String,
  itemName: String,
  allocatedQty: { type: Number, default: 0 },
  issuedQty: { type: Number, default: 0 },
  remainingQty: { type: Number, default: 0 },
  allocatedBy: String,
  allocationDate: { type: String, default: () => new Date().toISOString() },
  date: { type: String, default: () => new Date().toISOString().split('T')[0] },
  status: { type: String, enum: ["Allocated", "Partially Issued", "Closed"], default: "Allocated" }
}, { timestamps: true });

MRAllocationSchema.index({ id: 1 });
MRAllocationSchema.index({ mrId: 1 });
MRAllocationSchema.index({ sku: 1 });

export const MRAllocation = mongoose.model('MRAllocation', MRAllocationSchema);

// Quotation Model
const QuotationItemSchema = new Schema({
  materialName: { type: String, required: true },
  category: String,
  qty: { type: Number, required: true },
  unit: String,
  rate: { type: Number, required: true },
  gstPct: Number,
  gstType: { type: String, enum: ["Inclusive", "Exclusive"] },
  approved: { type: Boolean, default: false }
});

const QuotationSchema = new Schema({
  id: { type: String, required: true, unique: true },
  mrId: { type: String, required: true },
  category: String,
  supplierId: String,
  supplierName: { type: String, required: true },
  ownerName: String,
  mobile: String,
  gstNumber: String,
  items: [QuotationItemSchema],
  deliveryDate: String,
  remarks: String,
  token: { type: String, unique: true, sparse: true },
  status: { type: String, enum: ["Pending", "Approved", "Rejected"], default: "Pending" },
  totalAmount: Number,
  freightAmount: Number,
  freightGstPct: Number,
  freightGstType: { type: String, enum: ["Inclusive", "Exclusive"] },
  loadingAmount: Number,
  loadingGstPct: Number,
  loadingGstType: { type: String, enum: ["Inclusive", "Exclusive"] },
  unloadingAmount: Number,
  unloadingGstPct: Number,
  unloadingGstType: { type: String, enum: ["Inclusive", "Exclusive"] },
  date: { type: String, default: () => new Date().toISOString().split('T')[0] },
}, { timestamps: true });

QuotationSchema.pre('save', async function() {
  const q = this as any;
  if (!q.token) {
    q.token = `QT-TOKEN-${q.id || Math.random().toString(36).substr(2, 9)}-${Date.now()}`;
  }
});

QuotationSchema.index({ id: 1 });
QuotationSchema.index({ mrId: 1 });
QuotationSchema.index({ supplierName: 1 });
QuotationSchema.index({ status: 1 });
QuotationSchema.index({ updatedAt: -1 });

export const Quotation = mongoose.model('Quotation', QuotationSchema);
export { Vendor as SupplierModel };
