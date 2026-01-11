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
  | "send_utility_template"
  | "distance_check"
  | "google_sheet"
  | "razorpay_payment"
  | "borzo_delivery";

/* ---------- NODE ---------- */
export interface AutomationNode {
  /* =========================
     CORE
  ========================= */
  id: string;
  type: AutomationNodeType;

  /* =========================
     COMMON (ALL NODES)
  ========================= */
  message?: string;

  buttons?: {
    type: string;
    id: string;
    title: string;
  }[];

  save_to?: string;
  validation?: "email" | "phone" | "text";

  /* =========================
     FLOW NODE
  ========================= */
  flow_id?: string;
  header?: string;
  body?: string;
  cta?: string;
  startScreen?: string;

  /* =========================
     DISTANCE CHECK
  ========================= */
  reference_lat?: number;
  reference_lng?: number;
  max_distance_km?: number;

  /* =========================
     INTEGRATION (COMMON)
  ========================= */
  integration_slug?: string; // google_sheet | razorpay | borzo | shiprocket etc.

  /* =========================
     GOOGLE SHEET NODE
  ========================= */
  spreadsheet_id?: string;
  sheet_name?: string;
  action?: "create" | "update" | "delete";
  map?: Record<string, string>; // {{template}} based mapping

  /* =========================
     RAZORPAY PAYMENT NODE
  ========================= */
  amount?: string;
  currency?: string;
  receipt?: string;

  /* =========================
     BORZO DELIVERY NODE
  ========================= */
  borzo_action?:
  | "calculate"
  | "create"
  | "update"
  | "cancel"
  | "track"
  | "get_order";

  vehicle_type_id?: number;

  pickup?: {
    address?: string;     // {{address}}
    latitude?: string;    // {{addressData.latitude}}
    longitude?: string;   // {{addressData.longitude}}
  };

  drop?: {
    address?: string;
    latitude?: string;
    longitude?: string;
  };

  order_id?: string; // used for update / cancel / track

  /* =========================
     FUTURE / CUSTOM
  ========================= */
  config?: Record<string, any>; // shiprocket, webhook, email, sms, etc.
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
  account_id: mongoose.Types.ObjectId;
  nodes: AutomationNode[];
  edges: AutomationEdge[];

  is_fallback_automation: boolean;
  automation_type: "builder";

  createdAt: Date;
  updatedAt: Date;
  keywords: string[]
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
        "distance_check",
        "google_sheet",
        "razorpay_payment",
        "borzo_delivery",
      ],
      required: true,
    },

    /* ===== COMMON ===== */
    message: String,

    buttons: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
        },
      ],
      default: undefined,
    },

    save_to: String,
    validation: {
      type: String,
      enum: ["email", "phone", "text"],
    },

    /* ===== FLOW ===== */
    flow_id: String,
    header: String,
    body: String,
    cta: String,
    startScreen: String,

    /* ===== DISTANCE ===== */
    reference_lat: Number,
    reference_lng: Number,
    max_distance_km: Number,

    /* ===== INTEGRATION ===== */
    integration_slug: String,

    /* ===== GOOGLE SHEET ===== */
    spreadsheet_id: String,
    sheet_name: String,
    action: String,
    map: Schema.Types.Mixed,

    /* ===== BORZO ===== */
    borzo_action: String,
    vehicle_type_id: Number,

    pickup: {
      address: String,
      latitude: String,
      longitude: String,
    },

    drop: {
      address: String,
      latitude: String,
      longitude: String,
    },

    order_id: String,

    /* ===== RAZORPAY ===== */
    amount: String,
    currency: String,
    receipt: String,

    /* ===== FUTURE ===== */
    config: Schema.Types.Mixed,
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
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

  },
  {
    timestamps: true,
  }
);

// Fast lookup for active automation per channel
AutomationSchema.index({
  account_id: 1,
  channel_id: 1,
  trigger: 1,
  status: 1,
});

const Automation =
  mongoose.models.Automation ||
  mongoose.model<AutomationDocument>("Automation", AutomationSchema);

export default Automation;
