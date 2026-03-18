import express from "express";
import { createContact, getContactsByChannel } from "../controllers/contact.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/:channelId", authMiddleware, getContactsByChannel);
router.post("/:channelId", authMiddleware, createContact);


export default router;