import express from "express";
import serverless from "serverless-http";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";

const app = express();

app.use(express.json());

app.use("/webhook", webhookRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);

app.get("/", (_req, res) => {
  res.send(`<pre>Nothing to see here. Checkout README.md to start.</pre>`);
});

// Lambda handler
export const serverHandler = serverless(app);
export const handler = async (event:any, context:any) => {
  return serverHandler(event, context);
};
// Optional (for local testing)
export const server = app;
