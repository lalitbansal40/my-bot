/**
 * CLI runner for populating the `metaratecards` MongoDB collection.
 *
 * Usage
 * -----
 *   # 1. Hardcoded seed (uses metaRateCardData.ts) — fastest to get started:
 *   npm run seed:meta-rates
 *
 *   # 2. Sync live from Meta's official CSV(s) — set this in .env:
 *   #    META_RATE_CARD_URLS={"INR":"https://...inr.csv","USD":"https://...usd.csv"}
 *   npm run seed:meta-rates -- --sync
 *
 *   # 3. Restrict to specific currencies:
 *   npm run seed:meta-rates -- --currency=INR,USD
 *
 *   # 4. Don't overwrite existing rows (insert-only):
 *   npm run seed:meta-rates -- --skip-existing
 *
 * Exit codes:
 *   0 = success, 1 = failure
 */

import dotenv from "dotenv";
import mongoose from "mongoose";

import { connectMongo } from "../database/mongodb";
import { seedMetaRateCard } from "../database/seedMetaRateCard";
import { syncMetaRateCard } from "../services/metaPricing.service";

dotenv.config();

type Args = {
  sync: boolean;
  skipExisting: boolean;
  currencies?: string[];
};

const parseArgs = (): Args => {
  const args: Args = { sync: false, skipExisting: false };
  for (const raw of process.argv.slice(2)) {
    if (raw === "--sync") args.sync = true;
    else if (raw === "--skip-existing") args.skipExisting = true;
    else if (raw.startsWith("--currency=")) {
      args.currencies = raw
        .slice("--currency=".length)
        .split(",")
        .map((c) => c.trim().toUpperCase())
        .filter(Boolean);
    }
  }
  return args;
};

const parseUrlMap = (): Record<string, string> => {
  const raw = process.env.META_RATE_CARD_URLS;
  if (!raw) {
    // Backwards-compat with the original single-URL env vars.
    const single =
      process.env.META_RATE_CARD_URL || process.env.META_INR_RATE_CARD_URL;
    return single ? { INR: single } : {};
  }
  try {
    const parsed = JSON.parse(raw);
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === "string" && v.trim()) out[k.toUpperCase()] = v.trim();
    }
    return out;
  } catch (err) {
    console.error(
      "❌ META_RATE_CARD_URLS is not valid JSON. Expected: {\"INR\":\"...\",\"USD\":\"...\"}"
    );
    return {};
  }
};

const runSync = async (urls: Record<string, string>, filter?: string[]) => {
  const targets = filter
    ? Object.entries(urls).filter(([cur]) => filter.includes(cur))
    : Object.entries(urls);

  if (targets.length === 0) {
    console.warn("⚠️  No currency URLs to sync after applying --currency filter.");
    return { inserted: 0 };
  }

  let total = 0;
  for (const [currency, sourceUrl] of targets) {
    console.log(`⏳ Syncing ${currency} from ${sourceUrl} ...`);
    try {
      const result = await syncMetaRateCard({ sourceUrl, currency });
      console.log(`   ✅ ${currency}: ${result.count} rows`);
      total += result.count;
    } catch (err: any) {
      console.error(`   ❌ ${currency} sync failed:`, err?.message || err);
    }
  }
  return { inserted: total };
};

const main = async () => {
  const args = parseArgs();
  const urls = parseUrlMap();

  await connectMongo();

  try {
    if (args.sync) {
      if (Object.keys(urls).length === 0) {
        console.error(
          "❌ --sync requested but META_RATE_CARD_URLS / META_RATE_CARD_URL not set in env."
        );
        process.exitCode = 1;
        return;
      }
      const { inserted } = await runSync(urls, args.currencies);
      console.log(`🎉 Live sync complete. ${inserted} rows.`);
    } else {
      const { inserted, skipped } = await seedMetaRateCard({
        skipExisting: args.skipExisting,
        currencies: args.currencies,
      });
      console.log(
        `🎉 Seed complete. inserted/updated=${inserted} skipped=${skipped}`
      );
    }
  } catch (err: any) {
    console.error("❌ runSeedMetaRateCard failed:", err?.message || err);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => undefined);
  }
};

main();
