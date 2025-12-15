import dotenv from "dotenv";
dotenv.config();
export const WHATSAPP = {
  TOKEN: process.env.WHATSAPP_TOKEN!,
  PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID!,
  VERIFY_TOKEN: process.env.WHATSAPP_VERIFY_TOKEN!,
  APP_SECRET: process.env.WHATSAPP_APP_SECRET!,
};
