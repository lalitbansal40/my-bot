import { Request, Response } from "express";
import { uploadToS3V2 } from "../services/s3v2.service";

export const uploadMediaController = async (req: Request, res: Response) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ message: "File required" });
  }

  try {
    const url = await uploadToS3V2(
      file.buffer,      // ✅ correct
      file.mimetype
    );

    return res.json({
      success: true,
      url,
    });
  } catch (err: any) {
    console.error("Upload error:", err);
    return res.status(500).json({
      message: err.message,
    });
  }
};