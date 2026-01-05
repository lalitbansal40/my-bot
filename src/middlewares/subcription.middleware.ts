import { Request, Response, NextFunction } from "express";
import User from "../models/user.model";
import mongoose from "mongoose";

export const subscriptionGuard = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const userId = (req.user as any)?.user_id;

  if (!userId) {
    return res.status(401).json({ message: "Unauthorized" });
  }
  
  const user = await User.findOne({
    _id: new mongoose.Types.ObjectId(userId),
    is_active: true,
    "subscription.is_active": true,
    "subscription.payment_status": "paid",
    "subscription.payment_end_date": { $gte: new Date() },
  });
  if (!user) {
    return res.status(403).json({
      message: "Subscription inactive or expired",
    });
  }

  next();
};
