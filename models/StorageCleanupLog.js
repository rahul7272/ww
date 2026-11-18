import mongoose from "mongoose";

const storageCleanupLogSchema = new mongoose.Schema(
  {
    executedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    triggerType: {
      type: String,
      enum: ["automated_cron", "manual_admin"],
      default: "manual_admin",
      index: true,
    },
    targetCategory: {
      type: String,
      enum: ["all", "video", "image", "audio", "document", "other"],
      default: "all",
      index: true,
    },
    daysOlderThan: {
      type: Number,
      default: null,
    },
    allTime: {
      type: Boolean,
      default: false,
    },
    filesDeleted: {
      type: Number,
      default: 0,
    },
    bytesFreed: {
      type: Number,
      default: 0,
    },
    sizeFreed: {
      type: String,
      default: "0 B",
    },
    status: {
      type: String,
      enum: ["success", "failed"],
      default: "success",
    },
    adminEmail: {
      type: String,
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

storageCleanupLogSchema.index({ createdAt: -1 });

export default mongoose.model("StorageCleanupLog", storageCleanupLogSchema);
