import { Request, Response } from "express";
import axios from "axios";
import { Channel } from "../models/channel.model";
import { uploadToS3V2 } from "../services/s3v2.service";
import FormData from "form-data";
import { TemplateModel } from "../models/template.model";
import Contact from "../models/contact.model";
import Message from "../models/message.model";
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

          console.log("comp :: ", JSON.stringify(comp));

          console.log("comp.example :: ", comp.example);

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
      header_format: headerFormat,
      media_url: mediaUrl,
      components: sanitizedComponents,
      channel_id: channel._id,
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

    const channel = await getChannel(channelId);

    const response = await axios.get(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
        },
      },
    );

    res.json({
      success: true,
      data: response.data.data,
    });
  } catch (error: any) {
    res.status(500).json({
      message: error.response?.data || error.message,
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

    const channel = await getChannel(channelId);

    // 🔥 new unique name (required by Meta)
    const newName = `${name}_v${Date.now()}`;

    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.waba_id}/message_templates`,
      {
        name: newName,
        language,
        category,
        components,
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
      message: "Template updated (recreated)",
      data: response.data,
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
};

export const deleteTemplate = async (req: Request, res: Response) => {
  try {
    const { channelId, templateId } = req.params;

    const channel = await getChannel(channelId);

    await axios.delete(`https://graph.facebook.com/v19.0/${templateId}`, {
      headers: {
        Authorization: `Bearer ${channel.access_token}`,
      },
    });

    return res.json({
      success: true,
      message: "Template deleted successfully",
    });
  } catch (error: any) {
    return res.status(500).json({
      message: error.response?.data || error.message,
    });
  }
};

export const uploadMediaController = async (req: Request, res: Response) => {
  try {
    const file = req.file;

    if (!file) {
      return res.status(400).json({ message: "File required" });
    }

    const url = await uploadToS3V2(file.buffer, file.mimetype);

    return res.json({
      success: true,
      url,
    });
  } catch (err: any) {
    res.status(500).json({ message: err.message });
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

  try {
    const { templateName, to, bodyParams } = req.body;
    const { channelId } = req.params;

    if (!templateName || !to) {
      return res.status(400).json({
        message: "templateName and to are required",
      });
    }

    const channel = await getChannel(channelId);

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
    if (template.header_format && template.media_url) {
      components.push({
        type: "header",
        parameters: [
          {
            type: template.header_format.toLowerCase(),
            [template.header_format.toLowerCase()]: {
              link: template.media_url,
            },
          },
        ],
      });
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
      (c: any) => c.type === "BODY"
    );

    if (bodyComponent?.text && bodyParams?.length) {
      renderedText = bodyComponent.text.replace(/{{(\d+)}}/g, (_:any, i:any) => {
        return bodyParams[i - 1] || `{{${i}}}`;
      });
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

    // ✅ SEND TO META
    const response = await axios.post(
      `https://graph.facebook.com/v19.0/${channel.phone_number_id}/messages`,
      metaPayload,
      {
        headers: {
          Authorization: `Bearer ${channel.access_token}`,
          "Content-Type": "application/json",
        },
      }
    );

    console.log("data :: ",JSON.stringify(response.data));

    const waMessageId = response.data.messages?.[0]?.id;

    // ✅ UPDATE MESSAGE → SENT + RESPONSE
    await Message.findByIdAndUpdate(messageDoc._id, {
      status: "SENT",
      wa_message_id: waMessageId,
      $set: {
        "payload.response": response.data, // 🔥 FULL RESPONSE
      },
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
    console.error("SEND TEMPLATE ERROR:", err?.response?.data || err.message);

    if (messageDoc?._id) {
      await Message.findByIdAndUpdate(messageDoc._id, {
        status: "FAILED",
        error: err?.response?.data || err.message,
        $set: {
          "payload.error": err?.response?.data || err.message, // 🔥 SAVE ERROR ALSO
        },
      });
    }

    return res.status(500).json({
      success: false,
      message: err?.response?.data || err.message,
    });
  }
};
