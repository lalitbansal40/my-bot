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

  button?: {
    payload?: string;
    text?: string;
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
     1️⃣ BUTTON / LIST / CAROUSEL HANDLING
  =============================== */
  const isInteractiveReply =
    !!normalizedMessage.interactive?.button_reply ||
    !!normalizedMessage.interactive?.list_reply;

  // 🔥 CRITICAL: a button/list reply ALWAYS belongs to the previous interactive
  // node — never let it fall through to the "start" branch (which would
  // re-trigger the carousel). We accept it whenever waiting_for is set to
  // any of the interactive states, OR when the contact is parked on an
  // interactive-type node (carousel / auto_reply with buttons / list).
  const interactiveStates = ["button", "list", "carousel"];
  const currentNodeObj = automation.nodes.find(
    (n) => n.id === session.current_node,
  );
  const isOnInteractiveNode =
    currentNodeObj?.type === "carousel" ||
    currentNodeObj?.type === "list" ||
    (currentNodeObj?.type === "auto_reply" &&
      Array.isArray((currentNodeObj as any).buttons) &&
      (currentNodeObj as any).buttons.length > 0);

  if (
    isInteractiveReply &&
    (interactiveStates.includes(session.waiting_for) || isOnInteractiveNode)
  ) {
    const rawButtonId = (
      normalizedMessage.interactive?.button_reply?.id ||
      normalizedMessage.interactive?.list_reply?.id ||
      ""
    ).trim();
    const rawTitle = (
      normalizedMessage.interactive?.button_reply?.title ||
      normalizedMessage.interactive?.list_reply?.title ||
      ""
    ).trim();

    // Map carousel synthetic IDs (cr_<card>_<button>) back to the real
    // button.id stored on the node — this is what edge.condition matches.
    const mappedId =
      session.data?.carousel_button_id_map?.[rawButtonId] || rawButtonId;

    console.log("🔥 BUTTON click", {
      rawButtonId,
      mappedId,
      title: rawTitle,
      currentNode: session.current_node,
      waiting_for: session.waiting_for,
    });

    // 1️⃣ Try edge match by mapped id (primary path)
    let nextNodeId = getNextNodeByCondition(
      automation.edges,
      session.current_node,
      mappedId,
    );

    // 2️⃣ Fallback: edge match by raw id (in case map was missing)
    if (!nextNodeId && rawButtonId && rawButtonId !== mappedId) {
      nextNodeId = getNextNodeByCondition(
        automation.edges,
        session.current_node,
        rawButtonId,
      );
    }

    // 3️⃣ Fallback: edge match by button title
    if (!nextNodeId && rawTitle) {
      nextNodeId = getNextNodeByCondition(
        automation.edges,
        session.current_node,
        rawTitle,
      );
    }

    // 4️⃣ Fallback: read button.nextNode directly from node definition
    //    (covers the case where the user picked "Next Node" in the editor
    //    instead of dragging an edge handle).
    if (!nextNodeId && currentNodeObj) {
      const collectButtons: any[] = [];
      if (Array.isArray((currentNodeObj as any).buttons))
        collectButtons.push(...(currentNodeObj as any).buttons);
      if (Array.isArray((currentNodeObj as any).cards)) {
        for (const card of (currentNodeObj as any).cards) {
          if (Array.isArray(card.buttons)) collectButtons.push(...card.buttons);
        }
      }
      if (Array.isArray((currentNodeObj as any).sections)) {
        for (const sec of (currentNodeObj as any).sections) {
          if (Array.isArray(sec.rows)) collectButtons.push(...sec.rows);
        }
      }
      const matched = collectButtons.find(
        (b: any) =>
          (b?.id && (b.id === mappedId || b.id === rawButtonId)) ||
          (b?.title && rawTitle && b.title === rawTitle),
      );
      if (matched?.nextNode) nextNodeId = matched.nextNode;
    }

    if (!nextNodeId) {
      console.warn("⚠️ No matching edge/button for reply:", {
        mappedId,
        rawButtonId,
        rawTitle,
        currentNode: session.current_node,
        edges: automation.edges?.filter(
          (e: any) => e.from === session.current_node,
        ),
      });
      // 🔥 IMPORTANT: do NOT fall through. If we re-enter, the "start"
      // branch below will re-fire the carousel. Bail silently instead.
      return;
    }

    await updateSession({
      current_node: nextNodeId,
      waiting_for: null,
      data: {
        ...session.data,
        last_button_id: mappedId,
        last_button_title: rawTitle,
      },
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

  // 🔥 SAFETY NET: if we received an interactive reply but the contact's
  // session is in an unexpected state (e.g. stale current_node, lost
  // waiting_for after a crash) — DO NOT re-trigger the flow from start.
  // Just acknowledge and stop, otherwise the carousel sends itself again
  // every time the user taps a card button.
  if (isInteractiveReply) {
    console.warn(
      "⚠️ Interactive reply received but session not on an interactive node — ignoring to avoid re-trigger",
      {
        currentNode: session.current_node,
        waiting_for: session.waiting_for,
        currentNodeType: currentNodeObj?.type,
      },
    );
    return;
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
