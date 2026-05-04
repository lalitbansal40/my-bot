/* =============================================================
   INTEGRATION REGISTRY (SOURCE OF TRUTH)
   -------------------------------------------------------------
   Each app = { credentials fields } + { actions } + { triggers }.
   Each action / trigger declares a configSchema (form fields the
   automation builder shows) and an outputSchema (variables the
   action/trigger writes into session data — usable as
   {{var}} in downstream nodes).

   To add a new integration: add an entry below + register a
   handler in src/integrations/handlers/<slug>.handler.ts +
   (optional) a webhook parser in src/integrations/webhooks/.
============================================================= */

export type FieldType =
  | "text"
  | "password"
  | "select"
  | "url"
  | "email"
  | "textarea"
  | "number"
  | "boolean"
  | "json"
  | "key_value"; // map<string,string>  — Google-Sheets style

export type IntegrationCategory =
  | "payments"
  | "logistics"
  | "crm"
  | "productivity"
  | "ecommerce"
  | "communication"
  | "other";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  isSecret?: boolean;       // true → stored in `secrets`, never returned
  options?: string[];       // for type='select'
  placeholder?: string;
  helperText?: string;
  defaultValue?: any;
  /** Allows {{contact.name}} / {{var}} interpolation at runtime */
  supportsInterpolation?: boolean;
  /** For key_value fields: lock the keys to a fixed list */
  fixedKeys?: string[];
  /** Show this field only when another field has one of these values */
  visibleWhen?: { field: string; equals: any | any[] };
}

export interface OutputDef {
  key: string;        // dotted path, e.g. "payment_link"
  label: string;
  type: "string" | "number" | "boolean" | "object" | "array";
  description?: string;
}

export interface ActionDef {
  key: string;
  label: string;
  description: string;
  /** Form fields shown in the node editor */
  configSchema: FieldDef[];
  /** Variables this action writes to session data after running */
  outputSchema?: OutputDef[];
  /** Channel-types where this action makes sense (default = all) */
  channelTypes?: ("whatsapp" | "sms" | "email" | "any")[];
}

export interface TriggerDef {
  key: string;
  label: string;
  description: string;
  /** Optional filters the user can configure on the trigger */
  configSchema?: FieldDef[];
  /** Variables exposed by this trigger to the automation */
  outputSchema?: OutputDef[];
  /** External webhook event that fires this trigger */
  webhookEvent?: string;
}

export interface IntegrationDefinition {
  slug: string;
  name: string;
  description: string;
  category: IntegrationCategory;
  color: string;
  bgColor: string;
  icon?: string;        // emoji or icon hint
  available: boolean;   // false → "Coming soon"
  fields: FieldDef[];
  actions: ActionDef[];
  triggers: TriggerDef[];
  order?: number;
  connectInfo?: string;
  /** Documentation URL shown on the connect modal */
  docsUrl?: string;
}

/* =============================================================
   COMMON FIELD HELPERS
============================================================= */
const f = {
  text: (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "text", required: false, isSecret: false, supportsInterpolation: true, ...opts,
  }),
  textarea: (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "textarea", required: false, isSecret: false, supportsInterpolation: true, ...opts,
  }),
  number: (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "number", required: false, isSecret: false, supportsInterpolation: true, ...opts,
  }),
  select: (key: string, label: string, options: string[], opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "select", required: false, isSecret: false, options, ...opts,
  }),
  password: (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "password", required: false, isSecret: true, ...opts,
  }),
  kv: (key: string, label: string, opts: Partial<FieldDef> = {}): FieldDef => ({
    key, label, type: "key_value", required: false, isSecret: false, supportsInterpolation: true, ...opts,
  }),
};

