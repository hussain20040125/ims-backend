import mongoose, { Schema } from "mongoose";

const SupplierSchema = new Schema({
  id:                 { type: String, required: true, unique: true },
  email:              { type: String, required: true },
  companyName:        { type: String, required: true, unique: true },
  ownerName:          { type: String, required: true },
  mobile:             { type: String, required: true },
  altMobile:          String,
  website:            String,
  address:            { type: String, required: true },
  dealingProducts:    { type: String, required: true },
  references:         String,
  avgTurnover:        String,
  additionalInfo:     String,
  accountHolderName:  { type: String, required: true },
  bankName:           { type: String, required: true },
  accountNumber:      { type: String, required: true },
  ifscCode:           { type: String, required: true },
  branch:             { type: String, required: true },
  panNumber:          { type: String, required: true },
  gstNumber:          String,
  gstCertificateUrl:  String,
  panCardUrl:         { type: String, required: true },
  bankProofUrl:       { type: String, required: true },
  businessCardUrl:    String,
  processCoordinator: String,
  status:             { type: String, enum: ["Active","Inactive"], default: "Active" },
  // Alias fields
  name:     { type: String, required: true },   // = companyName
  contact:  { type: String, required: true },   // = ownerName
  phone:    { type: String, required: true },   // = mobile
  category: { type: String, required: true },   // = dealingProducts
  gst:      { type: String },                   // = gstNumber
}, { timestamps: true });

SupplierSchema.index({ name: 1 });
SupplierSchema.index({ ownerName: 1 });
SupplierSchema.index({ email: 1 });
SupplierSchema.index({ mobile: 1 });
SupplierSchema.index({ contact: 1 });
SupplierSchema.index({ phone: 1 });
SupplierSchema.index({ updatedAt: -1 });

export const Supplier = mongoose.model("Supplier", SupplierSchema);
export const Vendor = Supplier;
