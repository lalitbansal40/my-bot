import { Request, Response } from "express";
import axios from "axios";
import { Channel } from "../models/channel.model";
import { uploadToS3V2, uploadToS3Stream } from "../services/s3v2.service";
import fs from "fs";
import FormData from "form-data";
import { TemplateModel } from "../models/template.model";
import Contact from "../models/contact.model";
import Message from "../models/message.model";
import { parseCSV } from "../helpers/csvparser";
import { AuthRequest } from "../types/auth.types";
import mongoose from "mongoose";
import {
  attachWalletHoldToWaMessage,
  releaseTemplateHold,
  reserveTemplateCharge,
} from "../services/wallet.service";
import { pushToAccount } from "../services/wsHelper";

/**
 * Normalize whatever the catch block sees into the schema-friendly shape:
 *   { code?: number, message: string, details: string }
 *
 * - `message` is the human-readable text the frontend tooltip reads.
 * - `details` is always a string (JSON-stringified if the source is an object)
 *   because Message.error.details is typed `String` in the schema.
 */
const buildErrorPayload = (err: any) => {
  const rawDetails = err?.response?.data ?? err?.message ?? "Unknown error";
  const message =
    err?.response?.data?.error?.message ||
    err?.response?.data?.error?.error_user_msg ||
    err?.response?.data?.message ||
    (typeof err?.response?.data === "string" ? err.response.data : null) ||
    err?.message ||
    "Unknown error";
  const code =
    err?.response?.data?.error?.code ??
    err?.response?.status ??
    undefined;
  const details =
    typeof rawDetails === "string"
      ? rawDetails
      : (() => {
          try {
            return JSON.stringify(rawDetails);
          } catch {
            return String(rawDetails);
          }
        })();
  return { code, message, details };
};
// 🔥 Helper: Get Channel
const getChannel = async (channelId: string) => {
  const channel = await Channel.findById(channelId);
  if (!channel) throw new Error("Channel not found");
  return channel;
};

// ✅ Create Marketing Template
export const createTemplate = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    let { name, language, category, components } = req.body;

    // ✅ BASIC VALIDATION
    if (!name || !language || !category || !components) {
      return res.status(400).json({
        success: false,
        message: "name, language, category, components are required",
      });
    }

    if (!Array.isArray(components)) {
      return res.status(400).json({
        success: false,
        message: "components must be an array",
      });
    }

    const channel = await getChannel(channelId);

    // ✅ NAME FORMAT FIX (Meta requirement 🔥)
    name = name.toLowerCase().replace(/[^a-z0-9_]/g, "_");

    // ✅ SANITIZE + VALIDATE COMPONENTS
    let headerFormat = null;
    let mediaUrl = null;
    const sanitizedComponents = await Promise.all(
      components.map(async (comp: any) => {
        // 🔹 HEADER
        if (comp.type === "HEADER") {
          if (comp.format === "TEXT") {
            if (!comp.text) {
              throw new Error("Header text is required");
            }

            return {
              type: "HEADER",
              format: "TEXT",
              text: comp.text,
            };
          }

          // ✅ IMAGE / VIDEO / DOCUMENT
          const fileUrl = comp?.example?.header_handle?.[0];
          headerFormat = comp.format;
          mediaUrl = fileUrl;
          if (comp.format === "IMAGE" && !fileUrl.match(/\.(jpg|jpeg|png)$/)) {
            throw new Error("Invalid IMAGE file");
          }

          if (comp.format === "VIDEO" && !fileUrl.endsWith(".mp4")) {
            throw new Error("Invalid VIDEO file");
          }

          if (comp.format === "DOCUMENT" && !fileUrl.endsWith(".pdf")) {
            throw new Error("Invalid DOCUMENT file");
          }

          if (!fileUrl) {
            throw new Error("Media URL missing in header");
          }

          if (!fileUrl.startsWith("http")) {
            throw new Error("Invalid media URL");
          }

          // 🔥 UPLOAD TO META FIRST
          const mediaHandle = await uploadMediaForTemplate(
            fileUrl,
            channel.access_token,
          );

          return {
            type: "HEADER",
            format: comp.format,
            example: {
              header_handle: [mediaHandle],
            },
          };
        }

        // 🔹 BODY
        if (comp.type === "BODY") {
          const variables = comp.text.match(/{{\d+}}/g);

          const bodyComponent: any = {
            type: "BODY",
            text: comp.text,
          };

          if (variables) {
            // ✅ fallback (agar frontend miss kare)
            const exampleValues = comp.example?.body_text || [
              variables.map(() => "sample"),
            ];

            bodyComponent.example = {
              body_text: exampleValues,
            };
          }

          return bodyComponent;
        }

        // 🔹 BUTTONS
        if (comp.type === "BUTTONS") {
          if (!Array.isArray(comp.buttons)) {
            throw new Error("Buttons must be array");
          }

          const buttons = comp.buttons.map((btn: any) => {
            if (!btn.text) {
              throw new Error("Button text required");
            }

            if (btn.type === "PHONE_NUMBER") {
              return {
                type: "PHONE_NUMBER",
                text: btn.text,
                phone_number: btn.phone_number,
              };
            }

            if (btn.type === "URL") {
              return {
                type: "URL",
                text: btn.text,
                url: btn.url,
              };
            }

            return {
              type: "QUICK_REPLY",
              text: btn.text,
            };
          });

          return {
            type: "BUTTONS",
            buttons,
          };
        }

        return comp;
      }),
    );

    // ✅ FINAL PAYLOAD
    const payload = {
      name,
      language,
      category,
      components: sanitizedComponents,
    };

    console.log(
      "SANITIZED COMPONENTS:",
      JSON.stringify(sanitizedComponents, null, 2),
    );

    // ✅ META API CALL
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      payload,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );

    await TemplateModel.create({
      name,
      language,
      category,
      header_format: headerFormat, // ✅ fix
      media_url: mediaUrl,
      media_id: null,
      components,
      channel_id: channelId, // ✅ fix
    });

    return res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    console.error(
      "CREATE TEMPLATE ERROR:",
      error?.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,
      message: error?.response?.data || error.message,
    });
  }
};

