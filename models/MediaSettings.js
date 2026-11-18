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
    retentionDays: { type: Number, default: 30, min: 0 },
    autoCleanupEnabled: { type: Boolean, default: true },
    categoryRetention: {
      video:    { enabled: { type: Boolean, default: true }, days: { type: Number, default: 15, min: 0 } },
      image:    { enabled: { type: Boolean, default: true }, days: { type: Number, default: 30, min: 0 } },
      audio:    { enabled: { type: Boolean, default: true }, days: { type: Number, default: 30, min: 0 } },
      document: { enabled: { type: Boolean, default: true }, days: { type: Number, default: 60, min: 0 } },
      other:    { enabled: { type: Boolean, default: true }, days: { type: Number, default: 20, min: 0 } },
    },
    lastCleanup: {
      executedAt: { type: Date, default: null },
      targetCategory: { type: String, default: "all" },
      filesDeleted: { type: Number, default: 0 },
      bytesFreed: { type: Number, default: 0 },
      sizeFreed: { type: String, default: "0 B" },
      status: { type: String, default: "idle" },
    },
  },
  { timestamps: true },
);

export default mongoose.model("MediaSettings", mediaSettingsSchema);
