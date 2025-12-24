import express from "express";
import serverless from "serverless-http";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";

const app = express();

app.use(express.json());

app.use("/webhook", webhookRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);

app.get("/", (_req, res) => {
  res.send("APP RUNNING ✅");
});

// 🔴 THIS IS IMPORTANT
export const handler = serverless(app);

// optional (local only)
export const server = app;
