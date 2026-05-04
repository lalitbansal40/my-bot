import { RazorpayService } from "../../services/razorpay.service";
import { IntegrationHandler, IntegrationHandlerMap } from "./types";

/* ── Helpers ─────────────────────────────────────── */
const cleanPhone = (raw?: string): string => {
  if (!raw) return "";
  return raw.toString().replace(/\D/g, "").slice(-10);
};

const num = (v: any, def = 0): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
};

/* ── Action: Create Payment Link ─────────────────── */
const create_payment_link: IntegrationHandler = async (ctx, config) => {
  const { credentials, interpolate, contact } = ctx;
  const key_id = credentials.config.key_id;
  const key_secret = credentials.secrets.key_secret;

  if (!key_id || !key_secret) {
    return { ok: false, error: "Razorpay credentials missing" };
  }

  const amount = num(interpolate(config.amount));
  if (amount <= 0) {
    return { ok: false, error: "Razorpay: amount must be > 0" };
  }

  const description = interpolate(config.description) || "Payment";
  const customerName = interpolate(config.customer_name) || contact?.name || "Customer";
  const customerPhone =
    cleanPhone(interpolate(config.customer_phone)) ||
    cleanPhone(contact?.phone) ||
    "";
  const referenceId = interpolate(config.reference_id) || ctx.session.contact_id;

  const rp = new RazorpayService(key_id, key_secret);
  const link = await rp.createPaymentLink({
    amount,
    customerName,
    customerPhone,
    description,
    referenceId,
  });

  return {
    ok: true,
    data: {
      id: link.id,
      short_url: link.short_url,
      amount,
      status: link.status,
      reference_id: referenceId,
    },
  };
};

/* ── Action: Fetch Order ─────────────────────────── */
const fetch_order: IntegrationHandler = async (ctx, config) => {
  const { credentials, interpolate } = ctx;
  const key_id = credentials.config.key_id;
  const key_secret = credentials.secrets.key_secret;

  if (!key_id || !key_secret) {
    return { ok: false, error: "Razorpay credentials missing" };
  }

  const orderId = interpolate(config.order_id);
  if (!orderId) {
    return { ok: false, error: "order_id is required" };
  }

  // Razorpay SDK lacks a typed `orders.fetch` in some versions — call REST directly via axios fallback
  const axios = (await import("axios")).default;
  try {
    const res = await axios.get(`https://api.razorpay.com/v1/orders/${orderId}`, {
      auth: { username: key_id, password: key_secret },
    });
    return { ok: true, data: res.data };
  } catch (err: any) {
    return { ok: false, error: err?.response?.data?.error?.description || "Razorpay fetch failed" };
  }
};

/* ── Map ─────────────────────────────────────────── */
const handlers: IntegrationHandlerMap = {
  create_payment_link,
  fetch_order,
};

export default handlers;
