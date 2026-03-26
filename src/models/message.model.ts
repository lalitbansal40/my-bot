import mongoose, { Schema, Document } from "mongoose";

export type MessageDirection = "IN" | "OUT";

export type MessageStatus =
  | "PENDING" // saved, not yet sent
  | "SENT" // WhatsApp accepted
  | "DELIVERED" // delivered to user
  | "READ" // user read
  | "FAILED"; // API error / webhook error

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
  text: { type: String };

  media: {
    url: String;
    mime_type: String;
    filename: String;
  };

  status: MessageStatus;

  wa_message_id?: string; // WhatsApp message id
  payload: Record<string, any>; // 🔥 full raw message

  error?: string;
  reply_to?: string | null;

  createdAt: Date;
  updatedAt: Date;
  is_read: boolean;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    channel_id: { type: Schema.Types.ObjectId, ref: "Channel", index: true },
    contact_id: { type: Schema.Types.ObjectId, ref: "Contact", index: true },

    direction: { type: String, enum: ["IN", "OUT"], required: true },
    type: { type: String, required: true },

    is_read: {
      type: Boolean,
      default: false,
    },
    status: {
      type: String,
      enum: ["PENDING", "SENT", "DELIVERED", "READ", "FAILED"],
      default: "PENDING",
      index: true,
    },

    wa_message_id: { type: String, index: true },
    text: { type: String },

    media: {
      url: String,
      mime_type: String,
      filename: String,
    },

    payload: { type: Schema.Types.Mixed, required: true },
    reply_to: {
      type: String,
      default: null,
    },

    error: {
      code: Number,
      message: String,
      details: String,
    },
  },
  { timestamps: true },
);
MessageSchema.index({ contact_id: 1, createdAt: -1 });
MessageSchema.index({ wa_message_id: 1 });
const Message =
  mongoose.models.Message ||
  mongoose.model<MessageDocument>("Message", MessageSchema);

export default Message;
