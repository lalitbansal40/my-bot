import crypto from "crypto";
import { Request } from "express";
import { WebhookParser, WebhookEvent } from "./index";

/* Razorpay webhook events we map → integration trigger keys */
const EVENT_MAP: Record<string, string> = {
  "payment.captured": "payment_captured",
  "payment.failed": "payment_failed",
  "payment_link.paid": "payment_captured",
};

const parser: WebhookParser = {
  verify: async (req, _) => {
    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) return; // dev mode: skip verification
    if (!signature) throw new Error("Missing x-razorpay-signature header");

    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const expected = crypto.createHmac("sha256", secret).update(raw).digest("hex");
    if (expected !== signature) {
      throw new Error("Razorpay signature mismatch");
    }
  },

  parse: (req: Request): WebhookEvent[] => {
    const event = req.body?.event as string;
    const triggerKey = EVENT_MAP[event];
    if (!triggerKey) return [];

    const payment = req.body?.payload?.payment?.entity || {};
    const link = req.body?.payload?.payment_link?.entity || {};

    const phone = payment.contact || link?.customer?.contact || "";

    const data = {
      payment_id: payment.id,
      amount: payment.amount ? payment.amount / 100 : undefined,
      currency: payment.currency,
      status: payment.status,
      contact_phone: phone,
      contact_email: payment.email,
      reference_id: link.reference_id,
      payment_link_id: link.id,
      error_description: payment.error_description,
    };

    return [
      {
        triggerKey,
        contactPhone: phone,
        data,
      },
    ];
  },
};

export default parser;
