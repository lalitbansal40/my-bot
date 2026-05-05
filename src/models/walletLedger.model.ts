import mongoose, { Schema, Document } from "mongoose";

export type WalletLedgerStatus = "HELD" | "CAPTURED" | "RELEASED";
export type WalletLedgerType = "TEMPLATE_MESSAGE";

export interface WalletLedgerDocument extends Document {
  account_id: mongoose.Types.ObjectId;
  channel_id?: mongoose.Types.ObjectId;
  contact_id?: mongoose.Types.ObjectId;
  message_id?: mongoose.Types.ObjectId;
  wa_message_id?: string;
  type: WalletLedgerType;
  status: WalletLedgerStatus;
  currency: string;
  amount: number;
  template_amount: number;
  commission_amount: number;
  commission_percent: number;
  meta_payer: "customer" | "platform";
  template_name?: string;
  template_category?: string;
  reason?: string;
  capturedAt?: Date;
  releasedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const WalletLedgerSchema = new Schema<WalletLedgerDocument>(
  {
    account_id: { type: Schema.Types.ObjectId, required: true, index: true },
    channel_id: { type: Schema.Types.ObjectId, ref: "Channel", index: true },
    contact_id: { type: Schema.Types.ObjectId, ref: "Contact", index: true },
    message_id: {
      type: Schema.Types.ObjectId,
      ref: "Message",
      unique: true,
      sparse: true,
      index: true,
    },
    wa_message_id: { type: String, index: true },
    type: {
      type: String,
      enum: ["TEMPLATE_MESSAGE"],
      required: true,
    },
    status: {
      type: String,
      enum: ["HELD", "CAPTURED", "RELEASED"],
      required: true,
      index: true,
    },
    currency: { type: String, default: "INR" },
    amount: { type: Number, required: true },
    template_amount: { type: Number, default: 0 },
    commission_amount: { type: Number, default: 0 },
    commission_percent: { type: Number, default: 0 },
    meta_payer: {
      type: String,
      enum: ["customer", "platform"],
      required: true,
    },
    template_name: String,
    template_category: String,
    reason: String,
    capturedAt: Date,
    releasedAt: Date,
  },
  { timestamps: true }
);

export const WalletLedger =
  mongoose.models.WalletLedger ||
  mongoose.model<WalletLedgerDocument>("WalletLedger", WalletLedgerSchema);
