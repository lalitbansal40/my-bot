import axios from "axios";
import Message from "../models/message.model";
import Contact from "../models/contact.model";
import { pushToAccount } from "./wsHelper";

export interface WhatsAppButton {
  id: string;
  title: string;
}

export interface WhatsAppClient {
  sendText(to: string, text: string): Promise<void>;
  requestLocation(to: string, text: string): Promise<void>;
  sendMedia(
    to: string,
    payload: {
      type: "image" | "video" | "document";
      url: string;
      caption?: string;
    }
  ): Promise<void>;
  sendTemplate(
    to: string,
    payload: {
      name: string;
      language?: string;
      header?: {
        type: "image" | "video" | "document";
        id: string; // ✅ CHANGE
      };
      body?: string[];
      buttons?: {
        type: "url" | "quick_reply";
        text: string;
        url?: string;
      }[];
    }
  ): Promise<void>;
  sendFlow(
    to: string,
    flowId: string,
    options: {
      header?: string;
      body?: string;
      cta?: string;
      startScreen?: string;
      data?: Record<string, any>; // 👈 dynamic data
    },
  ): Promise<void>;
  sendList(
    to: string,
    payload: {
      header?: string;
      body: string;
      buttonText: string;
      sections: {
        title: string;
        rows: {
          id: string;
          title: string;
          description?: string;
        }[];
      }[];
    }
  ): Promise<void>;
  sendInteractiveMedia(
    to: string,
    payload: {
      type: "image" | "video";
      url: string;
      caption: string;
      buttons: { id: string; title: string }[];
    },
  ): Promise<void>;
  sendCarousel(
    to: string,
    data: {
      header?: string;
      body: string;
      items: {
        id: string;
        title: string;
        description?: string;
        image?: string;
      }[];
    },
  ): Promise<void>;
  sendAddressMessage(to: string, text: string): Promise<void>;
  // ✅ ADD THIS
  sendButtons(
    to: string,
    bodyText: string,
    buttons: WhatsAppButton[],
  ): Promise<void>;

  sendUrlButton(
    to: string,
    bodyText: string,
    buttonText: string,
    url: string,
  ): Promise<void>;

  sendProductList(
    to: string,
    payload: {
      catalogId: string;
      header?: string;
      body: string;
      footer?: string;
      sections: {
        title: string;
        productRetailerIds: string[];
      }[];
    },
  ): Promise<void>;

  sendSingleProduct(
    to: string,
    payload: {
      catalogId: string;
      productRetailerId: string;
      body?: string;
      footer?: string;
    },
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
  },
  accountId?: string,
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

  // Push wa_message_id + status back to frontend so ticks can update
  const notifyUpdate = (msgId: any, update: { wa_message_id?: string; status: string; error?: any }) => {
    if (accountId) pushToAccount(accountId, { type: "message_update", _id: msgId.toString(), ...update }).catch(() => { });
  };

