import { verifyWebhook, receiveMessage } from "./controllers/webhook.controller";

export const handler = async (event: any, context: any) => {
  try {
    context.callbackWaitsForEmptyEventLoop = false;

    /* ✅ Detect HTTP method safely */
    const method =
      event?.requestContext?.http?.method ||
      event?.httpMethod ||
      "";

    /* ✅ Detect path safely */
    const rawPath =
      event?.rawPath ||
      event?.path ||
      "/";

    const path = rawPath.replace(/\/$/, "") || "/";

    /* ✅ Health check */
    if (path === "/" && method === "GET") {
      return {
        statusCode: 200,
        body: "APP RUNNING ✅",
      };
    }

    /* ✅ Webhook verification */
    if (path === "/webhook" && method === "GET") {
      return await verifyWebhook(event);
    }

    /* ✅ Receive WhatsApp messages */
    if (path === "/webhook" && method === "POST") {
      return await receiveMessage(event);
    }

    return {
      statusCode: 404,
      body: "NOT FOUND",
    };
  } catch (err) {
    console.error("❌ LAMBDA ERROR:", err);

    return {
      statusCode: 500,
      body: "INTERNAL ERROR",
    };
  }
};
