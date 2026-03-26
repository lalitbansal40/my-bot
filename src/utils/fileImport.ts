import csv from "csv-parser";
import fs from "fs";
import multer from "multer";
import xlsx from "xlsx";

export const contactUpload = multer({
  dest: "uploads/", // 🔥 this forces disk storage
});

export const parseFile = async (filePath: string, originalName: string) => {
  const ext = originalName.split(".").pop();
  let data: any[] = [];

  if (ext === "csv") {
    await new Promise((resolve, reject) => {
      fs.createReadStream(filePath)
        .pipe(csv())
        .on("data", (row) => data.push(row))
        .on("end", resolve)
        .on("error", reject);
    });
  }

  if (ext === "xlsx") {
    const workbook = xlsx.readFile(filePath);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    data = xlsx.utils.sheet_to_json(sheet);
  }

  return data;
};