// ✅ Get All Templates
export const getTemplates = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const {
      after,
      before,
      limit = 20,
      page = 1,
      category,
      status,
      search,
    } = req.query;

    const channel = await getChannel(channelId);

    // 🔥 MAIN DATA
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
        params: { limit, after, before },
      },
    );

    let templates = response.data.data || [];

    // ✅ FILTERS
    if (category) {
      templates = templates.filter((t: any) => t.category === category);
    }

    if (status) {
      templates = templates.filter((t: any) => t.status === status);
    }

    if (search) {
      const searchText = (search as string).toLowerCase();
      templates = templates.filter((t: any) =>
        t.name?.toLowerCase().includes(searchText),
      );
    }

    // 🔥 TOTAL COUNT
    let totalCount = 0;
    let nextCursor: string | undefined = undefined;

    do {
      const countRes: any = await axios.get(
        `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
        {
          headers: {
            Authorization: `Bearer ${channel.access_token}`,
          },
          params: {
            limit: 100,
            after: nextCursor,
          },
        },
      );

      totalCount += countRes.data.data.length;
      nextCursor = countRes.data.paging?.cursors?.after;
    } while (nextCursor);

    // 🔥 CALCULATIONS
    const totalPages = Math.ceil(totalCount / Number(limit));
    const currentPage = Number(page);

    return res.json({
      success: true,
      data: templates,
      paging: response.data.paging || {},
      total: totalCount,
      currentPage,
      totalPages,
      limit: Number(limit),
    });
  } catch (error: any) {
    console.error(
      "GET TEMPLATE ERROR:",
      error?.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.error?.message ||
        error?.message ||
        "Something went wrong",
    });
  }
};

export const getTemplateById = async (req: Request, res: Response) => {
  try {
    const { channelId, templateId } = req.params;

    const channel = await getChannel(channelId);

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${templateId}`,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
      },
    );

    return res.json({
      success: true,
      data: response.data,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
};

export const updateTemplate = async (req: Request, res: Response) => {
  try {
    const { channelId, templateId } = req.params;
    const { name, language, category, components } = req.body;

    // ✅ validate input
    if (!name || !language || !category || !components) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields",
      });
    }

    const channel = await getChannel(channelId);

    if (!channel?.waba_id || !channel?.access_token) {
      return res.status(400).json({
        success: false,
        message: "Invalid channel configuration",
      });
    }

    // 🔥 WhatsApp limitation: cannot update → create new version
    const newName = `${name}_v${Date.now()}`;
    const sanitizedComponents = await Promise.all(
      components.map(async (comp: any) => {
        // 🔹 HEADER
        if (comp.type === "HEADER") {
          if (comp.format === "TEXT") {
            return {
              type: "HEADER",
              format: "TEXT",
              text: comp.text,
            };
          }

          const fileUrl = comp?.example?.header_handle?.[0];

          if (!fileUrl) {
            throw new Error("Media URL missing in header");
          }

          if (!fileUrl.startsWith("http")) {
            throw new Error("Invalid media URL");
          }

          // 🔥 UPLOAD TO META
          const mediaHandle = await uploadMediaForTemplate(
            fileUrl,
            channel.access_token,
          );

          return {
            type: "HEADER",
            format: comp.format,
            example: {
              header_handle: [mediaHandle],
            },
          };
        }

        // 🔹 BODY
        if (comp.type === "BODY") {
          const variables = comp.text.match(/{{\d+}}/g);

          const bodyComponent: any = {
            type: "BODY",
            text: comp.text,
          };

          if (variables) {
            const exampleValues = comp.example?.body_text || [
              variables.map(() => "sample"),
            ];

            bodyComponent.example = {
              body_text: exampleValues,
            };
          }

          return bodyComponent;
        }

        // 🔹 BUTTONS
        if (comp.type === "BUTTONS") {
          const buttons = comp.buttons.map((btn: any) => {
            if (btn.type === "PHONE_NUMBER") {
              return {
                type: "PHONE_NUMBER",
                text: btn.text,
                phone_number: btn.phone_number,
              };
            }

            if (btn.type === "URL") {
              return {
                type: "URL",
                text: btn.text,
                url: btn.url,
              };
            }

            return {
              type: "QUICK_REPLY",
              text: btn.text,
            };
          });

          return {
            type: "BUTTONS",
            buttons,
          };
        }

        return comp;
      }),
    );

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        name: newName,
        language,
        category,
        components: sanitizedComponents,
      },
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );

    return res.json({
      success: true,
      message: "Template updated successfully (new version created)",
      data: response.data,
      meta: {
        oldTemplateId: templateId,
        newTemplateName: newName,
      },
    });
  } catch (error: any) {
    console.error(
      "Update template error:",
      error?.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.error?.message ||
        error?.response?.data ||
        error.message ||
        "Something went wrong",
    });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { channelId, templateId } = req.params;

    const channel = await getChannel(channelId);

    // 🔥 templateId actually name hona chahiye
    const template = await TemplateModel.findOne({
      name: templateId,
      channel_id: channel._id,
    });

    if (!template) {
      return res.status(404).json({
        success: false,
        message: "Template not found",
      });
    }

    // ✅ DELETE USING NAME
    await axios.delete(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        params: {
          name: template.name,
        },
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
      },
    );

    // ✅ optional: DB se bhi delete karo
    await TemplateModel.deleteOne({ _id: template._id });

    return res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error: any) {
    console.error(
      "DELETE TEMPLATE ERROR:",
      error?.response?.data || error.message,
    );

    return res.status(500).json({
      success: false,
      message:
        error?.response?.data?.error?.message ||
        error?.response?.data ||
        error.message,
    });
  }
};

