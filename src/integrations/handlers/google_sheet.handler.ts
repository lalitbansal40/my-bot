import { GoogleSheetService, extractSpreadsheetId } from "../../services/googlesheet.service";
import { IntegrationHandler, IntegrationHandlerMap } from "./types";

/* ──────────────────────────────────────────────────
   Map { sheetColumn: "{{template}}" } → resolved row.
   We coerce values to string and skip empty keys.
─────────────────────────────────────────────────── */
const resolveMap = (
  rawMap: Record<string, any> | undefined,
  interpolate: (s: any) => string
): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const [col, val] of Object.entries(rawMap || {})) {
    const key = (col || "").toString().trim();
    if (!key) continue; // ignore rows with empty column name
    let resolved: string;
    if (typeof val === "string") {
      resolved = interpolate(val);
      // If interpolate returns "" because the value had a {{var}} that
      // resolved to undefined, fall back to the literal so we don't lose
      // user-entered text.
      if (resolved === "" && !/\{\{.+?\}\}/.test(val)) resolved = val;
    } else if (val === null || val === undefined) {
      resolved = "";
    } else {
      resolved = String(val);
    }
    out[key] = resolved;
  }
  return out;
};

/* ── Action: Append Row ──────────────────────────── */
const append_row: IntegrationHandler = async (ctx, config) => {
  const spreadsheet_id = extractSpreadsheetId(config.spreadsheet_id);
  const sheet_name = (config.sheet_name || "Sheet1").trim();
  if (!spreadsheet_id) return { ok: false, error: "spreadsheet_id required" };

  const sheet = new GoogleSheetService(spreadsheet_id);
  const headers = await sheet.getHeaders(sheet_name);
  const resolved = resolveMap(config.map, ctx.interpolate);

  // Build a row aligned to actual sheet headers — this guarantees the
  // values land in the right columns regardless of mapping order.
  const payload: Record<string, string> = {};
  for (const h of headers) {
    payload[h] = resolved[h] ?? "";
  }

  console.log("[google_sheet.append_row] →", { spreadsheet_id, sheet_name, headers, resolved, payload });

  await sheet.create(payload, sheet_name);
  return { ok: true, data: { appended: true, row: payload } };
};

/* ── Action: Update Row ──────────────────────────── */
const update_row: IntegrationHandler = async (ctx, config) => {
  const spreadsheet_id = extractSpreadsheetId(config.spreadsheet_id);
  const sheet_name = (config.sheet_name || "Sheet1").trim();
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
  const spreadsheet_id = extractSpreadsheetId(config.spreadsheet_id);
  const sheet_name = (config.sheet_name || "Sheet1").trim();
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
