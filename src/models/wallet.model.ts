import mongoose, { Schema, Document } from "mongoose";

export type MetaPayer = "customer" | "platform";

export interface WalletDocument extends Document {
  account_id: mongoose.Types.ObjectId;
  currency: string;
  balance: number;
  hold_balance: number;
  credit_limit: number;
  meta_payer: MetaPayer;
  commission_enabled: boolean;
  commission_percent: number;
  template_rates: Record<string, number>;
  meta_rate_card_url?: string;
  default_market: string;
  createdAt: Date;
  updatedAt: Date;
}

const WalletSchema = new Schema<WalletDocument>(
  {
    account_id: {
      type: Schema.Types.ObjectId,
      required: true,
      unique: true,
      index: true,
    },
    currency: { type: String, default: "INR" },
    balance: { type: Number, default: 0 },
    hold_balance: { type: Number, default: 0 },
    credit_limit: { type: Number, default: 100 },
    meta_payer: {
      type: String,
      enum: ["customer", "platform"],
      default: "customer",
    },
    commission_enabled: { type: Boolean, default: true },
    commission_percent: { type: Number, default: 10 },
    template_rates: {
      type: Map,
      of: Number,
      default: {
        MARKETING: 0,
        UTILITY: 0,
        AUTHENTICATION: 0,
        SERVICE: 0,
      },
    },
    meta_rate_card_url: String,
    default_market: { type: String, default: "India" },
  },
  { timestamps: true }
);

export const Wallet =
  mongoose.models.Wallet ||
  mongoose.model<WalletDocument>("Wallet", WalletSchema);
