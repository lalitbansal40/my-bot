import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import axios from "axios";
import fs from "fs";

const s3 = new S3Client({});

export const uploadToS3V2 = async (buffer: Buffer, mimeType: string) => {
  const extension = getExtensionFromMime(mimeType);

  const key = `whatsapp/${Date.now()}-${uuidv4()}.${extension}`; // ✅ FIX

  const reponse = await s3.send(
    new PutObjectCommand({
      Bucket: process.env.WHATSAPP_BUCKET!,
      Key: key,
      Body: buffer,
      ContentType: mimeType,
    }),
  );

  console.log("response :: ",JSON.stringify(reponse))

  console.log("{process.env.WHATSAPP_BUCKET",process.env.WHATSAPP_BUCKET)
  console.log(`https://${process.env.WHATSAPP_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`)

  return `https://${process.env.WHATSAPP_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

// Stream file from disk → S3 (zero buffer RAM usage)
export const uploadToS3Stream = async (filePath: string, mimeType: string, size: number): Promise<string> => {
  const extension = getExtensionFromMime(mimeType);
  const key = `whatsapp/${Date.now()}-${uuidv4()}.${extension}`;

  await s3.send(new PutObjectCommand({
    Bucket: process.env.WHATSAPP_BUCKET!,
    Key: key,
    Body: fs.createReadStream(filePath),
    ContentType: mimeType,
    ContentLength: size,
  }));

  return `https://${process.env.WHATSAPP_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
};

export const uploadFromUrlToS3 = async (
  url: string,
  mimeType: string = "image/jpeg",
): Promise<string> => {
  const res = await axios.get(url, { responseType: "arraybuffer" });
  const buffer = Buffer.from(res.data);
  return uploadToS3V2(buffer, mimeType);
};

const getExtensionFromMime = (mimeType: string) => {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "video/mp4") return "mp4";
  if (mimeType === "application/pdf") return "pdf";
  return "bin"; // fallback
};
