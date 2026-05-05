import { Response } from "express";
import { AuthRequest } from "../types/auth.types";
import { Wallet } from "../models/wallet.model";
import { WalletLedger } from "../models/walletLedger.model";
import { syncMetaRateCard } from "../services/metaPricing.service";

const getOrCreateWallet = async (accountId: string) => {
  return Wallet.findOneAndUpdate(
    { account_id: accountId },
    {
      $setOnInsert: {
        account_id: accountId,
        currency: "INR",
        balance: 0,
        hold_balance: 0,
        credit_limit: 100,
        meta_payer: "customer",
        commission_enabled: true,
        commission_percent: 10,
        default_market: "India",
      },
    },
    { upsert: true, new: true }
  ).lean();
};

export const getWallet = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const wallet = await getOrCreateWallet(accountId);
    const recentLedger = await WalletLedger.find({ account_id: accountId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json({
      success: true,
      data: {
        wallet,
        available_balance:
          Number(wallet?.balance || 0) - Number(wallet?.hold_balance || 0),
        remaining_credit:
          Number(wallet?.balance || 0) +
          Number(wallet?.credit_limit || 0) -
          Number(wallet?.hold_balance || 0),
        recentLedger,
      },
    });
  } catch (error: any) {
    console.error("getWallet error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

export const updateWalletSettings = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const allowed: Record<string, any> = {};
    const {
      meta_payer,
      commission_enabled,
      commission_percent,
      template_rates,
      currency,
      credit_limit,
      meta_rate_card_url,
      default_market,
    } = req.body;

    if (meta_payer !== undefined) allowed.meta_payer = meta_payer;
    if (commission_enabled !== undefined)
      allowed.commission_enabled = commission_enabled;
    if (commission_percent !== undefined)
      allowed.commission_percent = Number(commission_percent);
    if (template_rates !== undefined) allowed.template_rates = template_rates;
    if (currency !== undefined) allowed.currency = currency;
    if (credit_limit !== undefined) allowed.credit_limit = Number(credit_limit);
    if (meta_rate_card_url !== undefined)
      allowed.meta_rate_card_url = meta_rate_card_url;
    if (default_market !== undefined) allowed.default_market = default_market;

    const wallet = await Wallet.findOneAndUpdate(
      { account_id: accountId },
      { $set: allowed, $setOnInsert: { account_id: accountId } },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: wallet });
  } catch (error: any) {
    console.error("updateWalletSettings error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

export const creditWallet = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const amount = Number(req.body.amount || 0);
    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount must be greater than 0" });
    }

    const wallet = await Wallet.findOneAndUpdate(
      { account_id: accountId },
      {
        $inc: { balance: amount },
        $setOnInsert: {
          account_id: accountId,
          currency: req.body.currency || "INR",
          hold_balance: 0,
          credit_limit: 100,
          meta_payer: "customer",
          commission_enabled: true,
          commission_percent: 10,
          default_market: "India",
        },
      },
      { upsert: true, new: true }
    );

    return res.json({ success: true, data: wallet });
  } catch (error: any) {
    console.error("creditWallet error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};

export const syncWalletMetaRates = async (req: AuthRequest, res: Response) => {
  try {
    const accountId = req.user?.account_id;
    if (!accountId) return res.status(401).json({ message: "Unauthorized" });

    const wallet = await getOrCreateWallet(accountId);
    const sourceUrl =
      req.body.sourceUrl ||
      wallet?.meta_rate_card_url ||
      process.env.META_RATE_CARD_URL ||
      process.env.META_INR_RATE_CARD_URL;

    if (!sourceUrl) {
      return res.status(400).json({
        message: "Meta rate card URL is required",
      });
    }

    const result = await syncMetaRateCard({
      sourceUrl,
      currency: wallet?.currency || "INR",
    });

    if (req.body.sourceUrl && req.body.persist !== false) {
      await Wallet.updateOne(
        { account_id: accountId },
        { $set: { meta_rate_card_url: req.body.sourceUrl } }
      );
    }

    return res.json({ success: true, data: result });
  } catch (error: any) {
    console.error("syncWalletMetaRates error:", error);
    return res.status(500).json({ message: error.message || "Server error" });
  }
};
