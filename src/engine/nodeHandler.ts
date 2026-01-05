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
import { getIntegration } from "../services/integration.resolver";
import { GoogleSheetService } from "../services/googlesheet.service";
import { makeGoogleSheetPayload } from "../utils/makeGoogleSheetPayload";

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
      let text = node.message || "";

      // ✅ interpolate variables first
      text = interpolate(text, session.data);

      if (
        node.id === "confirm_address_en" ||
        node.id === "confirm_address_hi"
      ) {
        const mapUrl = session.data?.addressData?.googleMapsUrl;
        if (mapUrl) {
          text += `\n\n🗺️ View on Google Maps:\n${mapUrl}`;
        }
      }


      if (node.buttons?.length) {

        // 🔒 prevent duplicate button send
        if (session.waiting_for === "button") return;

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

      /* =========================
         1️⃣ LOCATION BUTTON
      ========================= */
      if (message.location) {
        const addressText = await reverseGeocode(
          message.location.latitude,
          message.location.longitude
        );
        structuredAddress = await getStructuredAddress(addressText);
      }

      /* =========================
         2️⃣ TYPED ADDRESS
      ========================= */
      else if (
        message.text?.body &&
        !message.interactive?.button_reply &&
        !message.interactive?.nfm_reply
      ) {
        structuredAddress = await getStructuredAddress(message.text.body);
      }

      /* =========================
         3️⃣ NO INPUT YET → ASK
      ========================= */
      if (!structuredAddress) {
        await whatsapp.requestLocation(from, node.message!);

        await updateSession({
          current_node: node.id,
          waiting_for: "location",
        });
        return;
      }

      /* =========================
         4️⃣ INVALID ADDRESS
      ========================= */
      if (typeof structuredAddress === "string") {
        await whatsapp.sendText(from, structuredAddress);

        await updateSession({
          current_node: node.id,
          waiting_for: "location",
        });
        return;
      }

      /* =========================
         5️⃣ SAVE TO CONTACT
      ========================= */
      await Contact.updateOne(
        { phone: from, channel_id: automation.channel_id },
        {
          $set: {
            [`attributes.${saveKey}`]: {
              text: structuredAddress.fullAddress,
              latitude: structuredAddress.latitude,
              longitude: structuredAddress.longitude,
              structured: structuredAddress,
              googleMapsUrl: structuredAddress.googleMapsUrl
            },
          },
        },
        { upsert: true }
      );

      /* =========================
         6️⃣ SAVE TO SESSION (for {{address}})
      ========================= */
      await updateSession({
        data: {
          ...session.data,
          address: structuredAddress.fullAddress,
          addressData: {
            latitude: structuredAddress.latitude,
            longitude: structuredAddress.longitude,
            googleMapsUrl: structuredAddress.googleMapsUrl
          },
        },
      });

      /* =========================
         7️⃣ MOVE TO CONFIRM NODE
         ❗ DO NOT SET waiting_for HERE
      ========================= */
      const nextNodeId = getNextNodeId(automation.edges, node.id);
      if (!nextNodeId) return;

      await updateSession({
        current_node: nextNodeId,
        waiting_for: null, // 🔥 THIS IS THE FIX
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

    case "google_sheet": {
      // 1️⃣ ensure integration enabled
      await getIntegration(
        automation.account_id.toString(),
        "google_sheet"
      );

      if (!node.spreadsheet_id || !node.sheet_name) {
        throw new Error("Google Sheet node not configured");
      }

      // 2️⃣ FETCH CONTACT (🔥 THIS WAS MISSING)
      const contact = await Contact.findById(
        session.contact_id
      ).lean();

      if (!contact) {
        throw new Error("Contact not found for Google Sheet node");
      }

      // 3️⃣ create service using NODE spreadsheet_id
      const sheet = new GoogleSheetService(
        node.spreadsheet_id
      );

      // 4️⃣ load headers (source of truth)
      const headers = await sheet.getHeaders(
        node.sheet_name
      );

      // 5️⃣ build payload (future-proof)
      const payload = makeGoogleSheetPayload(
        headers,
        contact,
        session.data,
        node.map // optional override
      );

      console.log("GOOGLE SHEET PAYLOAD:", payload);

      // 6️⃣ execute action
      if (node.action === "create") {
        await sheet.create(payload, node.sheet_name);
      }

      return moveNext();
    }

    default:
      console.warn("⚠️ Unsupported node type:", node.type);
      return;
  }
};
