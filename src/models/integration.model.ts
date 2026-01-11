import mongoose, { Schema, Document } from "mongoose";

export type IntegrationSlug =
  | "google_sheet"
  | "razorpay"
  | "borzo"
  | "shiprocket";

export interface IntegrationDocument extends Document {
  user_id: mongoose.Types.ObjectId;

  slug: IntegrationSlug;
  is_active: boolean;

  /**
   * NON-SECRET config only
   * eg:
   *  - spreadsheet_id
   *  - sheet_name
   *  - environment flags
   */
  config: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

const IntegrationSchema = new Schema<IntegrationDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    slug: {
      type: String,
      enum: [
        "google_sheet",
        "razorpay",
        "borzo",
        "shiprocket",
      ],
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

/**
 * 🔥 ONE integration per account per service
 */
IntegrationSchema.index(
  { user_id: 1, slug: 1 },
  { unique: true }
);

export default mongoose.model<IntegrationDocument>(
  "Integration",
  IntegrationSchema
);
