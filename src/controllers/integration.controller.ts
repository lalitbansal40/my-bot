import { Request, Response } from "express";
import Integration from "../models/integration.model";
import IntegrationApp from "../models/integrationApp.model";
import {
  INTEGRATION_REGISTRY,
  IntegrationDefinition,
  BUILTIN_TRIGGERS,
} from "../config/integration-registry";
import { AuthRequest } from "../types/auth.types";
import { dispatchIntegrationWebhook } from "../integrations/webhooks";

/* =====================================================
   REGISTRY-DERIVED VALIDATION
   Source of truth is MongoDB (IntegrationApp collection).
   Static registry is used only for seeding and validation fallback.
===================================================== */

const REGISTRY_MAP: Record<string, IntegrationDefinition> = Object.fromEntries(
  INTEGRATION_REGISTRY.map((app) => [app.slug, app])
);

const AVAILABLE_SLUGS = INTEGRATION_REGISTRY
  .filter((app) => app.available)
  .map((app) => app.slug);

const getRequiredFields = (slug: string) => {
  const app = REGISTRY_MAP[slug];
  if (!app) return { configFields: [], secretFields: [] };
  return {
    configFields: app.fields.filter((f) => !f.isSecret && f.required).map((f) => f.key),
    secretFields: app.fields.filter((f) => f.isSecret && f.required).map((f) => f.key),
  };
};

const getAllConfigKeys = (slug: string) => {
  const app = REGISTRY_MAP[slug];
  if (!app) return { configKeys: [], secretKeys: [] };
  return {
    configKeys: app.fields.filter((f) => !f.isSecret).map((f) => f.key),
    secretKeys: app.fields.filter((f) => f.isSecret).map((f) => f.key),
  };
};

const getIntegrationApps = async () => {
  const apps = await IntegrationApp.find().sort({ order: 1, name: 1 }).lean();
  return apps.length > 0 ? apps : INTEGRATION_REGISTRY;
};

/* =====================================================
   GUARD HELPERS
===================================================== */

const requireAdmin = (req: AuthRequest, res: Response): boolean => {
  if (!req.user?.account_id) {
    res.status(401).json({ message: "Unauthorized" });
    return false;
  }
  if (req.user?.role !== "admin") {
    res.status(403).json({ message: "Only admin can manage integrations" });
    return false;
  }
  return true;
};

const validateSlug = (slug: string, res: Response, requireAvailable = true): boolean => {
  if (!REGISTRY_MAP[slug]) {
    res.status(400).json({ message: `Unknown integration: ${slug}` });
    return false;
  }
  if (requireAvailable && !AVAILABLE_SLUGS.includes(slug)) {
    res.status(400).json({ message: `${REGISTRY_MAP[slug].name} is not yet available.` });
    return false;
  }
  return true;
};

const validateFields = (slug: string, body: Record<string, any>, res: Response): boolean => {
  const { configFields, secretFields } = getRequiredFields(slug);
  const allRequired = [...configFields, ...secretFields];
  const missing = allRequired.filter((f) => body[f] === undefined || body[f] === "");
  if (missing.length > 0) {
    res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    return false;
  }
  return true;
};

