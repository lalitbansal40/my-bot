import { Request, Response } from "express";
import { Channel } from "../models/channel.model";

export const createChannel = async (req: Request, res: Response) => {
  try {
    const accountId = (req.user as any)?.user_id;

    if (!accountId) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const {
      channel_name,
      phone_number_id,
      display_phone_number,
      access_token,
    } = req.body;

    if (
      !channel_name ||
      !phone_number_id ||
      !display_phone_number ||
      !access_token
    ) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    // 🔍 check if phone_number_id already exists
    const existing = await Channel.findOne({ phone_number_id });
    if (existing) {
      return res.status(400).json({
        message: "Channel with this phone number already exists",
      });
    }

    const channel = await Channel.create({
      channel_name,
      phone_number_id,
      display_phone_number,
      access_token,
      account_id: accountId, // 🔥 LINK TO USER
    });

    return res.status(201).json({
      message: "Channel created successfully",
      channel,
    });
  } catch (error) {
    console.error("Create channel error:", error);
    return res.status(500).json({
      message: "Failed to create channel",
    });
  }
};
