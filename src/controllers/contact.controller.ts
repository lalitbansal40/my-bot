import { Request, Response } from "express";
import mongoose from "mongoose";
import Contact from "../models/contact.model";
import csv from "csv-parser";
import fs from "fs";
import xlsx from "xlsx";
import { Parser } from "json2csv";
import { parseFile } from "../utils/fileImport";

export const getContactsByChannel = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { search, cursor, limit = 20 } = req.query;

    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId as string)) {
      return res.status(400).json({
        success: false,
        message: "Valid channelId is required",
      });
    }

    const query: any = {
      channel_id: new mongoose.Types.ObjectId(channelId as string),
    };

    // 🔍 Search by name or phone
    if (search) {
      query.$or = [
        { phone: { $regex: search, $options: "i" } },
        { name: { $regex: search, $options: "i" } },
      ];
    }

    // ⬇ Cursor based pagination (load older contacts)
    if (cursor) {
      query.last_message_at = {
        $lt: new Date(cursor as string),
      };
    }

    const contacts = await Contact.find(query)
      .sort({ last_message_at: -1 }) // newest chat first
      .limit(Number(limit))
      .populate("last_message_id"); // optional

    return res.status(200).json({
      success: true,
      count: contacts.length,
      nextCursor:
        contacts.length > 0
          ? contacts[contacts.length - 1].last_message_at
          : null,
      data: contacts,
    });
  } catch (error: any) {
    console.error("Get Contacts Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const createContact = async (req: Request, res: Response) => {
  try {
    const channel_id = req.params.channelId;
    const { phone, name, attributes = {} } = req.body;

    if (!phone || !channel_id) {
      return res.status(400).json({
        success: false,
        message: "phone and channel_id are required",
      });
    }

    const existingContact = await Contact.findOne({
      phone,
      channel_id,
    });

    if (existingContact) {
      return res.status(200).json({
        success: true,
        message: "Contact already exists",
        data: existingContact,
      });
    }

    // 🔥 Clean attributes (remove undefined/null)
    const cleanedAttributes = Object.fromEntries(
      Object.entries(attributes || {}).filter(
        ([_, v]) => v !== undefined && v !== null && v !== "",
      ),
    );

    const contact = await Contact.create({
      phone,
      name,
      channel_id,
      attributes: cleanedAttributes,
    });

    return res.status(201).json({
      success: true,
      message: "Contact created successfully",
      data: contact,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Contact already exists for this channel",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const updateContact = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;
    const { name, phone, attributes } = req.body;

    if (!contactId) {
      return res.status(400).json({
        success: false,
        message: "contactId is required",
      });
    }

    const contact = await Contact.findById(contactId);

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    // ✅ Basic fields
    if (name !== undefined) contact.name = name;
    if (phone !== undefined) contact.phone = phone;

    // 🔥 Deep merge attributes
    if (attributes && typeof attributes === "object") {
      contact.attributes = deepMerge(contact.attributes || {}, attributes);

      // 🔥 THIS IS THE REAL FIX
      contact.markModified("attributes");
    }

    await contact.save();

    return res.status(200).json({
      success: true,
      message: "Contact updated successfully",
      data: contact,
    });
  } catch (error: any) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: "Phone already exists for this channel",
      });
    }

    return res.status(500).json({
      success: false,
      message: "Internal server error",
      error: error.message,
    });
  }
};

export const getContactById = async (req: Request, res: Response) => {
  try {
    const { contactId } = req.params;

    // 🔴 Validate
    if (!contactId || !mongoose.Types.ObjectId.isValid(contactId)) {
      return res.status(400).json({
        success: false,
        message: "Valid contactId is required",
      });
    }

    const contact =
      await Contact.findById(contactId).populate("last_message_id"); // optional

    if (!contact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    return res.status(200).json({
      success: true,
      data: contact,
    });
  } catch (error: any) {
    console.error("Get Contact By ID Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

const deepMerge = (target: any, source: any) => {
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key])
    ) {
      target[key] = deepMerge(target[key] || {}, source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
};

const formatPhone = (phone: string) => {
  let p = phone.replace(/\D/g, "");
  if (!p.startsWith("91")) p = "91" + p;
  return "+" + p;
};

export const importContacts = async (req: any, res: any) => {
  try {
    const { channelId } = req.params;

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    if (!req.file) {
      return res.status(400).json({ message: "File required" });
    }

    // 🔥 handle both cases (disk + memory)
    let filePath = req.file.path;

    if (!filePath && req.file.buffer) {
      const tempPath = `uploads/${Date.now()}-${req.file.originalname}`;
      fs.writeFileSync(tempPath, req.file.buffer);
      filePath = tempPath;
    }

    if (!filePath) {
      return res.status(400).json({
        success: false,
        message: "File path not found",
      });
    }

    const rows = await parseFile(filePath, req.file.originalname);

    const seen = new Set();
    let success = 0;
    let failed = 0;

    const operations = rows
      .map((row: any) => {
        const phoneRaw = row.phone || row.Phone || row.mobile;

        if (!phoneRaw) {
          failed++;
          return null;
        }

        const phone = formatPhone(phoneRaw);

        if (seen.has(phone)) {
          failed++;
          return null;
        }

        seen.add(phone);

        const name = row.name || row.Name || "";

        success++;

        return {
          updateOne: {
            filter: { phone, channel_id: channelId },
            update: {
              $setOnInsert: {
                phone,
                name,
                channel_id: channelId,
                attributes: { source: "import" },
              },
            },
            upsert: true,
          },
        };
      })
      .filter((op): op is any => op !== null); // 🔥 THIS FIX

    await Contact.bulkWrite(operations);

    fs.unlinkSync(req.file.path);

    return res.json({
      success: true,
      inserted: success,
      skipped: failed,
    });
  } catch (err: any) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const exportContacts = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;

    const contacts = await Contact.find({ channel_id: channelId });

    const data = contacts.map((c) => ({
      name: c.name || "",
      phone: c.phone,
      unread_count: c.unread_count || 0,
      created_at: c.createdAt,
    }));

    const parser = new Parser();
    const csv = parser.parse(data);

    res.header("Content-Type", "text/csv");
    res.attachment("contacts.csv");
    return res.send(csv);
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
