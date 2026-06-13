import mongoose, { Schema } from "mongoose";

const StockCheckItemSchema = new Schema({
  sku:           { type: String, required: true },
  itemName:      { type: String, required: true },
  systemStock:   { type: Number, required: true },
  physicalStock: { type: Number, required: true },
  variance:      { type: Number, required: true },
  unit:          { type: String, required: true },
});

const StockCheckReportSchema = new Schema({
  id:             { type: String, required: true, unique: true },
  date:           { type: Date,   required: true },
  category:       { type: String, required: true },
  performedBy:    { type: String, required: true },
  items:          [StockCheckItemSchema],
  status:         { type: String, enum: ["Completed","Pending Approval","Approved","Rejected"], default: "Completed" },
  approvalReason: String,
  approvedBy:     String,
}, { timestamps: true });

StockCheckReportSchema.index({ date: 1 });
StockCheckReportSchema.index({ category: 1 });

export const StockCheckReport = mongoose.model("StockCheckReport", StockCheckReportSchema);
