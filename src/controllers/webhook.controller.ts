import { Request, Response } from "express";
import { WHATSAPP } from "../config/whatsapp";
import { handleIncomingMessage } from "../services/message.service";

export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === WHATSAPP.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

export const receiveMessage = async (req: Request, res: Response) => {
  res.sendStatus(200); // Meta ko fast response
  console.log({body:JSON.stringify(req.body)})
  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.messages) return;

  for (const message of value.messages) {
    await handleIncomingMessage(message);
  }
};
