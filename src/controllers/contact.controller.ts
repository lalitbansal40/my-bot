import { Request, Response } from "express";
import mongoose from "mongoose";
import Contact from "../models/contact.model";

export const getContactsByChannel = async (
  req: Request,
  res: Response
) => {
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