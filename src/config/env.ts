import dotenv from "dotenv";
import path from "path";
dotenv.config({ path: path.join(".env") });

export const ENV = {
  PORT: process.env.PORT || "3000",
};
