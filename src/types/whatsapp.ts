export interface WhatsAppInteractive {
  type: "button_reply" | "list_reply" | "nfm_reply";

  button_reply?: {
    id: string;
    title?: string;
  };

  list_reply?: {
    id: string;
    title?: string;
    description?: string;
  };

  nfm_reply?: {
    response_json: string;
  };
}
