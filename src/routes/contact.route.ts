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
import { contactUpload } from "../utils/fileImport";

const router = express.Router();

// ================= 🔥 IMPORT / EXPORT =================

// Import contacts (CSV upload)
router.post(
  "/import/:channelId",
  authMiddleware,
  contactUpload.single("file"),
  importContacts
);

// Export contacts (CSV download)
router.get(
  "/export/:channelId",
  authMiddleware,
  exportContacts
);

// ================= 🔥 SPECIFIC ROUTES =================

// Get contact by ID (⚠️ must be above /:channelId)
router.get(
  "/details/:contactId",
  authMiddleware,
  getContactById
);

// Update contact
router.patch(
  "/:contactId",
  authMiddleware,
  updateContact
);

// ================= 🔥 GENERIC ROUTES =================

// Get contacts by channel (⚠️ keep this last)
router.get(
  "/:channelId",
  authMiddleware,
  getContactsByChannel
);

// Create contact
router.post(
  "/:channelId",
  authMiddleware,
  createContact
);

export default router;