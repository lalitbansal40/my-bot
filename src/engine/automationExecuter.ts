import { WhatsAppClient } from "../services/whatsapp.client";
import { executeNode } from "./nodeHandler";
import { doesTriggerMatch, getNextNodeByCondition } from "../utils/automation";
import {
  AutomationDocument,
  AutomationNode,
} from "../models/automation.model";
import { AutomationSessionDocument } from "../models/automationSession.model";
import { getNextNodeId } from "./grapht";
import { normalizeMessage } from "./noramalizeMesaage";

/* =========================
   MESSAGE TYPE
========================= */
export interface IncomingMessage {

  text?: {
    body: string;
  };

  from: string;
  interactive?: {
    type?: "button_reply" | "nfm_reply"; // 👈 optional here
    button_reply?: {
      id: string;
      title?: string;
    };
    nfm_reply?: {
      response_json: string;
    };
  };

  location?: {
    latitude: number;
    longitude: number;
  };
}

/* =========================
   RUN AUTOMATION PARAMS
========================= */
interface RunAutomationParams {
  automation: AutomationDocument;
  session: AutomationSessionDocument;
  message: IncomingMessage;
  whatsapp: WhatsAppClient;
  updateSession: (
    data: Partial<AutomationSessionDocument>
  ) => Promise<void>;
}

/* =========================
   AUTOMATION RUNNER
========================= */
export const runAutomation = async ({
  automation,
  session,
  message,
  whatsapp,
  updateSession,
}: RunAutomationParams) => {
  const text = message.text?.body?.toLowerCase();
  const normalizedMessage = normalizeMessage(message);

  const RESET_KEYWORDS = ["restart"];

  /* ===============================
     0️⃣ RESET HANDLING (STOP FLOW)
  =============================== */
  if (text && RESET_KEYWORDS.includes(text)) {
    console.log("🔁 Resetting automation session");

    await updateSession({
      current_node: "start",
      waiting_for: null,
      data: {},
    });

    return; // ⛔ VERY IMPORTANT
  }

  /* ===============================
     1️⃣ BUTTON HANDLING (TOP PRIORITY)
  =============================== */
  if (session.waiting_for === "button") {
    if (!normalizedMessage.interactive?.button_reply?.id) {
      return; // ⛔ ignore text/location while waiting for button
    }

    const buttonId = normalizedMessage.interactive.button_reply.id;

    const nextNodeId = getNextNodeByCondition(
      automation.edges,
      session.current_node,
      buttonId
    );
    if (!nextNodeId) return;

    await updateSession({
      current_node: nextNodeId,
      waiting_for: null,
    });

    const nextNode = automation.nodes.find(n => n.id === nextNodeId);
    if (!nextNode) return;

    return executeNode({
      node: nextNode,
      automation,
      session,
      message: normalizedMessage,
      whatsapp,
      updateSession,
    });
  }

  /* ===============================
     2️⃣ LOCATION / TYPED ADDRESS HANDLING
  =============================== */
  if (session.waiting_for === "location") {
    // ❌ ignore buttons & flows
    if (
      normalizedMessage.interactive?.button_reply ||
      normalizedMessage.interactive?.nfm_reply
    ) {
      return;
    }

    // ✅ allow location OR typed address
    if (
      normalizedMessage.location ||
      normalizedMessage.text?.body
    ) {
      const currentNode = automation.nodes.find(
        n => n.id === session.current_node
      );
      if (!currentNode) return;

      return executeNode({
        node: currentNode,
        automation,
        session,
        message: normalizedMessage,
        whatsapp,
        updateSession,
      });
    }

    return;
  }


  /* ===============================
     3️⃣ TRIGGER (ONLY ON START)
  =============================== */
  if (session.current_node === "start" && !session.waiting_for) {
    const triggerNode = automation.nodes.find(n => n.type === "trigger");
    if (!triggerNode) return;

    const nextNodeId = getNextNodeId(automation.edges, triggerNode.id);
    if (!nextNodeId) return;

    await updateSession({
      current_node: nextNodeId,
      waiting_for: null,
    });

    const nextNode = automation.nodes.find(n => n.id === nextNodeId);
    if (!nextNode) return;

    return executeNode({
      node: nextNode,
      automation,
      session,
      message: normalizedMessage,
      whatsapp,
      updateSession,
    });
  }

  /* ===============================
     4️⃣ NORMAL NODE EXECUTION
  =============================== */
  const node = automation.nodes.find(n => n.id === session.current_node);
  if (!node) {
    console.warn("⚠️ Invalid current_node:", session.current_node);
    return;
  }

  return executeNode({
    node,
    automation,
    session,
    message: normalizedMessage,
    whatsapp,
    updateSession,
  });
};



