import axios from "axios";
import Message from "../models/message.model";
import Contact from "../models/contact.model";

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


export const createWhatsAppClient = (
  channel: {
    _id: any;
    phone_number_id: string;
    access_token: string;
  },
  contact: {
    _id: any;
  }
): WhatsAppClient => {
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
    async sendText(to, text) {
      // 1️⃣ SAVE AS PENDING
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "text",
        status: "PENDING",
        payload: { text },
      });

      try {
        // 2️⃣ SEND TO WHATSAPP
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        });

        const waId = res.data?.messages?.[0]?.id;

        // 3️⃣ UPDATE → SENT
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          }
        );

        // 4️⃣ UPDATE CONTACT LAST MESSAGE
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          }
        );

      } catch (e: any) {
        // 5️⃣ FAILED
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error"
            ),
          }
        );

        logError("sendText", e);
      }
    },

    async requestLocation(to, text) {
      // 1️⃣ SAVE AS PENDING
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "location_request",
        status: "PENDING",
        payload: { text },
      });

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

        // 2️⃣ SENT
        await Message.updateOne(
          { _id: msg._id },
          { status: "SENT" }
        );

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          }
        );

      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED", error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error"
            ),
          }
        );
        logError("requestLocation", e);
      }
    },

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
      // 1️⃣ SAVE MESSAGE
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "flow",
        status: "PENDING",
        payload: { flowId, options },
      });

      try {
        await api.post("/messages", {
          messaging_product: "whatsapp", // ✅ MUST be top-level
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

            footer: {
              text: options.cta || "Continue",
            },

            action: {
              name: "flow", // ✅ REQUIRED
              parameters: {
                flow_message_version: "3",
                flow_token: `flow_${Date.now()}`,
                flow_id: flowId,
                // flow_action: "navigate",
                flow_cta: options.cta || "Continue", // 🔥 MUST
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

        // 2️⃣ SENT
        await Message.updateOne(
          { _id: msg._id },
          { status: "SENT" }
        );

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          }
        );

      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error"
            ),
          }
        );

        logError("sendFlow", e);
      }
    },

    async sendButtons(to, bodyText, buttons) {
      // 1️⃣ SAVE MESSAGE
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "button",
        status: "PENDING",
        payload: { bodyText, buttons },
      });

      try {
        const safeButtons = buttons.slice(0, 3);

        await api.post("/messages", {
          messaging_product: "whatsapp", // ✅ MUST be top-level
          to,
          type: "interactive",
          interactive: {
            type: "button",
            body: {
              text: bodyText,
            },
            action: {
              buttons: safeButtons.map((btn) => ({
                type: "reply",
                reply: {
                  id: String(btn.id),        // ✅ force string
                  title: btn.title.substring(0, 20),
                },
              })),
            },
          },
        });

        // 2️⃣ UPDATE STATUS
        await Message.updateOne(
          { _id: msg._id },
          { status: "SENT" }
        );

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          }
        );

      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error"
            ),
          }
        );

        logError("sendButtons", e);
      }
    }

  };
};
