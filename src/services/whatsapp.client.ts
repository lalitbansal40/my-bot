import axios from "axios";

/* =========================
   TYPES
========================= */

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppClient {
  sendText(to: string, text: string): Promise<void>;
  requestLocation(to: string, text: string): Promise<void>;
  sendFlow(
    to: string,
    flowId: string,
    options: {
      header?: string;
      body?: string;
      cta?: string;
      startScreen?: string;
      data?: Record<string, any>; // 👈 dynamic data
    }
  ): Promise<void>;


  // ✅ ADD THIS
  sendButtons(
    to: string,
    bodyText: string,
    buttons: WhatsAppButton[]
  ): Promise<void>;
}

/* =========================
   FACTORY
========================= */

export const createWhatsAppClient = (channel: {
  phone_number_id: string;
  access_token: string;
}): WhatsAppClient => {
  const api = axios.create({
    baseURL: `https://graph.facebook.com/v24.0/${channel.phone_number_id}`,
    headers: {
      Authorization: `Bearer ${channel.access_token}`,
      "Content-Type": "application/json",
    },
  });

  const logError = (ctx: string, err: any) => {
    console.error(`❌ ${ctx}`, err?.response?.data || err.message);
  };

  return {
    /* =========================
       TEXT
    ========================= */
    async sendText(to, text) {
      try {
        await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        });
      } catch (e) {
        logError("sendText", e);
      }
    },

    /* =========================
       LOCATION REQUEST
    ========================= */
    async requestLocation(to, text) {
      try {
        await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "location_request_message",
            body: { text },
            action: { name: "send_location" },
          },
        });
      } catch (e) {
        logError("requestLocation", e);
      }
    },

    /* =========================
       FLOW
    ========================= */
    async sendFlow(
      to: string,
      flowId: string,
      options: {
        header?: string;
        body?: string;
        cta?: string;
        startScreen?: string;
        data?: Record<string, any>;
      }
    ) {
      try {
        await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "flow",
            header: {
              type: "text",
              text: options.header || "Welcome",
            },

            body: {
              text: options.body || "Please continue",
            },

            action: {
              name: "flow",
              parameters: {
                flow_message_version: "3",
                flow_token: `flow_${Date.now()}`,
                flow_id: flowId,
                flow_cta: options.cta || "Continue",
                flow_action: "navigate",
                flow_action_payload: {
                  screen: options.startScreen || "WELCOME_SCREEN",
                  data: {
                    phone_number: to,     
                    ...(options.data || {}), 
                  },
                },
              },
            },
          },
        });
      } catch (e) {
        logError("sendFlow", e);
      }
    },

    async sendButtons(to, bodyText, buttons) {
      try {
        const safeButtons = buttons.slice(0, 3);

        await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: { text: bodyText },
            action: {
              buttons: safeButtons.map((btn) => ({
                type: "reply",
                reply: {
                  id: btn.id,
                  title: btn.title.slice(0, 20),
                },
              })),
            },
          },
        });
      } catch (e) {
        logError("sendButtons", e);
      }
    },
  };
};
