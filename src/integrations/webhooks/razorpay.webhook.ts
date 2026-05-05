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
  /**
   * Per-account HMAC verification.
   * Priority:
   *  1. `secret` resolved from the Integration record (preferred)
   *  2. process.env.RAZORPAY_WEBHOOK_SECRET (fallback)
   *  3. If neither set → skip (dev mode)
   */
  verify: async (req, secret) => {
    const resolvedSecret = secret || process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!resolvedSecret) return; // dev mode: skip verification

    const signature = req.headers["x-razorpay-signature"] as string | undefined;
    if (!signature) throw new Error("Missing x-razorpay-signature header");

    const raw = (req as any).rawBody || JSON.stringify(req.body);
    const expected = crypto
      .createHmac("sha256", resolvedSecret)
      .update(raw)
      .digest("hex");

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
