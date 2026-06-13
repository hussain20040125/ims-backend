import mongoose, { Schema } from "mongoose";

const InventorySchema = new Schema({
  sku:          { type: String, required: true, unique: true },
  itemName:     { type: String, required: true },
  category:     { type: String, required: true },
  subCategory:  { type: String, required: true },
  unit:         { type: String, required: true },
  openingStock: { type: Number, default: 0 },
  totalQty:     { type: Number, default: 0 },      // total_qty = available + allocated + issued
  availableQty: { type: Number, default: 0 },      // Layer 1: Free stock
  allocatedQty: { type: Number, default: 0 },      // Layer 2: Reserved/Locked for MR
  issuedQty:    { type: Number, default: 0 },      // Layer 3: Physically moved out
  liveStock:    { type: Number, default: 0 },      // Legacy/Compatibility
  condition:    { type: String, enum: ["New","Good","Needs Repair","Damaged","NEW","GOOD","NEEDS REPAIR","DAMAGED"], default: "New" },
  sourceSite:   String,
  lastProject:  String,
}, { timestamps: true });

InventorySchema.pre("save", async function () {
  if (this.liveStock !== undefined) {
    this.availableQty = Math.max(0, (this.liveStock || 0) - (this.allocatedQty || 0));
    this.totalQty     = (this.liveStock || 0) + (this.issuedQty || 0);
  }
});

InventorySchema.index({ itemName: 1 });
InventorySchema.index({ category: 1 });
InventorySchema.index({ updatedAt: -1 });

export const Inventory = mongoose.model("Inventory", InventorySchema);
