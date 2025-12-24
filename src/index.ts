// import express from "express";
// import serverless from "serverless-http";
// import webhookRoutes from "./routes/webhook.route";
// import whatsappFlowRoutes from "./routes/whatsappFlow.route";

// const app = express();

// app.use(express.json());

// app.use("/webhook", webhookRoutes);
// app.use("/whatsappflow", whatsappFlowRoutes);

// app.get("/", (_req, res) => {
//   res.send("<pre>Nothing to see here. Checkout README.md to start.</pre>");
// });

// // ✅ Direct handler export
// export const handler = serverless(app);

// // optional (local testing)
// export const server = app;


export const handler = async (event: any) => {
  try {
    const method = event.requestContext?.http?.method;
    const path = event.rawPath;
    console.log("event :: ",JSON.stringify(event))
    // ROOT
    if (path === "/" && method === "GET") {
      return {
        statusCode: 200,
        body: "APP RUNNING ✅"
      };
    }

    // WEBHOOK VERIFY
    if (path === "/webhook" && method === "GET") {
      const q = event.queryStringParameters || {};

      if (
        q["hub.mode"] === "subscribe" &&
        q["hub.verify_token"] === process.env.WHATSAPP_VERIFY_TOKEN
      ) {
        return {
          statusCode: 200,
          headers: { "Content-Type": "text/plain" },
          body: q["hub.challenge"]
        };
      }

      return { statusCode: 403, body: "Forbidden" };
    }

    return { statusCode: 404, body: "Not Found" };
  } catch (err) {
    console.error("ERROR:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
