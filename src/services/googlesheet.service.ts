import { google, sheets_v4 } from "googleapis";
type RowData = Record<string, any>;
import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(".env") });
/**
 * Accept either a raw spreadsheet ID or a full URL like:
 *   https://docs.google.com/spreadsheets/d/<ID>/edit?gid=0
 * and return just the ID. Used so the user can paste the URL.
 */
export const extractSpreadsheetId = (input?: string): string => {
  if (!input) return "";
  const trimmed = input.trim();
  const match = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : trimmed;
};

export class GoogleSheetService {
  private sheets: sheets_v4.Sheets;
  private spreadsheetId: string;
  private headers: string[] = [];

  constructor(spreadsheetId: string) {
    if (!process.env.GOOGLE_CLIENT_EMAIL || !process.env.GOOGLE_PRIVATE_KEY) {
      throw new Error("Google service account not configured");
    }

    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_CLIENT_EMAIL,
      key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    this.sheets = google.sheets({ version: "v4", auth });
    // 🔒 Always normalize — accepts URL or raw ID.
    this.spreadsheetId = extractSpreadsheetId(spreadsheetId);
    if (!this.spreadsheetId) {
      throw new Error("GoogleSheetService: spreadsheet ID/URL is empty");
    }
  }


  /* ===== Load Header Row ===== */
  private async loadHeaders(sheetName: string) {
    if (this.headers.length) return;

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1:Z1`,
    });

    this.headers = res.data.values?.[0] || [];
  }

  /* ===== Get Headers (PUBLIC) ===== */
  async getHeaders(sheetName: string): Promise<string[]> {
    await this.loadHeaders(sheetName);
    return this.headers;
  }

  /* ===== Get All Data ===== */
  async getAll(sheetName: string): Promise<RowData[]> {
    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A1:Z`,
    });

    const rows = res.data.values || [];
    if (rows.length < 2) return [];

    // 1️⃣ First row = headers (keys)
    const headers = rows[0].map(h => h.trim());

    // 2️⃣ Remaining rows = data
    const dataRows = rows.slice(1);

    // 3️⃣ Map rows → object
    return dataRows.map(row => {
      const obj: Record<string, any> = {};

      headers.forEach((key, index) => {
        obj[key] = row[index] ?? "";
      });

      return obj;
    });
  }


  /* ===== Get Latest by Key ===== */
  async getByKey(key: string, value: string, sheetName: string): Promise<RowData | null> {
    const all = await this.getAll(sheetName);
    return all.filter(r => r[key] === value).pop() || null;
  }

  /* ===== Create Data ===== */
  async create(data: any[] | Record<string, any>, sheetName: string) {
    await this.loadHeaders(sheetName);

    let row: any[];

    // ✅ If data is ARRAY → map by header order
    if (Array.isArray(data)) {
      row = this.headers.map((_, index) => data[index] ?? "");
    }
    // ✅ If data is OBJECT → map by header name
    else {
      row = this.headers.map(h => data[h] ?? "");
    }

    await this.sheets.spreadsheets.values.append({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A:Z`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [row] },
    });
  }


  /* ===== Update by Key ===== */
  async updateByKey(key: string, value: string, newData: RowData, sheetName: string) {
    await this.loadHeaders(sheetName);

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A2:Z`,
    });

    const rows = res.data.values || [];
    const keyIndex = this.headers.indexOf(key);

    let rowIndex = -1;
    rows.forEach((row, i) => {
      if (row[keyIndex] === value) rowIndex = i;
    });

    if (rowIndex === -1) throw new Error("Row not found");

    const updatedRow = this.headers.map(
      h => newData[h] ?? rows[rowIndex][this.headers.indexOf(h)] ?? ""
    );

    await this.sheets.spreadsheets.values.update({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A${rowIndex + 2}:Z${rowIndex + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });
  }

  /* ===== Delete by Key ===== */
  async deleteByKey(key: string, value: string, sheetName: string) {
    await this.loadHeaders(sheetName);

    const res = await this.sheets.spreadsheets.values.get({
      spreadsheetId: this.spreadsheetId,
      range: `${sheetName}!A2:Z`,
    });

    const rows = res.data.values || [];
    const keyIndex = this.headers.indexOf(key);

    let rowIndex = -1;
    rows.forEach((row, i) => {
      if (row[keyIndex] === value) rowIndex = i;
    });

    if (rowIndex === -1) throw new Error("Row not found");

    await this.sheets.spreadsheets.batchUpdate({
      spreadsheetId: this.spreadsheetId,
      requestBody: {
        requests: [
          {
            deleteDimension: {
              range: {
                sheetId: 0,
                dimension: "ROWS",
                startIndex: rowIndex + 1,
                endIndex: rowIndex + 2,
              },
            },
          },
        ],
      },
    });
  }

  private mapRow(row: string[]): RowData {
    const obj: any = {};

    this.headers.forEach((header, index) => {
      obj[header] = row[index] ?? null;
    });

    return obj;
  }

}
