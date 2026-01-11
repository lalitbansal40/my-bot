// controllers/integration.controller.ts
import { Request, Response } from "express";
import Integration from "../models/integration.model";

export const configureGoogleSheet = async (req: Request, res: Response) => {
  const userId = (req.user as any)?.user_id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }



  await Integration.findOneAndUpdate(
    { user_id: userId, type: "google_sheet" },
    {
      user_id: userId,
      slug: "google_sheet",
      is_active: true,
    },
    { upsert: true }
  );

  return res.json({
    message: "Google Sheet integration configured successfully",
  });
};

export const configureBorzo = async (req: Request, res: Response) => {
  const userId = (req.user as any)?.user_id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const { auth_token, environment } = req.body;

  if (!auth_token) {
    return res.status(400).json({
      message: "Borzo auth_token is required",
    });
  }

  await Integration.findOneAndUpdate(
    { user_id: userId, slug: "borzo" },
    {
      user_id: userId,
      slug: "borzo",
      is_active: true,
      config: {
        auth_token,                  // 🔐 Borzo API key
        environment: environment || "test", // test | production
      },
    },
    { upsert: true, new: true }
  );

  return res.json({
    message: "Borzo integration configured successfully",
  });
};
