import { Request, Response } from "express";
import { WHATSAPP } from "../config/whatsapp";
import { handleIncomingMessage } from "../services/message.service";
import { sendTextMessage, sendUtilityTemplate } from "../services/whatsapp.service";
import { GoogleSheetService } from "../services/googlesheet.service";
import { BorzoApiClient } from "../services/borzo.service";
import { CalculateOrderData } from "../services/borzo.service";
import cakeData from "./../cakeData.json"
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

const BORZO_API_KEY = "7086ED3616843A380A867EB9BC097B024BAF5518"
/* =====================================================
   WHATSAPP VERIFY WEBHOOK
===================================================== */
export const verifyWebhook = (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === WHATSAPP.VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
};

/* =====================================================
   WHATSAPP MESSAGE RECEIVE
===================================================== */
export const receiveMessage = async (req: Request, res: Response) => {
  res.sendStatus(200); // Meta fast response

  const entry = req.body.entry?.[0];
  const change = entry?.changes?.[0];
  const value = change?.value;

  if (!value?.messages) return;

  const userName = value.contacts?.[0]?.profile?.name || "Customer";

  for (const message of value.messages) {
    await handleIncomingMessage(message, userName);
  }
};


export const recievePayment = async (req: Request, res: Response) => {
  // ⚡ Razorpay requires immediate response
  res.sendStatus(200);

  try {
    const { event, payload } = req.body;
    console.log("🔔 Razorpay Event:", event);

    const paymentLink = payload?.payment_link?.entity;
    const payment = payload?.payment?.entity;

    const phone = paymentLink?.customer?.contact;
    const amount = payment?.amount ? payment.amount / 100 : undefined;

    if (!phone) {
      console.error("❌ Phone missing in Razorpay webhook");
      return;
    }

    const sheet = new GoogleSheetService(SHEET_ID);

    /* =================================================
       ✅ PAYMENT SUCCESS
    ================================================= */
    if (event === "payment_link.paid") {
      /* 1️⃣ Update payment status */
      await sheet.updateByKey(
        "phone",
        phone,
        {
          payment_status: "PAID",
          updated_at: new Date().toISOString(),
        },
        "order details"
      );

      /* 2️⃣ Fetch order */
      const order = await sheet.getByKey("phone", phone, "order details");

      if (!order) {
        console.error("❌ Order not found for phone:", phone);
        return;
      }

      /* 3️⃣ Prepare Borzo */
      const borzoClient = new BorzoApiClient(
        BORZO_API_KEY!,
        false // 🔧 TEST environment (safe)
      );

      const borzoPayload: CalculateOrderData = {
        matter: order.item_name,
        payment_method: "balance",
        points: [
          {
            // 🏪 Pickup (Shop)
            address: SHOP_ADDRESS,
            latitude: REFERENCE_COORDS.lat,
            longitude: REFERENCE_COORDS.lng,
            contact_person: {
              name: "Cake Arena",
              phone: SHOP_PHONE,
            },
          },
          {
            // 🏠 Drop (Customer)
            address: order.address,
            latitude: Number(order.latitude),
            longitude: Number(order.longitude),
            contact_person: {
              name: order.name,
              phone: phone,
            },
          },
        ],
      };

      let borzoOrderId = "";

      try {
        /* 4️⃣ Create Borzo order */
        const borzoResp = await borzoClient.createOrder(borzoPayload);
        if (!borzoResp.is_successful || !borzoResp.order.order_id) {
          throw new Error("Borzo order creation failed");
        }

        borzoOrderId = borzoResp.order.order_id;

        /* 5️⃣ Update sheet (Borzo success) */
        await sheet.updateByKey(
          "phone",
          phone,
          {
            delivery_partner: "BORZO",
            delivery_status: "CREATED",
            borzo_order_id: borzoOrderId,
            updated_at: new Date().toISOString(),
          },
          "order details"
        );
      } catch (err) {
        console.error("❌ Borzo failed, fallback to manual:", err);

        /* 6️⃣ Fallback: Manual delivery */
        await sheet.updateByKey(
          "phone",
          phone,
          {
            delivery_partner: "MANUAL",
            delivery_status: "PENDING",
            updated_at: new Date().toISOString(),
          },
          "order details"
        );
      }

      /* 7️⃣ WhatsApp confirmation */
      await sendTextMessage(
        phone,
        `✅ *Payment Successful!*

🍰 *Your order is confirmed*
💰 Amount Paid: ₹${amount}

🚚 *Delivery Status:* ${borzoOrderId
          ? "Delivery scheduled via Borzo 🚚"
          : "Our team will contact you shortly"
        }

📦 *Order ID:* ${borzoOrderId || "Will be shared soon"}

Thank you for ordering with us 🎂`
      );

      const items = order.item_name
        .split(",")
        .map((i: string) => i.trim());


      const cakeMap = cakeData.reduce<Record<string, typeof cakeData[number]>>(
        (acc, cake) => {
          acc[cake.id] = cake;   // 👈 id = "black_&_white"
          return acc;
        },
        {}
      );
      // 🔹 Send to INTERNAL NUMBERS ONLY
      for (const notifyNumber of INTERNAL_NOTIFY_NUMBERS) {
        for (const itemKey of items) {
          const cake = cakeMap[itemKey];
          if (!cake) continue;

          await sendUtilityTemplate(notifyNumber, "order_confiremed", {
            headerImageUrl: cake.image_url,       // 🖼️ IMAGE HEADER
            parameters: [
              borzoOrderId || "PENDING",      // {{1}} Order ID
              cake.title                       // {{2}} Cake Name
            ],
          });
        }
      }

      return;
    }

    /* =================================================
       ❌ PAYMENT FAILED
    ================================================= */
    if (event === "payment.failed") {
      await sheet.updateByKey(
        "phone",
        phone,
        {
          payment_status: "FAILED",
          updated_at: new Date().toISOString(),
        },
        "order details"
      );

      await sendTextMessage(
        phone,
        `❌ *Payment Failed*

Your payment could not be completed.
Please try again using the payment link.`
      );

      return;
    }

    /* =================================================
       🚫 PAYMENT CANCELLED
    ================================================= */
    if (event === "payment_link.cancelled") {
      await sheet.updateByKey(
        "phone",
        phone,
        {
          payment_status: "CANCELLED",
          updated_at: new Date().toISOString(),
        },
        "order details"
      );

      await sendTextMessage(
        phone,
        `🚫 *Payment Cancelled*

If you still want to place the order,
please message us again.`
      );

      return;
    }

    console.log("ℹ️ Unhandled Razorpay event:", event);
  } catch (error) {
    console.error("❌ recievePayment error:", error);
  }
};



async function updatePaymentStatus(
  phone: string,
  data: Record<string, any>
) {
  const sheet = new GoogleSheetService(SHEET_ID);

  await sheet.updateByKey(
    "phone",
    phone,
    {
      ...data,
      updated_at: new Date().toISOString(),
    },
    "order details"
  );
}


