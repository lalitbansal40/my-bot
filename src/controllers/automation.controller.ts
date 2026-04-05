import { Request, Response } from "express";
import Automation from "../models/automation.model";
import { AuthRequest } from "../types/auth.types";

/* =========================================
   1️⃣ GET ALL AUTOMATIONS (WITH FILTER)
========================================= */
export const getAutomations = async (req: AuthRequest, res: Response) => {
  try {
    const { channel_id } = req.query;
    const account_id = req.user?.account_id;

    const filter: any = {
      account_id,
      is_fallback_automation: false,
    };

    // 🔥 optional filter
    if (channel_id) {
      filter.channel_id = channel_id;
    }

    const automations = await Automation.find(filter)
      .select("_id name status channel_id channel_name createdAt updatedAt")
      .populate("channel_id", "name phone_number")
      .sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: automations,
    });
  } catch (error) {
    console.error("❌ getAutomations error:", error);
    return res.status(500).json({ success: false });
  }
};

/* =========================================
   2️⃣ PLAY / PAUSE AUTOMATION
========================================= */
export const toggleAutomationStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findById(id);

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    // 🔥 toggle status
    automation.status = automation.status === "active" ? "paused" : "active";

    await automation.save();

    return res.json({
      success: true,
      message: `Automation ${
        automation.status === "active" ? "activated" : "paused"
      } successfully`,
      data: {
        id: automation._id,
        status: automation.status,
      },
    });
  } catch (error) {
    console.error("❌ toggleAutomationStatus error:", error);
    return res.status(500).json({ success: false });
  }
};

/* =========================================
   3️⃣ DELETE AUTOMATION
========================================= */
export const deleteAutomation = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const automation = await Automation.findByIdAndDelete(id);

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    return res.json({
      success: true,
      message: "Automation deleted successfully",
      data: {
        id,
      },
    });
  } catch (error) {
    console.error("❌ deleteAutomation error:", error);
    return res.status(500).json({ success: false });
  }
};

export const getAutomationById = async (req: AuthRequest, res: Response) => {
  try {
    const { id } = req.params;
    const account_id = req.user?.account_id;

    const automation = await Automation.findOne({
      _id: id,
      account_id, // 🔥 security (important)
    })
      .populate("channel_id", "name phone_number")
      .lean();

    if (!automation) {
      return res.status(404).json({
        success: false,
        message: "Automation not found",
      });
    }

    return res.json({
      success: true,
      data: automation, // 🔥 full JSON (nodes + edges)
    });
  } catch (error) {
    console.error("❌ getAutomationById error:", error);
    return res.status(500).json({ success: false });
  }
};
