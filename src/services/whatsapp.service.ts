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
    language = "en_US",
    parameters: string[]
) => {
    try {
        await whatsappApi.post("/messages", {
            messaging_product: "whatsapp",
            to,
            type: "template",
            template: {
                name: templateName,
                language: { code: language },
                components: [
                    {
                        type: "body",
                        parameters: parameters.map(text => ({
                            type: "text",
                            text,
                        })),
                    },
                ],
            },
        });
    } catch (error) {
        console.error("sendUtilityTemplate error:", error);
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

    } catch (error) {
        console.error("sendButtonMessage error:", error);
    }
};

export const sendFlowMessage = async (
    to: string,
    flowId: string
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
                    text: "Agarwal Cake Zone 🍰",
                },
                body: {
                    text: "Tap below to place your order",
                },
                action: {
                    name: "flow",
                    parameters: {
                        flow_token: "hello",
                        flow_message_version: "3", // ✅ REQUIRED
                        flow_id: flowId,
                        flow_cta: "Place An Order",
                        flow_action: "navigate",
                        flow_action_payload: {
                            screen: "WELCOME_SCREEN",
                            data: {
                                hello: "hello"
                            }
                        }
                    }
                }
            },
        });
    } catch (error: any) {
        console.error(
            "sendFlowMessage error:",
            error?.response?.data || error.message
        );
    }
};



export const sendLocationRequest = async (to: string) => {
    try {
        await whatsappApi.post("/messages", {
            messaging_product: "whatsapp",
            to,
            type: "interactive",
            interactive: {
                type: "location_request_message",
                body: {
                    text: "📍 Please share the delivery location where you want the cake delivered.",
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
