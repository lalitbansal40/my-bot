/**
 * Meta WhatsApp Business per-message rate card seed data.
 *
 * IMPORTANT
 * ----------
 * - Rates here are approximate values based on Meta's mid-2025 published
 *   per-message pricing. Meta updates these rate cards from time to time, so
 *   for billing-grade accuracy you should sync from Meta's official CSV using
 *   `META_RATE_CARD_URLS` env var (see runSeedMetaRateCard.ts).
 * - Rates are stored in PAISE / CENTS (i.e. value * 100). The seed code
 *   multiplies the decimal values below at insert time.
 * - SERVICE category messages are free as per Meta policy.
 */

export type CategoryRate = {
  MARKETING: number;
  UTILITY: number;
  AUTHENTICATION: number;
};

// All 32 markets that Meta publishes rate cards for.
export const META_MARKETS = [
  "India",
  "North America",
  "Argentina",
  "Brazil",
  "Chile",
  "Colombia",
  "Egypt",
  "France",
  "Germany",
  "Indonesia",
  "Israel",
  "Italy",
  "Malaysia",
  "Mexico",
  "Netherlands",
  "Nigeria",
  "Pakistan",
  "Peru",
  "Russia",
  "Saudi Arabia",
  "South Africa",
  "Spain",
  "Turkey",
  "United Arab Emirates",
  "United Kingdom",
  "Rest of Africa",
  "Rest of Asia Pacific",
  "Rest of Central & Eastern Europe",
  "Rest of Latin America",
  "Rest of Middle East",
  "Rest of Western Europe",
  "Other",
] as const;

export type MetaMarket = (typeof META_MARKETS)[number];

/**
 * USD baseline rates per market (decimal USD per message).
 * Based on Meta's published USD rate card.
 */
export const USD_BASELINE: Record<MetaMarket, CategoryRate> = {
  India:                              { MARKETING: 0.0099, UTILITY: 0.0014, AUTHENTICATION: 0.0014 },
  "North America":                    { MARKETING: 0.0250, UTILITY: 0.0150, AUTHENTICATION: 0.0135 },
  Argentina:                          { MARKETING: 0.0526, UTILITY: 0.0388, AUTHENTICATION: 0.0367 },
  Brazil:                             { MARKETING: 0.0625, UTILITY: 0.0080, AUTHENTICATION: 0.0315 },
  Chile:                              { MARKETING: 0.0889, UTILITY: 0.0700, AUTHENTICATION: 0.0651 },
  Colombia:                           { MARKETING: 0.0125, UTILITY: 0.0050, AUTHENTICATION: 0.0086 },
  Egypt:                              { MARKETING: 0.1073, UTILITY: 0.0386, AUTHENTICATION: 0.0864 },
  France:                             { MARKETING: 0.1432, UTILITY: 0.0400, AUTHENTICATION: 0.0691 },
  Germany:                            { MARKETING: 0.1365, UTILITY: 0.0550, AUTHENTICATION: 0.0768 },
  Indonesia:                          { MARKETING: 0.0411, UTILITY: 0.0300, AUTHENTICATION: 0.0309 },
  Israel:                             { MARKETING: 0.0353, UTILITY: 0.0192, AUTHENTICATION: 0.0214 },
  Italy:                              { MARKETING: 0.0691, UTILITY: 0.0303, AUTHENTICATION: 0.0356 },
  Malaysia:                           { MARKETING: 0.0865, UTILITY: 0.0203, AUTHENTICATION: 0.0125 },
  Mexico:                             { MARKETING: 0.0436, UTILITY: 0.0100, AUTHENTICATION: 0.0235 },
  Netherlands:                        { MARKETING: 0.1597, UTILITY: 0.0744, AUTHENTICATION: 0.0856 },
  Nigeria:                            { MARKETING: 0.0516, UTILITY: 0.0209, AUTHENTICATION: 0.0418 },
  Pakistan:                           { MARKETING: 0.0473, UTILITY: 0.0344, AUTHENTICATION: 0.0389 },
  Peru:                               { MARKETING: 0.0703, UTILITY: 0.0179, AUTHENTICATION: 0.0625 },
  Russia:                             { MARKETING: 0.0802, UTILITY: 0.0398, AUTHENTICATION: 0.0517 },
  "Saudi Arabia":                     { MARKETING: 0.0322, UTILITY: 0.0142, AUTHENTICATION: 0.0125 },
  "South Africa":                     { MARKETING: 0.0379, UTILITY: 0.0125, AUTHENTICATION: 0.0233 },
  Spain:                              { MARKETING: 0.0615, UTILITY: 0.0252, AUTHENTICATION: 0.0344 },
  Turkey:                             { MARKETING: 0.0023, UTILITY: 0.0017, AUTHENTICATION: 0.0017 },
  "United Arab Emirates":             { MARKETING: 0.0356, UTILITY: 0.0202, AUTHENTICATION: 0.0245 },
  "United Kingdom":                   { MARKETING: 0.0530, UTILITY: 0.0282, AUTHENTICATION: 0.0368 },
  "Rest of Africa":                   { MARKETING: 0.0205, UTILITY: 0.0108, AUTHENTICATION: 0.0115 },
  "Rest of Asia Pacific":             { MARKETING: 0.0732, UTILITY: 0.0173, AUTHENTICATION: 0.0303 },
  "Rest of Central & Eastern Europe": { MARKETING: 0.0860, UTILITY: 0.0438, AUTHENTICATION: 0.0498 },
  "Rest of Latin America":            { MARKETING: 0.0700, UTILITY: 0.0220, AUTHENTICATION: 0.0275 },
  "Rest of Middle East":              { MARKETING: 0.0337, UTILITY: 0.0179, AUTHENTICATION: 0.0184 },
  "Rest of Western Europe":           { MARKETING: 0.0911, UTILITY: 0.0478, AUTHENTICATION: 0.0497 },
  Other:                              { MARKETING: 0.0500, UTILITY: 0.0250, AUTHENTICATION: 0.0250 },
};

