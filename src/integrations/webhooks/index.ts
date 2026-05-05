import { Request } from "express";
import mongoose from "mongoose";
import Automation from "../../models/automation.model";
import Contact from "../../models/contact.model";
import Integration from "../../models/integration.model";
import { Channel } from "../../models/channel.model";
import { createWhatsAppClient } from "../../services/whatsapp.client";
import { runAutomation } from "../../engine/automationExecuter";
import razorpayParser from "./razorpay.webhook";
import borzoParser from "./borzo.webhook";

/* =============================================================
   WEBHOOK PARSER CONTRACT
   Returns one or more normalized events. Each event runs the
   automations that subscribe to it.
============================================================= */
export interface WebhookEvent {
  triggerKey: string;
  accountId?: string;
  channelId?: string;
  /** Phone number (digits only — last 10) */
  contactPhone?: string;
  data: Record<string, any>;
}

export interface WebhookParser {
  /** Verify signature; throw if invalid. `secret` is per-account. */
  verify?: (req: Request, secret: string | undefined) => Promise<void> | void;
  parse: (req: Request) => Promise<WebhookEvent[]> | WebhookEvent[];
}

const PARSERS: Record<string, WebhookParser> = {
  razorpay: razorpayParser,
  borzo: borzoParser,
};

/* =============================================================
   Resolve the per-account webhook secret for an integration.
============================================================= */
const getWebhookSecret = async (
  slug: string,
  accountId?: string,
  channelId?: string
): Promise<string | undefined> => {
  if (!accountId) return undefined;
  try {
    const filter: any = {
      account_id: new mongoose.Types.ObjectId(accountId),
      slug,
    };
    if (channelId) filter.channel_id = new mongoose.Types.ObjectId(channelId);

    const integration = await Integration.findOne(filter).select("+secrets");
    return integration?.secrets?.webhook_secret;
  } catch {
    return undefined;
  }
};

/* =============================================================
   DISPATCHER
============================================================= */
export const dispatchIntegrationWebhook = async (
  slug: string,
  req: Request
): Promise<{ ok: boolean; status?: number; error?: string; fired?: number }> => {
  const parser = PARSERS[slug];
  if (!parser) {
    return { ok: false, status: 404, error: `No webhook parser for "${slug}"` };
  }

  // Account/channel hinted via querystring (recommended)
  const queryAccountId = req.query.account_id as string | undefined;
  const queryChannelId = req.query.channel_id as string | undefined;

  // Resolve per-account secret BEFORE verification
  const secret = await getWebhookSecret(slug, queryAccountId, queryChannelId);

  if (parser.verify) {
    try {
      await parser.verify(req, secret);
    } catch (e: any) {
      return { ok: false, status: 401, error: e?.message || "Signature verification failed" };
    }
  }

  const events = await parser.parse(req);
  let fired = 0;

  for (const ev of events) {
    const accountId = ev.accountId || queryAccountId;
    const channelId = ev.channelId || queryChannelId;
    if (!accountId || !channelId) {
      console.warn(`[webhook ${slug}] missing account/channel for event ${ev.triggerKey}`);
      continue;
    }

    // Find matching automations
    const automations = await Automation.find({
      account_id: new mongoose.Types.ObjectId(accountId),
      channel_id: new mongoose.Types.ObjectId(channelId),
      status: "active",
      trigger: "integration_trigger",
      "trigger_config.slug": slug,
      "trigger_config.trigger_key": ev.triggerKey,
    }).lean();

    if (!automations.length) continue;

    // Resolve channel for WA client
    const channel = await Channel.findById(channelId);
    if (!channel) {
      console.warn(`[webhook ${slug}] channel ${channelId} not found`);
      continue;
    }

    for (const automation of automations) {
      // Resolve contact (may be optional)
      let contact: any = null;
      if (ev.contactPhone) {
        const phone = ev.contactPhone.replace(/\D/g, "");
        contact = await Contact.findOneAndUpdate(
          { phone, channel_id: channelId },
          {
            $setOnInsert: { phone, channel_id: channelId, account_id: accountId },
            $set: { [`attributes.last_${slug}_event`]: { triggerKey: ev.triggerKey, ...ev.data } },
          },
          { upsert: true, new: true }
        );
      }

      const whatsapp = createWhatsAppClient(
        channel as any,
        (contact || { _id: undefined }) as any,
        accountId
      );

      const session: any = {
        contact_id: contact?._id?.toString() || `ext_${slug}_${Date.now()}`,
        current_node: "start",
        waiting_for: null,
        data: { ...ev.data },
      };

      const updateSession = async (data: any) => {
        if (!contact) return;
        const set: any = {};
        if (data.current_node !== undefined) set["attributes.current_node"] = data.current_node;
        if (data.waiting_for !== undefined) set["attributes.waiting_for"] = data.waiting_for;
        if (data.data !== undefined) {
          for (const [k, v] of Object.entries(data.data)) set[`attributes.${k}`] = v;
        }
        await Contact.updateOne({ _id: contact._id }, { $set: set });
      };

      try {
        await runAutomation({
          automation: automation as any,
          session,
          whatsapp,
          updateSession,
        });
        fired++;
      } catch (err) {
        console.error(`[webhook ${slug}] automation ${automation._id} failed:`, err);
      }
    }
  }

  return { ok: true, fired };
};
