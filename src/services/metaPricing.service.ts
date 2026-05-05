import axios from "axios";
import XLSX from "xlsx";
import { MetaRateCard } from "../models/metaRateCard.model";

const CATEGORY_ALIASES: Record<string, string[]> = {
  MARKETING: ["marketing"],
  UTILITY: ["utility"],
  AUTHENTICATION: ["authentication", "authentication-international"],
  SERVICE: ["service"],
};

const PHONE_MARKETS: { prefix: string; market: string; fallback?: string }[] = [
  // Meta exact markets
  { prefix: "91", market: "India", fallback: "Rest of Asia Pacific" },
  { prefix: "1", market: "North America", fallback: "North America" },
  { prefix: "972", market: "Israel", fallback: "Rest of Middle East" },
  { prefix: "971", market: "United Arab Emirates", fallback: "Rest of Middle East" },
  { prefix: "966", market: "Saudi Arabia", fallback: "Rest of Middle East" },
  { prefix: "44", market: "United Kingdom", fallback: "Rest of Western Europe" },
  { prefix: "33", market: "France", fallback: "Rest of Western Europe" },
  { prefix: "49", market: "Germany", fallback: "Rest of Western Europe" },
  { prefix: "39", market: "Italy", fallback: "Rest of Western Europe" },
  { prefix: "34", market: "Spain", fallback: "Rest of Western Europe" },
  { prefix: "31", market: "Netherlands", fallback: "Rest of Western Europe" },
  { prefix: "52", market: "Mexico", fallback: "Rest of Latin America" },
  { prefix: "54", market: "Argentina", fallback: "Rest of Latin America" },
  { prefix: "55", market: "Brazil", fallback: "Rest of Latin America" },
  { prefix: "56", market: "Chile", fallback: "Rest of Latin America" },
  { prefix: "57", market: "Colombia", fallback: "Rest of Latin America" },
  { prefix: "51", market: "Peru", fallback: "Rest of Latin America" },
  { prefix: "20", market: "Egypt", fallback: "Rest of Africa" },
  { prefix: "234", market: "Nigeria", fallback: "Rest of Africa" },
  { prefix: "27", market: "South Africa", fallback: "Rest of Africa" },
  { prefix: "62", market: "Indonesia", fallback: "Rest of Asia Pacific" },
  { prefix: "60", market: "Malaysia", fallback: "Rest of Asia Pacific" },
  { prefix: "92", market: "Pakistan", fallback: "Rest of Asia Pacific" },
  { prefix: "90", market: "Turkey", fallback: "Rest of Middle East" },
  { prefix: "7", market: "Russia", fallback: "Rest of Central & Eastern Europe" },

  // Rest of Asia Pacific
  { prefix: "61", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "64", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "65", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "66", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "81", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "82", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "84", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "86", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "852", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "853", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "855", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "856", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "880", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "886", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "93", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "94", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "95", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "960", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "975", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "976", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "977", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },

  // Rest of Middle East
  { prefix: "962", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "963", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "964", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "965", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "967", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "968", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "970", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "973", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "974", market: "Rest of Middle East", fallback: "Rest of Middle East" },
  { prefix: "98", market: "Rest of Middle East", fallback: "Rest of Middle East" },

  // Rest of Western Europe
  { prefix: "30", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "32", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "351", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "352", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "353", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "354", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "356", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "357", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "358", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "359", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "36", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "40", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "41", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "43", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "45", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "46", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "47", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },
  { prefix: "48", market: "Rest of Western Europe", fallback: "Rest of Western Europe" },

  // Rest of Central & Eastern Europe
  { prefix: "355", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "370", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "371", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "372", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "373", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "374", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "375", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "380", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "381", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "382", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "383", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "385", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "386", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "387", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },
  { prefix: "389", market: "Rest of Central & Eastern Europe", fallback: "Rest of Central & Eastern Europe" },

  // Rest of Latin America
  { prefix: "502", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "503", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "504", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "505", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "506", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "507", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "509", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "53", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "58", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "591", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "593", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "595", market: "Rest of Latin America", fallback: "Rest of Latin America" },
  { prefix: "598", market: "Rest of Latin America", fallback: "Rest of Latin America" },

  // Rest of Africa
  { prefix: "211", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "212", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "213", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "216", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "218", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "220", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "221", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "222", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "223", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "224", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "225", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "226", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "227", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "228", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "229", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "230", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "231", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "232", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "233", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "235", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "236", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "237", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "238", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "239", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "240", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "241", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "242", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "243", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "244", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "245", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "246", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "248", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "249", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "250", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "251", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "252", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "253", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "254", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "255", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "256", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "257", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "258", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "260", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "261", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "262", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "263", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "264", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "265", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "266", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "267", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "268", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "269", market: "Rest of Africa", fallback: "Rest of Africa" },
  { prefix: "880", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "94", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
  { prefix: "977", market: "Rest of Asia Pacific", fallback: "Rest of Asia Pacific" },
];

const normalize = (value: any) =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, " ");

