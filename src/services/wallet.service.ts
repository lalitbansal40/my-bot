import mongoose from "mongoose";
import { Wallet } from "../models/wallet.model";
import { WalletLedger } from "../models/walletLedger.model";
import { TemplateModel } from "../models/template.model";
import {
  getMetaTemplateRate,
  resolveMarketFromPhone,
  resolveMarketCandidatesFromPhone,
} from "./metaPricing.service";

type ReserveTemplateChargeParams = {
  accountId: any;
  channelId: any;
  contactId: any;
  messageId: any;
  templateName: string;
  to?: string;
};

type AttachWaMessageParams = {
  messageId: any;
  waMessageId?: string;
};

const normalizeCategory = (category?: string) =>
  (category || "UTILITY").toUpperCase();

const toObjectId = (id: any) =>
  typeof id === "string" ? new mongoose.Types.ObjectId(id) : id;

const calculateCharge = (
  wallet: any,
  templateAmount: number,
  templateCategory?: string
) => {
  const category = normalizeCategory(templateCategory);
  const commissionPercent = wallet.commission_enabled
    ? Number(wallet.commission_percent || 0)
    : 0;
  const commissionAmount = Math.ceil((templateAmount * commissionPercent) / 100);
  const amount =
    wallet.meta_payer === "platform"
      ? templateAmount + commissionAmount
      : commissionAmount;

  return {
    amount,
    template_amount: templateAmount,
    commission_amount: commissionAmount,
    commission_percent: commissionPercent,
    template_category: category,
  };
};

export const reserveTemplateCharge = async ({
  accountId,
  channelId,
  contactId,
  messageId,
  templateName,
  to,
}: ReserveTemplateChargeParams) => {
  const accountObjectId = toObjectId(accountId);

  const wallet = await Wallet.findOneAndUpdate(
    { account_id: accountObjectId },
    {
      $setOnInsert: {
        account_id: accountObjectId,
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
  );

  const template = await TemplateModel.findOne({
    name: templateName,
    channel_id: channelId,
  }).lean();

  const category = normalizeCategory(template?.category);
  const market = resolveMarketFromPhone(to || "", wallet.default_market || "India");
  const marketCandidates = resolveMarketCandidatesFromPhone(
    to || "",
    wallet.default_market || "India"
  );
  const templateAmount =
    category === "SERVICE"
      ? 0
      : await getMetaTemplateRate({
          category,
          currency: wallet.currency || "INR",
          market,
          marketCandidates,
          sourceUrl:
            wallet.meta_rate_card_url ||
            process.env.META_RATE_CARD_URL ||
            process.env.META_INR_RATE_CARD_URL,
        });

  const charge = calculateCharge(wallet, templateAmount, template?.category);

  if (charge.template_category !== "SERVICE" && charge.template_amount <= 0) {
    throw new Error(
      `Template pricing is not configured for ${charge.template_category}. Please set wallet template rate before sending.`
    );
  }

  if (charge.amount <= 0) {
    return null;
  }

  const updatedWallet = await Wallet.findOneAndUpdate(
    {
      _id: wallet._id,
      $expr: {
        $gte: [
          {
            $subtract: [
              { $add: ["$balance", { $ifNull: ["$credit_limit", 0] }] },
              "$hold_balance",
            ],
          },
          charge.amount,
        ],
      },
    },
    { $inc: { hold_balance: charge.amount } },
    { new: true }
  );

  if (!updatedWallet) {
    throw new Error("Please add amount in wallet. Wallet limit exceeded.");
  }

  return WalletLedger.create({
    account_id: accountObjectId,
    channel_id: toObjectId(channelId),
    contact_id: toObjectId(contactId),
    message_id: toObjectId(messageId),
    type: "TEMPLATE_MESSAGE",
    status: "HELD",
    currency: wallet.currency || "INR",
    amount: charge.amount,
    template_amount: charge.template_amount,
    commission_amount: charge.commission_amount,
    commission_percent: charge.commission_percent,
    meta_payer: wallet.meta_payer,
    template_name: templateName,
    template_category: charge.template_category,
  });
};

export const attachWalletHoldToWaMessage = async ({
  messageId,
  waMessageId,
}: AttachWaMessageParams) => {
  if (!waMessageId) return;
  await WalletLedger.updateOne(
    { message_id: toObjectId(messageId), status: "HELD" },
    { $set: { wa_message_id: waMessageId } }
  );
};

export const captureTemplateHold = async (messageId: any) => {
  const ledger = await WalletLedger.findOneAndUpdate(
    { message_id: toObjectId(messageId), status: "HELD" },
    { $set: { status: "CAPTURED", capturedAt: new Date() } },
    { new: false }
  );

  if (!ledger) return null;

  await Wallet.updateOne(
    { account_id: ledger.account_id },
    {
      $inc: {
        balance: -ledger.amount,
        hold_balance: -ledger.amount,
      },
    }
  );

  return ledger;
};

export const releaseTemplateHold = async (messageId: any, reason?: string) => {
  const ledger = await WalletLedger.findOneAndUpdate(
    { message_id: toObjectId(messageId), status: "HELD" },
    {
      $set: {
        status: "RELEASED",
        releasedAt: new Date(),
        ...(reason && { reason }),
      },
    },
    { new: false }
  );

  if (!ledger) return null;

  await Wallet.updateOne(
    { account_id: ledger.account_id },
    { $inc: { hold_balance: -ledger.amount } }
  );

  return ledger;
};
