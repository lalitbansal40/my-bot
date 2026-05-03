import mongoose, { Schema, Document } from "mongoose";

export type MessageDirection = "IN" | "OUT";

export type MessageStatus =
  | "PENDING"
  | "SENT"
  | "DELIVERED"
  | "READ"
  | "FAILED"
  | "CALL_INITIATED"
  | "CALL_RINGING"
  | "CALL_COMPLETED"
  | "CALL_FAILED"
  | "CALL_NO_ANSWER"
  | "CALL_BUSY"
  | "CALL_REJECTED";

export type MessageType =
  | "text"
  | "button"
  | "flow"
  | "list"
  | "interactive"
  | "template"
  | "image"
  | "document"
  | "location"
  | "contact"
  | "sticker"
  | "video"
  | "audio"
  | "vcard"
  | "poll"
  | "reaction"
  | "location"

  | "call" // 🔥 ADD THIS
  | "unknown";

export interface MessageDocument extends Document {
  channel_id: mongoose.Types.ObjectId;
  contact_id: mongoose.Types.ObjectId;

  direction: MessageDirection;
  type: MessageType;

  text?: string;

  media?: {
    url?: string;
    mime_type?: string;
    filename?: string;
  };

  status: MessageStatus;

  wa_message_id?: string;
  payload: Record<string, any>;

  // 🔥 CALL DATA (NEW)
  call?: {
    call_id: string;
    from: string;
    to: string;
    direction: string;
    event: string;
    status: string;
    timestamp: number;
    duration?: number;
  };

  error?: {
    code?: number;
    message?: string;
    details?: string;
  };

  reply_to?: string | null;

  createdAt: Date;
  updatedAt: Date;
  is_read: boolean;
}

const MessageSchema = new Schema<MessageDocument>(
  {
    channel_id: { type: Schema.Types.ObjectId, ref: "Channel" },
    contact_id: { type: Schema.Types.ObjectId, ref: "Contact", index: true },

    direction: { type: String, enum: ["IN", "OUT"], required: true },

    type: {
      type: String,
      enum: [
        "text",
        "button",
        "flow",
        "template",
        "image",
        "document",
        "location",
        "list",
        "interactive",
        "call", // 🔥
        "unknown",
        "contact",
        "sticker",
        "video",
        "audio",
        "vcard",
        "poll",
        "reaction",
        "location",
        "carousel",
        "cta_url",
        "address_message",
        "product_list",
        "single_product",
        "location_request"
      ],
      required: true,
    },

    is_read: {
      type: Boolean,
      default: false,
    },

    status: {
      type: String,
      enum: [
        "PENDING",
        "SENT",
        "DELIVERED",
        "READ",
        "FAILED",
        "CALL_INITIATED",
        "CALL_RINGING",
        "CALL_COMPLETED",
        "CALL_FAILED",
        "CALL_NO_ANSWER",
        "CALL_BUSY",
        "CALL_REJECTED",
      ],
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

    // 🔥 NEW FIELD
    call: {
      call_id: String,
      from: String,
      to: String,
      direction: String,
      event: String,
      status: String,
      timestamp: Number,
      duration: Number,
    },

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
  { timestamps: true }
);

// 🔥 INDEXES
MessageSchema.index({ contact_id: 1, createdAt: -1 });

// 🔥 UNIQUE (VERY IMPORTANT FOR DUPLICATE)
MessageSchema.index(
  { wa_message_id: 1 },
  { unique: true, sparse: true }
);

const Message =
  mongoose.models.Message ||
  mongoose.model<MessageDocument>("Message", MessageSchema);

export default Message;