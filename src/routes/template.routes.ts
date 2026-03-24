import { Router } from "express";
import {
  createTemplate,
  deleteTemplate,
  getTemplateById,
  getTemplates,
  sendTemplate,
  updateTemplate,
  uploadMediaController,
} from "../controllers/template.controller";

import { authMiddleware } from "../middlewares/auth.middleware";
import { subscriptionGuard } from "../middlewares/subcription.middleware";
import { upload } from "../middlewares/upload.middleware";

const router = Router();

/**
 * 🔐 Apply middlewares globally (BEST PRACTICE)
 */
router.use(authMiddleware, subscriptionGuard);

/**
 * 📁 MEDIA UPLOAD
 */
router.post(
  "/upload-media/:channelId",
  upload.single("file"),
  uploadMediaController
);

/**
 * 📄 TEMPLATE CRUD
 */

// ✅ Get all templates
router.get("/:channelId", getTemplates);

// ✅ Get single template
router.get("/:channelId/:templateId", getTemplateById);

// ✅ Create template
router.post("/:channelId", createTemplate);
router.post("/send-template/:channelId", sendTemplate);

// ✅ Update template (recreate)
router.put("/:channelId/:templateId", updateTemplate);

// ✅ Delete template
router.delete("/:channelId/:templateId", deleteTemplate);

export default router;