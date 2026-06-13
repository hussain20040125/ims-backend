import mongoose, { Schema } from "mongoose";

const PlanLineItemSchema = new Schema({
  sku:       String,
  itemName:  String,
  required:  Number,
  unit:      String,
  available: Number,
  reusable:  Number,
  shortage:  Number,
  priority:  { type: String, enum: ["High","Medium","Low"] },
  delivery:  String,
  activity:  String,
});

const MaterialPlanSchema = new Schema({
  id:          { type: String, required: true, unique: true },
  project:     String,
  milestone:   String,
  workType:    String,
  location:    String,
  engineer:    String,
  gmAgm:       String,
  date:        String,
  status:      { type: String, enum: ["Draft","Pending Approval","Approved","Rejected","PO Raised","Fulfilled","Open"], default: "Draft" },
  submittedBy: String,
  submittedAt: Date,
  approvedBy:  String,
  approvedAt:  Date,
  rejectedBy:  String,
  rejectedAt:  Date,
  rejectionReason: String,
  items:       [PlanLineItemSchema],
  editHistory: [{ date: Date, editedBy: String, previousItems: [PlanLineItemSchema] }],
}, { timestamps: true });

MaterialPlanSchema.index({ project: 1 });
MaterialPlanSchema.index({ status: 1 });
MaterialPlanSchema.index({ updatedAt: -1 });

export const MaterialPlan = mongoose.model("MaterialPlan", MaterialPlanSchema);
