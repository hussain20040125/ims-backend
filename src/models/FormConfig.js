import mongoose, { Schema } from "mongoose";

const FieldConfigSchema = new Schema({
  fieldId:       { type: String, required: true },
  label:         { type: String, required: true },
  originalLabel: String,
  type:          { type: String, default: "text", enum: ["text","number","date","select","textarea","file","checkbox","email","tel"] },
  required:      { type: Boolean, default: false },
  visible:       { type: Boolean, default: true },
  order:         { type: Number, default: 0 },
  options:       [String],
  placeholder:   String,
  helpText:      String,
  isCore:        { type: Boolean, default: false },
  isCustom:      { type: Boolean, default: false },
}, { _id: false });

const FormConfigSchema = new Schema({
  formId:      { type: String, required: true, unique: true },
  formName:    { type: String, required: true },
  section:     { type: String, default: "General" },
  description: String,
  fields:      [FieldConfigSchema],
}, { timestamps: true });

export const FormConfig = mongoose.model("FormConfig", FormConfigSchema);
