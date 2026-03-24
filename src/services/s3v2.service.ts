import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";

const s3 = new S3Client({});

export const uploadToS3V2 = async (buffer: Buffer, mimeType: string) => {
  const extension = getExtensionFromMime(mimeType);

  const key = `whatsapp/${Date.now()}-${uuidv4()}.${extension}`; // ✅ FIX

  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.WHATSAPP_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  return `https://${process.env.WHATSAPP_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

const getExtensionFromMime = (mimeType: string) => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "application/pdf") return "pdf";
  return "bin"; // fallback
};
