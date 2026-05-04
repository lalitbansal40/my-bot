import razorpay from "./razorpay.handler";
import borzo from "./borzo.handler";
import google_sheet from "./google_sheet.handler";
import { IntegrationHandlerMap } from "./types";

/* =============================================================
   Slug → action map.
   Add new integrations by registering them here.
============================================================= */
export const INTEGRATION_HANDLERS: Record<string, IntegrationHandlerMap> = {
  razorpay,
  borzo,
  google_sheet,
};

export const getActionHandler = (slug: string, actionKey: string) => {
  return INTEGRATION_HANDLERS[slug]?.[actionKey];
};
