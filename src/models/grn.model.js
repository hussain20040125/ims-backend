import mongoose, { Schema } from "mongoose";

const GRNItemSchema = new Schema({
  sku:       String,
  itemName:  String,
  ordered:   Number,
  received:  Number,
  variance:  Number,
  unit:      String,
  condition: String,
  images:    [String],
});

const GRNSchema = new Schema({
  id:                 { type: String, required: true, unique: true },
  poId:               String,
  project:            String,
  destinationProject: String,
  supplier:           String,
  date:               String,
  challan:            String,
  mrNo:               String,
  gatePassNo:         String,
  docType:            { type: String, enum: ["Challan","Invoice","Bilty","Gate Pass","Without Challan","Without Gate Pass"] },
  items:              [GRNItemSchema],
  status:             { type: String, enum: ["Draft","Confirmed"], default: "Draft" },
  materialImageUrl:   String,
  challanImageUrl:    String,
  challanPhotos:      [String],
  personName:         String,
  personPhotoUrl:     String,
  personPhotos:       [String],
}, { timestamps: true });

GRNSchema.index({ poId: 1 });
GRNSchema.index({ project: 1 });
GRNSchema.index({ supplier: 1 });
GRNSchema.index({ updatedAt: -1 });

export const GRN = mongoose.model("GRN", GRNSchema);
