import mongoose from "mongoose";

const mediaSettingsSchema = new mongoose.Schema(
  {
    key: { type: String, default: "global", unique: true },
    storageService: {
      type: String,
      enum: ["vps", "whatsapp_url"],
      default: "vps",
    },
    publicBaseUrl: {
      type: String,
      default: "",
    },
    autoDownload: {
      image: { type: Boolean, default: true },
      video: { type: Boolean, default: true },
      audio: { type: Boolean, default: true },
      document: { type: Boolean, default: true },
    },
    image:    { maxSizeMB: { type: Number, default: 16,  min: 1, max: 100 } },
    video:    { maxSizeMB: { type: Number, default: 64,  min: 1, max: 500 } },
    audio:    { maxSizeMB: { type: Number, default: 32,  min: 1, max: 100 } },
    document: { maxSizeMB: { type: Number, default: 50,  min: 1, max: 100 } },
  },
  { timestamps: true },
);

export default mongoose.model("MediaSettings", mediaSettingsSchema);
