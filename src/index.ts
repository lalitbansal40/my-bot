
export const handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const method =
      event?.requestContext?.http?.method ||
      event?.httpMethod;

    const rawPath = event?.rawPath || event?.path || "/";
    const path = rawPath.replace(/\/$/, "") || "/";
    console.log({ path })
    // 🔹 Health check
    if (path === "/" && method === "GET") {
      return {
        statusCode: 200,
        body: "APP RUNNING ✅",
      };
    }

    // 🔹 Lazy import (IMPORTANT)
    if (path === "/webhook" && method === "GET") {
      const { verifyWebhook } = await import(
        "./controllers/webhook.controller.js"
      );
      return await verifyWebhook(event);
    }

    if (path === "/webhook" && method === "POST") {
      const { receiveMessage } = await import(
        "./controllers/webhook.controller.js"
      );

      return await receiveMessage(event);
    }

    if (path === "/webhook/payment" && method === "POST") {
      const { recievePayment } = await import(
        "./controllers/webhook.controller.js"
      );

      return await recievePayment(event);

    }

    if (path.startsWith("/whatsappflow/") && method === "POST") {
      const appName = path.split("/")[2];

      const { whatsappFlowController } = await import(
        "./controllers/whatsappFlow.controller.js"
      );

      return await whatsappFlowController(event);
    }

    return {
      statusCode: 404,
      body: "NOT FOUND",
    };
  } catch (err) {
    console.error("❌ HANDLER ERROR:", err);

    return {
      statusCode: 500,
      body: "INTERNAL ERROR",
    };
  }
};
