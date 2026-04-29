import express from "express";
import {
  getMessagesByContact,
  markMessagesAsRead,
  sendMediaMessage,
  sendTextMessage,
} from "../controllers/message.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { subscriptionGuard } from "../middlewares/subcription.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = express.Router();

router.get("/:contactId", authMiddleware, getMessagesByContact);
router.post("/send-text", authMiddleware, subscriptionGuard, sendTextMessage);
router.put(
  "/read/:contactId",
  authMiddleware,
  subscriptionGuard,
  markMessagesAsRead,
);
router.post(
  "/send-media",
  authMiddleware,
  subscriptionGuard,
  upload.array("files", 3), // max 10 files
  sendMediaMessage,
);

export default router;
