import { Router } from "express";
import {
  getRegistry,
  getCatalog,
  getBuiltinTriggers,
  integrationWebhook,
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
   PUBLIC / WEBHOOK ROUTES — must be before /:slug to
   avoid the dynamic param shadowing them.
===================================================== */

// GET /api/integrations/registry — full app catalog (no auth needed)
router.get("/registry", getRegistry);

// GET /api/integrations/triggers/builtin — built-in triggers
router.get("/triggers/builtin", getBuiltinTriggers);

// POST /api/integrations/webhook/:slug — external webhook receiver
router.post("/webhook/:slug", integrationWebhook);

// GET /api/integrations/catalog — channel-aware catalog (auth)
router.get("/catalog", authMiddleware, getCatalog);

/* =====================================================
   CRUD — account + channel level integration management
===================================================== */

// GET  /api/integrations              — list all (optionally ?channel_id=)
router.get("/", authMiddleware, listIntegrations);

// GET  /api/integrations/:slug        — get one (?channel_id=)
router.get("/:slug", authMiddleware, getIntegration);

// POST /api/integrations              — create / upsert  { slug, channel_id, ...fields }
router.post("/", authMiddleware, createIntegration);

// PUT  /api/integrations/:slug        — update  { channel_id, config?, secrets? }
router.put("/:slug", authMiddleware, updateIntegration);

// DELETE /api/integrations/:slug      — delete  (?channel_id=)
router.delete("/:slug", authMiddleware, deleteIntegration);

// PATCH /api/integrations/:slug/toggle — toggle is_active  { channel_id }
router.patch("/:slug/toggle", authMiddleware, toggleIntegration);

/* =====================================================
   LEGACY — backward compat
===================================================== */
router.post("/google-sheet", authMiddleware, configureGoogleSheet);
router.post("/borzo", authMiddleware, configureBorzo);
router.post("/razorpay", authMiddleware, configureRazorpay);

export default router;
