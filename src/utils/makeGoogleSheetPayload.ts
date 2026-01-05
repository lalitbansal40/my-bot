import { flattenObject } from "./flatten";
import { interpolate } from "../helpers/whatsapp.helper";

export const makeGoogleSheetPayload = (
  headers: string[],
  contact: any,
  sessionData: Record<string, any>,
  nodeMap?: Record<string, string>
) => {
  const now = new Date().toISOString();

  /**
   * 1️⃣ Build raw data pool (future-proof)
   */
  const rawData = {
    phone: contact.phone,
    name: contact.name,
    created_at: now,
    updated_at: now,

    ...(contact.attributes || {}),
    ...(sessionData || {}),
  };

  /**
   * 2️⃣ Flatten everything
   */
  const flatData = flattenObject(rawData);

  /**
   * 3️⃣ Build payload strictly by Google Sheet headers
   */
  const payload: Record<string, any> = {};

  for (const header of headers) {
    // ✅ Priority 1: explicit node.map
    if (nodeMap?.[header]) {
      payload[header] = interpolate(
        nodeMap[header],
        rawData
      );
      continue;
    }

    // ✅ Priority 2: auto mapping
    payload[header] =
      flatData[header] ??
      flatData[`data.${header}`] ??
      flatData[`delivery_address.${header}`] ??
      "";
  }

  return payload;
};
