import express from "express";
import dotenv from "dotenv";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";
dotenv.config();
import axios from "axios";
import fs from "fs";
import path from "path";
import sharp from "sharp";
import cakeData from "./cakeData.json"
import { GoogleSheetService } from "./services/googlesheet.service";
const app = express();
const PORT = process.env.PORT || 3000;
app.use(express.json());
app.use("/webhook", webhookRoutes);
app.use("/whatsappflow", whatsappFlowRoutes);

app.get("/", (_, res) => {
  res.send("WhatsApp Webhook Running ✅");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});



// export interface ImageInput {
//   id: number;
//   title: string;
//   metadata: string;
//   description: string;
//   image: string; // image URL
// }

// export interface ImageOutput {
//   id: string;
//   title: string;
//   metadata: string;
//   description: string;
//   image: string; // base64
// }

// const originalData: ImageInput[] = [
//   {
//     id: 1,
//     title: "Black & White",
//     metadata: "₹319",
//     description: "A premium black and white choco royale cake layered with rich chocolate sponge, smooth whipped cream and dark chocolate ganache. Topped with chocolate shavings and cream swirls for a perfect celebration treat.",
//     image: "./cakephotos/Black & White Cake [500 g].png"
//   },
//   {
//     id: 2,
//     title: "Butterscotch Drizzle Delight",
//     metadata: "₹309",
//     description: "A rich butterscotch cream cake topped with smooth chocolate drips, soft swirls, and colorful sprinkles. Perfectly moist, creamy and ideal for any celebration.",
//     image: "./cakephotos/Butterscotch Drizzle Delight Cake [500 g].png"
//   },
//   {
//     id: 3,
//     title: "Black & White Drizzle",
//     metadata: "₹319",
//     description: "A soft vanilla cream cake topped with glossy chocolate drips, fluffy cream swirls, and rich choco shavings. Light, fresh and perfect for every celebration.",
//     image: "./cakephotos/Black & White Drizzle Cream Cake [500 g].png"
//   },
//   {
//     id: 4,
//     title: "Chocolate Chips Overload",
//     metadata: "₹339",
//     description: "A rich chocolate cake coated in glossy ganache, loaded with dark choco chips, white pearls and decorative chocolate pieces. Deep, indulgent and perfect for true chocolate lovers.",
//     image: "./cakephotos/Chocolate Chips Overload Cake [500 g].png"
//   },
//   {
//     id: 5,
//     title: "Choco Truffle Delight",
//     metadata: "₹319",
//     description: "A rich dark chocolate truffle cake topped with a decorative chocolate fan, cherry, and crunchy choco chips. Smooth, indulgent and perfect for chocolate lovers.",
//     image: "./cakephotos/Choco Truffle Delight Cake [500 g].png"
//   },
//   {
//     id: 6,
//     title: "Chocolate Mocha Fusion",
//     metadata: "₹329",
//     description: "A rich mocha chocolate cake topped with creamy swirls, dark ganache and chocolate shavings. Smooth, elegant and perfect for coffee, chocolate lovers.",
//     image: "./cakephotos/Chocolate Mocha Fusion Cake Cake [500 g].png"
//   },
//   {
//     id: 7,
//     title: "Midnight Chocolate Swirl",
//     metadata: "₹329",
//     description: "A rich dark chocolate swirl cake topped with smooth cream rosettes, glossy ganache and elegant chocolate décor. Bold, indulgent and perfect for every celebration.",
//     image: "./cakephotos/Midnight Chocolate Swirl Cake [500 g].png"
//   },
//   {
//     id: 8,
//     title: "Dark Forest Spiral",
//     metadata: "₹319",
//     description: "A premium dark chocolate cake topped with a glossy ganache spiral, elegant chocolate decor and a cherry center.",
//     image: "./cakephotos/Dark Forest Spiral Cake [500 g].png"
//   },
//   {
//     id: 9,
//     title: "Love & Chocolate Truffle",
//     metadata: "₹339",
//     description: "A rich chocolate truffle cake coated in fine choco shavings, decorated with heart shaped chocolate drizzle, white pearls and a cherry topper. Pure indulgence for special moments.",
//     image: "./cakephotos/Love & Chocolate Truffle Cake [500 g].png"
//   },
//   {
//     id: 10,
//     title: "Pink Strawberry Drip",
//     metadata: "₹309",
//     description: "A soft strawberry cream cake topped with silky swirls, glossy dark drips and colorful jelly toppings. Light, smooth and perfect for celebrations.",
//     image: "./cakephotos/Pink Strawberry Drip Cake [500 g].png"
//   },
//   {
//     id: 11,
//     title: "Royal Tutti Frutti",
//     metadata: "₹329",
//     description: "Soft vanilla sponge topped with rich whipped cream, loaded with colorful tutti frutti and elegant chocolate garnishing.",
//     image: "./cakephotos/Royal Tutti Frutti Celebration Cake [500 g].png"
//   },
//   {
//     id: 12,
//     title: "Rosette Swirl Celebration",
//     metadata: "₹319",
//     description: "Soft vanilla cream cake decorated with beautiful pink, yellow and white rosette swirls.",
//     image: "./cakephotos/Rosette Swirl Celebration Cake [500 g].png"
//   },
//   {
//     id: 13,
//     title: "White Forest Choco Flakes",
//     metadata: "₹319",
//     description: "Soft vanilla sponge coated in whipped cream, topped with chocolate curls and flakes for a perfect white forest experience.",
//     image: "./cakephotos/White Forest Choco Flakes Cake [500 g].png"
//   },
//   {
//     id: 14,
//     title: "Mocha Drizzle Swirl Cake",
//     metadata: "₹329",
//     description: "A rich mocha cake topped with creamy swirls and a glossy chocolate drizzle.",
//     image: "./cakephotos/Mocha Drizzle Swirl Cake.png"
//   },
//   {
//     id: 15,
//     title: "Choco Lava Brownie",
//     metadata: "₹389",
//     description: "A rich, dark chocolate brownie cake coated in glossy ganache, topped with a chocolate fan and cherry. Dense, chocolate and perfect for every celebration.",
//     image: "./cakephotos/Choco Lava Brownie Cake [500 g].png"
//   },
//   {
//     id: 16,
//     title: "Red Velvet Crumble",
//     metadata: "₹319",
//     description: "Soft and rich red velvet cake coated in fine crumble, topped with smooth cream swirl, cherry, and chocolate decor. Light, velvety and perfect for every celebration.",
//     image: "./cakephotos/Red Velvet Crumble Cake [500 g].png"
//   }
// ];

