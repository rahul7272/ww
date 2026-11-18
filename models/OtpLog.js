import mongoose from "mongoose";

const otpLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      required: true,
      index: true,
    },
    phoneNumber: {
      type: String,
      required: true,
      index: true,
    },
    mode: {
      type: String,
      enum: ["SYSTEM_GENERATED", "CALLER_PROVIDED"],
      required: true,
      default: "CALLER_PROVIDED",
    },
    otpDisplay: {
      type: String,
      default: "", // Masked e.g. "48****" or partial for security audit
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppTemplate",
      default: null,
    },
    templateName: {
      type: String,
      default: "",
    },
    status: {
      type: String,
      enum: ["QUEUED", "DISPATCHED", "DELIVERED", "FAILED"],
      default: "QUEUED",
      index: true,
    },
    verificationStatus: {
      type: String,
      enum: ["PENDING", "VERIFIED", "EXPIRED", "FAILED_MAX_ATTEMPTS"],
      default: "PENDING",
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    dispatchLatencyMs: {
      type: Number,
      default: 0,
    },
    errorMessage: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

otpLogSchema.index({ createdAt: -1 });

export default mongoose.model("OtpLog", otpLogSchema);