export const uploadMediaController = async (req: Request, res: Response) => {
  const file = req.file;
  console.log("Received file:", file);
  if (!file) return res.status(400).json({ message: "File required" });

  try {
    const url = await uploadToS3V2(
      file.buffer,
      file.mimetype
    );
    return res.json({ success: true, url });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
  } finally {
    if (file?.path) {
      fs.unlink(file.path, (err) => {
        if (err) console.error("unlink error:", err);
      });
    }
  }
};

const uploadMediaForTemplate = async (fileUrl: string, accessToken: string) => {
  // 1. Get file
  const fileResponse = await axios.get(fileUrl, {
    responseType: "arraybuffer",
  });

  const fileSize = fileResponse.data.length;
  const contentType = fileResponse.headers["content-type"];

  // 2. Create upload session
  const session = await axios.post(
    `https://graph.facebook.com/v19.0/app/uploads`,
    {
      file_length: fileSize,
      file_type: contentType,
    },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  const uploadId = session.data.id;

  // 3. Upload file
  const upload = await axios.post(
    `https://graph.facebook.com/v19.0/${uploadId}`,
    fileResponse.data,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
    },
  );

  return upload.data.h; // ✅ IMPORTANT (this is header_handle)
};

export const sendTemplate = async (req: Request, res: Response) => {
  let messageDoc: any = null;
  let channel: any = null;

  try {
    const { templateName, to, bodyParams } = req.body;
    const { channelId } = req.params;


    if (!templateName || !to) {
      return res.status(400).json({
        message: "templateName and to are required",
      });
    }

    channel = await getChannel(channelId);

    // ✅ FIND OR CREATE CONTACT
    let contact = await Contact.findOne({
      phone: to,
      channel_id: channel._id,
    });

    if (!contact) {
      contact = await Contact.create({
        phone: to,
        channel_id: channel._id,
      });
    }

    // ✅ GET TEMPLATE
    const template = await TemplateModel.findOne({ name: templateName });
    if (!template) throw new Error("Template not found");

    const components: any[] = [];

    // 🔥 HEADER
    if (template.header_format === "IMAGE") {
      let mediaId = template.media_id;

      // 🔥 अगर DB में नहीं है → upload करो
      if (!mediaId && template.media_url) {
        mediaId = await uploadMediaForSending(template.media_url, channel);

        // 🔥 DB में save कर दो
        await TemplateModel.updateOne(
          { _id: template._id },
          { $set: { media_id: mediaId } }
        );
      }

      if (mediaId) {
        components.push({
          type: "header",
          parameters: [
            {
              type: "image",
              image: {
                id: mediaId,
              },
            },
          ],
        });
      }
    }

    // 🔥 BODY
    if (bodyParams?.length) {
      components.push({
        type: "body",
        parameters: bodyParams.map((text: string) => ({
          type: "text",
          text,
        })),
      });
    }

    // 🔥 META REQUEST PAYLOAD (IMPORTANT)
    const metaPayload = {
      messaging_product: "whatsapp",
      to,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        components,
      },
    };

    // 🔥 RENDER TEXT (for UI preview)
    let renderedText = template.name;
    const bodyComponent = template.components?.find(
      (c: any) => c.type === "BODY",
    );

    if (bodyComponent?.text && bodyParams?.length) {
      renderedText = bodyComponent.text.replace(
        /{{(\d+)}}/g,
        (_: any, i: any) => {
          return bodyParams[i - 1] || `{{${i}}}`;
        },
      );
    }

    // ✅ SAVE MESSAGE (PENDING + REQUEST)
    messageDoc = await Message.create({
      channel_id: channel._id,
      contact_id: contact._id,
      direction: "OUT",
      type: "template",
      text: renderedText,
      status: "PENDING",
      payload: {
        request: metaPayload, // 🔥 FULL REQUEST
        templateData: template,
      },
    });

    await reserveTemplateCharge({
      accountId: channel.account_id,
      channelId: channel._id,
      contactId: contact._id,
      messageId: messageDoc._id,
      templateName: template.name,
      to,
    });

    // ✅ SEND TO META
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.phone_number_id}/messages`,
      metaPayload,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );

    const waMessageId = response.data.messages?.[0]?.id;

    // ✅ UPDATE MESSAGE → SENT + RESPONSE
    await Message.findByIdAndUpdate(messageDoc._id, {
      status: "SENT",
      wa_message_id: waMessageId,
      $set: {
        "payload.response": response.data, // 🔥 FULL RESPONSE
      },
    });

    await attachWalletHoldToWaMessage({
      messageId: messageDoc._id,
      waMessageId,
    });

    // 🔥 UPDATE CONTACT
    await Contact.findByIdAndUpdate(contact._id, {
      last_message: renderedText,
      last_message_at: new Date(),
      last_message_id: messageDoc._id,
    });

    return res.json({
      success: true,
      data: response.data,
    });
  } catch (err: any) {
    const errorPayload = buildErrorPayload(err);
    console.error("SEND TEMPLATE ERROR:", errorPayload.details);

    if (messageDoc?._id) {
      await releaseTemplateHold(messageDoc._id, "template_send_failed");
      await Message.findByIdAndUpdate(messageDoc._id, {
        status: "FAILED",
        error: errorPayload, // ✅ structured: { message, details } — frontend reads .message
        $set: {
          "payload.error": errorPayload.details,
        },
      });

      // 🔥 LIVE PUSH so chat screen tooltip updates without a refresh
      const accountId = channel?.account_id?.toString?.();
      if (accountId) {
        pushToAccount(accountId, {
          type: "message_update",
          _id: messageDoc._id.toString(),
          status: "FAILED",
          error: errorPayload,
        }).catch(() => undefined);
      }
    }

    return res.status(500).json({
      success: false,
      message: errorPayload.message,
    });
  }
};

export const sendBulkTemplate = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    let { templateName, contacts, bodyParams } = req.body;

    if (bodyParams) {
      bodyParams = JSON.parse(bodyParams);
    }

    let phoneNumbers: string[] = [];

    // ✅ FROM SELECTED CONTACT IDS
    if (contacts) {
      const ids = JSON.parse(contacts);

      const contactDocs = await Contact.find({
        _id: { $in: ids },
      });

      phoneNumbers = contactDocs.map((c) => c.phone);
    }

    // ✅ FROM CSV
    if (req.file) {
      const rows: any = await parseCSV(req.file.path);
      phoneNumbers = rows.map((r: any) => r.phone);
      fs.unlink(req.file.path, () => { });
    }

    // ✅ REMOVE DUPLICATES
    phoneNumbers = [...new Set(phoneNumbers)];

    const results = [];

    for (const number of phoneNumbers) {
      try {
        await sendTemplateInternal({
          channelId,
          templateName,
          to: number,
          bodyParams,
        });

        results.push({ number, status: "SENT" });

        await new Promise((r) => setTimeout(r, 200)); // rate limit safety
      } catch (err: any) {
        results.push({ number, status: "FAILED" });
      }
    }

    return res.json({
      success: true,
      total: phoneNumbers.length,
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

const sendTemplateInternal = async ({
  channelId,
  templateName,
  to,
  bodyParams,
}: {
  channelId: string;
  templateName: string;
  to: string;
  bodyParams?: string[];
}) => {
  // 🔥 GET CHANNEL
  const channel = await Channel.findById(channelId);
  if (!channel) throw new Error("Channel not found");

  // 🔥 FIND OR CREATE CONTACT
  let contact = await Contact.findOne({
    phone: to,
    channel_id: channel._id,
  });

  if (!contact) {
    contact = await Contact.create({
      phone: to,
      channel_id: channel._id,
    });
  }

  // 🔥 GET TEMPLATE
  const template = await TemplateModel.findOne({ name: templateName });
  if (!template) throw new Error("Template not found");

  const components: any[] = [];

  // ✅ HEADER (only once)
  if (template.header_format === "IMAGE") {
    let mediaId = template.media_id;

    // 🔥 अगर DB में नहीं है → upload करो
    if (!mediaId && template.media_url) {
      mediaId = await uploadMediaForSending(template.media_url, channel);

      // 🔥 DB में save कर दो
      await TemplateModel.updateOne(
        { _id: template._id },
        { $set: { media_id: mediaId } }
      );
    }

    if (mediaId) {
      components.push({
        type: "header",
        parameters: [
          {
            type: "image",
            image: {
              id: mediaId,
            },
          },
        ],
      });
    }
  }

  // ✅ BODY
  if (bodyParams && bodyParams.length) {
    components.push({
      type: "body",
      parameters: bodyParams.map((param: string) => ({
        type: "text",
        text: param,
      })),
    });
  }

  // 🔥 META PAYLOAD
  const metaPayload = {
    messaging_product: "whatsapp",
    to,
    type: "template",
    template: {
      name: template.name,
      language: { code: template.language },
      components,
    },
  };

  // 🔥 SAVE MESSAGE (PENDING)
  const messageDoc = await Message.create({
    channel_id: channel._id,
    contact_id: contact._id,
    direction: "OUT",
    type: "template",

    // 🔥 IMPORTANT: rendered text add करो
    text:
      template.components?.find((c: any) => c.type === "BODY")?.text ||
      template.name,

    status: "PENDING",

    payload: {
      request: metaPayload,

      // 🔥 ADD THIS (MAIN FIX)
      templateData: template,
    },
  });

  await reserveTemplateCharge({
    accountId: channel.account_id,
    channelId: channel._id,
    contactId: contact._id,
    messageId: messageDoc._id,
    templateName: template.name,
    to,
  });

  let response: any;
  try {
    // 🔥 SEND TO META
    response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.phone_number_id}/messages`,
      metaPayload,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
      },
    );
  } catch (err: any) {
    const errorPayload = buildErrorPayload(err);
    console.error("SEND TEMPLATE ERROR:", errorPayload.details);
    await releaseTemplateHold(messageDoc._id, "template_send_failed");
    await Message.findByIdAndUpdate(messageDoc._id, {
      status: "FAILED",
      error: errorPayload,
      $set: {
        "payload.error": errorPayload.details,
      },
    });

    const accountId = channel?.account_id?.toString?.();
    if (accountId) {
      pushToAccount(accountId, {
        type: "message_update",
        _id: messageDoc._id.toString(),
        status: "FAILED",
        error: errorPayload,
      }).catch(() => undefined);
    }
    throw err;
  }

  const waMessageId = response.data.messages?.[0]?.id;

  // 🔥 UPDATE MESSAGE
  await Message.findByIdAndUpdate(messageDoc._id, {
    status: "SENT",
    wa_message_id: waMessageId,
    $set: {
      "payload.response": response.data,
    },
  });

  await attachWalletHoldToWaMessage({
    messageId: messageDoc._id,
    waMessageId,
  });

  return true;
};

