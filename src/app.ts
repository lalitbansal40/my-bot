import express from "express";
import serverless from "serverless-http";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";
import contactRoutes from "./routes/contact.route";
import messageRoutes from "./routes/message.route";
import authRoutes from "./routes/auth.routes";




const app = express();

app.use(express.json());

app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/message", messageRoutes);


app.use("/webhook", webhookRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);

app.get("/", (_req, res) => {
  res.send("APP RUNNING ✅");
});

// 🔴 THIS IS IMPORTANT
export const handler = serverless(app);

// optional (local only)
export const server = app;
