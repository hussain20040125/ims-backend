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

const GRNReceiptItemSchema = new Schema({
  sku:      String,
  itemName: String,
  received: Number,
  images:   [String],
}, { _id: false });

const GRNReceiptSchema = new Schema({
  date:          String,
  challan:       String,
  mrNo:          String,
  docType:       String,
  personName:    String,
  challanPhotos: [String],
  personPhotos:  [String],
  items:         [GRNReceiptItemSchema],
}, { _id: false });

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
  status:             { type: String, enum: ["Draft","Confirmed","Partial","Over-Received"], default: "Draft" },
  receipts:           { type: [GRNReceiptSchema], default: [] },
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