/* =====================================================
   GET /api/integrations/registry  — public app catalog (from DB)
===================================================== */
export const getRegistry = async (_req: AuthRequest, res: Response) => {
  try {
    const apps = await getIntegrationApps();
    const enriched = apps.map((app) => {
      if (app.slug === 'google_sheet' && process.env.GOOGLE_CLIENT_EMAIL) {
        return { ...app, connectInfo: process.env.GOOGLE_CLIENT_EMAIL };
      }
      return app;
    });
    return res.json({ registry: enriched });
  } catch (error) {
    console.error("getRegistry error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   GET /api/integrations/catalog?channel_id=...
   Returns the full app catalog enriched with per-channel
   `connected` status — used by automation builder palette.
===================================================== */
export const getCatalog = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const channelId = (req.query.channel_id as string) || undefined;

    const apps = await getIntegrationApps();

    const filter: Record<string, any> = { account_id: accountId, is_active: true };
    if (channelId) filter.channel_id = channelId;
    const connected = await Integration.find(filter).select("slug channel_id").lean();
    const connectedSlugs = new Set(connected.map((i) => i.slug));

    const enriched = apps.map((app) => ({
      ...app,
      connected: connectedSlugs.has(app.slug),
      ...(app.slug === "google_sheet" && process.env.GOOGLE_CLIENT_EMAIL
        ? { connectInfo: process.env.GOOGLE_CLIENT_EMAIL }
        : {}),
    }));

    return res.json({
      catalog: enriched,
      builtinTriggers: BUILTIN_TRIGGERS,
    });
  } catch (error) {
    console.error("getCatalog error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   GET /api/integrations/triggers/builtin
===================================================== */
export const getBuiltinTriggers = async (_req: AuthRequest, res: Response) => {
  return res.json({ triggers: BUILTIN_TRIGGERS });
};

/* =====================================================
   POST /api/integrations/webhook/:slug
   Generic webhook endpoint — any integration can post here.
   Handler-specific parsers (src/integrations/webhooks/) turn
   the payload into a normalized event and fire matching
   automations.
   NOTE: this route is unauthenticated by design (external
   services post to it). Each handler MUST verify signatures.
===================================================== */
export const integrationWebhook = async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const result = await dispatchIntegrationWebhook(slug, req);
    if (!result.ok) {
      return res.status(result.status || 400).json({ message: result.error });
    }
    return res.status(200).json({ ok: true, fired: result.fired ?? 0 });
  } catch (err: any) {
    console.error("integrationWebhook error:", err);
    return res.status(500).json({ message: err?.message || "Internal error" });
  }
};

/* =====================================================
   GET /api/integrations  — list all for account
===================================================== */
export const listIntegrations = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const filter: Record<string, any> = { account_id: accountId };
    if (req.query.channel_id) filter.channel_id = req.query.channel_id;

    const integrations = await Integration.find(filter).lean();
    return res.json({ integrations });
  } catch (error) {
    console.error("listIntegrations error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   GET /api/integrations/:slug  — get one by slug
===================================================== */
export const getIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const { slug } = req.params;
    if (!validateSlug(slug, res, false)) return;

    const filter: Record<string, any> = { account_id: accountId, slug };
    if (req.query.channel_id) filter.channel_id = req.query.channel_id;

    const integration = await Integration.findOne(filter).lean();
    if (!integration) return res.status(404).json({ message: "Integration not found" });

    return res.json({ integration });
  } catch (error) {
    console.error("getIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   POST /api/integrations  — create / upsert
   Body: { slug, channel_id, <field keys...> }
===================================================== */
export const createIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug, channel_id, ...rest } = req.body;

    if (!slug) return res.status(400).json({ message: "slug is required" });
    if (!channel_id) return res.status(400).json({ message: "channel_id is required" });
    if (!validateSlug(slug, res)) return;
    if (!validateFields(slug, rest, res)) return;

    const { configKeys, secretKeys } = getAllConfigKeys(slug);

    const resolvedConfig: Record<string, any> = {};
    for (const k of configKeys) {
      if (rest[k] !== undefined) resolvedConfig[k] = rest[k];
    }

    const resolvedSecrets: Record<string, any> = {};
    for (const k of secretKeys) {
      if (rest[k] !== undefined) resolvedSecrets[k] = rest[k];
    }

    const integration = await Integration.findOneAndUpdate(
      { account_id: accountId, channel_id, slug },
      {
        account_id: accountId,
        channel_id,
        slug,
        is_active: true,
        config: resolvedConfig,
        secrets: resolvedSecrets,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      message: "Integration saved successfully",
      integration: { ...integration.toObject(), secrets: undefined },
    });
  } catch (error) {
    console.error("createIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   PUT /api/integrations/:slug  — update config / secrets
   Body: { channel_id, config?, secrets? }
   For secret fields: omit key to keep existing value.
===================================================== */
export const updateIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;
    const { channel_id, config, secrets } = req.body;

    if (!channel_id) return res.status(400).json({ message: "channel_id is required" });
    if (!validateSlug(slug, res, false)) return;

    const existing = await Integration.findOne({ account_id: accountId, channel_id, slug }).select("+secrets");
    if (!existing) return res.status(404).json({ message: "Integration not found" });

    if (config && typeof config === "object") {
      existing.config = { ...existing.config, ...config };
    }
    if (secrets && typeof secrets === "object") {
      existing.secrets = { ...(existing.secrets || {}), ...secrets };
    }

    await existing.save();

    return res.json({
      message: "Integration updated successfully",
      integration: { ...existing.toObject(), secrets: undefined },
    });
  } catch (error) {
    console.error("updateIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   DELETE /api/integrations/:slug?channel_id=xxx
===================================================== */
export const deleteIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;
    const channel_id = req.query.channel_id || req.body?.channel_id;

    if (!validateSlug(slug, res, false)) return;

    const filter: Record<string, any> = { account_id: accountId, slug };
    if (channel_id) filter.channel_id = channel_id;

    const deleted = await Integration.findOneAndDelete(filter);
    if (!deleted) return res.status(404).json({ message: "Integration not found" });

    return res.json({ message: "Integration deleted successfully" });
  } catch (error) {
    console.error("deleteIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   PATCH /api/integrations/:slug/toggle
   Body: { channel_id }
===================================================== */
export const toggleIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;
    const { channel_id } = req.body;

    if (!channel_id) return res.status(400).json({ message: "channel_id is required" });
    if (!validateSlug(slug, res, false)) return;

    const integration = await Integration.findOne({ account_id: accountId, channel_id, slug });
    if (!integration) return res.status(404).json({ message: "Integration not found" });

    integration.is_active = !integration.is_active;
    await integration.save();

    return res.json({
      message: `Integration ${integration.is_active ? "enabled" : "disabled"} successfully`,
      is_active: integration.is_active,
    });
  } catch (error) {
    console.error("toggleIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   LEGACY — backward compat (no channel_id required)
===================================================== */
export const configureGoogleSheet = async (req: AuthRequest, res: Response) => {
  req.body = { ...req.body, slug: "google_sheet" };
  return createIntegration(req, res);
};

export const configureBorzo = async (req: AuthRequest, res: Response) => {
  const { auth_token, environment = "test", channel_id } = req.body;
  req.body = { slug: "borzo", auth_token, environment, channel_id };
  return createIntegration(req, res);
};

export const configureRazorpay = async (req: AuthRequest, res: Response) => {
  const { key_id, key_secret, environment = "test", channel_id } = req.body;
  req.body = { slug: "razorpay", key_id, key_secret, environment, channel_id };
  return createIntegration(req, res);
};
