import { Request, Response } from "express";
import mongoose from "mongoose";
import Contact from "../models/contact.model";
import { Parser } from "json2csv";
import { parseFile } from "../utils/fileImport";

export const getContactsByChannel = async (req: Request, res: Response) => {
  try {
    const { channelId } = req.params;
    const { search, cursor, limit = 20 } = req.query;

    // ✅ VALIDATION
    if (!channelId || !mongoose.Types.ObjectId.isValid(channelId as string)) {
      return res.status(400).json({
        success: false,
        message: "Valid channelId is required",
      });
    }

    const parsedLimit = Number(limit) || 20;

    // ✅ BASE QUERY (🔥 removed last_message_at filter)
    const query: any = {
      channel_id: new mongoose.Types.ObjectId(channelId as string),
    };

    // 🔍 SEARCH
    if (search) {
      query.$and = [
        {
          $or: [
            { phone: { $regex: search, $options: "i" } },
            { name: { $regex: search, $options: "i" } },
          ],
        },
      ];
    }

    // 🔥 CURSOR BASED PAGINATION
    if (cursor) {
      const parsedCursor =
        typeof cursor === "string" ? JSON.parse(cursor) : cursor;

      const cursorDate = parsedCursor.last_message_at
        ? new Date(parsedCursor.last_message_at)
        : null;

      const cursorId = new mongoose.Types.ObjectId(parsedCursor._id);

      query.$and = [
        ...(query.$and || []),
        {
          $or: [
            // 🔥 normal pagination (with date)
            ...(cursorDate
              ? [
                  { last_message_at: { $lt: cursorDate } },
                  {
                    last_message_at: cursorDate,
                    _id: { $lt: cursorId },
                  },
                ]
              : []),

            // 🔥 fallback (for null dates)
            {
              last_message_at: null,
              _id: { $lt: cursorId },
            },
          ],
        },
      ];
    }

    // 🔥 FETCH DATA
    const contacts = await Contact.find(query)
      .sort({
        last_message_at: -1, // latest first
        _id: -1, // stable sort
      })
      .limit(parsedLimit)
      .populate("last_message_id");

    // 🔥 NEXT CURSOR
    const lastItem = contacts[contacts.length - 1];

    const nextCursor =
      contacts.length === parsedLimit && lastItem
        ? JSON.stringify({
            last_message_at: lastItem.last_message_at || null,
            _id: lastItem._id,
          })
        : null;

    return res.status(200).json({
      success: true,
      count: contacts.length,
      nextCursor,
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

    const existingContact = await Contact.findById(contactId);

    if (!existingContact) {
      return res.status(404).json({
        success: false,
        message: "Contact not found",
      });
    }

    const updateData: any = {};

    // ✅ Name update
    if (name !== undefined) {
      updateData.name = name;
    }

    // 🔥 Phone update with duplicate check
    if (
      typeof phone === "string" &&
      phone.trim() &&
      phone !== existingContact.phone
    ) {
      const duplicate = await Contact.findOne({
        phone,
        channel_id: existingContact.channel_id,
        _id: { $ne: contactId },
      });

      if (duplicate) {
        return res.status(400).json({
          success: false,
          message: "Phone already exists for this channel",
        });
      }

      updateData.phone = phone;
    }

    // 🔥 Attributes merge
    if (attributes && typeof attributes === "object") {
      updateData.attributes = deepMerge(
        existingContact.attributes || {},
        attributes,
      );
    }

    // 🔥 Update
    const updatedContact = await Contact.findOneAndUpdate(
      { _id: contactId },
      { $set: updateData },
      { new: true }, // return updated doc
    );

    return res.status(200).json({
      success: true,
      message: "Contact updated successfully",
      data: updatedContact,
    });
  } catch (error: any) {
    console.error("Update Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
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

    let rows: any[] = [];

    if (req.file.path) {
      rows = await parseFile(req.file.path, req.file.originalname);
    } else {
      return res.status(400).json({ success: false, message: "File not found" });
    }

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
