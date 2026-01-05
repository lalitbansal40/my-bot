// models/integration.model.ts
import mongoose, { Schema, Document } from "mongoose";

export interface IntegrationDocument extends Document {
  user_id: mongoose.Types.ObjectId;
  slug: "google_sheet" | "razorpay" | "borzo" | "shiprocket";
  is_active: boolean;
  config: Record<string, any>;
}

const IntegrationSchema = new Schema<IntegrationDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      index: true,
      required: true,
    },

    slug: {
      type: String,
      required: true,
      index: true,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    config: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

IntegrationSchema.index({ user_id: 1, type: 1 }, { unique: true });

export default mongoose.model<IntegrationDocument>(
  "Integration",
  IntegrationSchema
);
