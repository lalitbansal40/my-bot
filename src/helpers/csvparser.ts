import csv from "csv-parser";
import stream from "stream";
import fs from "fs";

export const parseCSV = (input: Buffer | string) => {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    const readable = typeof input === "string"
      ? fs.createReadStream(input)
      : (() => {
          const r = new stream.Readable();
          r.push(input);
          r.push(null);
          return r;
        })();

    readable
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};