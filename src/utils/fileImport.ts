import csv from "csv-parser";
import fs from "fs";
import multer from "multer";
import xlsx from "xlsx";
import { Readable } from "stream";

// ✅ FIX: memory storage (Lambda safe)
export const contactUpload = multer({
  storage: multer.memoryStorage(),
});

// ✅ UPDATED: buffer support
export const parseFile = async (
  input: any,
  originalName: string
): Promise<any[]> => {
  const ext = originalName.split(".").pop()?.toLowerCase();
  let data: any[] = [];

  // 🔥 HANDLE BUFFER (Lambda)
  if (Buffer.isBuffer(input)) {
    if (ext === "xlsx") {
      const workbook = xlsx.read(input, { type: "buffer" });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      return xlsx.utils.sheet_to_json(sheet);
    }

    if (ext === "csv") {
      return new Promise((resolve, reject) => {
        const results: any[] = [];
        const stream = Readable.from(input);

        stream
          .pipe(csv())
          .on("data", (row) => results.push(row))
          .on("end", () => resolve(results))
          .on("error", reject);
      });
    }
  }

  // 🔁 FALLBACK (local only)
  if (input && typeof input === "string") {
    if (ext === "csv") {
      await new Promise((resolve, reject) => {
        fs.createReadStream(input)
          .pipe(csv())
          .on("data", (row) => data.push(row))
          .on("end", resolve)
          .on("error", reject);
      });
    }

    if (ext === "xlsx") {
      const workbook = xlsx.readFile(input);
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      data = xlsx.utils.sheet_to_json(sheet);
    }
  }

  return data;
};