import express, { Request, Response } from "express";
import dotenv from "dotenv";
import http from "http";
import { WebSocketServer } from "ws";
import { addLocalConnection, removeLocalConnection } from "./services/localWsStore";

import webhookRoutes from "./routes/webhook.route";
import channelRoutes from "./routes/channel.routes";
import authRoutes from "./routes/auth.routes";
import integrationRoutes from "./routes/integration.routes";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";
import contactRoutes from "./routes/contact.route";
import messageRoutes from "./routes/message.route";
import contactAttributeRoutes from "./routes/contactAttribute.route";
import templatesRoutes from "./routes/template.routes";
import automationRoutes from "./routes/automation.route";
import mediaRoutes from "./routes/media.routes";
import metaRoutes from "./routes/meta.route";
import catalogRoutes from "./routes/catalog.routes";

import { connectMongo } from "./database/mongodb";
import cors from "cors";

dotenv.config();

const app = express();

/* =========================
🔥 CORS FIX (STRONG)
========================= */
app.use(cors());

setInterval(() => {
  const used = process.memoryUsage();

  console.log("🧠 RAM Usage:");
  console.log(`RSS: ${(used.rss / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Used: ${(used.heapUsed / 1024 / 1024).toFixed(2)} MB`);
  console.log(`Heap Total: ${(used.heapTotal / 1024 / 1024).toFixed(2)} MB`);
  console.log("-----------------------------");
}, 10000);

/* =========================
🔹 RAW BODY
========================= */
app.use(
  express.json({
    verify: (
      req: Request & { rawBody?: string },
      _res: Response,
      buf: Buffer,
      encoding: BufferEncoding,
    ) => {
      if (buf) {
        req.rawBody = buf.toString(encoding || "utf8");
      }
    },
  }),
);

/* =========================
🔹 Mongo Connection (Optimized)
========================= */
let isDbConnected = false;

app.use(async (req, res, next) => {
  try {
    if (req.method === "OPTIONS") return next();

    if (!isDbConnected) {
      await connectMongo();
      isDbConnected = true;
      console.log("✅ Mongo Connected");
    }

    next();
  } catch (err) {
    console.error("❌ Mongo connection failed", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

/* =========================
🔹 ROUTES
========================= */
app.use("/webhook", webhookRoutes);
app.use("/api/channel", channelRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/contact", contactRoutes);
app.use("/api/contact-attributes", contactAttributeRoutes);
app.use("/api/message", messageRoutes);
app.use("/api/integrations", integrationRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);
app.use("/api/templates", templatesRoutes);
app.use("/api/automations", automationRoutes);
app.use("/api/media", mediaRoutes);
app.use("/meta", metaRoutes);
app.use("/api/catalog", catalogRoutes);



/* =========================
🔹 HEALTH CHECK
========================= */
app.get("/", (_req: Request, res: Response) => {
  res.send("AutoChatix API running 🚀");
});

/* =========================
🔹 SERVER START (HTTP + WebSocket)
========================= */
const PORT = process.env.PORT || 5005;

const httpServer = http.createServer(app);
const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws: any, req: any) => {
  const url = new URL(req.url, `http://localhost`);
  const accountId = url.searchParams.get("accountId");

  if (!accountId) {
    ws.close(1008, "accountId required");
    return;
  }

  addLocalConnection(accountId, ws);
  console.log(`✅ WS connected: accountId=${accountId}`);

  ws.on("close", () => {
    removeLocalConnection(accountId, ws);
    console.log(`❌ WS disconnected: accountId=${accountId}`);
  });
});

httpServer.listen(PORT, () => {
  console.log(`✅ HTTP → http://localhost:${PORT}`);
  console.log(`✅ WS   → ws://localhost:${PORT}`);
});

export const server = app;
