import csv from "csv-parser";
import fs from "fs";
import multer from "multer";
import xlsx from "xlsx";
import { Readable } from "stream";
import os from "os";

export const contactUpload = multer({
  storage: multer.diskStorage({
    destination: os.tmpdir(),
    filename: (_req, file, cb) => cb(null, `${Date.now()}-${file.originalname}`),
  }),
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

  if (input && typeof input === "string") {
    try {
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
    } finally {
      fs.unlink(input, () => {}); // cleanup temp file
    }
  }

  return data;
};