/* =============================================================
   APP DEFINITIONS
============================================================= */
export const INTEGRATION_REGISTRY: IntegrationDefinition[] = [
  /* ─────────────── RAZORPAY ─────────────── */
  {
    slug: "razorpay",
    name: "Razorpay",
    description: "Accept payments and automate payment workflows on WhatsApp.",
    category: "payments",
    color: "#2563eb",
    bgColor: "#eff6ff",
    icon: "💳",
    available: true,
    order: 1,
    docsUrl: "https://razorpay.com/docs/api/payments",
    fields: [
      f.text("key_id", "API Key ID", { required: true, placeholder: "rzp_test_...", supportsInterpolation: false }),
      f.password("key_secret", "API Key Secret", { required: true, placeholder: "Razorpay key secret" }),
      f.select("environment", "Environment", ["test", "live"], { required: true, defaultValue: "test" }),
    ],
    actions: [
      {
        key: "create_payment_link",
        label: "Create Payment Link",
        description: "Generate a hosted payment link and send it to the customer.",
        configSchema: [
          f.number("amount", "Amount (₹)", { required: true, placeholder: "{{cart_total}} or 499" }),
          f.text("description", "Description", { required: true, placeholder: "Order #{{order_id}}", defaultValue: "Payment" }),
          f.text("customer_name", "Customer Name", { defaultValue: "{{contact.name}}" }),
          f.text("customer_phone", "Customer Phone", { defaultValue: "{{contact.phone}}" }),
          f.text("customer_email", "Customer Email", { defaultValue: "{{contact.email}}" }),
          f.text("reference_id", "Reference ID", { placeholder: "Internal reference (optional)" }),
          f.number("expire_minutes", "Expire After (minutes)", { defaultValue: 60 }),
          f.text("save_to", "Save Response As", { defaultValue: "razorpay_payment", helperText: "Variable name to access response (e.g. {{razorpay_payment.short_url}})", supportsInterpolation: false }),
        ],
        outputSchema: [
          { key: "id", label: "Payment Link ID", type: "string" },
          { key: "short_url", label: "Short URL", type: "string" },
          { key: "amount", label: "Amount", type: "number" },
          { key: "status", label: "Status", type: "string" },
        ],
      },
      {
        key: "fetch_order",
        label: "Fetch Order",
        description: "Retrieve order details by Razorpay order ID.",
        configSchema: [
          f.text("order_id", "Order ID", { required: true, placeholder: "{{razorpay_order_id}}" }),
          f.text("save_to", "Save Response As", { defaultValue: "razorpay_order", supportsInterpolation: false }),
        ],
        outputSchema: [
          { key: "id", label: "Order ID", type: "string" },
          { key: "amount", label: "Amount", type: "number" },
          { key: "status", label: "Status", type: "string" },
        ],
      },
    ],
    triggers: [
      {
        key: "payment_captured",
        label: "Payment Captured",
        description: "Fires when a payment is successfully captured.",
        webhookEvent: "payment.captured",
        outputSchema: [
          { key: "payment_id", label: "Payment ID", type: "string" },
          { key: "amount", label: "Amount", type: "number" },
          { key: "contact_phone", label: "Customer Phone", type: "string" },
        ],
      },
      {
        key: "payment_failed",
        label: "Payment Failed",
        description: "Fires when a payment attempt fails.",
        webhookEvent: "payment.failed",
        outputSchema: [
          { key: "payment_id", label: "Payment ID", type: "string" },
          { key: "error_description", label: "Error", type: "string" },
          { key: "contact_phone", label: "Customer Phone", type: "string" },
        ],
      },
    ],
  },

  /* ─────────────── BORZO ─────────────── */
  {
    slug: "borzo",
    name: "Borzo",
    description: "Automate last-mile delivery with Borzo courier service.",
    category: "logistics",
    color: "#16a34a",
    bgColor: "#f0fdf4",
    icon: "🚚",
    available: true,
    order: 2,
    docsUrl: "https://borzodelivery.com/api",
    fields: [
      f.password("auth_token", "Auth Token", { required: true, placeholder: "Borzo auth token" }),
      f.select("environment", "Environment", ["test", "production"], { required: true, defaultValue: "test" }),
    ],
    actions: [
      {
        key: "calculate_price",
        label: "Calculate Delivery Price",
        description: "Calculate the price of a delivery without creating an order.",
        configSchema: [
          f.number("vehicle_type_id", "Vehicle Type", { required: true, defaultValue: 7, helperText: "1=Bike, 7=Auto, 8=Van" }),
          f.text("pickup_address", "Pickup Address", { required: true, defaultValue: "{{store_address}}" }),
          f.text("pickup_lat", "Pickup Latitude", { defaultValue: "{{store_lat}}" }),
          f.text("pickup_lng", "Pickup Longitude", { defaultValue: "{{store_lng}}" }),
          f.text("drop_address", "Drop Address", { required: true, defaultValue: "{{address}}" }),
          f.text("drop_lat", "Drop Latitude", { defaultValue: "{{addressData.latitude}}" }),
          f.text("drop_lng", "Drop Longitude", { defaultValue: "{{addressData.longitude}}" }),
          f.text("save_to", "Save Response As", { defaultValue: "borzo_quote", supportsInterpolation: false }),
        ],
        outputSchema: [
          { key: "payment_amount", label: "Price", type: "number" },
          { key: "delivery_fee_amount", label: "Delivery Fee", type: "number" },
        ],
      },
      {
        key: "create_order",
        label: "Create Delivery Order",
        description: "Create a new Borzo delivery order.",
        configSchema: [
          f.number("vehicle_type_id", "Vehicle Type", { required: true, defaultValue: 7 }),
          f.text("pickup_address", "Pickup Address", { required: true, defaultValue: "{{store_address}}" }),
          f.text("pickup_lat", "Pickup Latitude", { defaultValue: "{{store_lat}}" }),
          f.text("pickup_lng", "Pickup Longitude", { defaultValue: "{{store_lng}}" }),
          f.text("pickup_phone", "Pickup Contact Phone", { defaultValue: "{{store_phone}}" }),
          f.text("pickup_name", "Pickup Contact Name", { defaultValue: "{{store_name}}" }),
          f.text("drop_address", "Drop Address", { required: true, defaultValue: "{{address}}" }),
          f.text("drop_lat", "Drop Latitude", { defaultValue: "{{addressData.latitude}}" }),
          f.text("drop_lng", "Drop Longitude", { defaultValue: "{{addressData.longitude}}" }),
          f.text("drop_phone", "Drop Contact Phone", { defaultValue: "{{contact.phone}}" }),
          f.text("drop_name", "Drop Contact Name", { defaultValue: "{{contact.name}}" }),
          f.text("matter", "Item Description", { defaultValue: "Order #{{order_id}}" }),
          f.text("save_to", "Save Response As", { defaultValue: "borzo_order", supportsInterpolation: false }),
        ],
        outputSchema: [
          { key: "order_id", label: "Order ID", type: "string" },
          { key: "tracking_url", label: "Tracking URL", type: "string" },
          { key: "payment_amount", label: "Price", type: "number" },
        ],
      },
      {
        key: "track_order",
        label: "Track Order",
        description: "Get real-time delivery tracking status.",
        configSchema: [
          f.text("order_id", "Order ID", { required: true, defaultValue: "{{borzo_order.order_id}}" }),
          f.text("save_to", "Save Response As", { defaultValue: "borzo_tracking", supportsInterpolation: false }),
        ],
      },
      {
        key: "cancel_order",
        label: "Cancel Order",
        description: "Cancel an existing Borzo delivery order.",
        configSchema: [
          f.text("order_id", "Order ID", { required: true, defaultValue: "{{borzo_order.order_id}}" }),
        ],
      },
    ],
    triggers: [
      { key: "order_picked_up", label: "Order Picked Up", description: "Courier has picked up the package.", webhookEvent: "order.picked_up" },
      { key: "order_delivered", label: "Order Delivered", description: "Order successfully delivered.", webhookEvent: "order.delivered" },
      { key: "order_failed", label: "Delivery Failed", description: "Delivery attempt failed.", webhookEvent: "order.failed" },
    ],
  },

  /* ─────────────── GOOGLE SHEETS ─────────────── */
  {
    slug: "google_sheet",
    name: "Google Sheets",
    description: "Sync customer data, leads and orders to Google Sheets.",
    category: "productivity",
    color: "#15803d",
    bgColor: "#f0fdf4",
    icon: "📊",
    available: true,
    order: 3,
    docsUrl: "https://developers.google.com/sheets/api",
    fields: [],
    actions: [
      {
        key: "append_row",
        label: "Append Row",
        description: "Add a new row of data to the spreadsheet.",
        configSchema: [
          f.text("spreadsheet_id", "Spreadsheet ID", { required: true, placeholder: "1AbCdef...", supportsInterpolation: false }),
          f.text("sheet_name", "Sheet Tab Name", { required: true, defaultValue: "Sheet1", supportsInterpolation: false }),
          f.kv("map", "Column Mapping", { helperText: "Map sheet columns to values. RHS supports {{variables}}." }),
          f.text("save_to", "Save Response As", { defaultValue: "sheet_row", supportsInterpolation: false }),
        ],
      },
      {
        key: "update_row",
        label: "Update Row",
        description: "Update an existing row matched by a key column.",
        configSchema: [
          f.text("spreadsheet_id", "Spreadsheet ID", { required: true, supportsInterpolation: false }),
          f.text("sheet_name", "Sheet Tab Name", { required: true, defaultValue: "Sheet1", supportsInterpolation: false }),
          f.text("match_column", "Match Column", { required: true, placeholder: "order_id", supportsInterpolation: false }),
          f.text("match_value", "Match Value", { required: true, placeholder: "{{order_id}}" }),
          f.kv("map", "Columns to Update"),
        ],
      },
      {
        key: "find_row",
        label: "Find Row",
        description: "Search for a specific row by column value.",
        configSchema: [
          f.text("spreadsheet_id", "Spreadsheet ID", { required: true, supportsInterpolation: false }),
          f.text("sheet_name", "Sheet Tab Name", { required: true, defaultValue: "Sheet1", supportsInterpolation: false }),
          f.text("match_column", "Match Column", { required: true, supportsInterpolation: false }),
          f.text("match_value", "Match Value", { required: true, placeholder: "{{phone}}" }),
          f.text("save_to", "Save Result As", { defaultValue: "sheet_match", supportsInterpolation: false }),
        ],
      },
    ],
    triggers: [],
  },

  /* ─────────────── COMING SOON APPS ─────────────── */
  {
    slug: "shiprocket",
    name: "Shiprocket",
    description: "Automate shipping and order fulfillment.",
    category: "logistics",
    color: "#ea580c",
    bgColor: "#fff7ed",
    icon: "📦",
    available: false,
    order: 4,
    fields: [
      f.text("email", "Account Email", { required: true, placeholder: "you@store.com", supportsInterpolation: false }),
      f.password("password", "Account Password", { required: true }),
    ],
    actions: [
      { key: "create_order", label: "Create Order", description: "Create a new shipment order.", configSchema: [] },
      { key: "track_shipment", label: "Track Shipment", description: "Get tracking status.", configSchema: [] },
      { key: "cancel_order", label: "Cancel Order", description: "Cancel a shipment order.", configSchema: [] },
    ],
    triggers: [
      { key: "order_shipped", label: "Order Shipped", description: "Shipment dispatched.", webhookEvent: "order.shipped" },
      { key: "order_delivered", label: "Order Delivered", description: "Shipment delivered.", webhookEvent: "order.delivered" },
    ],
  },
  {
    slug: "shopify",
    name: "Shopify",
    description: "Connect your Shopify store to WhatsApp workflows.",
    category: "ecommerce",
    color: "#96bf48",
    bgColor: "#f4f9ee",
    icon: "🛍️",
    available: false,
    order: 5,
    fields: [
      f.text("store_url", "Store URL", { required: true, placeholder: "your-store.myshopify.com", supportsInterpolation: false }),
      f.password("access_token", "Admin API Access Token", { required: true, placeholder: "shpat_..." }),
      f.password("webhook_secret", "Webhook Secret"),
    ],
    actions: [
      { key: "create_order", label: "Create Order", description: "Create a new order.", configSchema: [] },
      { key: "get_product", label: "Get Product", description: "Fetch product details.", configSchema: [] },
    ],
    triggers: [
      { key: "order_created", label: "Order Created", description: "New order placed.", webhookEvent: "orders/create" },
      { key: "payment_received", label: "Payment Received", description: "Payment received.", webhookEvent: "orders/paid" },
    ],
  },
  {
    slug: "woocommerce",
    name: "WooCommerce",
    description: "Sync your WooCommerce store with WhatsApp.",
    category: "ecommerce",
    color: "#7f54b3",
    bgColor: "#f5f0ff",
    icon: "🛒",
    available: false,
    order: 6,
    fields: [
      f.text("store_url", "Store URL", { required: true, placeholder: "https://yourstore.com", supportsInterpolation: false }),
      f.text("consumer_key", "Consumer Key", { required: true, supportsInterpolation: false }),
      f.password("consumer_secret", "Consumer Secret", { required: true }),
    ],
    actions: [
      { key: "get_order", label: "Get Order", description: "Fetch order details.", configSchema: [] },
    ],
    triggers: [
      { key: "order_created", label: "Order Created", description: "New order placed.", webhookEvent: "woocommerce_new_order" },
    ],
  },
  {
    slug: "hubspot",
    name: "HubSpot",
    description: "Sync contacts and deals with HubSpot CRM.",
    category: "crm",
    color: "#ff7a59",
    bgColor: "#fff5f2",
    icon: "🎯",
    available: false,
    order: 7,
    fields: [f.password("api_key", "Private App Token", { required: true })],
    actions: [
      { key: "create_contact", label: "Create Contact", description: "Add a contact to HubSpot.", configSchema: [] },
    ],
    triggers: [
      { key: "deal_stage_changed", label: "Deal Stage Changed", description: "Deal moved stages.", webhookEvent: "deal.propertyChange" },
    ],
  },
  {
    slug: "zoho_crm",
    name: "Zoho CRM",
    description: "Push WhatsApp leads into Zoho CRM.",
    category: "crm",
    color: "#e42527",
    bgColor: "#fef2f2",
    icon: "💼",
    available: false,
    order: 8,
    fields: [
      f.text("client_id", "Client ID", { required: true, supportsInterpolation: false }),
      f.password("client_secret", "Client Secret", { required: true }),
      f.password("refresh_token", "Refresh Token", { required: true }),
    ],
    actions: [
      { key: "create_lead", label: "Create Lead", description: "Add a lead to Zoho CRM.", configSchema: [] },
    ],
    triggers: [],
  },
  {
    slug: "cashfree",
    name: "Cashfree",
    description: "Collect payments via Cashfree on WhatsApp.",
    category: "payments",
    color: "#00baf2",
    bgColor: "#f0fbff",
    icon: "💰",
    available: false,
    order: 9,
    fields: [
      f.text("app_id", "App ID", { required: true, supportsInterpolation: false }),
      f.password("secret_key", "Secret Key", { required: true }),
      f.select("environment", "Environment", ["sandbox", "production"], { required: true, defaultValue: "sandbox" }),
    ],
    actions: [
      { key: "create_payment_link", label: "Create Payment Link", description: "Generate a Cashfree payment link.", configSchema: [] },
    ],
    triggers: [
      { key: "payment_success", label: "Payment Success", description: "Payment successful.", webhookEvent: "PAYMENT_SUCCESS" },
      { key: "payment_failed", label: "Payment Failed", description: "Payment failed.", webhookEvent: "PAYMENT_FAILED" },
    ],
  },
  {
    slug: "delhivery",
    name: "Delhivery",
    description: "Automate shipment tracking and delivery updates.",
    category: "logistics",
    color: "#d12030",
    bgColor: "#fef2f2",
    icon: "🚛",
    available: false,
    order: 10,
    fields: [f.password("api_token", "API Token", { required: true })],
    actions: [
      { key: "track_shipment", label: "Track Shipment", description: "Get tracking status.", configSchema: [] },
    ],
    triggers: [
      { key: "shipment_delivered", label: "Shipment Delivered", description: "Shipment delivered.", webhookEvent: "delivered" },
    ],
  },
];

