import express from "express";
import {
  createContact,
  getContactById,
  getContactsByChannel,
  importContacts,
  exportContacts,
  updateContact,
} from "../controllers/contact.controller";
import { authMiddleware } from "../middlewares/auth.middleware";
import { upload } from "../middlewares/upload.middleware";
import { contactUpload } from "../utils/fileImport";

const router = express.Router();

// 🔽 Import contacts (CSV upload)
router.post(
  "/import/:channelId",
  authMiddleware,
  contactUpload.single("file"),
  importContacts
);

// 🔽 Export contacts (CSV download)
router.get(
  "/export/:channelId",
  authMiddleware,
  exportContacts
);

// 🔽 CRUD
router.get("/:channelId", authMiddleware, getContactsByChannel);
router.post("/:channelId", authMiddleware, createContact);
router.patch("/:contactId", authMiddleware, updateContact);
router.get("/details/:contactId", authMiddleware, getContactById);

export default router;