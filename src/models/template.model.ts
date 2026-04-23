import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    language: { type: String, required: true },
    category: { type: String, required: true },

    // 🔥 HEADER CONFIG
    header_format: { type: String }, // IMAGE | VIDEO | DOCUMENT | TEXT

    // 🔥 MEDIA (only ONE source of truth)
    media_id: { type: String }, // ✅ Meta media id (BEST)
    media_url: { type: String }, // optional fallback (S3)

    // 🔥 TEMPLATE STRUCTURE
    components: { type: Array, required: true },

    channel_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
    },
  },
  { timestamps: true }
);

export const TemplateModel = mongoose.model("Template", templateSchema);