
export const verifyWebhook = async (event: any) => {
  try {
    console.log("event :: ",JSON.stringify(event))
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
  /* ⚡ Always respond immediately */
  const response = { statusCode: 200, body: "" };

  try {
    console.log("event :: ",JSON.stringify(event))
    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : event.body || "";

    if (!rawBody) return response;

    const body = JSON.parse(rawBody);
    console.log("body :: ",JSON.stringify(body));
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    console.log("value :: ",JSON.stringify(value))
    if (!value?.messages) return response;

    const userName =
      value.contacts?.[0]?.profile?.name || "Customer";

    /* 🔥 DO NOT await (avoid timeout) */
    for (const message of value.messages) {
      import("../services/message.service")
        .then(({ handleIncomingMessage }) =>
          handleIncomingMessage(message, userName)
        )
        .catch(err =>
          console.error("handleIncomingMessage error:", err)
        );
    }

    return response;
  } catch (err) {
    console.error("receiveMessage error:", err);
    return response; // still 200 for WhatsApp
  }
};


export const recievePayment = async (event: any) => {
  /* ⚡ Razorpay requires instant 200 */
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
    const amount = payment?.amount
      ? payment.amount / 100
      : undefined;

    if (!phone) return response;

    /* 🔥 Lazy imports (avoid init timeout) */
    const { GoogleSheetService } = await import("../services/googlesheet.service");
    const { BorzoApiClient } = await import("../services/borzo.service");
    const { sendTextMessage, sendUtilityTemplate } = await import("../services/whatsapp.service");
    const cakeData = (await import("../cakeData.json")).default;

    const SHEET_ID = process.env.SHEET_ID!;
    const BORZO_API_KEY = process.env.BORZO_API_KEY!;

    const sheet = new GoogleSheetService(SHEET_ID);

    if (rpEvent === "payment_link.paid") {
      await sheet.updateByKey(
        "phone",
        phone,
        { payment_status: "PAID", updated_at: new Date().toISOString() },
        "order details"
      );

      /* Remaining heavy logic continues async */
      Promise.resolve().then(async () => {
        // Borzo + WhatsApp logic here
      });

      return response;
    }

    if (rpEvent === "payment.failed") {
      await sheet.updateByKey(
        "phone",
        phone,
        { payment_status: "FAILED", updated_at: new Date().toISOString() },
        "order details"
      );

      await sendTextMessage(phone, "❌ Payment failed");
    }

    return response;
  } catch (err) {
    console.error("recievePayment error:", err);
    return response;
  }
};



