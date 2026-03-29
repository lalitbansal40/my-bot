import { Request, Response } from "express";
import mongoose from "mongoose";
import Message from "../models/message.model";
import { Channel } from "../models/channel.model";
import Contact from "../models/contact.model";
import { createWhatsAppClient } from "../services/whatsapp.client";
import { uploadToS3 } from "../services/s3.service";
import axios from "axios";
import { convertToMp3 } from "../helpers/audioConvertor";
import { convertToMp4 } from "../helpers/videoConvertor";
import heicConvert from "heic-convert";
/* ================================
   Attach Reply Messages
================================ */
async function attachReplyMessages(messages: any[]) {
  const replyIds = messages.filter((m) => m.reply_to).map((m) => m.reply_to);

  if (replyIds.length === 0) return messages;

  const repliedMessages = await Message.find({
    wa_message_id: { $in: replyIds },
  }).lean();

  const replyMap: any = {};

  repliedMessages.forEach((msg) => {
    replyMap[msg.wa_message_id] = msg;
  });

  messages.forEach((m: any) => {
    if (m.reply_to) {
      m.reply_message = replyMap[m.reply_to] || null;
    }
  });

  return messages;
}

/* ================================
   Get Messages By Contact
================================ */
export const getMessagesByContact = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const { cursor, limit = 30 } = req.query;

    // Validate contactId
    if (!contactId || !mongoose.Types.ObjectId.isValid(contactId)) {
      return res.status(400).json({
        success: false,
        message: "Valid contactId is required",
      });
    }

    const query: any = {
      contact_id: new mongoose.Types.ObjectId(contactId),
    };

    // Cursor pagination
    if (cursor) {
      query.createdAt = {
        $lt: new Date(cursor as string),
      };
    }

    // Fetch messages
    let messages = await Message.find(query)
      .sort({ createdAt: -1 })
      .limit(Number(limit))
      .lean();

    // Attach reply messages
    messages = await attachReplyMessages(messages);

    return res.status(200).json({
      success: true,
      count: messages.length,
      nextCursor:
        messages.length > 0 ? messages[messages.length - 1].createdAt : null,
      data: messages.reverse(), // oldest → newest
    });
  } catch (error: any) {
    console.error("Get Messages By Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const sendTextMessage = async (req: Request, res: Response) => {
  try {
    const { channelId, contactId, text } = req.body;

    if (!channelId || !contactId || !text) {
      return res.status(400).json({
        success: false,
        message: "channelId, contactId and text are required",
      });
    }

    // 1️⃣ Get Channel
    const channel = await Channel.findById(channelId);
    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    // 2️⃣ Get Contact
    const contact = await Contact.findById(contactId);
    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    // 3️⃣ Create WhatsApp Client
    const whatsapp = createWhatsAppClient(channel, contact);

    // 4️⃣ Send Message (this internally saves message)
    await whatsapp.sendText(contact.phone, text);

    // 5️⃣ Get latest message for response
    const message = await Message.findOne({
      contact_id: contactId,
      channel_id: channelId,
      direction: "OUT",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({
      success: true,
      data: message,
    });
  } catch (error) {
    console.error("Send Message Error:", error);

    return res.status(500).json({
      success: false,
      message: "Failed to send message",
    });
  }
};

export const markMessagesAsRead = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    await Message.updateMany(
      {
        contact_id: contactId,
        direction: "IN",
        is_read: false,
      },
      {
        $set: { is_read: true },
      },
    );

    await Contact.updateOne({ _id: contactId }, { $set: { unread_count: 0 } });

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false });
  }
};

