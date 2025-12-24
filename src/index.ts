import { verifyWebhook } from "./controllers/webhook.controller";

export const handler = async (event: any) => {
  try {
    const method = event.requestContext.http.method;
    const path = event.rawPath.replace(/\/$/, "");

    if (path === "/" && method === "GET") {
      return { statusCode: 200, body: "APP RUNNING ✅" };
    }

    if (path === "/webhook" && method === "GET") {
      return await verifyWebhook(event);
    }

    return { statusCode: 404, body: "NOT FOUND" };
  } catch (err) {
    console.error("ERROR:", err);
    return { statusCode: 500, body: "INTERNAL ERROR" };
  }
};
