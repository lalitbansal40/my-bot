import mongoose, { Schema, Document } from "mongoose";

export type MessageDirection = "IN" | "OUT";

export type MessageStatus =
  | "PENDING"     // saved, not yet sent
  | "SENT"        // WhatsApp accepted
  | "DELIVERED"   // delivered to user
  | "READ"        // user read
  | "FAILED";     // API error / webhook error

export type MessageType =
  | "text"
  | "button"
  | "flow"
  | "template"
  | "image"
  | "document"
  | "location"
  | "unknown";

export interface MessageDocument extends Document {
  channel_id: mongoose.Types.ObjectId;
  contact_id: mongoose.Types.ObjectId;

  direction: MessageDirection;
  type: MessageType;

  status: MessageStatus;

  wa_message_id?: string; // WhatsApp message id
  payload: Record<string, any>; // 🔥 full raw message

  error?: string;

  createdAt: Date;
  updatedAt: Date;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    channel_id: { type: Schema.Types.ObjectId, ref: "Channel", index: true },
    contact_id: { type: Schema.Types.ObjectId, ref: "Contact", index: true },

    direction: { type: String, enum: ["IN", "OUT"], required: true },
    type: { type: String, required: true },

    status: {
      type: String,
      enum: ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"],
      default: "PENDING",
      index: true,
    },

    wa_message_id: { type: String, index: true },

    payload: { type: Schema.Types.Mixed, required: true },

    error: { type: String },
  },
  { timestamps: true }
);

const Message =
  mongoose.models.Message ||
  mongoose.model<MessageDocument>("Message", MessageSchema);

export default Message;