export const sendMediaMessage = async (req: Request, res: Response) => {
  try {
    const { channelId, contactId, caption } = req.body;
    const files = (req.files as Express.Multer.File[]) || [];

    if (!files.length) {
      return res.status(400).json({ message: "Files required" });
    }

    if (!files || files.length === 0) {
      return res.status(400).json({ message: "Files required" });
    }

    const channel = await Channel.findById(channelId);
    const contact = await Contact.findById(contactId);

    if (!channel || !contact) {
      return res.status(404).json({ message: "Invalid channel/contact" });
    }

    const whatsappUrl = `https://graph.facebook.com/v24.0/${channel.phone_number_id}/messages`;

    const results = [];
    const groupId = new mongoose.Types.ObjectId();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      /* =========================================
         🔥 1. HANDLE MIME + BUFFER
      ========================================= */
      let mimeType = file.mimetype;
      let buffer = file.buffer;
      let filename = file.originalname;

      /* =========================================
   🔥 HEIC IMAGE FIX (FINAL FIXED 🔥)
========================================= */
      if (
        file.mimetype === "image/heic" ||
        file.mimetype === "image/heif" ||
        file.originalname.toLowerCase().endsWith(".heic")
      ) {
        console.log("🖼️ Converting HEIC → JPG...");

        // 🔥 Buffer → ArrayBuffer convert
        const arrayBuffer = file.buffer.buffer.slice(
          file.buffer.byteOffset,
          file.buffer.byteOffset + file.buffer.byteLength,
        );

        const outputBuffer = await heicConvert({
          buffer: arrayBuffer, // ✅ FIXED
          format: "JPEG",
          quality: 0.9,
        });

        // 🔥 ArrayBuffer → Buffer
        buffer = Buffer.from(outputBuffer);

        mimeType = "image/jpeg";
        filename = `${Date.now()}.jpg`;
      }
      /* =========================================
   🔥 AUDIO FIX
========================================= */
      if (mimeType.includes("audio")) {
        console.log("🎤 Converting audio to mp3...");
        buffer = await convertToMp3(file.buffer);
        mimeType = "audio/mpeg";
        filename = `${Date.now()}.mp3`;
      }

      /* =========================================
   🔥 VIDEO FIX (CRITICAL 🔥)
========================================= */
      if (mimeType.includes("video")) {
        if (mimeType !== "video/mp4") {
          console.log("🎬 Converting video → MP4...");

          buffer = await convertToMp4(file.buffer);
          mimeType = "video/mp4";
          filename = `${Date.now()}.mp4`;
        }
      }

      /* =========================================
         🔥 2. UPLOAD TO S3 (FIXED)
      ========================================= */
      const url = await uploadToS3(buffer, mimeType); // ✅ IMPORTANT FIX

      /* =========================================
         🔥 3. DETECT TYPE
      ========================================= */
      let type: any = "document";

      if (mimeType.startsWith("image")) type = "image";
      else if (mimeType.startsWith("video")) type = "video";
      else if (mimeType.startsWith("audio")) type = "audio";

      console.log("SENDING FILE:", {
        original: file.mimetype,
        finalMime: mimeType,
        type,
        url,
      });

      /* =========================================
         🔥 4. SAVE IN DB
      ========================================= */
      const msg = await Message.create({
        channel_id: channel._id,
        contact_id: contact._id,
        direction: "OUT",
        type,
        status: "PENDING",
        group_id: groupId,
        is_read: true,
        payload: {
          url,
          filename,
          mime_type: mimeType,
          caption: i === 0 ? caption : undefined,
        },
      });

      /* =========================================
         🔥 5. BUILD WHATSAPP PAYLOAD
      ========================================= */
      const payload: any = {
        messaging_product: "whatsapp",
        to: contact.phone,
        type,
      };

      if (type === "image") {
        payload.image = {
          link: url,
          caption: i === 0 ? caption : undefined,
        };
      } else if (type === "video") {
        payload.video = {
          link: url,
          caption: i === 0 ? caption : undefined,
        };
      } else if (type === "audio") {
        payload.audio = {
          link: url, // ✅ NO caption
        };
      } else {
        payload.document = {
          link: url,
          filename,
          caption: i === 0 ? caption : undefined,
        };
      }

      /* =========================================
         🔥 6. SEND TO WHATSAPP
      ========================================= */
      const response = await axios.post(whatsappUrl, payload, {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
      });

      const waId = response.data?.messages?.[0]?.id;

      /* =========================================
         🔥 7. UPDATE STATUS
      ========================================= */
      await Message.updateOne(
        { _id: msg._id },
        {
          status: "SENT",
          wa_message_id: waId,
        },
      );

      results.push({
        ...msg.toObject(),
        wa_message_id: waId,
        status: "SENT",
      });
    }

    /* =========================================
       🔥 8. UPDATE CONTACT
    ========================================= */
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: { last_message_at: new Date() },
      },
    );

    return res.json({
      success: true,
      data: results,
    });
  } catch (error: any) {
    console.error("❌ Send Media Error:", error?.response?.data || error);

    return res.status(500).json({
      success: false,
      message: "Failed to send media",
    });
  }
};
