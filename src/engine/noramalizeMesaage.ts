import { WhatsAppInteractive } from "../types/whatsapp";
import { IncomingMessage } from "./automationExecuter";

export const normalizeMessage = (
  message: IncomingMessage
): {
  from: string;
  interactive?: WhatsAppInteractive;
  location?: {
    latitude: number;
    longitude: number;
  };
  text?: {
    body: string;
  };
} => {
  let interactive: WhatsAppInteractive | undefined;

  if (message.interactive?.button_reply) {
    interactive = {
      type: "button_reply",
      button_reply: message.interactive.button_reply,
    };
  } else if (message.interactive?.nfm_reply) {
    interactive = {
      type: "nfm_reply",
      nfm_reply: message.interactive.nfm_reply,
    };
  }

  return {
    from: message.from,

    // ✅ FIX: KEEP TEXT
    text: message.text
      ? { body: message.text.body }
      : undefined,

    // ✅ KEEP LOCATION
    location: message.location,

    // ✅ KEEP INTERACTIVE
    interactive,
  };
};

