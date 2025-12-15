import express from "express";
import dotenv from "dotenv";
import webhookRoutes from "./routes/webhook.route";
import whatsappFlowRoutes from "./routes/whatsappFlow.route";
dotenv.config();
import axios from "axios";
import fs from "fs";
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



export interface ImageInput {
  id: number;
  title: string;
  metadata: string;
  description: string;
  image: string; // image URL
}

export interface ImageOutput {
  id: string;
  title: string;
  metadata: string;
  description: string;
  image: string; // base64
}

const originalData: ImageInput[] = [
  {
    id: 1,
    title: "Black & White Cake [500 g]",
    metadata: "₹319",
    description: "A premium black and white choco royale cake layered with rich chocolate sponge, smooth whipped cream and dark chocolate ganache. Topped with chocolate shavings and cream swirls for a perfect celebration treat.",
    image: "https://drive.google.com/file/d/1LAlGQi5HzR0OhJRMugNczipo_EKFjJ6N/view?usp=sharing"
  },
  {
    id: 2,
    title: "titlButterscotch Drizzle Delight Cake [500 g]e",
    metadata: "₹309",
    description: "A rich butterscotch cream cake topped with smooth chocolate drips, soft swirls, and colorful sprinkles. Perfectly moist, creamy and ideal for any celebration.",
    image: "https://drive.google.com/file/d/18fJZgGF5XzI8QR8xEPEI2wnb9RW7fy63/view?usp=sharing"
  },
  {
    id: 3,
    title: "Black & White Drizzle Cream Cake [500 g]",
    metadata: "₹319",
    description: "A soft vanilla cream cake topped with glossy chocolate drips, fluffy cream swirls, and rich choco shavings. Light, fresh and perfect for every celebration.",
    image: "https://drive.google.com/file/d/1k2I--D-igd40uGIFmfMwnJwanXFSfxLp/view?usp=sharing"
  },
  {
    id: 4,
    title: "Chocolate Chips Overload Cake [500 g]",
    metadata: "₹339",
    description: "A rich chocolate cake coated in glossy ganache, loaded with dark choco chips, white pearls and decorative chocolate pieces. Deep, indulgent and perfect for true chocolate lovers.",
    image: "https://drive.google.com/file/d/1sL8CwCAtU0hMNlxF0FBM4mmJ7XNKya-9/view?usp=sharing"
  },
  {
    id: 5,
    title: "Choco Truffle Delight Cake [500 g]",
    metadata: "₹319",
    description: "A rich dark chocolate truffle cake topped with a decorative chocolate fan, cherry, and crunchy choco chips. Smooth, indulgent and perfect for chocolate lovers.",
    image: "https://drive.google.com/file/d/1888JBOcxQ34XiI1GrIHSF30Cv4Qh9BhH/view?usp=sharing"
  },
  {
    id: 6,
    title: "Chocolate Mocha Fusion Cake Cake [500 g]",
    metadata: "₹329",
    description: "A rich mocha chocolate cake topped with creamy swirls, dark ganache and chocolate shavings. Smooth, elegant and perfect for coffee, chocolate lovers.",
    image: "https://drive.google.com/file/d/1IpKZeSj-VNG0qO6W3FMErLldvLpOkYIV/view?usp=sharing"
  },
  {
    id: 7,
    title: "Midnight Chocolate Swirl Cake [500 g]",
    metadata: "₹329",
    description: "A rich dark chocolate swirl cake topped with smooth cream rosettes, glossy ganache and elegant chocolate décor. Bold, indulgent and perfect for every celebration.",
    image: "https://drive.google.com/file/d/1Jczjnm0TKpGbacdeGCGh5eXur_SCtqd7/view?usp=sharing"
  },
  {
    id: 8,
    title: "Dark Forest Spiral Cake [500 g]",
    metadata: "₹319",
    description: "A premium dark chocolate cake topped with a glossy ganache spiral, elegant chocolate decor and a cherry center.",
    image: "https://drive.google.com/file/d/1Patf5shTV6DhGRyUWDyiAusiVcFsyXj1/view?usp=sharing"
  },
  {
    id: 9,
    title: "Love & Chocolate Truffle Cake [500 g]",
    metadata: "₹339",
    description: "A rich chocolate truffle cake coated in fine choco shavings, decorated with heart shaped chocolate drizzle, white pearls and a cherry topper. Pure indulgence for special moments.",
    image: "https://drive.google.com/file/d/1blCWQS3ClA6npTgLDS4yNv1kLzbQkToX/view?usp=sharing"
  },
  {
    id: 10,
    title: "Pink Strawberry Drip Cake [500 g]",
    metadata: "₹309",
    description: "A soft strawberry cream cake topped with silky swirls, glossy dark drips and colorful jelly toppings. Light, smooth and perfect for celebrations.",
    image: "https://drive.google.com/file/d/1_8gwOjIvscnCsEN2gQxqLUcM6TkQm7pj/view?usp=sharing"
  },
  {
    id: 11,
    title: "Royal Tutti Frutti Celebration Cake [500 g]",
    metadata: "₹329",
    description: "Soft vanilla sponge topped with rich whipped cream, loaded with colorful tutti frutti and elegant chocolate garnishing.",
    image: "https://drive.google.com/file/d/1TWhZldV1pKT-ULbUtBhkgwXYQXvFgAiC/view?usp=sharing"
  },
  {
    id: 12,
    title: "Rosette Swirl Celebration Cake [500 g]",
    metadata: "₹319",
    description: "Soft vanilla cream cake decorated with beautiful pink, yellow and white rosette swirls.",
    image: "https://drive.google.com/file/d/1PaTk4QE2JiORi_-z8GzcE4-MI4dXnptY/view?usp=sharing"
  },
  {
    id: 13,
    title: "White Forest Choco Flakes Cake [500 g]",
    metadata: "₹319",
    description: "Soft vanilla sponge coated in whipped cream, topped with chocolate curls and flakes for a perfect white forest experience.",
    image: "https://drive.google.com/file/d/19OPRcy8OQCCuwYBlpi2Itl0T7AMlmkL1/view?usp=sharing"
  },
  {
    id: 14,
    title: "Mocha Drizzle Swirl Cake",
    metadata: "₹329",
    description: "A rich mocha cake topped with creamy swirls and a glossy chocolate drizzle.",
    image: "https://drive.google.com/file/d/1UZYZejupIvQuVEWkt8ZB_GjLOFj1NhVY/view?usp=sharing"
  },
  {
    id: 15,
    title: "Choco Lava Brownie Cake [500 g]",
    metadata: "₹389",
    description: "A rich, dark chocolate brownie cake coated in glossy ganache, topped with a chocolate fan and cherry. Dense, chocolate and perfect for every celebration.",
    image: "https://drive.google.com/file/d/1zV_5qpioBEy1SdGtpX0wvBpzsWX_pE8Y/view?usp=sharing"
  },
  {
    id: 16,
    title: "Red Velvet Crumble Cake [500 g]",
    metadata: "₹319",
    description: "Soft and rich red velvet cake coated in fine crumble, topped with smooth cream swirl, cherry, and chocolate decor. Light, velvety and perfect for every celebration.",
    image: "https://drive.google.com/file/d/1YuNOwbeJyLjQGojQBOX11gbKCviOdPk0/view?usp=sharing"
  }
]
export const generateIdFromTitle = (title: string): string => {
  return title
    .toLowerCase()
    .replace(/\[.*?\]/g, "")      // remove [500 g]
    .replace(/\s+/g, "_")         // spaces -> _
    .replace(/_+/g, "_")          // multiple _ -> single _
    .replace(/^_+|_+$/g, "")      // trim _ from start/end
    .trim();
};
const imageUrlToBase64 = async (url: string): Promise<string> => {
  const response = await axios.get(url, {
    responseType: "arraybuffer",
  });

  const contentType = response.headers["content-type"] || "image/jpeg";

  return `${Buffer.from(
    response.data
  ).toString("base64")}`;
};

/**
 * Convert array of image URLs to base64 JSON
 */
export const convertImagesToBase64 = async (
  input: ImageInput[],
  outputFilePath?: string
): Promise<ImageOutput[]> => {
  const result: ImageOutput[] = [];

  for (const item of input) {
    try {
      const base64Image = await imageUrlToBase64(item.image);

      result.push({
        id: generateIdFromTitle(item.title),
        title: item.title,
        metadata: item.metadata,
        description: item.description,
        image: base64Image,
      });
    } catch (error) {
      console.error(`❌ Failed to convert image for id ${item.id}`, error);
    }
  }

  // Optional: write to JSON file
  if (outputFilePath) {
    fs.writeFileSync(
      outputFilePath,
      JSON.stringify(result, null, 2),
      "utf-8"
    );
  }

  return result;
};

convertImagesToBase64(originalData, "cakedata")