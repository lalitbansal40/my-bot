import mongoose, { Schema, Document } from "mongoose";

export interface MetaRateCardDocument extends Document {
  currency: string;
  market: string;
  category: string;
  rate: number;
  source_url: string;
  effectiveAt?: Date;
  fetchedAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MetaRateCardSchema = new Schema<MetaRateCardDocument>(
  {
    currency: { type: String, required: true, index: true },
    market: { type: String, required: true, index: true },
    category: { type: String, required: true, index: true },
    rate: { type: Number, required: true },
    source_url: { type: String, required: true },
    effectiveAt: Date,
    fetchedAt: { type: Date, required: true, default: Date.now },
  },
  { timestamps: true }
);

MetaRateCardSchema.index(
  { currency: 1, market: 1, category: 1 },
  { unique: true }
);

export const MetaRateCard =
  mongoose.models.MetaRateCard ||
  mongoose.model<MetaRateCardDocument>("MetaRateCard", MetaRateCardSchema);
