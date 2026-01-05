import mongoose, { Schema, Document } from "mongoose";

export interface ContactDocument extends Document {
  phone: string;
  name?: string;
  channel_id: mongoose.Types.ObjectId;
  last_message_id: mongoose.Types.ObjectId;


  last_message?: string;
  last_message_at?: Date;

  attributes: Record<string, any>;

  createdAt: Date;
  updatedAt: Date;
}

const ContactSchema = new Schema<ContactDocument>(
  {
    phone: { type: String, required: true },
    name: { type: String },

    channel_id: {
      type: Schema.Types.ObjectId,
      ref: "Channel",
      required: true,
      index: true,
    },
    last_message_id: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      index: true,
    },

    last_message: { type: String },
    last_message_at: { type: Date },

    // 🔥 ALL AUTOMATION DATA STORED HERE
    attributes: {
      type: Schema.Types.Mixed,
      default: {},
    },
  },
  { timestamps: true }
);

// one contact per channel + phone
ContactSchema.index({ channel_id: 1, phone: 1 }, { unique: true });

const Contact =
  mongoose.models.Contact ||
  mongoose.model<ContactDocument>("Contact", ContactSchema);

export default Contact;
