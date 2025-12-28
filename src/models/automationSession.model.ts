import mongoose, { Schema, Document } from "mongoose";

/* =========================
   TYPESCRIPT INTERFACE
========================= */

export interface AutomationSessionDocument extends Document {
  phone: string;

  automation_id: mongoose.Types.ObjectId;
  channel_id: mongoose.Types.ObjectId;

  contact_id: mongoose.Types.ObjectId; // ✅ ADD THIS

  current_node: string;

  data: Record<string, any>;

  waiting_for: string | null;

  last_message_at: Date;

  status: "active" | "completed" | "expired";

  createdAt: Date;
  updatedAt: Date;
}


/* =========================
   SCHEMA
========================= */

const AutomationSessionSchema = new Schema<AutomationSessionDocument>({
  phone: { type: String, required: true, index: true },

  automation_id: {
    type: Schema.Types.ObjectId,
    ref: "Automation",
    required: true,
    index: true,
  },

  channel_id: {
    type: Schema.Types.ObjectId,
    ref: "Channel",
    required: true,
    index: true,
  },

  contact_id: {                 // ✅ NEW
    type: Schema.Types.ObjectId,
    ref: "Contact",
    required: true,
    index: true,
  },

  current_node: {
    type: String,
    required: true,
    default: "start",
  },

  data: { type: Schema.Types.Mixed, default: {} },

  waiting_for: { type: String, default: null },

  last_message_at: { type: Date, default: Date.now },

  status: {
    type: String,
    enum: ["active", "completed", "expired"],
    default: "active",
    index: true,
  },
});


/* =========================
   INDEXES
========================= */

// Ensure only one active session per phone per automation
AutomationSessionSchema.index(
  {
    phone: 1,
    automation_id: 1,
    status: 1,
  },
  {
    unique: true,
    partialFilterExpression: { status: "active" },
  }
);

// Optional: Auto-expire inactive sessions (24 hours)
AutomationSessionSchema.index(
  { last_message_at: 1 },
  { expireAfterSeconds: 60 * 60 * 24 }
);

/* =========================
   MODEL EXPORT
========================= */

const AutomationSession =
  mongoose.models.AutomationSession ||
  mongoose.model<AutomationSessionDocument>(
    "AutomationSession",
    AutomationSessionSchema
  );

export default AutomationSession;
