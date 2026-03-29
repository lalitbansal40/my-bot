import csv from "csv-parser";
import stream from "stream";

export const parseCSV = (buffer: Buffer) => {
  return new Promise((resolve, reject) => {
    const results: any[] = [];

    const readable = new stream.Readable();
    readable.push(buffer);
    readable.push(null);

    readable
      .pipe(csv())
      .on("data", (data) => results.push(data))
      .on("end", () => resolve(results))
      .on("error", reject);
  });
};