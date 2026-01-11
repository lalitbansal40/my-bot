import { Request, Response } from "express";
import dotenv from "dotenv";
import path from "path";
import { Channel } from "../models/channel.model";
import Automation from "../models/automation.model";
import AutomationSession from "../models/automationSession.model";
import { createWhatsAppClient } from "../services/whatsapp.client";
import { runAutomation } from "../engine/automationExecuter";
import Contact from "../models/contact.model";
import Message from "../models/message.model";
dotenv.config({ path: path.join(".env") });

const SHEET_ID = "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI";
const REFERENCE_COORDS = {
  lat: 26.838606673565817,
  lng: 75.82641420437723,
};

const INTERNAL_NOTIFY_NUMBERS = [
  "919664114023",
  "917413048269",
];
/* =====================================================
   SHOP CONSTANTS (FIXED)
===================================================== */
const SHOP_ADDRESS =
  "Shiv Bhole Bakers, vivek vihar mod, jagatpura, Jaipur, Rajasthan, India";
const SHOP_PHONE = "9664114023";


export const verifyWebhook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const mode = req.query["hub.mode"] as string | undefined;
    const token = req.query["hub.verify_token"] as string | undefined;
    const challenge = req.query["hub.challenge"] as string | undefined;

    if (
      mode === "subscribe" &&
      token === process.env.WHATSAPP_VERIFY_TOKEN &&
      challenge
    ) {
      return res
        .status(200)
        .set("Content-Type", "text/plain")
        .send(challenge);
    }

    return res.sendStatus(403);
  } catch (error) {
    console.error("verifyWebhook error:", error);
    return res.sendStatus(500);
  }
};


/* =====================================================
   WHATSAPP MESSAGE RECEIVE
===================================================== */
export const receiveMessage = async (req: Request, res: Response) => {
  try {
    console.log("req.bod.   ::  ",JSON.stringify(req.body))
    const value = req.body?.entry?.[0]?.changes?.[0]?.value;
    if (!value?.messages) return res.sendStatus(200);

    const phoneNumberId = value.metadata.phone_number_id;
    const message = value.messages[0];
    const from = message.from;
    const text = message.text?.body || "";

    const channel = await Channel.findOne({
      phone_number_id: phoneNumberId,
      is_active: true,
    });
    if (!channel) return res.sendStatus(200);

    const automation = await Automation.findOne({
      channel_id: channel._id,
      trigger: "new_message_received",
      status: "active",
    });
    if (!automation) return res.sendStatus(200);

    const contact = await Contact.findOneAndUpdate(
      {
        channel_id: channel._id,
        phone: from,
      },
      {
        $set: {
          name: value.contacts?.[0]?.profile?.name,
        },
      },
      {
        upsert: true,
        new: true,
      }
    );


    const incoming = value.messages[0];

    const msg = await Message.create({
      channel_id: channel._id,
      contact_id: contact._id,
      direction: "IN",
      type: incoming.type || "unknown",
      status: "SENT", // incoming already received
      wa_message_id: incoming.id,
      payload: incoming,
    });

    // update contact last message
    await Contact.updateOne(
      { _id: contact._id },
      {
        $set: {
          last_message_id: msg._id,
          last_message_at: new Date(),
        },
      }
    );


    let session = await AutomationSession.findOne({
      phone: from,
      automation_id: automation._id,
    });

    if (!session) {
      session = await AutomationSession.create({
        phone: from,
        automation_id: automation._id,
        channel_id: channel._id,
        contact_id: contact._id, // 🔥 IMPORTANT
        current_node: "start",
        waiting_for: null,
        data: {},
        status: "active",
      });
    }

    const whatsapp = createWhatsAppClient(channel, contact);

    await runAutomation({
      automation,
      session,
      message,
      whatsapp,
      updateSession: async (updates) => {
        Object.assign(session, updates);
        await session.save();
      },
    });

    return res.sendStatus(200);
  } catch (error) {
    console.error("❌ receiveMessage error", error);
    return res.sendStatus(200);
  }
};



// export const recievePayment = async (req: Request & { rawBody?: string }, res: Response) => {
//   // ⚡ Razorpay needs instant 200
//   const response = { statusCode: 200, body: "" };

//   try {
//     const rawBody = req.rawBody || JSON.stringify(req.body || {});
//     if (!rawBody) return res.sendStatus(200);


//     if (!rawBody) return response;

//     const { event: rpEvent, payload } = JSON.parse(rawBody);

//     const paymentLink = payload?.payment_link?.entity;
//     const payment = payload?.payment?.entity;

//     const phone = paymentLink?.customer?.contact;
//     const amount = payment?.amount ? payment.amount / 100 : undefined;

//     if (!phone) {
//       console.error("❌ Phone missing in Razorpay payload");
//       return response;
//     }

//     const cakeData = (await import("../cakeData.json")).default;

