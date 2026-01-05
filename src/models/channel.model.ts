import { Schema, model, models, Types } from "mongoose";

export interface ChannelDocument {
  channel_name: string;          // e.g. cake-arena
  phone_number_id: string;       // WhatsApp phone_number_id
  display_phone_number: string;  // 917378226593
  access_token: string;          // WhatsApp access token

  account_id: Types.ObjectId;    // 🔥 NEW (User / Account ID)

  is_active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const ChannelSchema = new Schema<ChannelDocument>(
  {
    channel_name: {
      type: String,
      required: true,
      index: true,
    },

    phone_number_id: {
      type: String,
      required: true,
      unique: true, // 🔥 one channel per WhatsApp number
      index: true,
    },

    display_phone_number: {
      type: String,
      required: true,
    },

    access_token: {
      type: String,
      required: true,
    },

    // ✅ ACCOUNT / USER LINK
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "channels",
  }
);

// 🔥 Helpful compound index
ChannelSchema.index({ account_id: 1, is_active: 1 });

export const Channel =
  models.Channel || model<ChannelDocument>("Channel", ChannelSchema);
