import {
  AutomationDocument,
  AutomationNode,
} from "../models/automation.model";
import Contact from "../models/contact.model";
import { AutomationSessionDocument } from "../models/automationSession.model";
import { WhatsAppClient } from "../services/whatsapp.client";
import { getNextNodeId } from "./grapht";
import { WhatsAppInteractive } from "../types/whatsapp";
import { interpolate, reverseGeocode } from "../helpers/whatsapp.helper";
import { calculateDistance, getStructuredAddress } from "../utils/googlemaps";
import { IncomingMessage } from "./automationExecuter";
import { getNextNodeByCondition } from "../utils/automation";

/* =========================
   CONTEXT TYPE
========================= */
interface Context {
  node: AutomationNode;
  automation: AutomationDocument;
  session: AutomationSessionDocument; // ✅ ADD THIS
  message: IncomingMessage;
  whatsapp: WhatsAppClient;
  updateSession: (data: {
    current_node?: string;
    waiting_for?: "button" | "location" | null | "flow";
    data?: Record<string, any>;
  }) => Promise<void>;
}


/* =========================
   NODE EXECUTOR
========================= */
export const executeNode = async ({
  node,
  automation,
  session, // ✅ now available
  message,
  whatsapp,
  updateSession,
}: Context): Promise<void> => {
  const from = message.from;

  /* ===============================
     MOVE TO NEXT NODE
  =============================== */
  const moveNext = async () => {
    const nextNodeId = getNextNodeId(automation.edges, node.id);
    if (!nextNodeId) return;

    await updateSession({ current_node: nextNodeId });
  };

  /* ===============================
     NODE TYPE HANDLING
  =============================== */
  switch (node.type) {
    case "auto_reply": {
      const rawText = node.message || "";

      // ✅ replace all {{variables}}
      const text = interpolate(rawText, session.data);

      if (node.buttons?.length) {
        await whatsapp.sendButtons(from, text, node.buttons);

        await updateSession({
          current_node: node.id,
          waiting_for: "button",
        });
        return;
      }

      await whatsapp.sendText(from, text);
      return moveNext();
    }

    case "ask_location": {
      const saveKey = node.save_to || "location";
      let structuredAddress: any = null;

      // 1️⃣ live location
      if (message.location) {
        const addressText = await reverseGeocode(
          message.location.latitude,
          message.location.longitude
        );
        structuredAddress = await getStructuredAddress(addressText);
      }

      // 2️⃣ typed address
      else if (message.text?.body) {
        structuredAddress = await getStructuredAddress(message.text.body);
      }

      // 3️⃣ nothing received yet → ASK USER
      else {
        await whatsapp.requestLocation(from, node.message!);
        await updateSession({
          current_node: node.id,
          waiting_for: "location",
        });
        return;
      }

      // 4️⃣ invalid
      if (!structuredAddress || typeof structuredAddress === "string") {
        await whatsapp.sendText(
          from,
          typeof structuredAddress === "string"
            ? structuredAddress
            : "❌ Address not found. Please try again."
        );

        await updateSession({
          current_node: node.id,
          waiting_for: "location",
        });
        return;
      }

      // 5️⃣ save contact
      await Contact.updateOne(
        { phone: from, channel_id: automation.channel_id },
        {
          $set: {
            [`attributes.${saveKey}`]: {
              text: structuredAddress.fullAddress,
              latitude: structuredAddress.latitude,
              longitude: structuredAddress.longitude,
              structured: structuredAddress,
            },
          },
        },
        { upsert: true }
      );

      // 6️⃣ save session
      await updateSession({
        data: {
          ...session.data,
          address: structuredAddress.fullAddress,
          addressData: {
            latitude: structuredAddress.latitude,
            longitude: structuredAddress.longitude,
          },
        },
      });

      // 7️⃣ move to confirm
      const nextNodeId = getNextNodeId(automation.edges, node.id);
      if (!nextNodeId) return;

      await updateSession({
        current_node: nextNodeId,
        waiting_for: "button",
      });

      return executeNode({
        node: automation.nodes.find(n => n.id === nextNodeId)!,
        automation,
        session,
        message,
        whatsapp,
        updateSession,
      });
    }


    case "send_flow": {
      /**
       * 1️⃣ FLOW RESPONSE RECEIVED
       */
      if (
        message.interactive?.type === "nfm_reply" &&
        message.interactive?.nfm_reply?.response_json
      ) {
        const saveKey = node.save_to || "flow_data";

        let parsedData: any = {};
        try {
          parsedData = JSON.parse(
            message.interactive.nfm_reply.response_json
          );
        } catch (err) {
          console.error("❌ Invalid flow JSON", err);
          return;
        }

        // ✅ SAVE FLOW DATA TO CONTACT
        await Contact.updateOne(
          { _id: session.contact_id },
          {
            $set: {
              [`attributes.${saveKey}`]: parsedData,
            },
          }
        );

        // 🔁 MOVE TO NEXT NODE (IF ANY)
        const nextNodeId = getNextNodeId(automation.edges, node.id);
        if (!nextNodeId) return;

        await updateSession({
          current_node: nextNodeId,
          waiting_for: null,
        });

        const nextNode = automation.nodes.find(n => n.id === nextNodeId);
        if (!nextNode) return;

        // 🚀 AUTO EXECUTE NEXT NODE
        return executeNode({
          node: nextNode,
          automation,
          session,
          message,
          whatsapp,
          updateSession,
        });
      }

      /**
       * 2️⃣ SEND FLOW (NORMAL)
       */
      await whatsapp.sendFlow(from, node.flow_id!, {
        header: node.header || "Welcome",
        body: node.body || "Please continue",
        cta: node.cta || "Continue",
        startScreen: node.startScreen,
        data: {
          phone_number: from, // ✅ always send phone
        },
      });

      // ⛔ WAIT FOR FLOW SUBMISSION
      await updateSession({
        current_node: node.id,
        waiting_for: "flow",
      });

      return;
    }

    case "distance_check": {
      const address = session.data?.addressData;
      console.log({ session })
      if (!address?.latitude || !address?.longitude) {
        console.warn("❌ No address found for distance check");
        return;
      }

      const distance = calculateDistance(
        node.reference_lat!,
        node.reference_lng!,
        address.latitude,
        address.longitude
      );

      const condition = distance <= node.max_distance_km!
        ? "IN_RANGE"
        : "OUT_OF_RANGE";

      // optional: save distance
      await updateSession({
        data: {
          ...session.data,
          distance_km: distance.toFixed(2),
        },
      });

      const nextNodeId = getNextNodeByCondition(
        automation.edges,
        node.id,
        condition
      );

      if (!nextNodeId) return;

      return executeNode({
        node: automation.nodes.find(n => n.id === nextNodeId)!,
        automation,
        session,
        message,
        whatsapp,
        updateSession,
      });
    }

    default:
      console.warn("⚠️ Unsupported node type:", node.type);
      return;
  }
};