/**
 * FX multipliers from USD to target currency. Approximate as of mid-2025.
 * Used to derive non-USD rate cards from the USD baseline.
 *
 * Override individual currency-market entries via CURRENCY_OVERRIDES below
 * (Meta's actual published per-currency rates differ slightly from pure FX
 *  conversion — most importantly for INR/India which Meta prices natively).
 */
export const FX_FROM_USD: Record<string, number> = {
  USD: 1,
  INR: 84,
  EUR: 0.92,
  GBP: 0.79,
  AED: 3.67,
  BRL: 5.5,
  IDR: 16000,
  MXN: 18,
  ZAR: 18.5,
  NGN: 1550,
  PKR: 280,
  TRY: 34,
  RUB: 92,
  ILS: 3.7,
  SAR: 3.75,
  IQD: 1310,
  EGP: 49,
  ARS: 1000,
  CLP: 950,
  COP: 4100,
  PEN: 3.7,
  CAD: 1.36,
  AUD: 1.52,
  NZD: 1.65,
  SGD: 1.34,
  HKD: 7.8,
  JPY: 150,
  KRW: 1380,
  CNY: 7.25,
  THB: 35,
  PHP: 58,
  VND: 25000,
  CHF: 0.88,
  SEK: 10.5,
  NOK: 10.7,
  DKK: 6.85,
  PLN: 3.95,
  CZK: 23,
  HUF: 360,
  RON: 4.55,
};

/**
 * Per-currency / per-market overrides — for cases where Meta publishes a
 * specific local rate that doesn't match a pure FX conversion.
 * Most notably: India INR.
 */
export const CURRENCY_OVERRIDES: Record<
  string,
  Partial<Record<MetaMarket, Partial<CategoryRate>>>
> = {
  INR: {
    India: { MARKETING: 0.78, UTILITY: 0.115, AUTHENTICATION: 0.115 },
  },
};

export const SUPPORTED_CURRENCIES = Object.keys(FX_FROM_USD);
