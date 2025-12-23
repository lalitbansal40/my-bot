import express from "express";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";

const app = express();

app.use(express.json());

app.use("/webhook", webhookRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);

app.get("/", (_, res) => {
  res.send("WhatsApp Webhook Running ✅");
});

export default app;
