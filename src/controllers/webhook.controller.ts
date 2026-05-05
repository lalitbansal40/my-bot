import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { Channel } from "../models/channel.model";
import Automation from "../models/automation.model";
import { createWhatsAppClient } from "../services/whatsapp.client";
import { runAutomation } from "../engine/automationExecuter";
import Contact from "../models/contact.model";
import Message from "../models/message.model";
import axios from "axios";
import { getNextNodeId } from "../engine/grapht";
import { uploadFromUrlToS3 } from "../services/s3v2.service";
import { pushToAccount } from "../services/wsHelper";
import { sendTypingIndicator } from "../helpers/whatsapp.helper";
import {
  captureTemplateHold,
  releaseTemplateHold,
} from "../services/wallet.service";
dotenv.config({ path: path.join(".env") });

/* =====================================================
   PROFILE PICTURE — best-effort, never throws
===================================================== */
const fetchAndSaveProfilePic = async (
  phoneNumberId: string,
  accessToken: string,
  waId: string,
  contactId: any,
) => {
  try {
    // Meta WhatsApp Cloud API: get contact profile picture via contacts endpoint
    const res = await axios.get(
      `https://graph.facebook.com/v20.0/${phoneNumberId}/contacts`,
      {
        params: {
          contact_ids: JSON.stringify([waId]),
          fields: "profile_picture_url",
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      },
    );

    const picUrl: string | undefined =
      res.data?.data?.[0]?.profile_picture_url;

    if (!picUrl) return;

    // Download and re-upload to S3 so the URL is always public
    const s3Url = await uploadFromUrlToS3(picUrl, "image/jpeg");

    await Contact.updateOne(
      { _id: contactId },
      { $set: { profile_picture: s3Url } },
    );
  } catch (_) {
    // Silently skip — profile picture is optional
  }
};

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
      console.log("Webhook verified successfully");
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

    if (value?.calls) {
      const handled = await handleCallEvent(value);

      if (handled) {
        return res.sendStatus(200); // ✅ stop further execution
      }
    }

    // ✅ STATUS UPDATE
    if (value?.statuses) {
      const statusObj = value.statuses[0];

      const updateData: any = {
        status: statusObj.status.toUpperCase(),
      };

      if (statusObj.status === "failed") {
        const error = statusObj.errors?.[0];
        updateData.error = {
          code: error?.code,
          message: error?.message,
          details: error?.error_data?.details,
        };
      }

      const updatedMsg = await Message.findOneAndUpdate(
        { wa_message_id: statusObj.id },
        updateData,
        { new: false, lean: true, projection: { channel_id: 1, contact_id: 1, type: 1 } }
      ) as any;

      if (updatedMsg) {
        if (updatedMsg.type === "template") {
          const normalizedStatus = statusObj.status?.toUpperCase();
          if (normalizedStatus === "DELIVERED" || normalizedStatus === "READ") {
            await captureTemplateHold(updatedMsg._id);
          } else if (normalizedStatus === "FAILED") {
            await releaseTemplateHold(
              updatedMsg._id,
              updateData.error?.message || "template_delivery_failed"
            );
          }
        }

        const msgChannel = await Channel.findById(updatedMsg.channel_id, "account_id").lean() as any;
        if (msgChannel) {
          pushToAccount(msgChannel.account_id.toString(), {
            type: "message_status",
            wa_message_id: statusObj.id,
            status: statusObj.status.toUpperCase(),
            contact_id: updatedMsg.contact_id,
          }).catch(() => {});
        }
      }

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

    // 👤 CONTACT UPSERT
    const waId: string = value.contacts?.[0]?.wa_id || from;
    const contact = await Contact.findOneAndUpdate(
      { channel_id: channel._id, phone: from },
      {
        $set: { name: value.contacts?.[0]?.profile?.name },
        $inc: { unread_count: 1 },
      },
      { upsert: true, new: true }
    );

    // 📸 PROFILE PICTURE — fetch only when not yet saved
    if (!contact.profile_picture) {
      fetchAndSaveProfilePic(
        phoneNumberId,
        channel.access_token,
        waId,
        contact._id,
      );
    }

    // ✅ ADD THIS HERE (RIGHT AFTER CONTACT UPSERT)
    if (!contact.attributes) {
      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            attributes: {
              current_node: "start",
              waiting_for: null,
            },
          },
        }
      );

      // optional: memory में भी update कर लो
      contact.attributes = {
        current_node: "start",
        waiting_for: null,
      };
    }

    const incomingMessageType =
      message.type === "interactive" ||
      message.type === "button" ||
      message.type === "image" ||
      message.type === "document" ||
      message.type === "video" ||
      message.type === "audio" ||
      message.type === "location" ||
      message.type === "sticker" ||
      message.type === "contact"
        ? message.type
        : "text";

    const incomingText =
      message.text?.body ||
      message.button?.text ||
      message.button?.payload ||
      message.interactive?.button_reply?.title ||
      message.interactive?.list_reply?.title ||
      "";

    let savedMessage: any;
    try {
      savedMessage = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,

        direction: "IN",
        type: incomingMessageType,

        wa_message_id: message.id,
        text: incomingText,

        payload: message,

        status: "PENDING",
      });
    } catch (e) {
      console.log("⚠️ Duplicate prevented (DB)");
      return res.sendStatus(200);
    }

    // Enrich message for WS push
    const msgObj: any = savedMessage.toObject();
    msgObj.text = msgObj.text ||
      msgObj.payload?.text?.body ||
      msgObj.payload?.button?.text ||
      msgObj.payload?.button?.payload ||
      msgObj.payload?.interactive?.button_reply?.title ||
      msgObj.payload?.interactive?.list_reply?.title ||
      "";

    const contextId = message.context?.id;
    if (contextId) {
      const repliedMsg = await Message.findOne({ wa_message_id: contextId, contact_id: contact._id }).lean() as any;
      msgObj.reply_message = repliedMsg ? {
        _id: repliedMsg._id,
        type: repliedMsg.type,
        text: repliedMsg.text || repliedMsg.payload?.body || repliedMsg.payload?.text?.body || repliedMsg.payload?.button?.text || repliedMsg.payload?.button?.payload || repliedMsg.payload?.bodyText || repliedMsg.payload?.caption || repliedMsg.payload?.interactive?.button_reply?.title || repliedMsg.payload?.interactive?.list_reply?.title || "Message",
        payload: repliedMsg.payload,
      } : null;
    } else {
      msgObj.reply_message = null;
    }

    // Real-time push to frontend
    pushToAccount(channel.account_id.toString(), {
      type: "new_message",
      channel_id: channel._id,
      contact_id: contact._id,
      message: msgObj,
    }).catch(() => {});

    // Mark as read + show typing bubble on user's WhatsApp
    sendTypingIndicator(channel.phone_number_id, channel.access_token, message.id, from).catch(() => {});

    // 🧠 SESSION
    const session = {
      contact_id: contact._id,
      current_node: contact.attributes?.current_node || "start",
      waiting_for: contact.attributes?.waiting_for || null,
      data: contact.attributes || {},
    };

    const userText = message.text?.body?.toLowerCase()?.trim() || "";
    const isInteractiveReply = !!(
      message?.interactive?.button_reply?.id ||
      message?.interactive?.list_reply?.id ||
      message?.interactive?.nfm_reply ||
      message?.button?.payload ||
      message?.button?.text
    );

    let automation = null;

    // 🔥 KEYWORD MATCH (OVERRIDE)
    // Only run keyword override when we have actual text AND we're NOT
    // mid-flow waiting for a structured reply. Without this guard, an empty
    // userText (button/list/flow reply) could match an automation whose
    // keywords array contains "" and reset the carousel flow on every tap.
    const inActiveFlow =
      session.waiting_for &&
      ["button", "list", "carousel", "flow", "address_message", "location"].includes(
        session.waiting_for,
      );

    const keywordAutomation =
      userText && !isInteractiveReply && !inActiveFlow
        ? await Automation.findOne({
            channel_id: channel._id,
            trigger: "new_message_received",
            status: "active",
            keywords: { $in: [userText] },
          })
        : null;

    if (keywordAutomation) {
      console.log("🔥 Override → reset flow");
      automation = keywordAutomation;
      session.current_node = "start";
      session.waiting_for = null;
      session.data = {};
      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            attributes: {
              current_node: "start",
              waiting_for: null,
              automation_id: keywordAutomation._id,
            },
          },
        }
      );
    }

    // 🧠 SESSION CONTINUE
    if (
      !automation &&
      contact.attributes?.current_node &&
      contact.attributes.current_node !== "start"
    ) {
      if (contact.attributes?.automation_id) {
        automation = await Automation.findById(contact.attributes.automation_id);
      }

      if (!automation) {
        automation = await Automation.findOne({
          channel_id: channel._id,
          trigger: "new_message_received",
          status: "active",
          disable_automation: { $ne: true },
          $or: [
            { keywords: { $exists: false } },
            { keywords: { $size: 0 } },
          ],
        });
      }

      if (!automation) {
        automation = await Automation.findOne({
          channel_id: channel._id,
          trigger: "new_message_received",
          status: "active",
          is_fallback_automation: true,
        });
      }
    }

    // ✅ HANDLE ASK_INPUT RESPONSE
    if (session.waiting_for === "input" && message.text?.body) {
      console.log("✅ INPUT RECEIVED:", message.text.body);
      const inputValue = message.text.body;
      const key = session.data?.save_key;
      if (key) {
        await Contact.updateOne(
          { _id: contact._id },
          { $set: { [`attributes.${key}`]: inputValue } }
        );
        session.data[key] = inputValue;
      }
      session.waiting_for = null;
      const nextNodeId = getNextNodeId(automation?.edges || [], session.current_node);
      if (nextNodeId) session.current_node = nextNodeId;
    }

    const whatsapp = createWhatsAppClient(channel, contact, channel.account_id.toString());

    const inputId =
      message?.interactive?.button_reply?.id ||
      message?.interactive?.list_reply?.id ||
      message?.button?.payload;

    if (inputId) {
      await Contact.updateOne(
        { _id: contact._id },
        { $set: { "attributes.product_id": inputId } }
      );
      session.data.product_id = inputId;
    }

    if (
      session.waiting_for &&
      session.waiting_for !== "button" &&
      inputId
    ) {
      console.log("✅ INPUT RECEIVED → MOVE NEXT:", inputId);
      session.waiting_for = null;
      const nextNode = getNextNodeId(automation?.edges || [], session.current_node, inputId);
      if (nextNode) session.current_node = nextNode;
    }

    // ✅ RESET FLOW
    if (contact.attributes?.current_node === "done") {
      session.current_node = "start";
      session.waiting_for = null;
      session.data = {};
    }

    // 🔥 DEFAULT AUTOMATION (ONLY EMPTY KEYWORDS)
    if (!automation) {
      console.log("⚡ Default (no keyword)");
      automation = await Automation.findOne({
        channel_id: channel._id,
        trigger: "new_message_received",
        status: "active",
        $or: [
          { keywords: { $exists: false } },
          { keywords: { $size: 0 } },
        ],
      });
    }

    if (!automation) {
      console.log("❌ No automation found");
      return res.sendStatus(200);
    }

    // ✅ ATOMIC LOCK — only one automation per contact at a time
    const lockAcquired = await Contact.findOneAndUpdate(
      { _id: contact._id, is_processing: { $ne: true } },
      { $set: { is_processing: true, "attributes.automation_id": automation._id } },
    );

    if (!lockAcquired) {
      console.log("⏳ Contact already processing, skipping");
      return res.sendStatus(200);
    }

    session.data.automation_id = automation._id;

    pushToAccount(channel.account_id.toString(), {
      type: "typing_indicator",
      contact_id: contact._id,
      is_typing: true,
    }).catch(() => {});

    // 🚀 RUN ENGINE
    try {
      await runAutomation({
        automation,
        session,
        message,
        whatsapp,
        updateSession: async (updates) => {
          const freshContact = await Contact.findById(contact._id).lean();
          const updatedAttributes = {
            ...freshContact?.attributes,
            ...(updates.data || {}),
            current_node:
              updates.current_node !== undefined
                ? updates.current_node
                : freshContact?.attributes?.current_node,
            waiting_for:
              updates.waiting_for !== undefined
                ? updates.waiting_for
                : freshContact?.attributes?.waiting_for,
          };
          await Contact.updateOne(
            { _id: contact._id },
            { $set: { attributes: updatedAttributes } }
          );
          session.current_node = updatedAttributes.current_node;
          session.waiting_for = updatedAttributes.waiting_for;
          session.data = updatedAttributes;
        },
      });
    } finally {
      // Always release lock
      await Contact.updateOne({ _id: contact._id }, { $set: { is_processing: false } });
      pushToAccount(channel.account_id.toString(), {
        type: "typing_indicator",
        contact_id: contact._id,
        is_typing: false,
      }).catch(() => {});
    }

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ receiveMessage error", error);
    return res.sendStatus(200);
  }
};