export const syncTemplates = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const channel = await Channel.findById(channelId);
    if (!channel) throw new Error("Channel not found");

    // 🔥 1. GET FROM META
    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
      }
    );

    const templates = response.data.data;

    console.log("templates :: ", JSON.stringify(templates))
    // 🔥 Keep track of meta template names
    const metaTemplateNames: string[] = [];

    // 🔥 2. UPSERT ALL META TEMPLATES
    for (const t of templates) {
      metaTemplateNames.push(t.name);

      const header = t.components?.find((c: any) => c.type === "HEADER");

      await TemplateModel.findOneAndUpdate(
        {
          name: t.name,
          channel_id: channel._id,
        },
        {
          name: t.name,
          language: t.language,
          category: t.category,
          components: t.components,
          status: t.status,
          channel_id: channel._id,

          // 🔥 HEADER
          header_format: header?.format || null,

          // 🔥 MEDIA (IMPROVED)
          media_id: header?.example?.header_handle?.[0] || null,
          media_url: header?.example?.header_handle?.[0] || null,
        },
        { upsert: true, new: true }
      );
    }

    // 🔥 3. DELETE LOCAL TEMPLATES जो Meta में नहीं हैं
    await TemplateModel.deleteMany({
      channel_id: channel._id,
      name: { $nin: metaTemplateNames },
    });

    return res.json({
      success: true,
      total: templates.length,
      message: "Templates fully synced (add/update/delete) 🚀",
    });
  } catch (err: any) {
    console.error("SYNC TEMPLATE ERROR:", err?.response?.data || err.message);

    return res.status(500).json({
      success: false,
      message: err?.response?.data || err.message,
    });
  }
};

