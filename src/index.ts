import express, { Request, Response } from "express";
import path from "path";
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

import { connectMongo } from "./database/mongodb"; // ✅ CHANGE: Mongo connect
import cors from "cors";
dotenv.config({ path: path.join(".env") });

const app = express();
app.use(
  cors({
    origin: "*",
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: false,
  }),
);
const PORT = Number(process.env.PORT) || 5005;

/* =========================
   🔹 RAW BODY (WEBHOOK SAFE)
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
   🔹 CHANGE: MongoDB middleware
   - Ensures DB connected before any route
   - Cold start: connect once
   - Warm start: reuse
========================= */
let isDbConnected = false;

app.use(async (req, res, next) => {
  try {
    // 🔥 Skip preflight request
    if (req.method === "OPTIONS") {
      return next();
    }

    if (!isDbConnected) {
      await connectMongo();
      isDbConnected = true;
    }

    next();
  } catch (err) {
    console.error("❌ Mongo connection failed", err);
    res.status(500).json({ error: "Database connection failed" });
  }
});

app.options("*", (req, res) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "*");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  return res.sendStatus(200);
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

/* =========================
   🔹 HEALTH CHECK
========================= */
app.get("/", (_req: Request, res: Response) => {
  res.send(`<pre>Nothing to see here. Checkout README.md to start.</pre>`);
});

/* =========================
   🔹 LOCAL SERVER ONLY
   ❌ DO NOT listen in Lambda
========================= */
const isLambda = Boolean(process.env.LAMBDA_TASK_ROOT);

if (!isLambda) {
  // 🔥 Force Mongo connect on local startup
  connectMongo()
    .then(() => console.log("✅ MongoDB connected (startup)"))
    .catch(console.error);

  app.listen(PORT, () => {
    console.info(
      `✅ API pluggable up and running on: http://localhost:${PORT}`,
    );
  });
}
/* =========================
   🔹 GLOBAL ERROR HANDLING
========================= */
process.on("uncaughtException", (error: Error) => {
  console.error({
    level: "error",
    message: error?.message || "💀 UnCaught Exception 💀",
    stack: error?.stack,
  });
});

process.on("unhandledRejection", (error: unknown) => {
  const err = error as Error;
  console.error({
    level: "error",
    message: err?.message || "💀 Unhandled Rejection 💀",
    stack: err?.stack,
  });
});

/* =========================
   🔹 LAMBDA HANDLER
========================= */
const serverHandler = serverless(app);

export const handler = async (event: any, context: any): Promise<any> => {
  context.callbackWaitsForEmptyEventLoop = false;
  return serverHandler(event, context);
};

/* =========================
   🔹 EXPORT APP (TESTING)
========================= */
export const server = app;
