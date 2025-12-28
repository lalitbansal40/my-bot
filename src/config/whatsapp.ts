import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(".env") });
export const WHATSAPP = {
  TOKEN: String(process.env.WHATSAPP_TOKEN!),
  PHONE_NUMBER_ID: String(process.env.WHATSAPP_PHONE_NUMBER_ID!),
  VERIFY_TOKEN: String(process.env.WHATSAPP_VERIFY_TOKEN!),
  APP_SECRET: String(process.env.WHATSAPP_APP_SECRET!),
};
