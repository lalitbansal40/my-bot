import mongoose, { Schema, Document } from "mongoose";

/* ── FIELD DEF ── */
const FieldDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["text", "password", "select", "url", "email", "textarea", "number", "boolean", "json", "key_value"],
      required: true,
    },
    required: { type: Boolean, default: false },
    isSecret: { type: Boolean, default: false },
    options: { type: [String], default: undefined },
    placeholder: String,
    helperText: String,
    defaultValue: Schema.Types.Mixed,
    supportsInterpolation: { type: Boolean, default: false },
    fixedKeys: { type: [String], default: undefined },
    visibleWhen: { type: Schema.Types.Mixed, default: undefined },
  },
  { _id: false }
);

/* ── OUTPUT DEF ── */
const OutputDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    type: {
      type: String,
      enum: ["string", "number", "boolean", "object", "array"],
      default: "string",
    },
    description: String,
  },
  { _id: false }
);

/* ── ACTION DEF ── */
const ActionDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    configSchema: { type: [FieldDefSchema], default: [] },
    outputSchema: { type: [OutputDefSchema], default: undefined },
    channelTypes: { type: [String], default: undefined },
  },
  { _id: false }
);

/* ── TRIGGER DEF ── */
const TriggerDefSchema = new Schema(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    description: { type: String, required: true },
    configSchema: { type: [FieldDefSchema], default: undefined },
    outputSchema: { type: [OutputDefSchema], default: undefined },
    webhookEvent: String,
  },
  { _id: false }
);

export interface IntegrationAppDocument extends Document {
  slug: string;
  name: string;
  description: string;
  category: "payments" | "logistics" | "crm" | "productivity" | "ecommerce" | "communication" | "other";
  color: string;
  bgColor: string;
  icon?: string;
  available: boolean;
  fields: any[];
  actions: any[];
  triggers: any[];
  order: number;
  docsUrl?: string;
}

const IntegrationAppSchema = new Schema<IntegrationAppDocument>(
  {
    slug: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["payments", "logistics", "crm", "productivity", "ecommerce", "communication", "other"],
      required: true,
    },
    color: { type: String, required: true },
    bgColor: { type: String, required: true },
    icon: String,
    available: { type: Boolean, default: false },
    fields: [FieldDefSchema],
    actions: [ActionDefSchema],
    triggers: [TriggerDefSchema],
    order: { type: Number, default: 0 },
    docsUrl: String,
  },
  { timestamps: true }
);

export default mongoose.model<IntegrationAppDocument>(
  "IntegrationApp",
  IntegrationAppSchema
);