const toPaise = (value: any) => {
  const numeric = Number(String(value || "").replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(numeric) || numeric <= 0) return 0;
  return Math.ceil(numeric * 100);
};

export const resolveMarketFromPhone = (
  phone: string,
  defaultMarket = "India"
) => {
  const digits = String(phone || "").replace(/\D/g, "");
  const match = PHONE_MARKETS.sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => digits.startsWith(entry.prefix));
  return match?.market || "Other";
};

export const resolveMarketCandidatesFromPhone = (
  phone: string,
  defaultMarket = "India"
) => {
  const digits = String(phone || "").replace(/\D/g, "");
  const match = PHONE_MARKETS.sort((a, b) => b.prefix.length - a.prefix.length)
    .find((entry) => digits.startsWith(entry.prefix));

  const candidates = [
    match?.market,
    match?.fallback,
    "Other",
    defaultMarket,
  ].filter(Boolean) as string[];

  return Array.from(new Set(candidates));
};

const findColumnValue = (row: Record<string, any>, candidates: string[]) => {
  const keys = Object.keys(row);
  const key = keys.find((k) => candidates.includes(normalize(k)));
  return key ? row[key] : undefined;
};

const extractRows = (csvText: string) => {
  const workbook = XLSX.read(csvText, { type: "string" });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });
};

export const syncMetaRateCard = async ({
  sourceUrl,
  currency,
}: {
  sourceUrl: string;
  currency: string;
}) => {
  const response = await axios.get(sourceUrl, { responseType: "text" });
  const rows = extractRows(response.data);
  const fetchedAt = new Date();

  const ops: any[] = [];
  for (const row of rows) {
    const market =
      findColumnValue(row, ["market", "country", "country/region"]) || "";
    const rowCurrency =
      findColumnValue(row, ["currency", "currencies"]) || currency;

    if (!market) continue;

    for (const [category, aliases] of Object.entries(CATEGORY_ALIASES)) {
      const rawRate = findColumnValue(row, aliases);
      const rate = toPaise(rawRate);
      if (!rate) continue;

      ops.push({
        updateOne: {
          filter: {
            currency: String(rowCurrency || currency).toUpperCase(),
            market: String(market).trim(),
            category,
          },
          update: {
            $set: {
              rate,
              source_url: sourceUrl,
              fetchedAt,
            },
          },
          upsert: true,
        },
      });
    }
  }

  if (ops.length > 0) {
    await MetaRateCard.bulkWrite(ops, { ordered: false });
  }

  return { count: ops.length, fetchedAt };
};

export const getMetaTemplateRate = async ({
  category,
  currency,
  market,
  marketCandidates,
  sourceUrl,
}: {
  category: string;
  currency: string;
  market: string;
  marketCandidates?: string[];
  sourceUrl?: string;
}) => {
  const normalizedCategory = String(category || "").toUpperCase();
  const normalizedCurrency = String(currency || "INR").toUpperCase();

  const candidates = Array.from(new Set([market, ...(marketCandidates || [])]));

  const findRate = async () => {
    for (const candidate of candidates) {
      const found = await MetaRateCard.findOne({
        category: normalizedCategory,
        currency: normalizedCurrency,
        market: candidate,
      }).lean();
      if (found) return found;
    }
    return null;
  };

  let rate = await findRate();

  if (!rate && sourceUrl) {
    await syncMetaRateCard({ sourceUrl, currency: normalizedCurrency });
    rate = await findRate();
  }

  if (!rate) {
    throw new Error(
      `Meta pricing not found for ${candidates.join("/")} ${normalizedCategory}. Please sync Meta rate card.`
    );
  }

  return rate.rate;
};
