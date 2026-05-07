import { MetaRateCard } from "../models/metaRateCard.model";
import {
  CURRENCY_OVERRIDES,
  FX_FROM_USD,
  META_MARKETS,
  USD_BASELINE,
  type CategoryRate,
} from "./metaRateCardData";

const CATEGORIES: Array<keyof CategoryRate> = [
  "MARKETING",
  "UTILITY",
  "AUTHENTICATION",
];

const toMinorUnits = (value: number) => {
  if (!Number.isFinite(value) || value <= 0) return 0;
  // Match the convention used in metaPricing.service.ts (Math.ceil to avoid
  // under-charging on fractional sub-units).
  return Math.ceil(value * 100);
};

/**
 * Seeds the `metaratecards` collection with rate card data for every
 * (currency × market × category) combination defined in metaRateCardData.ts.
 *
 * - Idempotent: uses bulkWrite with upsert on the unique compound index
 *   (currency, market, category), so calling it repeatedly is safe.
 * - Non-destructive: existing rates are overwritten by the seed values, which
 *   is intentional. If you have manually-tuned rates you want to preserve,
 *   pass `{ skipExisting: true }`.
 */
export async function seedMetaRateCard(
  options: { skipExisting?: boolean; currencies?: string[] } = {}
): Promise<{ inserted: number; skipped: number }> {
  const { skipExisting = false, currencies } = options;
  const targetCurrencies = currencies?.length
    ? currencies.map((c) => c.toUpperCase())
    : Object.keys(FX_FROM_USD);

  const fetchedAt = new Date();
  const sourceUrl = "seed://metaRateCardData.ts";

  const ops: any[] = [];
  let skipped = 0;

  for (const currency of targetCurrencies) {
    const fx = FX_FROM_USD[currency];
    if (!fx) {
      console.warn(`⚠️  Skipping unknown currency: ${currency}`);
      continue;
    }

    for (const market of META_MARKETS) {
      const baseline = USD_BASELINE[market];
      const override: Partial<CategoryRate> =
        CURRENCY_OVERRIDES[currency]?.[market] ?? {};

      for (const category of CATEGORIES) {
        const overrideValue = override[category];
        const decimal =
          overrideValue !== undefined ? overrideValue : baseline[category] * fx;

        const rate = toMinorUnits(decimal);
        if (rate <= 0) {
          skipped += 1;
          continue;
        }

        const filter = { currency, market, category };
        const update = skipExisting
          ? {
              $setOnInsert: {
                rate,
                source_url: sourceUrl,
                fetchedAt,
              },
            }
          : {
              $set: {
                rate,
                source_url: sourceUrl,
                fetchedAt,
              },
            };

        ops.push({
          updateOne: {
            filter,
            update,
            upsert: true,
          },
        });
      }
    }
  }

  if (ops.length === 0) {
    return { inserted: 0, skipped };
  }

  const result = await MetaRateCard.bulkWrite(ops, { ordered: false });
  const inserted =
    (result.upsertedCount || 0) + (result.modifiedCount || 0);
  console.log(
    `✅ MetaRateCard seeded: ${inserted} rows touched ` +
      `(upserted=${result.upsertedCount || 0}, modified=${result.modifiedCount || 0}, skipped=${skipped})`
  );
  return { inserted, skipped };
}
