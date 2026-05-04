import mongoose, { Schema, Document } from "mongoose";

export interface IntegrationDocument extends Document {
  account_id: mongoose.Types.ObjectId;
  channel_id: mongoose.Types.ObjectId; // which channel this integration is configured for
  slug: string;
  is_active: boolean;
  config: Record<string, any>;
  secrets: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const IntegrationSchema = new Schema<IntegrationDocument>(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "Account",
      required: true,
      index: true,
    },

    channel_id: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
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

    secrets: {
      type: Schema.Types.Mixed,
      default: {},
      select: false,
    },
  },
  { timestamps: true }
);

// One integration per account per channel per app
IntegrationSchema.index(
  { account_id: 1, channel_id: 1, slug: 1 },
  { unique: true }
);

export default mongoose.model<IntegrationDocument>(
  "Integration",
  IntegrationSchema
);
