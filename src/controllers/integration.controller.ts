import { Response } from "express";
import Integration, { IntegrationSlug } from "../models/integration.model";
import { AuthRequest } from "../types/auth.types";

/* =====================================================
   VALIDATION MAP — required fields per slug
===================================================== */
const SLUG_VALIDATION: Record<
  IntegrationSlug,
  { configFields: string[]; secretFields: string[] }
> = {
  google_sheet: { configFields: [], secretFields: [] },
  razorpay: {
    configFields: ["key_id", "environment"],
    secretFields: ["key_secret"],
  },
  borzo: {
    configFields: ["environment"],
    secretFields: ["auth_token"],
  },
  shiprocket: {
    configFields: ["email"],
    secretFields: ["password"],
  },
};

const VALID_SLUGS = Object.keys(SLUG_VALIDATION) as IntegrationSlug[];

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

const validateSlug = (slug: string, res: Response): slug is IntegrationSlug => {
  if (!VALID_SLUGS.includes(slug as IntegrationSlug)) {
    res.status(400).json({
      message: `Invalid integration slug. Valid slugs: ${VALID_SLUGS.join(", ")}`,
    });
    return false;
  }
  return true;
};

const validateFields = (
  slug: IntegrationSlug,
  body: Record<string, any>,
  res: Response
): boolean => {
  const { configFields, secretFields } = SLUG_VALIDATION[slug];
  const allRequired = [...configFields, ...secretFields];
  const missing = allRequired.filter((f) => body[f] === undefined || body[f] === "");
  if (missing.length > 0) {
    res.status(400).json({ message: `Missing required fields: ${missing.join(", ")}` });
    return false;
  }
  return true;
};

/* =====================================================
   GET /api/integrations — list all for account
===================================================== */
export const listIntegrations = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const integrations = await Integration.find({ account_id: accountId }).lean();

    return res.json({ integrations });
  } catch (error) {
    console.error("listIntegrations error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   GET /api/integrations/:slug — get one by slug
===================================================== */
export const getIntegration = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const { slug } = req.params;
    if (!validateSlug(slug, res)) return;

    const integration = await Integration.findOne({
      account_id: accountId,
      slug,
    }).lean();

    if (!integration) {
      return res.status(404).json({ message: "Integration not found" });
    }

    return res.json({ integration });
  } catch (error) {
    console.error("getIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   POST /api/integrations — create / upsert
===================================================== */
export const createIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug, config = {}, secrets = {}, ...rest } = req.body;

    if (!validateSlug(slug, res)) return;

    const merged = { ...config, ...secrets, ...rest };
    if (!validateFields(slug, merged, res)) return;

    const { configFields, secretFields } = SLUG_VALIDATION[slug];

    const resolvedConfig: Record<string, any> = {};
    for (const f of configFields) {
      if (merged[f] !== undefined) resolvedConfig[f] = merged[f];
    }

    const resolvedSecrets: Record<string, any> = {};
    for (const f of secretFields) {
      if (merged[f] !== undefined) resolvedSecrets[f] = merged[f];
    }

    const integration = await Integration.findOneAndUpdate(
      { account_id: accountId, slug },
      {
        account_id: accountId,
        slug,
        is_active: true,
        config: resolvedConfig,
        secrets: resolvedSecrets,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    return res.status(201).json({
      message: "Integration created successfully",
      integration: { ...integration.toObject(), secrets: undefined },
    });
  } catch (error) {
    console.error("createIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   PUT /api/integrations/:slug — update config / secrets
===================================================== */
export const updateIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;

    if (!validateSlug(slug, res)) return;

    const existing = await Integration.findOne({ account_id: accountId, slug }).select("+secrets");
    if (!existing) {
      return res.status(404).json({ message: "Integration not found. Create it first." });
    }

    const { config, secrets } = req.body;

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
   DELETE /api/integrations/:slug — hard delete
===================================================== */
export const deleteIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;

    if (!validateSlug(slug, res)) return;

    const deleted = await Integration.findOneAndDelete({ account_id: accountId, slug });

    if (!deleted) {
      return res.status(404).json({ message: "Integration not found" });
    }

    return res.json({ message: "Integration deleted successfully" });
  } catch (error) {
    console.error("deleteIntegration error:", error);
    return res.status(500).json({ message: "Internal server error" });
  }
};

/* =====================================================
   PATCH /api/integrations/:slug/toggle — toggle is_active
===================================================== */
export const toggleIntegration = async (req: AuthRequest, res: Response) => {
  try {
    if (!requireAdmin(req, res)) return;

    const accountId = req.user!.account_id;
    const { slug } = req.params;

    if (!validateSlug(slug, res)) return;

    const integration = await Integration.findOne({ account_id: accountId, slug });

    if (!integration) {
      return res.status(404).json({ message: "Integration not found" });
    }

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
   LEGACY — kept for backward compatibility
===================================================== */
export const configureGoogleSheet = async (req: AuthRequest, res: Response) => {
  req.body = { slug: "google_sheet" };
  return createIntegration(req, res);
};

export const configureBorzo = async (req: AuthRequest, res: Response) => {
  const { auth_token, environment = "test" } = req.body;
  req.body = { slug: "borzo", auth_token, environment };
  return createIntegration(req, res);
};

export const configureRazorpay = async (req: AuthRequest, res: Response) => {
  const { key_id, key_secret, environment = "test" } = req.body;
  req.body = { slug: "razorpay", key_id, key_secret, environment };
  return createIntegration(req, res);
};
