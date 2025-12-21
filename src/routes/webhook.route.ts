import { Router } from "express";
import {
  verifyWebhook,
  receiveMessage,
  recievePayment,
} from "../controllers/webhook.controller";

const router = Router();

router.get("/", verifyWebhook);
router.post("/", receiveMessage);
router.post("/payment",recievePayment)

export default router;
