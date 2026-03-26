import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { Channel } from "../models/channel.model";
import Automation from "../models/automation.model";
import AutomationSession from "../models/automationSession.model";
import { createWhatsAppClient } from "../services/whatsapp.client";
import { runAutomation } from "../engine/automationExecuter";
import Contact from "../models/contact.model";
import Message from "../models/message.model";
import { sendTypingIndicator } from "../helpers/whatsapp.helper";
import { downloadWhatsAppMedia } from "../helpers/downloadMedia";
import { uploadToS3 } from "../services/s3.service";
import axios from "axios";
dotenv.config({ path: path.join(".env") });

const SHEET_ID = "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI";
const REFERENCE_COORDS = {
  lat: 26.838606673565817,
  lng: 75.82641420437723,
};

const INTERNAL_NOTIFY_NUMBERS = ["919664114023", "917413048269"];
/* =====================================================
   SHOP CONSTANTS (FIXED)
===================================================== */
const SHOP_ADDRESS =
  "Shiv Bhole Bakers, vivek vihar mod, jagatpura, Jaipur, Rajasthan, India";
const SHOP_PHONE = "9664114023";

export const verifyWebhook = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const mode = req.query["hub.mode"] as string | undefined;
    const token = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    console.log("Webhook verification attempt:", { mode, token, challenge });
    if (
      mode === "subscribe" &&
      token === process.env.WHATSAPP_VERIFY_TOKEN &&
      challenge
    ) {
      return res.status(200).set("Content-Type", "text/plain").send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error("verifyWebhook error:", error);
    return res.sendStatus(500);
  }
};

/* =====================================================
   WHATSAPP MESSAGE RECEIVE
===================================================== */
export const receiveMessage = async (req: Request, res: Response) => {
  try {
    console.log("req.body ::", JSON.stringify(req.body));

    const value = req.body?.entry?.[0]?.changes?.[0]?.value;

    // ✅ STATUS UPDATE (DELIVERED / READ)
    if (value?.statuses) {
      const statusObj = value.statuses[0];

      const updateData: any = {
        status: statusObj.status.toUpperCase(), // SENT / DELIVERED / READ / FAILED
      };

      // ✅ FAILED CASE
      if (statusObj.status === "failed") {
        const error = statusObj.errors?.[0];

        updateData.error = {
          code: error?.code,
          message: error?.message,
          details: error?.error_data?.details,
        };
      }

      await Message.updateOne({ wa_message_id: statusObj.id }, updateData);

      return res.sendStatus(200);
    }

    if (!value?.messages) return res.sendStatus(200);

    const phoneNumberId = value.metadata.phone_number_id;
    const message = value.messages[0];
    const from = message.from;

    const channel = await Channel.findOne({
      phone_number_id: phoneNumberId,
      is_active: true,
    });
    if (!channel) return res.sendStatus(200);

    const automation = await Automation.findOne({
      channel_id: channel._id,
      trigger: "new_message_received",
      status: "active",
    });
    if (!automation) return res.sendStatus(200);

    // 👤 CONTACT UPSERT
    const contact = await Contact.findOneAndUpdate(
      { channel_id: channel._id, phone: from },
      { $set: { name: value.contacts?.[0]?.profile?.name } },
      { upsert: true, new: true },
    );

    // 🚫 DUPLICATE CHECK
    const existing = await Message.findOne({
      wa_message_id: message.id,
    });

    if (existing) {
      return res.sendStatus(200);
    }

    // 🔥 MESSAGE PARSING
    let text: string | null = null;
    let media: any = null;

    // TEXT
    if (message.type === "text") {
      text = message.text?.body || null;
    }

    // MEDIA TYPES
    else if (["image", "video", "audio", "document"].includes(message.type)) {
      const mediaObj = message[message.type];

      try {
        console.log("Processing media:", message.type);

        // ✅ UNIVERSAL CAPTION HANDLING
        text = extractCaption(mediaObj);

        // 🔥 STEP 1: Get real media URL
        const metaRes = await axios.get(
          `https://graph.facebook.com/v19.0/${mediaObj.id}`,
          {
            headers: {
              Authorization: `Bearer ${channel.access_token}`,
            },
          },
        );

        const realUrl = metaRes.data.url;

        // 🔥 STEP 2: Download
        const buffer = await downloadWhatsAppMedia(
          realUrl,
          channel.access_token,
        );

        // 🔥 STEP 3: Upload to S3
        const s3Url = await uploadToS3(buffer, mediaObj.mime_type);

        // 🔥 SAVE MEDIA
        media = {
          url: s3Url,
          mime_type: mediaObj.mime_type,
          filename: mediaObj.filename || null,
        };
      } catch (err) {
        console.error("❌ Media processing failed:", err);

        // fallback
        media = {
          url: mediaObj.url,
          mime_type: mediaObj.mime_type,
          filename: mediaObj.filename || null,
        };

        // fallback caption
        text = extractCaption(mediaObj);
      }
    }

    // CONTACT SHARE
    else if (message.type === "contacts") {
      const c = message.contacts[0];

      text = c?.name?.formatted_name || "Shared Contact";

      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            "attributes.shared_contact": c,
          },
        },
      );
    }

    // LOCATION
    else if (message.type === "location") {
      const loc = message.location;

      text = `Location: ${loc.latitude}, ${loc.longitude}`;

      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            "attributes.delivery_address": loc,
          },
        },
      );
    }

    // SAVE MESSAGE
    const msg = await Message.create({
      channel_id: channel._id,
      contact_id: contact._id,
      direction: "IN",
      type: message.type,
      status: "SENT",
      wa_message_id: message.id,
      reply_to: message.context?.id || null,
      text,
      media,
      payload: message,
      is_read: false,
    });

    // UPDATE CONTACT
    await Contact.updateOne(
      { _id: contact._id },
      {
        $inc: { unread_count: 1 },
        $set: {
          last_message_id: msg._id,
          last_message: text || media?.url || "Media",
          last_message_at: new Date(),
        },
      },
    );

    // 🧠 AUTOMATION SESSION
    let session = await AutomationSession.findOne({
      phone: from,
      automation_id: automation._id,
    });

    if (!session) {
      session = await AutomationSession.create({
        phone: from,
        automation_id: automation._id,
        channel_id: channel._id,
        contact_id: contact._id,
        current_node: "start",
        waiting_for: null,
        data: {},
        status: "active",
      });
    }

    const whatsapp = createWhatsAppClient(channel, contact);

    sendTypingIndicator(
      channel.phone_number_id,
      channel.access_token,
      message.id,
    );

    await runAutomation({
      automation,
      session,
      message,
      whatsapp,
      updateSession: async (updates) => {
        Object.assign(session, updates);
        await session.save();
      },
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ receiveMessage error", error);
    return res.sendStatus(200);
  }
};

const extractCaption = (mediaObj: any) => {
  return mediaObj?.caption || null;
};
