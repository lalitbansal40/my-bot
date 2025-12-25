
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

export const verifyWebhook = async (event: any) => {
  try {
    const query = event.queryStringParameters || {};

    const mode = query["hub.mode"];
    const token = query["hub.verify_token"];
    const challenge = query["hub.challenge"];

    if (
      mode === "subscribe" &&
      token === process.env.WHATSAPP_VERIFY_TOKEN
    ) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "text/plain" },
        body: challenge,
      };
    }

    return { statusCode: 403, body: "" };
  } catch (err) {
    console.error("verifyWebhook error:", err);
    return { statusCode: 500, body: "" };
  }
};


/* =====================================================
   WHATSAPP MESSAGE RECEIVE
===================================================== */
export const receiveMessage = async (event: any) => {
  const response = { statusCode: 200, body: "" };

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    if (!rawBody) return response;

    const body = JSON.parse(rawBody);
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value?.messages) return response;

    const userName =
      value.contacts?.[0]?.profile?.name || "Customer";

    // ✅ THIS IS THE FIX
    for (const message of value.messages) {
      const { handleIncomingMessage } = await import(
        "../services/message.service"
      );

      await handleIncomingMessage(message, userName);
    }

    return response;
  } catch (err) {
    console.error("receiveMessage error:", err);
    return response;
  }
};


export const recievePayment = async (event: any) => {
  // ⚡ Razorpay needs instant 200
  const response = { statusCode: 200, body: "" };

  try {
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";


    if (!rawBody) return response;

    const { event: rpEvent, payload } = JSON.parse(rawBody);

    const paymentLink = payload?.payment_link?.entity;
    const payment = payload?.payment?.entity;

    const phone = paymentLink?.customer?.contact;
    const amount = payment?.amount ? payment.amount / 100 : undefined;

    if (!phone) {
      console.error("❌ Phone missing in Razorpay payload");
      return response;
    }

    // 🔥 Lazy imports (Lambda-safe)
    const { GoogleSheetService } = await import("../services/googlesheet.service");
    const { BorzoApiClient } = await import("../services/borzo.service");
    const {
      sendTextMessage,
      sendUtilityTemplate
    } = await import("../services/whatsapp.service");

    const cakeData = (await import("../cakeData.json")).default;

    const BORZO_API_KEY = process.env.BORZO_API_KEY!;

    const sheet = new GoogleSheetService(SHEET_ID);

    /* =================================================
       ✅ PAYMENT SUCCESS
    ================================================= */
    if (rpEvent === "payment_link.paid") {
      await sheet.updateByKey(
        "phone",
        phone,
        {
          payment_status: "PAID",
          updated_at: new Date().toISOString(),
        },
        "order details"
      );

      const order = await sheet.getByKey("phone", phone, "order details");
      if (!order) return response;

      let borzoOrderId = "";

      try {
        const borzoClient = new BorzoApiClient(BORZO_API_KEY, false);

        const borzoPayload:any = {
          matter: order.item_name,
          payment_method: "balance",
          points: [
            {
              address: SHOP_ADDRESS,
              latitude: REFERENCE_COORDS.lat,
              longitude: REFERENCE_COORDS.lng,
              contact_person: {
                name: "Cake Arena",
                phone: SHOP_PHONE,
              },
            },
            {
              address: order.address,
              latitude: Number(order.latitude),
              longitude: Number(order.longitude),
              contact_person: {
                name: order.name,
                phone,
              },
            },
          ],
        };

        const borzoResp = await borzoClient.createOrder(borzoPayload);

        if (borzoResp?.order?.order_id) {
          borzoOrderId = borzoResp.order.order_id;

          await sheet.updateByKey(
            "phone",
            phone,
            {
              delivery_partner: "BORZO",
              delivery_status: "CREATED",
              order_id: borzoOrderId,
              updated_at: new Date().toISOString(),
            },
            "order details"
          );
        } else {
          throw new Error("Borzo failed");
        }
      } catch {
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

      const items = order.item_name.split(",").map((i: string) => i.trim());

      const cakeMap = cakeData.reduce<Record<string, any>>((acc, cake) => {
        acc[cake.id] = cake;
        return acc;
      }, {});

      for (const notifyNumber of INTERNAL_NOTIFY_NUMBERS) {
        for (const itemKey of items) {
          const cake = cakeMap[itemKey];
          if (!cake) continue;

          await sendUtilityTemplate(notifyNumber, "order_confiremed", {
            headerImageUrl: cake.image_url,
            parameters: [
              borzoOrderId || "PENDING",
              cake.title,
            ],
          });
        }
      }

      return response;
    }


    /* =================================================
       ❌ PAYMENT FAILED
    ================================================= */
    if (rpEvent === "payment.failed") {
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
Please try again.`
      );

      return response;
    }

    /* =================================================
       🚫 PAYMENT CANCELLED
    ================================================= */
    if (rpEvent === "payment_link.cancelled") {
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

      return response;
    }

    return response;
  } catch (err) {
    console.error("❌ recievePayment error:", err);
    return response;
  }
};




