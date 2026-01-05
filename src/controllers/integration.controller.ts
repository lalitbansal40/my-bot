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
