import IntegrationApp from "../models/integrationApp.model";
import { INTEGRATION_REGISTRY } from "../config/integration-registry";

/**
 * Upserts all apps from INTEGRATION_REGISTRY into MongoDB.
 * Safe to call on every startup — uses upsert so existing records are updated.
 */
export async function seedIntegrationApps(): Promise<void> {
  try {
    const ops = INTEGRATION_REGISTRY.map((app) => ({
      updateOne: {
        filter: { slug: app.slug },
        update: { $set: app },
        upsert: true,
      },
    }));

    await IntegrationApp.bulkWrite(ops, { ordered: false });
    console.log(`✅ IntegrationApps seeded (${INTEGRATION_REGISTRY.length} apps)`);
  } catch (err) {
    console.error("❌ Failed to seed IntegrationApps:", err);
  }
}
