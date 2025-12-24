import { verifyWebhook, receiveMessage } from "./controllers/webhook.controller";
import { whatsappFlowController } from "./controllers/whatsappFlow.controller";

export const handler = async (event: any) => {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath;

    // ROOT
    if (path === "/" && method === "GET") {
      return { statusCode: 200, body: "APP RUNNING ✅" };
    }

    // WEBHOOK VERIFY (GET)
    if (path === "/webhook" && method === "GET") {
      return await verifyWebhook(event);
    }

    // WEBHOOK EVENTS (POST)
    if (path === "/webhook" && method === "POST") {
      return await receiveMessage(event);
    }

    // WHATSAPP FLOW
    if (path === "/whatsappflow" && method === "POST") {
      return await whatsappFlowController(event);
    }

    return { statusCode: 404, body: "Route not found" };
  } catch (err) {
    console.error("ERROR:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
