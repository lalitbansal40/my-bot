export interface WhatsAppInteractive {
  type: "button_reply" | "nfm_reply";

  button_reply?: {
    id: string;
    title?: string;
  };

  nfm_reply?: {
    response_json: string;
  };
}
