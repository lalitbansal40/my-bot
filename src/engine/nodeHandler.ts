import { AutomationDocument, AutomationNode } from "../models/automation.model";
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
import { buildBorzoPayload } from "../utils/borzopayload";
import { BorzoApiClient } from "../services/borzo.service";
import { RazorpayService } from "../services/razorpay.service";

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
   CONTEXT TYPE
========================= */
interface Context {
  node: AutomationNode;
  automation: AutomationDocument;
  session: any; // ✅ ADD THIS
  message: IncomingMessage;
  whatsapp: WhatsAppClient;
  updateSession: (data: {
    current_node?: string;
    waiting_for?:
    | "input"
    | "button"
    | "location"
    | "flow"
    | "carousel"
    | "address_message"
    | null;
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

  const goToNode = async (nextNodeId: string) => {
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
      message,
      whatsapp,
      updateSession,
    });
  };

  /* ===============================
     MOVE TO NEXT NODE
  =============================== */
  const moveNext = async () => {
    const nextNodeId = getNextNodeId(automation.edges, node.id);
    if (!nextNodeId) return;

    await goToNode(nextNodeId);
    return;
  };

  console.log(
    `Executing node ${node.id} of type ${node.type} for contact ${session.contact_id}`,
  );
  /* ===============================
     NODE TYPE HANDLING
  =============================== */
  switch (node.type) {
    case "auto_reply": {
      // =========================
      // 🔥 GENERIC BUTTON DATA SAVE (NO HARDCODE)
      // =========================
      if (message.interactive?.button_reply?.id) {
        const btnId = message.interactive.button_reply.id;
        const btnTitle = message.interactive.button_reply.title;

        await updateSession({
          data: {
            ...session.data,
            last_button_id: btnId,
            last_button_title: btnTitle,
          },
        });
      }

      // =========================
      // 🔥 GET CONTACT (FOR {{contact.name}})
      // =========================
      const contact = await Contact.findById(session.contact_id).lean();

      // =========================
      // 🔥 BUILD CONTEXT (POWERFUL)
      // =========================
      const context = {
        ...session.data,
        contact,
        ...contact?.attributes, // allows {{address}}, {{order_id}}, etc.
      };

      // =========================
      // 🔥 INTERPOLATE MESSAGE
      // =========================
      let text = node.message || "";
      text = interpolate(text, context);

      console.log("node :: ", node);

      // =========================
      // 🔥 MEDIA + BUTTONS
      // =========================
      if (node.media?.url) {
        console.log("Sending media with URL:", node.media.url);

        await whatsapp.sendInteractiveMedia(from, {
          type: node.media.type || "image",
          url: node.media.url,
          caption: text,
          buttons: node.buttons || [],
        });

        if (node.buttons?.length) {
          await updateSession({
            current_node: node.id,
            waiting_for: "button",
          });
          return;
        }

        return moveNext();
      }

      // =========================
      // 🔘 BUTTONS ONLY
      // =========================
      if (node.buttons?.length) {
        await whatsapp.sendButtons(from, text, node.buttons);

        await updateSession({
          current_node: node.id,
          waiting_for: "button",
        });

        return;
      }

      // =========================
      // 📝 TEXT ONLY
      // =========================
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
          message.location.longitude,
        );
        structuredAddress = await getStructuredAddress(addressText);
      } else if (
        /* =========================
         2️⃣ TYPED ADDRESS
      ========================= */
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
              googleMapsUrl: structuredAddress.googleMapsUrl,
              displayAddress: structuredAddress.displayAddress
            },
          },
        },
        { upsert: true },
      );

      /* =========================
         6️⃣ SAVE TO SESSION (for {{address}})
      ========================= */
      await updateSession({
        data: {
          ...session.data,
          address: structuredAddress.fullAddress,
           [`${saveKey}`]: {
              text: structuredAddress.fullAddress,
              latitude: structuredAddress.latitude,
              longitude: structuredAddress.longitude,
              structured: structuredAddress,
              googleMapsUrl: structuredAddress.googleMapsUrl,
              displayAddress: structuredAddress.displayAddress
            },
        },
      });

      /* =========================
         7️⃣ MOVE TO CONFIRM NODE
         ❗ DO NOT SET waiting_for HERE
      ========================= */
      const nextNodeId = getNextNodeId(automation.edges, node.id);
      if (!nextNodeId) return;

      await goToNode(nextNodeId);
      return;
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
          parsedData = JSON.parse(message.interactive.nfm_reply.response_json);
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
          },
        );

        // 🔁 MOVE TO NEXT NODE (IF ANY)
        const nextNodeId = getNextNodeId(automation.edges, node.id);
        if (!nextNodeId) return;

        await goToNode(nextNodeId);
        return;
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
        address.longitude,
      );

      const condition =
        distance <= node.max_distance_km! ? "IN_RANGE" : "OUT_OF_RANGE";

      // optional: save distance
      const nextNodeId = getNextNodeByCondition(
        automation.edges,
        node.id,
        condition,
      );
      await goToNode(nextNodeId);
      return;
    }

    case "google_sheet": {
      await getIntegration(automation.account_id.toString(), "google_sheet");

      if (!node.spreadsheet_id || !node.sheet_name) {
        throw new Error("Google Sheet node not configured");
      }

      const freshContact = await Contact.findById(session.contact_id).lean();
      if (!freshContact) throw new Error("Contact not found");

      const sheet = new GoogleSheetService(node.spreadsheet_id);
      const headers = await sheet.getHeaders(node.sheet_name);
      if (!session.data.order_id) {
        const orderId =
          "ORD-" +
          Date.now().toString(36) +
          Math.random().toString(36).substring(2, 6);

        await updateSession({
          data: {
            ...session.data,
            order_id: orderId.toUpperCase(),
          },
        });
      }

      const payload = makeGoogleSheetPayload(
        headers,
        freshContact,
        {
          ...freshContact?.attributes,
          ...session.data,
        },
        node.map,
      );

      const safePayload = Object.fromEntries(
        Object.entries(payload).map(([key, value]) => [key, value ?? ""]),
      );

      console.log("🔥 FINAL SHEET PAYLOAD:", safePayload);

      if (node.action === "create") {
        await sheet.create(safePayload, node.sheet_name);
      }

      return moveNext();
    }

    case "borzo_delivery": {
      // 1️⃣ get borzo client (account based)
      const { config, secrets } = await getIntegration(
        automation.account_id.toString(),
        "borzo",
      );

      const borzo = new BorzoApiClient(secrets.auth_token, config.environment);

      // 2️⃣ fetch contact
      const contact = await Contact.findById(session.contact_id).lean();

      if (!contact) {
        throw new Error("Contact not found for Borzo node");
      }

      let response: any;

      // 3️⃣ SWITCH BASED ON ACTION
      switch (node.borzo_action) {
        case "calculate": {
          const payload = buildBorzoPayload(node, contact, session.data);
          response = await borzo.calculatePrice(payload);
          break;
        }

        case "create": {
          const payload = buildBorzoPayload(node, contact, session.data);
          response = await borzo.createOrder(payload);
          break;
        }

        case "update": {
          const orderId = interpolate(node.order_id!, session.data);
          response = await borzo.updateOrder(orderId, node.config || {});
          break;
        }

        case "cancel": {
          const orderId = interpolate(node.order_id!, session.data);
          response = await borzo.cancelOrder(orderId);
          break;
        }

        case "track": {
          const deliveryId = interpolate(node.order_id!, session.data);
          response = await borzo.getCourierLocation(deliveryId);
          break;
        }

        case "get_order": {
          const orderId = interpolate(node.order_id!, session.data);
          response = await borzo.getOrderInfo(orderId);
          break;
        }

        default:
          throw new Error("Invalid Borzo action");
      }

      // 4️⃣ SAVE RESPONSE
      const saveKey = node.save_to || "borzo_amount";

      await Contact.updateOne(
        { _id: contact._id },
        {
          $set: {
            [`attributes.${saveKey}`]: response.order.payment_amount,
          },
        },
      );

      return moveNext();
    }

    case "razorpay_payment": {
      if (!node.config) {
        throw new Error("razorpay_payment node config missing");
      }

      const { config, secrets } = await getIntegration(
        automation.account_id.toString(),
        "razorpay",
      );

      const razorpay = new RazorpayService(config.key_id, secrets.key_secret);

      const contact = await Contact.findById(session.contact_id).lean();
      if (!contact) throw new Error("Contact not found");

      const context = {
        data: session.data,
        ...session.data,
        contact,
        ...contact.attributes, // 🔥 THIS IS THE REAL FIX
      };

      const itemAmount = Number(interpolate(node.config.item_amount, context));

      const deliveryAmount = Number(
        interpolate(node.config.delivery_amount, context),
      );

      const totalAmount = itemAmount + deliveryAmount;

      const paymentLink = await razorpay.createPaymentLink({
        amount: totalAmount,
        customerName: contact.name || "Customer",
        customerPhone: contact.phone.slice(-10),
        description: node.config.description || "Payment",
        referenceId: session._id.toString(),
      });

      await updateSession({
        data: {
          ...session.data,
          payment: {
            item_amount: itemAmount,
            delivery_amount: deliveryAmount,
            total_amount: totalAmount,
            payment_link: paymentLink.short_url,
            payment_link_id: paymentLink.id,
          },
        },
      });

      return moveNext();
    }

    case "payment_summary": {
      if (!node.config) {
        throw new Error("payment_summary node config missing");
      }

      const contact = await Contact.findById(session.contact_id).lean();
      if (!contact) throw new Error("Contact not found");

      const context = {
        data: session.data,
        ...session.data,
        contact,
        ...contact.attributes,
      };

      /* =========================
         BUILD MESSAGE
      ========================= */
      let text = `*${node.config.title}*\n\n`;

      for (const row of node.config.rows) {
        text += `• *${row.label}:* ${interpolate(row.value, context)}\n`;
      }

      text += `\n━━━━━━━━━━━━━━\n`;
      text += `💳 *Total Amount:* ₹${session.data.payment.total_amount}\n`;
      text += `━━━━━━━━━━━━━━`;

      /* =========================
         SEND PAY NOW BUTTON
      ========================= */
      await whatsapp.sendUrlButton(
        from,
        text,
        node.config.button_text || "Pay Now 💳",
        session.data.payment.payment_link,
      );

      return moveNext();
    }

    case "carousel": {
      console.log("Executing carousel node:", node.id);

      if (session.waiting_for === "carousel") return;

      console.log("👉 node.items:", node.items);
      console.log("👉 typeof node.items:", typeof node.items);

      // 🔥 FINAL FIX (MONGOOSE SAFE)
      const items = JSON.parse(JSON.stringify(node?.items ?? []));
      console.log("CHECK:", Array.isArray(node.items), node.items?.length);

      console.log("🔥 FINAL ITEMS:", items);
      console.log("🔥 LENGTH:", items.length);

      if (!items || items.length === 0) {
        console.warn("❌ Carousel has no items AFTER FIX");
        return;
      }

      await whatsapp.sendCarousel(from, {
        header: node.header || undefined,
        body: node.body || "Please choose",
        items,
      });

      await updateSession({
        current_node: node.id,
        waiting_for: "carousel",
        data: {
          ...session.data,
          carousel_items: items,
          carousel_node: node.id,
        },
      });

      return;
    }

    case "ask_input": {
      let text = node.message || "Enter value";

      await whatsapp.sendText(from, text);

      await updateSession({
        current_node: node.id,
        waiting_for: "input",
        data: {
          ...session.data,
          save_key: node.save_to,
        },
      });

      return;
    }

    case "address_message": {
      const saveKey = node.save_to || "address";
      // ✅ RESPONSE AAYA (IMPORTANT)
      if (
        session.waiting_for === "address_message" &&
        message.interactive?.type === "nfm_reply" &&
        message.interactive?.nfm_reply?.response_json
      ) {
        let parsed: any = {};
        console.log(
          "🔥 RAW ADDRESS RESPONSE:",
          JSON.stringify(message.interactive),
        );
        try {
          parsed = JSON.parse(message.interactive.nfm_reply.response_json);
        } catch (e) {
          console.error("❌ Address parse error", e);
          return;
        }

        // ✅ SAVE IN CONTACT
        const data = parsed?.values || {};

        const addressText = [
          data?.house_number,
          data?.floor_number,
          data?.tower_number,
          data?.building_name,
          data?.address,
          data?.landmark_area,
          data?.city,
          data?.state,
          data?.in_pin_code,
        ]
          .filter(Boolean)
          .join(", ");
        await Contact.updateOne(
          { _id: session.contact_id },
          {
            $set: {
              [`attributes.${saveKey}`]: {
                text: addressText,
                latitude: data?.latitude,
                longitude: data?.longitude,
                displayAddress: addressText
              }
            },
          },
        );

        await updateSession({
          data: {
            ...session.data,
            address: addressText,
            [`${saveKey}`]: {
                text: addressText,
                latitude: data?.latitude,
                longitude: data?.longitude,
                displayAddress: addressText
              }
          },
        });



        // 🔥 NEXT NODE (VERY IMPORTANT)
        const nextNodeId = getNextNodeId(automation.edges, node.id);
        if (!nextNodeId) return;

        await goToNode(nextNodeId);
        return;
      }

      // 📤 FIRST TIME SEND
      await whatsapp.sendAddressMessage(
        from,
        node.message || "📍 Please enter your delivery address",
      );

      await updateSession({
        current_node: node.id,
        waiting_for: "address_message",
      });

      return;
    }

    default:
      console.warn("⚠️ Unsupported node type:", node.type);
      return;
  }
};
