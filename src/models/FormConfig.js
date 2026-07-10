import mongoose, { Schema } from "mongoose";

const ValidationSchema = new Schema({
  min:          Number,
  max:          Number,
  minLength:    Number,
  maxLength:    Number,
  pattern:      String,
  errorMessage: String,
}, { _id: false });

const ConditionalLogicSchema = new Schema({
  dependsOn: String,
  operator:  { type: String, enum: ["equals", "not_equals", "contains", "empty", "not_empty"], default: "equals" },
  value:     String,
}, { _id: false });

const FieldConfigSchema = new Schema({
  fieldId:          { type: String, required: true },
  label:            { type: String, required: true },
  originalLabel:    String,
  type:             { type: String, default: "text", enum: ["text","number","date","select","textarea","file","checkbox","email","tel","calculated"] },
  required:         { type: Boolean, default: false },
  visible:          { type: Boolean, default: true },
  order:            { type: Number, default: 0 },
  options:          [String],
  placeholder:      String,
  helpText:         String,
  defaultValue:     Schema.Types.Mixed,
  colSpan:          { type: Number, default: 2, enum: [1, 2, 3] },
  rolesVisible:     [String],
  conditionalLogic: ConditionalLogicSchema,
  validation:       ValidationSchema,
  formula:          String,
  isCore:           { type: Boolean, default: false },
  isCustom:         { type: Boolean, default: false },
}, { _id: false });

const VersionSchema = new Schema({
  fields:   [FieldConfigSchema],
  savedAt:  { type: Date, default: Date.now },
  savedBy:  String,
}, { _id: false });

const FormConfigSchema = new Schema({
  formId:      { type: String, required: true, unique: true },
  formName:    { type: String, required: true },
  section:     { type: String, default: "General" },
  description: String,
  fields:      [FieldConfigSchema],
  versions:    { type: [VersionSchema], default: [] },
}, { timestamps: true });

export const FormConfig = mongoose.model("FormConfig", FormConfigSchema);
