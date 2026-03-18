import { Request, Response } from "express";
import mongoose from "mongoose";
import Contact from "../models/contact.model";

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
    const { phone, name } = req.body;

    // 🔴 Validation
    if (!phone || !channel_id) {
      return res.status(400).json({
        success: false,
        message: "phone and channel_id are required",
      });
    }

    // 🔥 Check existing contact
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

    // ✅ Create contact (minimal fields only)
    const contact = await Contact.create({
      phone,
      name,
      channel_id,
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