/* =============================================================
   BUILT-IN (NON-INTEGRATION) TRIGGERS — channel-level events
============================================================= */
export interface BuiltinTriggerDef {
  key: string;
  label: string;
  description: string;
  icon: string;
  channelTypes: string[];
  configSchema?: FieldDef[];
}

export const BUILTIN_TRIGGERS: BuiltinTriggerDef[] = [
  {
    key: "new_message_received",
    label: "Incoming Message",
    description: "Fires when a contact sends you a message.",
    icon: "📩",
    channelTypes: ["whatsapp"],
    configSchema: [
      f.select("match_type", "Match Type", ["all", "keyword", "regex"], { defaultValue: "all" }),
      {
        key: "keywords",
        label: "Keywords",
        type: "textarea",
        helperText: "Comma-separated. Used when Match Type = keyword.",
        placeholder: "hi, hello, menu",
        visibleWhen: { field: "match_type", equals: ["keyword", "regex"] },
      },
    ],
  },
  {
    key: "outgoing_message",
    label: "Outgoing Message",
    description: "Fires when an agent sends a message.",
    icon: "📤",
    channelTypes: ["whatsapp"],
  },
  {
    key: "webhook_received",
    label: "Webhook",
    description: "Fires when a custom webhook is invoked.",
    icon: "🔗",
    channelTypes: ["any"],
    configSchema: [
      f.text("path", "Webhook Path", { required: true, placeholder: "/webhook/my-event", supportsInterpolation: false }),
      f.password("secret", "Verify Secret", { helperText: "Optional HMAC secret for signature verification." }),
    ],
  },
  {
    key: "call_completed",
    label: "Call Completed",
    description: "Fires after a call ends.",
    icon: "📞",
    channelTypes: ["whatsapp"],
  },
  {
    key: "call_missed",
    label: "Call Missed",
    description: "Fires when a call is missed.",
    icon: "📵",
    channelTypes: ["whatsapp"],
  },
];