export const getAllWhatsappFlows = async (req: AuthRequest, res: Response) => {
  try {
    const account_id = req.user?.account_id;
    const { status } = req.query; // 🔥 NEW

    const channel = await Channel.findOne({
      account_id: account_id,
      is_active: true,
    });

    if (!channel) {
      return res.status(404).json({
        success: false,
        message: "Channel not found",
      });
    }

    const { waba_id, access_token } = channel;

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${waba_id}/flows`,
      {
        params: {
          fields: "id,name,status",
          ...(status && { status }), // 🔥 dynamic filter
        },
        headers: {
          Authorization: `Bearer ${access_token}`,
        },
      },
    );

    return res.json({
      success: true,
      data: response.data.data,
    });
  } catch (error: any) {
    console.error(
      "❌ getAllWhatsappFlows error:",
      error?.response?.data || error,
    );

    return res.status(500).json({
      success: false,
      message: "Failed to fetch flows",
    });
  }
};


export const uploadMediaForSending = async (fileUrl: string, channel: any) => {
  const response = await axios.get(fileUrl, {
    responseType: "stream",
  });

  const form = new FormData();
  form.append("file", response.data);
  form.append("messaging_product", "whatsapp");

  const upload = await axios.post(
    `https://graph.facebook.com/v19.0/${channel.phone_number_id}/media`,
    form,
    {
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
        ...form.getHeaders(),
      },
    }
  );

  return upload.data.id;
};
