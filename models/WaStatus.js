import mongoose from "mongoose";

const waStatusSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    sessionId: { type: String, required: true, index: true },
    batchId: { type: String, default: null, index: true },
    campaignTitle: { type: String, default: "" },
    type: { type: String, enum: ["text", "media"], required: true },
    text: { type: String, default: "" },
    caption: { type: String, default: "" },
    backgroundColor: { type: String, default: "#008069" },
    mediaUrl: { type: String, default: "" },
    mediaType: { type: String, default: "" },
    mediaFileName: { type: String, default: "" },
    mediaFileSize: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["scheduled", "sending", "sent", "failed"],
      default: "sending",
      index: true,
    },
    scheduledFor: { type: Date, default: null, index: true },
    scheduledDateKey: { type: String, default: "", index: true }, // Format: YYYY-MM-DD
    orderIndex: { type: Number, default: 0 },
    retryCount: { type: Number, default: 0 },
    postedAt: { type: Date, default: null },
    recipientsCount: { type: Number, default: 0 },
    waMessageId: { type: String, default: "" },
    errorMessage: { type: String, default: "" },
    debugInfo: { type: mongoose.Schema.Types.Mixed, default: null },
  },
  { timestamps: true }
);

waStatusSchema.index({ userId: 1, sessionId: 1, createdAt: -1 });
waStatusSchema.index({ userId: 1, sessionId: 1, scheduledDateKey: 1 });
waStatusSchema.index({ status: 1, scheduledFor: 1 });

export default mongoose.model("WaStatus", waStatusSchema);
