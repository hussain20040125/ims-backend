/**
 * One-time script: restore PRABHAT INDUSTRIES vendor from PO-2026-185 data.
 * Run: node src/scripts/restore-prabhat-industries.js
 */
import mongoose from "mongoose";
import dotenv from "dotenv";
dotenv.config();

const MONGO_URI = process.env.MONGODB_URI || process.env.MONGO_URI;
if (!MONGO_URI) { console.error("MONGODB_URI not set"); process.exit(1); }

await mongoose.connect(MONGO_URI);

const db = mongoose.connection.db;
const vendors = db.collection("vendors");
const pos     = db.collection("purchaseorders");

// 1. Check if vendor already exists
const existing = await vendors.findOne({
  $or: [
    { gstNumber: "23AYPPJ6441F1ZF" },
    { gst:       "23AYPPJ6441F1ZF" },
    { companyName: { $regex: /prabhat industries/i } },
  ]
});
if (existing) {
  console.log("Vendor already exists:", existing.id || existing._id);
  await mongoose.disconnect();
  process.exit(0);
}

// 2. Pull stored details from PO-2026-185
const po = await pos.findOne({ id: "PO-2026-185" });
if (!po) {
  console.error("PO-2026-185 not found — cannot restore vendor.");
  await mongoose.disconnect();
  process.exit(1);
}

const bd = po.vendorBankDetails || {};

// 3. Generate next VND id — scan all formats (VND-0001, VND_0001, VND0001…)
const allVendors = await vendors.find({}, { projection: { id: 1 } }).toArray();
let maxNum = 0;
for (const v of allVendors) {
  const m = (v.id || "").replace(/[^a-zA-Z0-9]/g, "").match(/^VND(\d+)$/i);
  if (m) { const n = parseInt(m[1], 10); if (n > maxNum) maxNum = n; }
}
const newId = `VND-${String(maxNum + 1).padStart(4, "0")}`;

// 4. Build vendor document
const vendor = {
  id:                newId,
  companyName:       "PRABHAT INDUSTRIES",
  name:              "PRABHAT INDUSTRIES",
  supplierName:      "PRABHAT INDUSTRIES",
  ownerName:         bd.accountHolder || "PRABHAT INDUSTRIES",
  contact:           bd.accountHolder || "PRABHAT INDUSTRIES",
  email:             po.vendorEmail   || "abc@gmail.com",
  mobile:            po.vendorContact || "9820641045",
  phone:             po.vendorContact || "9820641045",
  altMobile:         "",
  website:           "",
  address:           po.vendorAddress || "GRAM TILETHA, SITHOLI RAIL SPRING KARKHANE KE PASS, GWALIOR",
  dealingProducts:   "General",
  category:          "General",
  references:        "",
  avgTurnover:       "",
  additionalInfo:    "",
  accountHolderName: bd.accountHolder || "",
  bankName:          bd.bankName      || "",
  accountNumber:     bd.accountNo     || "",
  accountNo:         bd.accountNo     || "",
  ifscCode:          (bd.branchIFSC || "").split(/[,&]/)[1]?.trim() || "",
  branch:            (bd.branchIFSC || "").split(/[,&]/)[0]?.trim() || "",
  panNumber:         po.panNo         || "AYPPJ6441F",
  gstNumber:         po.gstNo         || "23AYPPJ6441F1ZF",
  gst:               po.gstNo         || "23AYPPJ6441F1ZF",
  gstCertificateUrl: "",
  panCardUrl:        "",
  bankProofUrl:      "",
  businessCardUrl:   "",
  processCoordinator:"",
  status:            "Active",
  createdAt:         new Date(),
  updatedAt:         new Date(),
};

await vendors.insertOne(vendor);
console.log(`✓ Vendor restored as ${newId} — PRABHAT INDUSTRIES`);
console.log(`  GST: ${vendor.gstNumber}, PAN: ${vendor.panNumber}`);
console.log(`  Bank: ${vendor.bankName}, A/C: ${vendor.accountNumber}, IFSC: ${vendor.ifscCode}`);
console.log("\nPlease verify the restored record in the Suppliers page and fill in any missing fields.");

await mongoose.disconnect();
