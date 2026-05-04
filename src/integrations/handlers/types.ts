import { AutomationDocument } from "../../models/automation.model";

/* =============================================================
   HANDLER CONTRACT
   -------------------------------------------------------------
   Every integration action is a pure async function:
     (ctx, config) => result
   - `ctx` exposes account, channel, contact, session and helpers
   - `config` is the already-interpolated config object the user
     filled in the node editor.
   - Returns an arbitrary object that gets saved to
     session.data[config.save_to] (when save_to is set).
============================================================= */

export interface HandlerCtx {
  accountId: string;
  channelId: string;
  contactId: string;
  contact: any | null;
  session: { contact_id: string; current_node?: string; data: Record<string, any> };
  automation: AutomationDocument;

  /** Decrypted credentials for this integration */
  credentials: { config: Record<string, any>; secrets: Record<string, any> };

  /** Interpolate a template string against contact + session.data */
  interpolate: (tpl: any) => string;
}

export type HandlerResult =
  | { ok: true; data?: Record<string, any> }
  | { ok: false; error: string; data?: Record<string, any> };

export type IntegrationHandler = (
  ctx: HandlerCtx,
  config: Record<string, any>
) => Promise<HandlerResult>;

export type IntegrationHandlerMap = Record<string, IntegrationHandler>; // actionKey → handler
