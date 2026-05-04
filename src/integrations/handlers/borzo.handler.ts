import { BorzoApiClient, CalculateOrderData, OrderPoint } from "../../services/borzo.service";
import { IntegrationHandler, IntegrationHandlerMap } from "./types";

/* ── Helpers ─────────────────────────────────────── */
const num = (v: any): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

const buildPoints = (
  ctx: any,
  config: Record<string, any>
): OrderPoint[] => {
  const { interpolate, contact } = ctx;
  const points: OrderPoint[] = [];

  // Pickup
  const pickup: OrderPoint = {
    address: interpolate(config.pickup_address),
    latitude: num(interpolate(config.pickup_lat)),
    longitude: num(interpolate(config.pickup_lng)),
    contact_person: {
      phone: interpolate(config.pickup_phone) || "",
      name: interpolate(config.pickup_name) || "Pickup",
    },
  };
  points.push(pickup);

  // Drop
  const drop: OrderPoint = {
    address: interpolate(config.drop_address),
    latitude: num(interpolate(config.drop_lat)),
    longitude: num(interpolate(config.drop_lng)),
    contact_person: {
      phone: interpolate(config.drop_phone) || contact?.phone || "",
      name: interpolate(config.drop_name) || contact?.name || "Customer",
    },
  };
  points.push(drop);

  return points;
};

const buildClient = (ctx: any) => {
  const token = ctx.credentials.secrets.auth_token;
  const env = ctx.credentials.config.environment || "test";
  if (!token) throw new Error("Borzo: auth_token missing");
  return new BorzoApiClient(token, env);
};

/* ── Action: Calculate Price ─────────────────────── */
const calculate_price: IntegrationHandler = async (ctx, config) => {
  const client = buildClient(ctx);
  const payload: CalculateOrderData = {
    matter: ctx.interpolate(config.matter) || "Order",
    vehicle_type_id: num(config.vehicle_type_id) ?? 7,
    points: buildPoints(ctx, config),
  };
  const res = await client.calculatePrice(payload);
  if (!res.is_successful) {
    return { ok: false, error: res.errors?.[0]?.message || "Borzo calculation failed" };
  }
  return {
    ok: true,
    data: {
      payment_amount: Number(res.order?.payment_amount ?? 0),
      delivery_fee_amount: Number(res.order?.delivery_fee_amount ?? 0),
    },
  };
};

/* ── Action: Create Order ────────────────────────── */
const create_order: IntegrationHandler = async (ctx, config) => {
  const client = buildClient(ctx);
  const payload: CalculateOrderData = {
    matter: ctx.interpolate(config.matter) || "Order",
    vehicle_type_id: num(config.vehicle_type_id) ?? 7,
    points: buildPoints(ctx, config),
  };
  const res = await client.createOrder(payload);
  if (!res.is_successful) {
    return { ok: false, error: res.errors?.[0]?.message || "Borzo order failed" };
  }
  return {
    ok: true,
    data: {
      order_id: res.order_id,
      delivery_id: res.delivery_id,
      payment_amount: Number(res.order?.payment_amount ?? 0),
      tracking_url: res.order?.tracking_url,
    },
  };
};

/* ── Action: Track Order ─────────────────────────── */
const track_order: IntegrationHandler = async (ctx, config) => {
  const client = buildClient(ctx);
  const orderId = ctx.interpolate(config.order_id);
  if (!orderId) return { ok: false, error: "order_id required" };
  try {
    const data = await client.getCourierLocation(orderId);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Borzo track failed" };
  }
};

/* ── Action: Cancel Order ────────────────────────── */
const cancel_order: IntegrationHandler = async (ctx, config) => {
  const client = buildClient(ctx);
  const orderId = ctx.interpolate(config.order_id);
  if (!orderId) return { ok: false, error: "order_id required" };
  const res = await client.cancelOrder(orderId);
  if (!res.is_successful) {
    return { ok: false, error: res.errors?.[0]?.message || "Borzo cancel failed" };
  }
  return { ok: true, data: { order_id: orderId, cancelled: true } };
};

/* ── Action: Get Order ───────────────────────────── */
const get_order: IntegrationHandler = async (ctx, config) => {
  const client = buildClient(ctx);
  const orderId = ctx.interpolate(config.order_id);
  if (!orderId) return { ok: false, error: "order_id required" };
  try {
    const data = await client.getOrderInfo(orderId);
    return { ok: true, data };
  } catch (e: any) {
    return { ok: false, error: e?.message || "Borzo get_order failed" };
  }
};

const handlers: IntegrationHandlerMap = {
  calculate_price,
  create_order,
  track_order,
  cancel_order,
  get_order,
};

export default handlers;
