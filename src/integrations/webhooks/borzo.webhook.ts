import { Request } from "express";
import { WebhookParser, WebhookEvent } from "./index";

const EVENT_MAP: Record<string, string> = {
  "order.picked_up": "order_picked_up",
  "order.delivered": "order_delivered",
  "order.failed": "order_failed",
  // Borzo also emits raw status names:
  picked_up: "order_picked_up",
  delivered: "order_delivered",
  failed: "order_failed",
};

const parser: WebhookParser = {
  parse: (req: Request): WebhookEvent[] => {
    const ev = req.body?.event_type || req.body?.status || req.body?.event;
    const triggerKey = EVENT_MAP[ev as string];
    if (!triggerKey) return [];

    const order = req.body?.order || req.body || {};
    const drop = order?.points?.[1] || {};
    const phone = drop?.contact_person?.phone || order?.contact_phone || "";

    return [
      {
        triggerKey,
        contactPhone: phone,
        data: {
          order_id: order.order_id,
          delivery_id: order.delivery_id,
          status: ev,
          payment_amount: order.payment_amount,
        },
      },
    ];
  },
};

export default parser;
