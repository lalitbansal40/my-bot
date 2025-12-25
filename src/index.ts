import { verifyWebhook, receiveMessage } from "./controllers/webhook.controller";

export const handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const method = event?.requestContext?.http?.method;
  const path = (event?.rawPath || "/").replace(/\/$/, "") || "/";

  if (path === "/" && method === "GET") {
    return { statusCode: 200, body: "APP RUNNING ✅" };
  }

  if (path === "/webhook" && method === "GET") {
    return await verifyWebhook(event);
  }

  if (path === "/webhook" && method === "POST") {
    return await receiveMessage(event);
  }

  return { statusCode: 404, body: "NOT FOUND" };
};
