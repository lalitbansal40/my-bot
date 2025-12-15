import {
    sendTextMessage,
    sendButtonMessage,
    sendFlowMessage,
    sendLocationRequest,
    WhatsAppButton,
} from "../services/whatsapp.service";

import {
    getSession,
    setSession,
    clearSession,
    reverseGeocode,
    UserSession,
} from "../helpers/whatsapp.helper";
// if separated

export const handleIncomingMessage = async (message: any) => {
    const from = message.from;
    const text = message.text?.body?.toLowerCase();
    const location = message.location;
    const buttonId = message?.interactive?.button_reply?.id;

    console.log("Incoming Message:", JSON.stringify(message, null, 2));

    const session = getSession(from);

    if (text === "hi" && !session) {
        const newSession: UserSession = {
            step: "WAITING_FOR_LOCATION",
        };

        setSession(from, newSession);

        await sendTextMessage(
            from,
            `Hello 👋 Welcome to *Cake Arena* 🎂

We bake fresh and delicious cakes for every special moment ❤️

📍 Please share the delivery location where you want your cake to be delivered.`
        );

        await sendLocationRequest(from);
        return;
    }


    if (location && session?.step === "WAITING_FOR_LOCATION") {
        const { latitude, longitude } = location;
        const address = await reverseGeocode(latitude, longitude);
       
        setSession(from, {
            step: "CONFIRM_ADDRESS",
            location: { latitude, longitude },
            address,
        });

        const buttons: WhatsAppButton[] = [
            {
                type: "reply",
                reply: { id: "CONFIRM_ADDRESS", title: "Confirm Address ✅" },
            },
            {
                type: "reply",
                reply: { id: "SEND_LOCATION_AGAIN", title: "Send Again 🔄" },
            },
        ];

        await sendButtonMessage(
            from,
            `📍 *Delivery Address Found*

${address}

Please confirm if this is the correct delivery address.`,
            buttons
        );
        return;
    }


    if (buttonId === "SEND_LOCATION_AGAIN") {
        setSession(from, {
            step: "WAITING_FOR_LOCATION",
        });

        await sendTextMessage(
            from,
            "No worries 😊 Please share the delivery location again."
        );

        await sendLocationRequest(from);
        return;
    }

    /* =====================================================
       STEP 3B: Address confirmed
    ===================================================== */
    if (buttonId === "CONFIRM_ADDRESS" && session?.step === "CONFIRM_ADDRESS") {
        setSession(from, {
            ...session,
            step: "CHOOSE_CAKE_TYPE",
        });

        const buttons: WhatsAppButton[] = [
            {
                type: "reply",
                reply: { id: "PURCHASE_CAKE", title: "Purchase Cake 🛒" },
            },
            {
                type: "reply",
                reply: { id: "CUSTOM_CAKE", title: "Custom Cake 🎨" },
            },
        ];

        await sendButtonMessage(
            from,
            `🎉 Address Confirmed!

How would you like to proceed?`,
            buttons
        );
        return;
    }


    if (buttonId === "PURCHASE_CAKE" && session?.step === "CHOOSE_CAKE_TYPE") {
        await sendFlowMessage(from, "1370897108098467");
        clearSession(from);
        return;
    }


    if (buttonId === "CUSTOM_CAKE" && session?.step === "CHOOSE_CAKE_TYPE") {
        await sendFlowMessage(from, "1370897108098467");
        clearSession(from);
        return;
    }
};
