import express from "express";
import {
  getAutomations,
  toggleAutomationStatus,
  deleteAutomation,
  getAutomationById,
} from "../controllers/automation.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { subscriptionGuard } from "../middlewares/subcription.middleware";

const router = express.Router();

// ✅ GET ALL (with filter)
router.get("/", authMiddleware, subscriptionGuard, getAutomations);
router.get("/:id", authMiddleware, subscriptionGuard, getAutomationById);


// ▶️ ⏸ TOGGLE
router.patch(
  "/:id/toggle",
  authMiddleware,
  subscriptionGuard,
  toggleAutomationStatus,
);

// 🗑 DELETE
router.delete("/:id", authMiddleware, subscriptionGuard, deleteAutomation);

export default router;
