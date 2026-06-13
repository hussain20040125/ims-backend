import mongoose, { Schema } from "mongoose";

const MaterialPlanRevisionSchema = new Schema({
  id:                    { type: String, required: true, unique: true },
  planId:                { type: String, required: true },
  planItemSku:           { type: String, required: true },
  itemName:              String,
  engineerName:          String,
  engineerId:            String,
  project:               String,
  unit:                  String,
  gmAgm:                 String,
  currentAllocatedQty:   { type: Number, default: 0 },
  requestedExtraQty:     { type: Number, required: true },
  reason:                { type: String, required: true },
  status:                { type: String, enum: ["pending","approved","rejected"], default: "pending" },
  reviewedBy:            String,
  reviewNote:            String,
  reviewedAt:            String,
}, { timestamps: true });

MaterialPlanRevisionSchema.index({ planId: 1 });
MaterialPlanRevisionSchema.index({ status: 1 });
MaterialPlanRevisionSchema.index({ engineerName: 1 });

export const MaterialPlanRevision = mongoose.model("MaterialPlanRevision", MaterialPlanRevisionSchema);
