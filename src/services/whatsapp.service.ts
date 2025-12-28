import axios, { AxiosInstance } from "axios";

export interface WhatsAppButton {
  type: "reply";
  reply: {
    id: string;
    title: string;
  };
}

interface ChannelContext {
  channel_name: string;
  phone_number_id: string;
  access_token: string;
  display_phone_number: string;
}

export class WhatsAppClient {
  private api: AxiosInstance;
  private phoneNumberId: string;

  constructor(channel: ChannelContext) {
    this.phoneNumberId = channel.phone_number_id;

    this.api = axios.create({
      baseURL: `https://graph.facebook.com/v24.0/${channel.phone_number_id}`,
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    });
  }

  private logAxiosError(context: string, error: any) {
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


  async sendText(to: string, text: string) {
    try {
      await this.api.post("/messages", {
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body: text },
      });
    } catch (error) {
      this.logAxiosError("sendText failed", error);
    }
  }


  async sendUtilityTemplate(
    to: string,
    templateName: string,
    options: {
      language?: string;
      parameters: string[];
      headerImageUrl?: string;
    }
  ) {
    try {
      const components: any[] = [];

      if (options.headerImageUrl) {
        components.push({
          type: "header",
          parameters: [
            {
              type: "image",
              image: { link: options.headerImageUrl },
            },
          ],
        });
      }

      components.push({
        type: "body",
        parameters: options.parameters.map((text) => ({
          type: "text",
          text,
        })),
      });

      await this.api.post("/messages", {
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
      this.logAxiosError("sendUtilityTemplate failed", error);
    }
  }

  async sendButtons(
    to: string,
    bodyText: string,
    buttons: WhatsAppButton[]
  ) {
    try {
      if (buttons.length > 3) {
        throw new Error("WhatsApp allows max 3 buttons");
      }

      buttons.forEach((btn) => {
        if (btn.reply.title.length > 20) {
          throw new Error(`Button title too long: ${btn.reply.title}`);
        }
      });

      await this.api.post("/messages", {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "button",
          body: { text: bodyText },
          action: { buttons },
        },
      });
    } catch (error) {
      this.logAxiosError("sendButtons failed", error);
    }
  }

  async sendFlow(
    to: string,
    flowId: string,
    options?: {
      headerText?: string;
      bodyText?: string;
      ctaText?: string;
      startScreen?: string;
      data?: Record<string, any>;
    }
  ) {
    try {
      await this.api.post("/messages", {
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
              flow_token: "flow",
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
      this.logAxiosError("sendFlow failed", error);
    }
  }

  async requestLocation(to: string, msg: string) {
    try {
      await this.api.post("/messages", {
        messaging_product: "whatsapp",
        to,
        type: "interactive",
        interactive: {
          type: "location_request_message",
          body: { text: msg },
          action: { name: "send_location" },
        },
      });
    } catch (error) {
      this.logAxiosError("requestLocation failed", error);
    }
  }
}
