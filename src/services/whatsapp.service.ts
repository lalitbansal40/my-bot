import axios from "axios";
import { WHATSAPP } from "../config/whatsapp";

/**
 * Axios instance
 */
const whatsappApi = axios.create({
    baseURL: `https://graph.facebook.com/v24.0/${WHATSAPP.PHONE_NUMBER_ID}`,
    headers: {
        Authorization: `Bearer ${WHATSAPP.TOKEN}`,
        "Content-Type": "application/json",
    },
});

/**
 * 1️⃣ Send Text Message
 */
export const sendTextMessage = async (to: string, text: string) => {
    try {
        await whatsappApi.post("/messages", {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: { body: text },
        });
    } catch (error) {
        console.error("sendTextMessage error:", error);
    }
};

export const sendUtilityTemplate = async (
    to: string,
    templateName: string,
    options: {
        language?: string;
        parameters: string[];        // BODY params (positional)
        headerImageUrl?: string;     // OPTIONAL IMAGE header
    }
) => {
    try {
        const components: any[] = [];

        /* ===============================
           HEADER (IMAGE) – optional
        =============================== */
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

        /* ===============================
           BODY (POSITIONAL)
        =============================== */
        components.push({
            type: "body",
            parameters: options.parameters.map(text => ({
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
    } catch (error: any) {
        console.error(
            "sendUtilityTemplate error:",
            error?.response?.data || error.message
        );
    }
};


export interface WhatsAppButton {
    type: "reply";
    reply: {
        id: string;
        title: string;
    };
}

export const sendButtonMessage = async (
    to: string,
    bodyText: string,
    buttons: WhatsAppButton[]
) => {
    try {
        const res = await whatsappApi.post("/messages", {
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "button",
                body: { text: bodyText },
                action: { buttons },
            },
        });
       console.log("responseData :: ",JSON.stringify(res.data))
    } catch (error) {
        console.log("error :: ",JSON.stringify(error))
        console.error("sendButtonMessage error:", error);
    }
};

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
                        flow_token: "hello", // can be dynamic later
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
    } catch (error: any) {
        console.error(
            "sendFlowMessage error:",
            error?.response?.data || error.message
        );
    }
};



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
        console.error("sendLocationRequest error:", error);
    }
};