import { Router } from "express";
import {
  listIntegrations,
  getIntegration,
  createIntegration,
  updateIntegration,
  deleteIntegration,
  toggleIntegration,
  // legacy
  configureBorzo,
  configureGoogleSheet,
  configureRazorpay,
} from "../controllers/integration.controller";
import { authMiddleware } from "../middlewares/auth.middleware";

const router = Router();

/* =====================================================
   CRUD — account-level integration management
===================================================== */

// GET  /api/integrations          — list all for account
router.get("/", authMiddleware, listIntegrations);

// GET  /api/integrations/:slug    — get one
router.get("/:slug", authMiddleware, getIntegration);

// POST /api/integrations          — create / upsert  { slug, ...fields }
router.post("/", authMiddleware, createIntegration);

// PUT  /api/integrations/:slug    — partial update   { config?, secrets? }
router.put("/:slug", authMiddleware, updateIntegration);

// DELETE /api/integrations/:slug  — hard delete
router.delete("/:slug", authMiddleware, deleteIntegration);

// PATCH /api/integrations/:slug/toggle — toggle is_active
router.patch("/:slug/toggle", authMiddleware, toggleIntegration);

/* =====================================================
   LEGACY — backward compat
===================================================== */
router.post("/google-sheet", authMiddleware, configureGoogleSheet);
router.post("/borzo", authMiddleware, configureBorzo);
router.post("/razorpay", authMiddleware, configureRazorpay);

export default router;
