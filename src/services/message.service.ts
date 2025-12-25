import {
    sendTextMessage,
    sendButtonMessage,
    sendFlowMessage,
    sendLocationRequest,
} from "../services/whatsapp.service";

import {
    getSession,
    setSession,
    reverseGeocode,
} from "../helpers/whatsapp.helper";

import { getStructuredAddress } from "../utils/googlemaps";
import { GoogleSheetService } from "./googlesheet.service";
import { RazorpayService } from "./razorpay.service";
import CakeData from "./../cakeData.json"
/* =====================
   TYPES
===================== */

interface FlowDecryptedBody {
    from: string;
    text?: { body: string };
    location?: { latitude: number; longitude: number };
    interactive?: any;
}

/* =====================
   CONSTANTS
===================== */

const FLOW_ID = "1370897108098467";
const SHEET_ID = "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI";

/* =====================
   MAIN HANDLER
===================== */

export const handleIncomingMessage = async (
    message: FlowDecryptedBody,
    userName: string
) => {
    const from = message.from;
    const text = message.text?.body?.trim();
    const location = message.location;
    const buttonId = message?.interactive?.button_reply?.id;

    let session = getSession(from);

    /* =====================
       INIT SESSION
    ===================== */
    if (!session && text) {
        setSession(from, {
            step: "CHOOSE_LANGUAGE",
            latitude: null,
            longitude: null,
            bill: undefined
        });

        return sendLanguageButtons(from);
    }

    if (!session) return;

    /* =================================================
       ✅ FLOW SUBMISSION HANDLER (nfm_reply)
    ================================================= */
    if (message?.interactive?.type === "nfm_reply") {
        const raw = message.interactive.nfm_reply?.response_json;
        if (!raw) return;

        const flowData = JSON.parse(raw);
        console.log("🔥 FLOW SUBMITTED DATA 🔥", flowData);

        const phoneNumber = flowData.phone_number;
        const selectedCakesText = flowData.cakeData
        const totalAmount = flowData.total_amount; // "₹364"
        const deliveryCharge = flowData.delivery_price || "₹50";

        // ✅ Convert ₹364 → 364

        /* ===============================
           SAVE TO GOOGLE SHEET
        =============================== */
        const googleSheet = new GoogleSheetService(
            "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI"
        );

        await googleSheet.updateByKey(
            "phone",
            phoneNumber,
            {
                item_name: selectedCakesText,
                price: totalAmount,
                payment_status: "PENDING",
                updated_at: new Date().toISOString(),
            },
            "order details"
        );

        /* ===============================
           CREATE RAZORPAY PAYMENT LINK
        =============================== */
        const razorpayService = new RazorpayService("rzp_test_RuD9k6MQelKZZF", "Ym82337mXPLJw6iFNUe16SvG"); // ✅ NO keys here

        const paymentLink = await razorpayService.createPaymentLink({
            amount: totalAmount, // rupees
            customerName: userName,
            customerPhone: phoneNumber,
            description: selectedCakesText,
            referenceId: `ORDER_${Date.now()}`,
        });

        /* ===============================
           SAVE SESSION
        =============================== */
        setSession(from, {
            ...session,
            step: "PAYMENT_LINK_SENT",
            bill: flowData,
        });

        /* ===============================
           SEND WHATSAPP MESSAGE
        =============================== */
        console.log("flowdata cakedata :: ",JSON.stringify(flowData.cakeData))
        await sendTextMessage(
            from,
            `🍰 *Order Summary*

📦 *Items:*  
${CakeData.map((item: any) => item.id === flowData.cakeData)}

🚚 *Delivery:* ${deliveryCharge}
💰 *Total Amount:* ${totalAmount}

🔐 *Pay using UPI / Card / Wallet*
👇 Click below to pay:
${paymentLink.short_url}

Once payment is successful, we’ll start preparing your cake 🎂`
        );

        return;
    }


    /* =====================
       STATE MACHINE
    ===================== */
    switch (session.step) {
        case "CHOOSE_LANGUAGE":
            return handleLanguageSelection(from, buttonId, session);

        case "WAITING_FOR_LOCATION":
            return handleLocation(from, text as string, location, session);

        case "CONFIRM_ADDRESS":
            return handleAddressConfirmation(from, buttonId, session, userName);

        case "CHOOSE_CAKE_TYPE":
            return handleCakeType(from, buttonId);

        default:
            return;
    }
};


/* =====================
   HELPERS
===================== */

const sendLanguageButtons = (from: string) =>
    sendButtonMessage(
        from,
        `🎂 *Welcome to Cake Arena!* 🍰

We bake fresh, delicious cakes for every celebration 🎉  
Choose your preferred language to continue 👇`,
        [
            { type: "reply", reply: { id: "LANG_EN", title: "English 🇺🇸" } },
            { type: "reply", reply: { id: "LANG_HI", title: "हिंदी 🇮🇳" } },
        ]
    );