  return {
    async sendText(to, text) {
      const timestamp = Math.floor(Date.now() / 1000);

      // 1️⃣ SAVE AS PENDING
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "text",
        status: "PENDING",
        is_read: true,
        payload: {
          from: channel.phone_number_id,
          timestamp: String(timestamp),
          text: {
            body: text,
          },
          type: "text",
        },
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        // 2️⃣ SEND TO WHATSAPP
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: text },
        });

        const waId = res.data?.messages?.[0]?.id;

        // 3️⃣ UPDATE MESSAGE
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
            "payload.id": waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        // 4️⃣ UPDATE CONTACT LAST MESSAGE
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendText", e);
      }
    },
    async sendTemplate(
      to: string,
      payload: {
        name: string;
        language?: string;
        header?: {
          type: "image" | "video" | "document";
          id: string; // ✅ CHANGE
        };
        body?: string[]; // ["123", "cake"]
        buttons?: {
          type: "url" | "quick_reply";
          text: string;
          url?: string;
        }[];
      }
    ) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "template",
        status: "PENDING",
        payload,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const components: any[] = [];

        // 🔹 HEADER
        if (payload.header) {
          components.push({
            type: "header",
            parameters: [
              {
                type: payload.header.type,
                [payload.header.type]: {
                  id: payload.header.id, // ✅ MAIN FIX
                },
              },
            ],
          });
        }

        // 🔹 BODY (placeholders)
        if (payload.body && payload.body.length > 0) {
          components.push({
            type: "body",
            parameters: payload.body.map((text) => ({
              type: "text",
              text,
            })),
          });
        }

        // 🔹 BUTTONS (optional)
        if (payload.buttons && payload.buttons.length > 0) {
          components.push({
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: payload.buttons.map((btn) => ({
              type: "text",
              text: btn.url || btn.text,
            })),
          });
        }


        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "template",
          template: {
            name: payload.name,
            language: { code: payload.language || "en_US" },
            components,
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          }
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

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
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendTemplate", e);
      }
    },
    async sendList(
      to: string,
      payload: {
        header?: string;
        body: string;
        buttonText: string;
        sections: {
          title: string;
          rows: {
            id: string;
            title: string;
            description?: string;
          }[];
        }[];
      }
    ) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "list",
        status: "PENDING",
        payload,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "list",

            header: payload.header
              ? {
                type: "text",
                text: payload.header,
              }
              : undefined,

            body: {
              text: payload.body,
            },

            action: {
              button: payload.buttonText || "Select",
              sections: payload.sections.map((section) => ({
                title: section.title,
                rows: section.rows.map((row) => ({
                  id: String(row.id),
                  title: row.title.substring(0, 24),
                  description: row.description?.substring(0, 72),
                })),
              })),
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          }
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

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
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendList", e);
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
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "location_request_message",
            body: { text },
            action: { name: "send_location" },
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        // 2️⃣ SENT
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("requestLocation", e);
      }
    },
    async sendCarousel(to, data) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "carousel",
        status: "PENDING",
        payload: data,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        // 🔥 TRY REAL MEDIA CAROUSEL FIRST
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "media_carousel",
            body: {
              text: data.body,
            },
            action: {
              cards: data.items.map((item) => ({
                header: {
                  type: "image",
                  image: {
                    link: item.image || "https://via.placeholder.com/300",
                  },
                },
                body: {
                  text: item.title,
                },
                buttons: [
                  {
                    type: "reply",
                    reply: {
                      id: item.id,
                      title: (item.title || "Select").substring(0, 20),
                    },
                  },
                ],
              })),
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        console.warn("⚠️ Media carousel failed, fallback to list");

        try {
          // 🔁 FALLBACK TO LIST (OLD LOGIC)
          const res = await api.post("/messages", {
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
              type: "list",
              header: data.header
                ? {
                  type: "text",
                  text: data.header,
                }
                : undefined,
              body: {
                text: data.body,
              },
              action: {
                button: "Select Option",
                sections: [
                  {
                    title: "Available Options",
                    rows: data.items.map((item) => ({
                      id: String(item.id),
                      title: item.title.substring(0, 24),
                      description: item.description?.substring(0, 72),
                    })),
                  },
                ],
              },
            },
          });

          const waId = res.data?.messages?.[0]?.id;

          await Message.updateOne(
            { _id: msg._id },
            {
              status: "SENT",
              wa_message_id: waId,
            },
          );
          notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

          await Contact.updateOne(
            { _id: contact._id },
            {
              $set: {
                last_message_id: msg._id,
                last_message_at: new Date(),
              },
            },
          );
        } catch (fallbackError: any) {
          await Message.updateOne(
            { _id: msg._id },
            {
              status: "FAILED",
              error: JSON.stringify(
                fallbackError?.response?.data ||
                fallbackError?.message ||
                "Unknown error",
              ),
            },
          );
          notifyUpdate(msg._id, { status: "FAILED" });
          logError("sendCarousel fallback", fallbackError);
        }
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
      },
    ) {
      // 1️⃣ SAVE MESSAGE
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "flow",
        status: "PENDING",
        payload: { flowId, options },
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
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

        const waId = res.data?.messages?.[0]?.id;
        // 2️⃣ SENT
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendFlow", e);
      }
    },
    async sendInteractiveMedia(to: string, payload: any) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "interactive",
        status: "PENDING",
        payload,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "button",

            // 🔥 THIS IS THE MAIN FIX
            header: {
              type: payload.type,
              [payload.type]: {
                link: payload.url,
              },
            },

            body: {
              text: payload.caption || "Choose option",
            },

            action: {
              buttons: payload.buttons.slice(0, 3).map((btn: any) => ({
                type: "reply",
                reply: {
                  id: String(btn.id),
                  title: btn.title.substring(0, 20),
                },
              })),
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        console.error("❌ sendInteractiveMedia", e?.response?.data || e.message);
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
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const safeButtons = buttons.slice(0, 3);

        const res = await api.post("/messages", {
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
                  id: String(btn.id), // ✅ force string
                  title: btn.title.substring(0, 20),
                },
              })),
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;
        // 2️⃣ UPDATE STATUS
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        // 3️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendButtons", e);
      }
    },
    async sendAddressMessage(to: string, text: string) {
      const timestamp = Math.floor(Date.now() / 1000);

      // 1️⃣ SAVE AS PENDING
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "address_message",
        status: "PENDING",
        is_read: true,
        payload: {
          from: channel.phone_number_id,
          timestamp: String(timestamp),
          text: {
            body: text,
          },
          type: "address_message",
        },
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        // 2️⃣ SEND TO WHATSAPP
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "address_message",
            body: {
              text: text || "📍 Please enter your delivery address",
            },
            action: {
              name: "address_message",
              parameters: {
                country: "IN",
              },
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        // 3️⃣ UPDATE MESSAGE
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
            "payload.id": waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        // 4️⃣ UPDATE CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendAddressMessage", e);
      }
    },

    async sendUrlButton(to, bodyText, buttonText, url) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "cta_url",
        status: "PENDING",
        payload: { bodyText, buttonText, url },
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "cta_url",
            body: {
              text: bodyText,
            },
            action: {
              name: "cta_url",
              parameters: {
                display_text: buttonText.substring(0, 20),
                url,
              },
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          },
        );
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });

        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              last_message_id: msg._id,
              last_message_at: new Date(),
            },
          },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(
              e?.response?.data || e?.message || "Unknown error",
            ),
          },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendUrlButton", e);
      }
    },

    async sendProductList(to, payload) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "product_list",
        status: "PENDING",
        payload,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "product_list",
            header: payload.header
              ? { type: "text", text: payload.header }
              : undefined,
            body: { text: payload.body },
            footer: payload.footer ? { text: payload.footer } : undefined,
            action: {
              catalog_id: payload.catalogId,
              sections: payload.sections.map((s) => ({
                title: s.title,
                product_items: s.productRetailerIds.map((id) => ({
                  product_retailer_id: id,
                })),
              })),
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;
        await Message.updateOne({ _id: msg._id }, { status: "SENT", wa_message_id: waId });
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });
        await Contact.updateOne(
          { _id: contact._id },
          { $set: { last_message_id: msg._id, last_message_at: new Date() } },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          { status: "FAILED", error: JSON.stringify(e?.response?.data || e?.message || "Unknown error") },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendProductList", e);
      }
    },

    async sendSingleProduct(to, payload) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: "single_product",
        status: "PENDING",
        payload,
        is_read: true,
      });
      if (accountId) pushToAccount(accountId, { type: "new_message", channel_id: channel._id, contact_id: contact._id, message: msg.toObject() }).catch(() => { });

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: "interactive",
          interactive: {
            type: "product",
            body: payload.body ? { text: payload.body } : undefined,
            footer: payload.footer ? { text: payload.footer } : undefined,
            action: {
              catalog_id: payload.catalogId,
              product_retailer_id: payload.productRetailerId,
            },
          },
        });

        const waId = res.data?.messages?.[0]?.id;
        await Message.updateOne({ _id: msg._id }, { status: "SENT", wa_message_id: waId });
        notifyUpdate(msg._id, { wa_message_id: waId, status: "SENT" });
        await Contact.updateOne(
          { _id: contact._id },
          { $set: { last_message_id: msg._id, last_message_at: new Date() } },
        );
      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          { status: "FAILED", error: JSON.stringify(e?.response?.data || e?.message || "Unknown error") },
        );
        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendSingleProduct", e);
      }
    },
    async sendMedia(to: string, payload: {
      type: "image" | "video" | "document";
      url: string;
      caption?: string;
    }) {
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type: payload.type,
        status: "PENDING",
        payload,
        is_read: true,
      });

      if (accountId) {
        pushToAccount(accountId, {
          type: "new_message",
          channel_id: channel._id,
          contact_id: contact._id,
          message: msg.toObject(),
        }).catch(() => { });
      }

      try {
        const res = await api.post("/messages", {
          messaging_product: "whatsapp",
          to,
          type: payload.type,
          [payload.type]: {
            link: payload.url,
            caption: payload.caption,
          },
        });

        const waId = res.data?.messages?.[0]?.id;

        await Message.updateOne(
          { _id: msg._id },
          {
            status: "SENT",
            wa_message_id: waId,
          }
        );

        notifyUpdate(msg._id, {
          wa_message_id: waId,
          status: "SENT",
        });

      } catch (e: any) {
        await Message.updateOne(
          { _id: msg._id },
          {
            status: "FAILED",
            error: JSON.stringify(e?.response?.data || e?.message),
          }
        );

        notifyUpdate(msg._id, { status: "FAILED" });
        logError("sendMedia", e);
      }
    }
  };
};
