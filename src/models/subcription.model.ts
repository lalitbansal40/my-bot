import mongoose, { Schema, Document } from "mongoose";

export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled";

export interface SubscriptionDocument extends Document {
  user_id: mongoose.Types.ObjectId;

  payment_status: PaymentStatus;
  plan_name: string;

  payment_start_date?: Date;
  payment_end_date?: Date;

  is_active: boolean;

  createdAt: Date;
  updatedAt: Date;
}

const SubscriptionSchema = new Schema<SubscriptionDocument>(
  {
    user_id: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    plan_name: {
      type: String,
      default: "basic",
    },

    payment_status: {
      type: String,
      enum: ["pending", "paid", "expired", "cancelled"],
      default: "pending",
    },

    payment_start_date: { type: Date },
    payment_end_date: { type: Date },

    is_active: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

const Subscription =
  mongoose.models.Subscription ||
  mongoose.model<SubscriptionDocument>(
    "Subscription",
    SubscriptionSchema
  );

export default Subscription;
