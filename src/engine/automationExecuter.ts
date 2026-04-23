import { WhatsAppClient } from "../services/whatsapp.client";
import { executeNode } from "./nodeHandler";
import { getNextNodeByCondition } from "../utils/automation";
import { AutomationDocument } from "../models/automation.model";
import { getNextNodeId } from "./grapht";
import { normalizeMessage } from "./noramalizeMesaage";
import Contact from "../models/contact.model";

const getFreshSession = async (contactId: string) => {
  const freshContact = await Contact.findById(contactId).lean();

  return {
    contact_id: contactId,
    current_node: freshContact?.attributes?.current_node,
    waiting_for: freshContact?.attributes?.waiting_for,
    data: freshContact?.attributes || {},
  };
};

/* =========================
   MESSAGE TYPE
========================= */
export interface IncomingMessage {
  text?: {
    body: string;
  };

  from: string;
  interactive?: {
    type?: "button_reply" | "list_reply" | "nfm_reply";
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
  session: any;
  message?: IncomingMessage;
  whatsapp: WhatsAppClient;
  updateSession: (data: any) => Promise<void>;
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
  const normalizedMessage = message
    ? normalizeMessage(message)
    : {
      text: { body: "" },
      interactive: undefined,
      location: undefined,
      from: session.contact_id,
    };
  const text = normalizedMessage.text?.body?.toLowerCase();

  const RESET_KEYWORDS = ["restart", "start", "hi", "hello"];

  /* ===============================
     0️⃣ RESET (STOP EVERYTHING)
  =============================== */
  if (text && RESET_KEYWORDS.includes(text)) {
    await updateSession({
      current_node: "start",
      waiting_for: null,
      data: {},
    });
  }

  /* ===============================
     1️⃣ BUTTON HANDLING
  =============================== */
  if (
    session.waiting_for === "button" &&
    normalizedMessage.interactive?.button_reply
  ) {
    const buttonId = (
      normalizedMessage.interactive?.button_reply.id ||
      normalizedMessage.interactive?.button_reply.title ||
      ""
    ).trim();

    console.log("🔥 BUTTON:", buttonId);

    let nextNodeId = getNextNodeByCondition(
      automation.edges,
      session.current_node,
      buttonId as string,
    );

    // 🔥 GENERIC FALLBACK FIX
    if (!nextNodeId) {
      // 👇 DO NOT MOVE FORWARD
      const currentNode = automation.nodes.find(
        (n) => n.id === session.current_node,
      );

      if (currentNode) {
        // 🔁 resend same node (retry UX)
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

    // ❌ STILL NOTHING → STAY ON SAME NODE
    if (!nextNodeId) {
      const currentNode = automation.nodes.find(
        (n) => n.id === session.current_node,
      );

      if (currentNode) {
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
    await updateSession({
      current_node: nextNodeId,
      waiting_for: null,
    });

    const nextNode = automation.nodes.find((n) => n.id === nextNodeId);
    if (!nextNode) return;

    const freshSession = await getFreshSession(session.contact_id);

    return executeNode({
      node: nextNode,
      automation,
      session: freshSession,
      message: normalizedMessage,
      whatsapp,
      updateSession,
    });
  }

  /* ===============================
   🔥 FLOW + ADDRESS (UNIFIED)
=============================== */
  // 🔥 FLOW + ADDRESS (FIXED)
  if (
    session.current_node === "start" &&
    !session.waiting_for &&
    !normalizedMessage.interactive
  ) {
    const currentNode = automation.nodes.find(
      (n) => n.id === session.current_node,
    );
    if (!currentNode) return;

    // 🔥 IMPORTANT → move to next node
    const nextNodeId = getNextNodeId(automation.edges, session.current_node);
    if (!nextNodeId) return;

    await updateSession({
      current_node: nextNodeId,
      waiting_for: null,
    });

    const nextNode = automation.nodes.find((n) => n.id === nextNodeId);
    if (!nextNode) return;

    const freshSession = await getFreshSession(session.contact_id);

    return executeNode({
      node: nextNode,
      automation,
      session: freshSession,
      message: normalizedMessage,
      whatsapp,
      updateSession,
    });
  }

  /* ===============================
   🔥 INPUT HANDLING (IMPORTANT FIX)
=============================== */
  if (session.waiting_for === "input" && normalizedMessage.text?.body) {
    const key = session.data?.save_key;

    await updateSession({
      waiting_for: null,
      data: {
        ...session.data,
        [key]: normalizedMessage.text.body,
      },
    });

    const nextNodeId = getNextNodeId(automation.edges, session.current_node);
    if (!nextNodeId) return;

    await updateSession({
      current_node: nextNodeId,
    });

    const nextNode = automation.nodes.find((n) => n.id === nextNodeId);
    if (!nextNode) return;

    const freshSession = await getFreshSession(session.contact_id);

    return executeNode({
      node: nextNode,
      automation,
      session: freshSession,
      message: normalizedMessage,
      whatsapp,
      updateSession,
    });
  }

  /* ===============================
     2️⃣ LOCATION / TYPED ADDRESS
     🔥 THIS FIXES YOUR ISSUE
  =============================== */
  if (
    session.waiting_for === "location" &&
    (normalizedMessage.location ||
      (normalizedMessage.text?.body &&
        !normalizedMessage.interactive?.button_reply &&
        !normalizedMessage.interactive?.nfm_reply))
  ) {
    const currentNode = automation.nodes.find(
      (n) => n.id === session.current_node,
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

  /* ===============================
     4️⃣ NORMAL EXECUTION
  =============================== */
  const node = automation.nodes.find((n) => n.id === session.current_node);
  if (!node) return;

  return executeNode({
    node,
    automation,
    session,
    message: normalizedMessage,
    whatsapp,
    updateSession,
  });
};