function getCallTrigger(call: any) {
  // ❌ Only process terminate events
  if (call.event !== "terminate") return null;

  const status = call.status?.toUpperCase();

  // ✅ Call completed
  if (status === "COMPLETED") {
    return "call_completed";
  }

  // ✅ Proper missed cases
  if (["NO_ANSWER", "FAILED", "BUSY", "REJECTED"].includes(status)) {
    return "call_missed";
  }

  // ❌ Ignore unknown
  return null;
}

export const handleCallEvent = async (value: any) => {
  try {
    if (!value?.calls) return false;

    const call = value.calls[0];
    const callId = call.id;

    // 🔥 DB check
    const existing = await Message.findOne({ wa_message_id: callId });

    if (existing) {
      console.log("🚫 Duplicate call webhook blocked (DB)");
      return true;
    }

    const trigger = getCallTrigger(call);
    if (!trigger) return true;

    const phoneNumberId = value.metadata.phone_number_id;
    const from = call.from;

    const channel = await Channel.findOne({
      phone_number_id: phoneNumberId,
      is_active: true,
    });

    if (!channel) return true;

    const contact = await Contact.findOneAndUpdate(
      { channel_id: channel._id, phone: from },
      { $set: { name: value.contacts?.[0]?.profile?.name } },
      { upsert: true, new: true }
    );

    const automation = await Automation.findOne({
      channel_id: channel._id,
      trigger: trigger,
      status: "active",
    });

    if (!automation) return true;

    const whatsapp = createWhatsAppClient(channel, contact, channel.account_id.toString());

    const session = {
      contact_id: contact._id,
      current_node: "start",
      waiting_for: null,
      data: {},
    };

    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          attributes: {
            waiting_for: null,
            automation_id: automation._id,
          },
        },
      }
    );


    await Message.create({
      channel_id: channel._id,
      contact_id: contact._id,

      direction: "IN",
      type: "call",

      status:
        call.status === "COMPLETED"
          ? "CALL_COMPLETED"
          : "CALL_" + call.status,

      wa_message_id: call.id,

      call: {
        call_id: call.id,
        from: call.from,
        to: call.to,
        direction: call.direction,
        event: call.event,
        status: call.status,
        timestamp: call.timestamp,
      },

      payload: call,
    });

    await runAutomation({
      automation,
      session,
      whatsapp,
      updateSession: async () => { },
    });

    return true;
  } catch (error) {
    console.error("❌ handleCallEvent error", error);
    return true;
  }
};