/* ---------- LANGUAGE ---------- */
const handleLanguageSelection = async (
    from: string,
    buttonId: string,
    session: any
) => {
    if (!buttonId?.startsWith("LANG_")) return;

    const language = buttonId === "LANG_EN" ? "ENGLISH" : "HINDI";

    setSession(from, {
        ...session,
        step: "WAITING_FOR_LOCATION",
        language,
    });

    return sendLocationRequest(
        from,
        language === "ENGLISH"
            ? `📍 *Where should we deliver your cake?* 🎂

You can choose either option 👇

1️⃣ *Current Location*  
If you want the cake delivered where you are right now, simply share your *live location*.

2️⃣ *Different Address*  
If you want delivery at another place, just *type the full address* and send it.

✍️ *Example:*  
"Flat 302, Sunshine Apartments, Vaishali Nagar, Jaipur"

Send your location or address below 👇`
            : `📍 *केक कहाँ डिलीवर करना है?* 🎂

आप इनमें से कोई भी तरीका चुन सकते हैं 👇

1️⃣ *वर्तमान लोकेशन*  
अगर आप जहाँ हैं वहीं केक मंगवाना चाहते हैं, तो अपनी *लाइव लोकेशन* भेजें।

2️⃣ *दूसरा पता*  
अगर कहीं और केक मंगवाना है, तो पूरा पता *टाइप करके भेजें*।

✍️ *उदाहरण:*  
"फ्लैट 302, सनशाइन अपार्टमेंट्स, वैशाली नगर, जयपुर"

नीचे अपना लोकेशन या पता भेजें 👇`
    );
};


/* ---------- LOCATION ---------- */
const handleLocation = async (
    from: string,
    text: string,
    location: any,
    session: any
) => {
    if (!text && !location) return;

    let structured;

    if (location) {
        const raw = await reverseGeocode(
            location.latitude,
            location.longitude
        );
        structured = await getStructuredAddress(raw);
    } else {
        structured = await getStructuredAddress(text);
    }

    if (!structured || typeof structured === "string") {
        return sendTextMessage(from, "❌ Address not serviceable. Try again.");
    }

    setSession(from, {
        ...session,
        step: "CONFIRM_ADDRESS",
        address: structured.fullAddress,
        structuredAddress: structured,
        latitude: location?.latitude ?? structured.latitude,
        longitude: location?.longitude ?? structured.longitude,
    });

    return sendButtonMessage(
        from,
        `📍 *Delivery Address Found!* 🎉

We’ll deliver your cake here 🍰👇

${structured.fullAddress}

✅ Looks correct? Tap *Confirm*  
🔄 Want to change it? Tap *Retry*`,
        [
            { type: "reply", reply: { id: "CONFIRM_ADDRESS", title: "Confirm ✅" } },
            { type: "reply", reply: { id: "SEND_LOCATION_AGAIN", title: "Retry 🔄" } },
        ]
    );

};

/* ---------- CONFIRM ADDRESS ---------- */
const handleAddressConfirmation = async (
    from: string,
    buttonId: string,
    session: any,
    userName: string
) => {
    /* 🔄 Retry address */
    if (buttonId === "SEND_LOCATION_AGAIN") {
        setSession(from, { ...session, step: "WAITING_FOR_LOCATION" });

        return sendTextMessage(
            from,
            `🔄 *No problem!*

Please send your delivery address or live location again 📍  
We’ll make sure your cake reaches the right place 🎂`
        );
    }

    /* ❌ Ignore other buttons */
    if (buttonId !== "CONFIRM_ADDRESS") return;

    /* 💾 Save address */
    const googleSheet = new GoogleSheetService(SHEET_ID);
    const now = new Date().toISOString();

    await googleSheet.create(
        [
            from,
            userName,
            session.address,
            "",
            "",
            "",
            false,
            session.latitude,
            session.longitude,
            now,
            now,
        ],
        "order details"
    );

    setSession(from, {
        ...session,
        step: "CHOOSE_CAKE_TYPE",
    });

    /* 🎂 Next action */
    return sendButtonMessage(
        from,
        `🎉 *Address Confirmed!* 🏡

Great! Where would you like to go next? 👇`,
        [
            {
                type: "reply",
                reply: { id: "PURCHASE_CAKE", title: "Buy Cakes 🛒" },
            },
            {
                type: "reply",
                reply: { id: "CUSTOM_CAKE", title: "Customize Cake 🎨" },
            },
        ]
    );
};


/* ---------- CAKE TYPE ---------- */
const handleCakeType = async (from: string, buttonId: string) => {
    if (buttonId === "PURCHASE_CAKE") {
        // 🍰 Normal cake purchase flow
        return sendFlowMessage(from, FLOW_ID, {
            headerText: "🍰 Cake Arena",
            bodyText:
                "Yummy cakes are just a few steps away 😋\n\nBrowse cakes, select your favourites and check the bill.",
            ctaText: "Browse Cakes",
            startScreen: "WELCOME_SCREEN",
        });
    }

    if (buttonId === "CUSTOM_CAKE") {
        // 🎨 Custom cake flow (can be same or different flow ID later)
        return sendFlowMessage(from, FLOW_ID, {
            headerText: "🎨 Custom Cake Order",
            bodyText:
                "Want something special? 🎂✨\n\nTell us your preferences and we’ll design the perfect cake for you.",
            ctaText: "Customize Cake",
            startScreen: "WELCOME_SCREEN",
        });
    }
};


