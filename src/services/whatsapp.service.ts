import axios from "axios";
import { WHATSAPP } from "../config/whatsapp";

/* =====================================================
   AXIOS INSTANCE
===================================================== */
const whatsappApi = axios.create({
  baseURL: `https://graph.facebook.com/v24.0/${WHATSAPP.PHONE_NUMBER_ID}`,
  headers: {
    Authorization: `Bearer ${WHATSAPP.TOKEN}`,
    "Content-Type": "application/json",
  },
});

/* =====================================================
   SHARED AXIOS ERROR LOGGER
===================================================== */
function logAxiosError(context: string, error: any) {
  if (axios.isAxiosError(error)) {
    console.error(`❌ ${context}`);
    console.error("Status:", error.response?.status);
    console.error(
      "Response:",
      JSON.stringify(error.response?.data, null, 2)
    );
  } else {
    console.error(`❌ ${context}`, error);
  }
}

/* =====================================================
   1️⃣ SEND TEXT MESSAGE
===================================================== */
export const sendTextMessage = async (to: string, text: string) => {
  try {
    await whatsappApi.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
  } catch (error) {
    logAxiosError("sendTextMessage failed", error);
  }
};

/* =====================================================
   2️⃣ SEND UTILITY TEMPLATE
===================================================== */
export const sendUtilityTemplate = async (
  to: string,
  templateName: string,
  options: {
    language?: string;
    parameters: string[];
    headerImageUrl?: string;
  }
) => {
  try {
    const components: any[] = [];

    /* HEADER (IMAGE) – optional */
    if (options.headerImageUrl) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: {
              link: options.headerImageUrl,
            },
          },
        ],
      });
    }

    /* BODY (POSITIONAL PARAMETERS) */
    components.push({
      type: "body",
      parameters: options.parameters.map((text) => ({
        type: "text",
        text,
      })),
    });

    await whatsappApi.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: templateName,
        language: { code: options.language || "en" },
        components,
      },
    });
  } catch (error) {
    logAxiosError("sendUtilityTemplate failed", error);
  }
};

/* =====================================================
   BUTTON TYPES
===================================================== */
export interface WhatsAppButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

/* =====================================================
   3️⃣ SEND BUTTON MESSAGE
===================================================== */
export const sendButtonMessage = async (
  to: string,
  bodyText: string,
  buttons: WhatsAppButton[]
) => {
  try {
    if (buttons.length > 3) {
      throw new Error("WhatsApp allows max 3 buttons");
    }

    buttons.forEach((btn) => {
      if (btn.reply.title.length > 20) {
        throw new Error(`Button title too long: ${btn.reply.title}`);
      }
    });

    const url = `https://graph.facebook.com/v24.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

    const payload = {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: bodyText },
        action: { buttons },
      },
    };

    console.log("📤 WhatsApp URL:", url);
    console.log("📤 Payload:", JSON.stringify(payload, null, 2));

    const res = await axios.post(url, payload, {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });

    console.log("✅ WhatsApp API SUCCESS:", res.data);
  } catch (error: any) {
    console.error("❌ sendButtonMessage FAILED");
    console.error("Status:", error?.response?.status);
    console.error("Data:", error?.response?.data);
    console.error("Message:", error.message);
  }
};
/* =====================================================
   4️⃣ SEND FLOW MESSAGE
===================================================== */
export const sendFlowMessage = async (
  to: string,
  flowId: string,
  options?: {
    headerText?: string;
    bodyText?: string;
    ctaText?: string;
    startScreen?: string;
    data?: Record<string, any>;
  }
) => {
  try {
    await whatsappApi.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "flow",
        header: {
          type: "text",
          text: options?.headerText || "Cake Arena 🍰",
        },
        body: {
          text:
            options?.bodyText ||
            "Tap below to explore cakes & place your order",
        },
        action: {
          name: "flow",
          parameters: {
            flow_token: "hello", // can be dynamic
            flow_message_version: "3",
            flow_id: flowId,
            flow_cta: options?.ctaText || "Start Ordering",
            flow_action: "navigate",
            flow_action_payload: {
              screen: options?.startScreen || "WELCOME_SCREEN",
              data: {
                phone_number: to,
                ...(options?.data || {}),
              },
            },
          },
        },
      },
    });
  } catch (error) {
    logAxiosError("sendFlowMessage failed", error);
  }
};

/* =====================================================
   5️⃣ SEND LOCATION REQUEST
===================================================== */
export const sendLocationRequest = async (to: string, msg: string) => {
  try {
    await whatsappApi.post("/messages", {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "location_request_message",
        body: {
          text: msg,
        },
        action: {
          name: "send_location",
        },
      },
    });
  } catch (error) {
    logAxiosError("sendLocationRequest failed", error);
  }
};
