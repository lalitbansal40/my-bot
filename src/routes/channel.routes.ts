import { Router } from "express";
import { createChannel } from "../controllers/channel.controller";
import { subscriptionGuard } from "../middlewares/subcription.middleware";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

/**
 * POST /api/channels
 * Protected + Subscription required
 */
router.post(
  "/",
  authMiddleware,
  subscriptionGuard,
  createChannel
);

export default router;
