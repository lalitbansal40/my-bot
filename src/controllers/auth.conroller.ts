import { Request, Response } from "express";
import User from "../models/user.model";
import Subscription from "../models/subcription.model";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(".env") });
export const register = async (req:Request, res:Response) => {
  const { email, phone, password } = req.body;

  if (!email || !phone || !password) {
    return res.status(400).json({
      message: "Email, phone and password are required",
    });
  }

  const existingUser = await User.findOne({
    $or: [{ email }, { phone }],
  });

  if (existingUser) {
    return res.status(400).json({
      message: "Email or phone already registered",
    });
  }

  const user = await User.create({
    email,
    phone,
    password,
  });

  await Subscription.create({
    user_id: user._id,
    payment_status: "pending",
    is_active: false,
  });

  return res.json({
    message: "Registered successfully",
  });
};


export const login = async (req: Request, res: Response) => {
  try {
    const { email, phone, password } = req.body;

    if ((!email && !phone) || !password) {
      return res.status(400).json({
        message: "Email or phone and password are required",
      });
    }

    // 🔍 find user by email OR phone
    const user = await User.findOne({
      $or: [
        email ? { email } : {},
        phone ? { phone } : {},
      ],
    });

    if (!user) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // 🔐 compare password
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({
        message: "Invalid credentials",
      });
    }

    // 🎟 JWT token
    const token = jwt.sign(
      { user_id: user._id },
      process.env.JWT_SECRET as string,
      { expiresIn: "7d" }
    );

    return res.json({
      token,
      user: {
        id: user._id,
        email: user.email,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    return res.status(500).json({
      message: "Something went wrong",
    });
  }
};
