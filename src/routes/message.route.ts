import express from "express";
import { getMessagesByContact } from "../controllers/message.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = express.Router();

router.get("/:contactId",authMiddleware, getMessagesByContact);

export default router;