import { Schema, model, models } from "mongoose";

export interface ChannelDocument {
    channel_name: string;          // e.g. cake-arena
    phone_number_id: string;       // WhatsApp phone_number_id
    display_phone_number: string;  // 917378226593
    access_token: string;          // WhatsApp access token
    is_active: boolean;            // true / false
    createdAt: Date;
    updatedAt: Date;
}

const ChannelSchema = new Schema<ChannelDocument>(
    {
        channel_name: {
            type: String,
            required: true,
            index: true,
        },

        phone_number_id: {
            type: String,
            required: true,
            unique: true, // 🔥 important (one channel per number)
            index: true,
        },

        display_phone_number: {
            type: String,
            required: true,
        },

        access_token: {
            type: String,
            required: true,
        },

        is_active: {
            type: Boolean,
            default: true,
        },
    },
    {
        timestamps: true,
        collection: "channels", // 👈 explicit collection name
    }
);

export const Channel =
    models.Channel || model<ChannelDocument>("Channel", ChannelSchema);