// const generateIdFromTitle = (title: string): string => {
//   return title
//     .toLowerCase()
//     .replace(/\[.*?\]/g, "")
//     .replace(/\(.*?\)/g, "")
//     .trim()
//     .replace(/\s+/g, "_");
// };

// /* =========================
//    IMAGE → BASE64 (LOCAL)
// ========================= */

// const MAX_SIZE_KB = 99;

// export const imageLocalToBase64 = async (
//   imagePath: string
// ): Promise<string> => {
//   const absolutePath = path.join(__dirname, imagePath.replace("./", ""));

//   if (!fs.existsSync(absolutePath)) {
//     throw new Error(`Image not found: ${absolutePath}`);
//   }

//   let quality = 80;
//   let width: number | undefined = undefined;
//   let buffer: Buffer;

//   while (true) {
//     buffer = await sharp(absolutePath)
//       .resize(width ? { width } : undefined)
//       .jpeg({ quality })
//       .toBuffer();

//     const sizeKB = buffer.length / 1024;

//     if (sizeKB <= MAX_SIZE_KB) {
//       console.log(
//         `✅ Image optimized: ${Math.round(sizeKB)} KB (quality=${quality}, width=${width ?? "original"})`
//       );
//       break;
//     }

//     // Reduce quality first
//     if (quality > 40) {
//       quality -= 10;
//     }
//     // Then reduce width
//     else {
//       width = width ? Math.floor(width * 0.9) : 800;
//     }
//   }

//   return buffer.toString("base64");
// };

// /* =========================
//    MAIN CONVERTER
// ========================= */

// export const convertImagesToBase64 = async (
//   input: ImageInput[],
//   outputFilePath?: string
// ): Promise<ImageOutput[]> => {
//   const result: ImageOutput[] = [];

//   for (const item of input) {
//     try {
//       const base64Image = await imageLocalToBase64(item.image);

//       result.push({
//         id: generateIdFromTitle(item.title),
//         title: item.title,
//         metadata: item.metadata,
//         description: item.description,
//         image: base64Image, // ✅ WhatsApp Flow compatible
//       });

//       console.log(`✅ Converted: ${item.title}`);
//     } catch (error) {
//       console.error(`❌ Failed for: ${item.title}`, error);
//     }
//   }

//   // Optional: save JSON file
//   if (outputFilePath) {
//     const outputPath = path.join(__dirname, outputFilePath);
//     fs.writeFileSync(outputPath, JSON.stringify(result, null, 2), "utf-8");
//     console.log(`📁 Output written to ${outputPath}`);
//   }

//   return result;
// };


// (async () => {
//   await convertImagesToBase64(originalData, "cakeData.json");
// })();

// async function updateCakeData() {
//   try {
//     const googleSheet = new GoogleSheetService(
//       "1xlAP136l66VtTjoMkdTEueo-FXKD7_L1RJUlaxefXzI",
//       "cake data"
//     );

//     for (const item of cakeData) {
//       try {
//         await googleSheet.create({
//           id: item.id,
//           title: item.title,
//           metadata: item.metadata,
//           description: item.description,
//           instock: true,
//         });

//         console.log(
//           `✅ Created: ${item.id} | ${item.title}`
//         );
//       } catch (itemError) {
//         console.error(
//           `❌ Failed to create item ${item.id} | ${item.title}`,
//           itemError
//         );
//       }
//     }

//     console.log("🎉 All entries processed");
//   } catch (error) {
//     console.error("🔥 updateCakeData failed", error);
//   }
// }
// updateCakeData();