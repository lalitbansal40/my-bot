import mongoose, { Schema, Document } from "mongoose";

export interface WsConnectionDocument extends Document {
  connectionId: string;
  accountId: string;
  callbackUrl: string;
  connectedAt: Date;
}

const WsConnectionSchema = new Schema<WsConnectionDocument>({
  connectionId: { type: String, required: true, unique: true },
  accountId: { type: String, required: true, index: true },
  callbackUrl: { type: String, required: true },
  connectedAt: { type: Date, default: Date.now },
});

// Auto-delete stale connections after 24 hours
WsConnectionSchema.index({ connectedAt: 1 }, { expireAfterSeconds: 86400 });

export const WsConnection =
  mongoose.models.WsConnection ||
  mongoose.model<WsConnectionDocument>("WsConnection", WsConnectionSchema);
