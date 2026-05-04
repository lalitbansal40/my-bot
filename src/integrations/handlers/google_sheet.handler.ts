import { GoogleSheetService } from "../../services/googlesheet.service";
import { IntegrationHandler, IntegrationHandlerMap } from "./types";

/* ──────────────────────────────────────────────────
   Map { sheetColumn: "{{template}}" } → resolved row
─────────────────────────────────────────────────── */
const resolveMap = (
  rawMap: Record<string, any> | undefined,
  interpolate: (s: any) => string
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [col, val] of Object.entries(rawMap || {})) {
    out[col] = interpolate(val) ?? "";
  }
  return out;
};

/* ── Action: Append Row ──────────────────────────── */
const append_row: IntegrationHandler = async (ctx, config) => {
  const spreadsheet_id = config.spreadsheet_id;
  const sheet_name = config.sheet_name || "Sheet1";
  if (!spreadsheet_id) return { ok: false, error: "spreadsheet_id required" };

  const sheet = new GoogleSheetService(spreadsheet_id);
  const headers = await sheet.getHeaders(sheet_name);
  const resolved = resolveMap(config.map, ctx.interpolate);

  // Reduce to headers actually present in sheet (avoids extra cols)
  const payload: Record<string, string> = {};
  for (const h of headers) {
    payload[h] = resolved[h] ?? "";
  }

  await sheet.create(payload, sheet_name);
  return { ok: true, data: { appended: true, row: payload } };
};

/* ── Action: Update Row ──────────────────────────── */
const update_row: IntegrationHandler = async (ctx, config) => {
  const spreadsheet_id = config.spreadsheet_id;
  const sheet_name = config.sheet_name || "Sheet1";
  const match_column = config.match_column;
  const match_value = ctx.interpolate(config.match_value);

  if (!spreadsheet_id || !match_column || !match_value) {
    return { ok: false, error: "spreadsheet_id, match_column, match_value all required" };
  }

  const sheet = new GoogleSheetService(spreadsheet_id);
  const newData = resolveMap(config.map, ctx.interpolate);

  try {
    await sheet.updateByKey(match_column, match_value, newData, sheet_name);
    return { ok: true, data: { updated: true } };
  } catch (e: any) {
    return { ok: false, error: e?.message || "update_row failed" };
  }
};

/* ── Action: Find Row ────────────────────────────── */
const find_row: IntegrationHandler = async (ctx, config) => {
  const spreadsheet_id = config.spreadsheet_id;
  const sheet_name = config.sheet_name || "Sheet1";
  const match_column = config.match_column;
  const match_value = ctx.interpolate(config.match_value);

  if (!spreadsheet_id || !match_column) {
    return { ok: false, error: "spreadsheet_id, match_column required" };
  }

  const sheet = new GoogleSheetService(spreadsheet_id);
  const row = await sheet.getByKey(match_column, match_value, sheet_name);
  return { ok: true, data: { found: !!row, row: row || {} } };
};

const handlers: IntegrationHandlerMap = {
  append_row,
  update_row,
  find_row,
};

export default handlers;
