import mongoose, { Schema, Document } from "mongoose";

/* =========================
   TYPESCRIPT TYPES
========================= */

export type AutomationNodeType =
  | "trigger"
  | "auto_reply"
  | "ask_location"
  | "ask_user_input"
  | "send_flow"
  | "send_utility_template";

/* ---------- NODE ---------- */
export interface AutomationNode {
  id: string;
  type: AutomationNodeType;

  conditions?: {
    match_type: "exact" | "contains" | "starts_with";
    keywords: string[];
  };
  // common
  message?: string;

  // buttons (auto_reply)
  buttons?: {
    id: string;
    title: string;
  }[];

  // ask_user_input
  save_to?: string;
  validation?: "email" | "phone" | "text";

  // send_flow
  flow_id?: string;
  header?: string;
  body?: string;
  cta?: string;
  startScreen?: string;

  // utility template
  template_name?: string;
  language?: string;
  parameters?: string[];
  keywords?: string[];


}

/* ---------- EDGE ---------- */
export interface AutomationEdge {
  from: string;
  to: string;
  condition?: string; // 🔥 REQUIRED for buttons
}

/* ---------- DOCUMENT ---------- */
export interface AutomationDocument extends Document {
  name: string;
  trigger: "new_message_received";
  status: "active" | "paused";
  disable_automation: boolean;

  channel_id: mongoose.Types.ObjectId;

  nodes: AutomationNode[];
  edges: AutomationEdge[];

  is_fallback_automation: boolean;
  automation_type: "builder";

  createdAt: Date;
  updatedAt: Date;
  keywords:string[]
}

/* =========================
   SCHEMAS
========================= */

/* ---------- NODE SCHEMA ---------- */
const AutomationNodeSchema = new Schema<AutomationNode>(
  {
    id: { type: String, required: true },

    type: {
      type: String,
      enum: [
        "trigger",
        "auto_reply",
        "ask_location",
        "ask_user_input",
        "send_flow",
        "send_utility_template",
      ],
      required: true,
    },

    message: { type: String },

    buttons: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
        },
      ],
      default: undefined,
    },

    save_to: { type: String },
    validation: {
      type: String,
      enum: ["email", "phone", "text"],
    },

    flow_id: { type: String },
    header: { type: String },
    body: { type: String },
    cta: { type: String },
    startScreen: { type: String },

    template_name: { type: String },
    language: { type: String, default: "en" },
    parameters: [{ type: String }],
  },
  { _id: false }
);

/* ---------- EDGE SCHEMA ---------- */
const AutomationEdgeSchema = new Schema<AutomationEdge>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    condition: { type: String }, // 🔥 button id / condition
  },
  { _id: false }
);

/* ---------- AUTOMATION SCHEMA ---------- */
const AutomationSchema = new Schema<AutomationDocument>(
  {
    name: { type: String, required: true },

    trigger: {
      type: String,
      enum: ["new_message_received"],
      required: true,
    },

    status: {
      type: String,
      enum: ["active", "paused"],
      default: "active",
    },

    disable_automation: {
      type: Boolean,
      default: false,
    },

    channel_id: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },

    automation_type: {
      type: String,
      enum: ["builder"],
      default: "builder",
    },

    is_fallback_automation: {
      type: Boolean,
      default: false,
    },

    nodes: {
      type: [AutomationNodeSchema],
      required: true,
    },

    edges: {
      type: [AutomationEdgeSchema],
      required: true,
    },
    keywords: [{ type: String }],
  },
  {
    timestamps: true,
  }
);

/* =========================
   INDEXES
========================= */

// Fast lookup for active automation per channel
AutomationSchema.index({
  channel_id: 1,
  trigger: 1,
  status: 1,
});

/* =========================
   MODEL EXPORT
========================= */

const Automation =
  mongoose.models.Automation ||
  mongoose.model<AutomationDocument>("Automation", AutomationSchema);

export default Automation;
