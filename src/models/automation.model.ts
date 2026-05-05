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
  | "borzo_delivery"
  | "ask_input"
  | "carousel"
  | "address_message"
  | "call_to_action"
  | "api_request"
  | "send_template"
  | "set_contact_attribute"
  | "list"
  | "payment_summary"
  | "product_list"
  | "single_product"
  | "integration_action"; // 🔥 generic integration action — slug + action_key + config

/* ---------- NODE ---------- */
export interface AutomationNode {
  /* =========================
     CORE
  ========================= */
  id: string;
  type: AutomationNodeType;
  position?: {
    x: number;
    y: number;
  };
  /* ===== CAROUSEL ===== */
  cards?: {
    id: string;
    body: string;
    media?: {
      type?: "image" | "video";
      url: string;
      name?: string;
    };
    buttons?: {
      id: string;
      title: string;
      type: string;
      nextNode?: string;
      url?: string;
    }[];
  }[];

  flows?: {
    id: string;
    name: string;
    status: string;
  }[];

  messageType?: string;
  list?: any;
  label?: string;
  _updatedAt?: number;
  sections?: {
    title: string;
    rows: {
      id: string;
      title: string;
      description?: string;
    }[];
  }[];
  url?: string;


  button_text?: string;

  /* =========================
     COMMON (ALL NODES)
  ========================= */
  message?: string;

  buttons?: {
    type: string;
    id: string;
    title: string;
  }[];

  template?: {
    name: string;
    language?: string;
    header?: {
      type: "image" | "video" | "document";
      link: string;
    };
    body?: string[];
    buttons?: {
      type: "url" | "quick_reply";
      text: string;
      url?: string;
    }[];
  };

  media?: {
    type?: "image" | "video";
    url: string;
  };

  save_to?: string;
  validation?: "email" | "phone" | "text";

  /* =========================
     FLOW NODE
  ========================= */
  flow_id?: string;
  items?: {
    id: string;
    title: string;
    description?: string;
  }[];

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
     INTEGRATION (COMMON / GENERIC)
  ========================= */
  integration_slug?: string; // google_sheet | razorpay | borzo | shiprocket etc.
  action_key?: string;       // 🔥 NEW — which action of the slug
  trigger_key?: string;      // for trigger nodes that wrap an integration trigger

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
    address?: string; // {{address}}
    latitude?: string; // {{addressData.latitude}}
    longitude?: string; // {{addressData.longitude}}
  };

  drop?: {
    address?: string;
    latitude?: string;
    longitude?: string;
  };

  order_id?: string; // used for update / cancel / track

  /* =========================
     PRODUCT CATALOG
  ========================= */
  catalog_id?: string;
  product_retailer_id?: string;
  footer?: string;

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
  channel_name: string;

  trigger:
  | "new_message_received"
  | "outgoing_message"
  | "webhook_received"
  | "call_completed"
  | "call_missed"
  | "integration_trigger"; // 🔥 NEW — see trigger_config for slug/key
  status: "active" | "paused";
  disable_automation: boolean;

  /** When trigger === "integration_trigger" this carries the source */
  trigger_config?: {
    slug?: string;          // razorpay, borzo, shopify…
    trigger_key?: string;   // payment_captured, order_delivered…
    filters?: Record<string, any>;
    [key: string]: any;
  };

  channel_id: mongoose.Types.ObjectId;
  account_id: mongoose.Types.ObjectId;
  nodes: AutomationNode[];
  edges: AutomationEdge[];

  is_fallback_automation: boolean;
  automation_type: "builder";

  createdAt: Date;
  updatedAt: Date;
  keywords: string[];
}

/* =========================
   SCHEMAS
========================= */

const CarouselButtonSchema = new Schema<any>(
  {
    id: String,
    title: String,
    type: String,
    nextNode: String,
    url: String,
  },
  { _id: false },
);

const CarouselCardSchema = new Schema<any>(
  {
    id: String,
    body: String,
    media: {
      type: {
        type: String,
        enum: ["image", "video"],
      },
      url: String,
      name: String,
    },
    buttons: {
      type: [CarouselButtonSchema],
      default: undefined,
    },
  },
  { _id: false },
);

/* ---------- NODE SCHEMA ---------- */
const AutomationNodeSchema = new Schema<any>(
  {
    id: { type: String, required: true },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },

    /* ===== CAROUSEL ===== */
    cards: {
      type: [CarouselCardSchema],
      default: undefined,
    },

    flows: {
      type: [
        {
          id: String,
          name: String,
          status: String,
        },
      ],
      default: undefined,
    },

    messageType: String,
    list: Schema.Types.Mixed,
    label: String,
    _updatedAt: Number,

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
        "carousel",
        "address_message",
        "call_to_action",
        "api_request",
        "send_template",
        "set_contact_attribute",
        "list",
        "payment_summary",
        "ask_input",
        "product_list",
        "single_product",
        "integration_action", // 🔥 generic
      ],
      required: true,
    },
    template: {
      name: { type: String },
      language: { type: String, default: "en" },
      header: {
        type: {
          type: String,
          enum: ["image", "video", "document"],
        },
        link: String,
      },
      body: {
        type: [String],
        default: undefined,
      },
      buttons: {
        type: [
          {
            type: { type: String },
            text: String,
            url: String,
          },
        ],
        default: undefined,
      },
    },
    sections: [
      {
        title: String,
        rows: [
          {
            id: String,
            title: String,
            description: String,
          },
        ],
      },
    ],

    /* ===== COMMON ===== */
    message: String,

    buttons: {
      type: [
        {
          id: { type: String, required: true },
          title: { type: String, required: true },
          type: { type: String },        // 🔥 ADD THIS
          nextNode: { type: String },    // 🔥 ADD THIS
        },
      ],
      default: undefined,
    },
    url: {
      type: String,
    },

    button_text: {
      type: String,
    },

    save_to: String,
    validation: {
      type: String,
      enum: ["email", "phone", "text"],
    },
    media: {
      type: {
        type: String,
        enum: ["image", "video"],
        default: "image",
      },
      url: {
        type: String,
      },
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

    /* ===== INTEGRATION (GENERIC) ===== */
    integration_slug: String,
    action_key: String,
    trigger_key: String,

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
    items: {
      type: [
        {
          id: { type: String },
          title: { type: String },
          description: { type: String },
          image: { type: String },
        },
      ],
      default: undefined, // 🔥 IMPORTANT
    },

    /* ===== PRODUCT CATALOG ===== */
    catalog_id: String,
    product_retailer_id: String,
    footer: String,

    /* ===== FUTURE ===== */
    config: Schema.Types.Mixed,
  },
  { _id: false },
);

/* ---------- EDGE SCHEMA ---------- */
const AutomationEdgeSchema = new Schema<AutomationEdge>(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    condition: { type: String }, // 🔥 button id / condition
  },
  { _id: false },
);

/* ---------- AUTOMATION SCHEMA ---------- */
const AutomationSchema = new Schema<AutomationDocument>(
  {
    name: { type: String, required: true },
    channel_name: { type: String, required: true },

    trigger: {
      type: String,
      enum: [
        "new_message_received",
        "outgoing_message",
        "webhook_received",
        "call_completed",
        "call_missed",
        "integration_trigger", // 🔥
      ],
      required: true,
    },

    trigger_config: {
      type: Schema.Types.Mixed,
      default: undefined,
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
    keywords: {
      type: [String],
      default: [],
      index: true, // 🔥 performance boost
    },
    account_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
  },
  {
    timestamps: true,
    collection: "automations",
  },
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
