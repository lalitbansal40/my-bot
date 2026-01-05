import mongoose, { Schema, Document } from "mongoose";

export type PaymentStatus = "pending" | "paid" | "expired" | "cancelled";
export type PlanType = "TRIAL" | "MONTHLY" | "YEARLY";

export interface UserDocument extends Document {
  email: string;
  phone: string;
  password: string;
  is_active: boolean;

  subscription?: {
    plan: PlanType;
    payment_status: PaymentStatus;
    payment_id?: string;
    amount?: number | string;
    payment_start_date?: Date;
    payment_end_date?: Date;
    is_active: boolean;
  };

  createdAt: Date;
  updatedAt: Date;
}

const UserSchema = new Schema<UserDocument>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
    },

    phone: {
      type: String,
      required: true,
      unique: true,
      index: true,
    },

    password: {
      type: String,
      required: true,
    },

    is_active: {
      type: Boolean,
      default: true,
    },

    // 🔥 EMBEDDED SUBSCRIPTION (MATCHING YOUR JSON)
    subscription: {
      plan: {
        type: String,
        enum: ["TRIAL", "MONTHLY", "YEARLY"],
        default: "TRIAL",
      },

      payment_status: {
        type: String,
        enum: ["pending", "paid", "expired", "cancelled"],
        default: "pending",
      },

      payment_id: { type: String },

      amount: { type: Schema.Types.Mixed },

      payment_start_date: { type: Date },

      payment_end_date: { type: Date },

      is_active: {
        type: Boolean,
        default: false,
      },
    },
  },
  { timestamps: true }
);

const User =
  mongoose.models.User || mongoose.model<UserDocument>("User", UserSchema);

export default User;
