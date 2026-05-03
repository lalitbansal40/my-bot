import express, { Request, Response } from "express";
import dotenv from "dotenv";
import serverless from "serverless-http";

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
if (!process.env.LAMBDA_TASK_ROOT) {
  dotenv.config();
}

const app = express();

/* =========================
🔥 CORS FIX (STRONG)
========================= */
app.use(cors());

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
🔹 LOCAL SERVER
========================= */
const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);

if (!isLambda) {
  connectMongo();
  console.log("✅ MongoDB connected (local)");

  const { WebSocketServer } = require("ws");
  const { addLocalConnection, removeLocalConnection } = require("./services/localWsStore");
  const http = require("http");

  const httpServer = http.createServer(app);
  const wss = new WebSocketServer({ server: httpServer });

  wss.on("connection", (ws: any, req: any) => {
    const url = new URL(req.url, "http://localhost");
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

  httpServer.listen(5005, () => {
    console.log("✅ HTTP  → http://localhost:5005");
    console.log("✅ WS    → ws://localhost:5005");
  });
}
/* =========================
🔹 LAMBDA HANDLER
========================= */
const serverHandler = serverless(app);

export const handler = async (event: any, context: any) => {
  context.callbackWaitsForEmptyEventLoop = false;

  // 🔥 CRITICAL FIX: preflight
  if (event.requestContext?.http?.method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
      },
      body: "",
    };
  }

  const response = (await serverHandler(event, context)) as any;

  // 🔥 Force CORS in ALL responses
  return {
    ...response,
    headers: {
      ...(response.headers || {}),
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Allow-Methods": "OPTIONS,GET,POST,PUT,DELETE",
    },
  };
};

export const server = app;
