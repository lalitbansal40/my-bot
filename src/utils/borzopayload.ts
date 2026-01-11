import { interpolate } from "../helpers/whatsapp.helper";

export const buildBorzoPayload = (
    node: any,
    contact: any,
    sessionData: any
) => {
    return {
        matter: "Cake Delivery",
        vehicle_type_id: node.vehicle_type_id || 8,

        points: [
            {
                address: interpolate(
                    node.pickup?.address || "",
                    sessionData
                ),
                latitude: Number(
                    interpolate(node.pickup?.latitude || "", sessionData)
                ),
                longitude: Number(
                    interpolate(node.pickup?.longitude || "", sessionData)
                ),
                contact_person: {
                    phone: contact.phone,
                    name: contact.name,
                },
            },
            {
                address: interpolate(
                    node.drop?.address || "",
                    sessionData
                ),
                latitude: Number(
                    interpolate(node.drop?.latitude || "", sessionData)
                ),
                longitude: Number(
                    interpolate(node.drop?.longitude || "", sessionData)
                ),
                contact_person: {
                    phone: contact.phone,
                    name: contact.name,
                },
            },
        ],
    };
};