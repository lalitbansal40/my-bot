import express from "express";
import { getContactsByChannel } from "../controllers/contact.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/:channelId", authMiddleware, getContactsByChannel);

export default router;