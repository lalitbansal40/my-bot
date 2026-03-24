import mongoose from "mongoose";

const templateSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    language: { type: String, required: true },
    category: { type: String, required: true },

    // 🔥 important fields
    header_format: { type: String }, // IMAGE | VIDEO | DOCUMENT | TEXT
    media_url: { type: String }, // S3 URL

    // optional (future use)
    media_id: { type: String }, // for faster sending (optional)

    components: { type: Array, required: true },

    channel_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Channel",
    },
  },
  { timestamps: true }
);

export const TemplateModel = mongoose.model("Template", templateSchema);