//     const BORZO_API_KEY = process.env.BORZO_API_KEY!;

//     const sheet = new GoogleSheetService(SHEET_ID);

//     /* =================================================
//        ✅ PAYMENT SUCCESS
//     ================================================= */
//     if (rpEvent === "payment_link.paid") {

//       // 1️⃣ Fetch order first
//       const order = await sheet.getByKey("phone", phone, "order details");
//       if (!order) return response;

//       // 2️⃣ Idempotency check
//       if (order.payment_status === "PAID") {
//         console.log("⚠️ Payment already processed for:", phone);
//         return response; // ⛔ STOP everything here
//       }

//       // 3️⃣ Mark payment as PAID
//       await sheet.updateByKey(
//         "phone",
//         phone,
//         {
//           payment_status: "PAID",
//           updated_at: new Date().toISOString(),
//         },
//         "order details"
//       );

//       let borzoOrderId = "";

//       try {
//         const borzoClient = new BorzoApiClient(BORZO_API_KEY, false);

//         const borzoPayload: any = {
//           matter: order.item_name,
//           payment_method: "balance",
//           points: [
//             {
//               address: SHOP_ADDRESS,
//               latitude: REFERENCE_COORDS.lat,
//               longitude: REFERENCE_COORDS.lng,
//               contact_person: {
//                 name: "Cake Arena",
//                 phone: SHOP_PHONE,
//               },
//             },
//             {
//               address: order.address,
//               latitude: Number(order.latitude),
//               longitude: Number(order.longitude),
//               contact_person: {
//                 name: order.name,
//                 phone,
//               },
//             },
//           ],
//         };

//         const borzoResp = await borzoClient.createOrder(borzoPayload);

//         if (borzoResp?.order?.order_id) {
//           borzoOrderId = borzoResp.order.order_id;

//           await sheet.updateByKey(
//             "phone",
//             phone,
//             {
//               delivery_partner: "BORZO",
//               delivery_status: "CREATED",
//               order_id: borzoOrderId,
//               updated_at: new Date().toISOString(),
//             },
//             "order details"
//           );
//         } else {
//           throw new Error("Borzo failed");
//         }
//       } catch {
//         await sheet.updateByKey(
//           "phone",
//           phone,
//           {
//             delivery_partner: "MANUAL",
//             delivery_status: "PENDING",
//             updated_at: new Date().toISOString(),
//           },
//           "order details"
//         );
//       }

//       // 4️⃣ Send confirmation to customer
//       await sendTextMessage(
//         phone,
//         `✅ *Payment Successful!*

// 🍰 *Your order is confirmed*
// 💰 Amount Paid: ₹${amount}

// 🚚 *Delivery Status:* ${borzoOrderId
//           ? "Delivery scheduled via Borzo 🚚"
//           : "Our team will contact you shortly"
//         }

// 📦 *Order ID:* ${borzoOrderId || "Will be shared soon"}

// Thank you for ordering with us 🎂`
//       );

//       // 5️⃣ Internal notifications
//       const items = order.item_name.split(",").map((i: string) => i.trim());

//       const cakeMap = cakeData.reduce<Record<string, any>>((acc, cake) => {
//         acc[cake.id] = cake;
//         return acc;
//       }, {});

//       for (const notifyNumber of INTERNAL_NOTIFY_NUMBERS) {
//         for (const itemKey of items) {
//           const cake = cakeMap[itemKey];
//           if (!cake) continue;

//           await sendUtilityTemplate(notifyNumber, "order_confiremed", {
//             headerImageUrl: cake.image_url,
//             parameters: [
//               borzoOrderId || "PENDING",
//               cake.title,
//             ],
//           });
//         }
//       }

//       return response;
//     }



//     /* =================================================
//        ❌ PAYMENT FAILED
//     ================================================= */
//     if (rpEvent === "payment.failed") {
//       await sheet.updateByKey(
//         "phone",
//         phone,
//         {
//           payment_status: "FAILED",
//           updated_at: new Date().toISOString(),
//         },
//         "order details"
//       );

//       await sendTextMessage(
//         phone,
//         `❌ *Payment Failed*

// Your payment could not be completed.
// Please try again.`
//       );

//       return response;
//     }

//     /* =================================================
//        🚫 PAYMENT CANCELLED
//     ================================================= */
//     if (rpEvent === "payment_link.cancelled") {
//       await sheet.updateByKey(
//         "phone",
//         phone,
//         {
//           payment_status: "CANCELLED",
//           updated_at: new Date().toISOString(),
//         },
//         "order details"
//       );

//       await sendTextMessage(
//         phone,
//         `🚫 *Payment Cancelled*

// If you still want to place the order,
// please message us again.`
//       );

//       return response;
//     }

//     return response;
//   } catch (err) {
//     console.error("❌ recievePayment error:", err);
//     return response;
//   }
// };




