import { Request, Response } from "express";
import mongoose from "mongoose";
import Message from "../models/message.model";

export const getMessagesByContact = async (
  req: Request,
  res: Response
) => {
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

    // Cursor pagination (load older messages)
    if (cursor) {
      query.createdAt = {
        $lt: new Date(cursor as string),
      };
    }

    const messages = await Message.find(query)
      .sort({ createdAt: -1 }) // newest first
      .limit(Number(limit));

    return res.status(200).json({
      success: true,
      count: messages.length,
      nextCursor:
        messages.length > 0
          ? messages[messages.length - 1].createdAt
          : null,
      data: messages.reverse(), // return oldest → newest
    });
  } catch (error: any) {
    console.error("Get Messages By Contact Error:", error);

    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};