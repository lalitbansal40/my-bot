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
dotenv.config({ path: path.join(".env") });

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

    // 👤 CONTACT UPSERT
    const contact = await Contact.findOneAndUpdate(
      { channel_id: channel._id, phone: from },
      { $set: { name: value.contacts?.[0]?.profile?.name } },
      { upsert: true, new: true }
    );

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
    try {
      await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,

        direction: "IN",
        type: "text",

        wa_message_id: message.id,
        text: message.text?.body || "",

        payload: message, // 🔥 full raw message

        status: "PENDING",
      });
    } catch (e) {
      console.log("⚠️ Duplicate prevented (DB)");
      return res.sendStatus(200);
    }


    // 🧠 SESSION
    const session = {
      contact_id: contact._id,
      current_node: contact.attributes?.current_node || "start",
      waiting_for: contact.attributes?.waiting_for || null,
      data: contact.attributes || {},
    };


    const userText = message.text?.body?.toLowerCase()?.trim() || "";

    let automation = null;
    // 🔥 KEYWORD MATCH (OVERRIDE)
    const keywordAutomation = await Automation.findOne({
      channel_id: channel._id,
      trigger: "new_message_received",
      status: "active",
      keywords: { $in: [userText] },
    });


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
      !automation && // 🔥 IMPORTANT
      contact.attributes?.current_node &&
      contact.attributes.current_node !== "start"
    ) {

      // 🔥 try continue
      if (contact.attributes?.automation_id) {
        automation = await Automation.findById(
          contact.attributes.automation_id
        );
      }


      if (!automation) {

        // 🔥 STEP 2: EMPTY KEYWORD AUTOMATION
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

        // 🛟 STEP 3: FALLBACK
        if (!automation) {
          automation = await Automation.findOne({
            channel_id: channel._id,
            trigger: "new_message_received",
            status: "active",
            is_fallback_automation: true,
          });
        }
      }

    }

    // ✅ HANDLE ASK_INPUT RESPONSE
    if (
      session.waiting_for === "input" &&
      message.text?.body
    ) {
      console.log("✅ INPUT RECEIVED:", message.text.body);

      const value = message.text.body;
      const key = session.data?.save_key;

      if (key) {
        // ✅ SAVE TO CONTACT
        await Contact.updateOne(
          { _id: contact._id },
          {
            $set: {
              [`attributes.${key}`]: value,
            },
          }
        );

        // ✅ SAVE TO SESSION
        session.data[key] = value;
      }

      // 🔥 RESET WAITING
      session.waiting_for = null;

      // 🔥 MOVE NEXT
      const nextNodeId = getNextNodeId(
        automation?.edges || [],
        session.current_node
      );

      if (nextNodeId) {
        session.current_node = nextNodeId;
      }
    }
    const whatsapp = createWhatsAppClient(channel, contact);

    // 🔥 INPUT DETECT (ONE TIME ONLY)
    if (!message) {
      return {
        text: "",
        inputId: null,
        type: "call"
      };
    }

    const inputId =
      message?.interactive?.button_reply?.id ||
      message?.interactive?.list_reply?.id;

    // ✅ SAVE INPUT
    if (inputId) {
      await Contact.updateOne(
        { _id: contact._id },
        { $set: { "attributes.product_id": inputId } }
      );

      // 🔥 CRITICAL (missing)
      session.data.product_id = inputId;
    }

    // 🔥 HANDLE INPUT → MOVE NEXT NODE
    if (session.waiting_for && inputId) {
      console.log("✅ INPUT RECEIVED → MOVE NEXT:", inputId);

      session.waiting_for = null;

      const nextNode = getNextNodeId(
        automation?.edges || [],
        session.current_node,
        inputId
      );

      if (nextNode) {
        session.current_node = nextNode;
      }
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

    session.data.automation_id = automation._id;
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          "attributes.automation_id": automation._id,
        },
      }
    );
    // 🚀 RUN ENGINE
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
          {
            $set: { attributes: updatedAttributes },
          }
        );

        session.current_node = updatedAttributes.current_node;
        session.waiting_for = updatedAttributes.waiting_for;
        session.data = updatedAttributes;
      },
    });

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

    const whatsapp = createWhatsAppClient(channel, contact);

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