import mongoose from "mongoose";

const templateLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "WhatsAppTemplate",
      default: null,
      index: true,
    },
    templateName: {
      type: String,
      default: "",
      index: true,
    },
    displayName: {
      type: String,
      default: "",
    },
    category: {
      type: String,
      enum: ["AUTHENTICATION", "UTILITY", "MARKETING"],
      default: "MARKETING",
      index: true,
    },
    action: {
      type: String,
      enum: ["DISPATCH", "TEST_SEND", "CREATED", "UPDATED", "OTP_VERIFY"],
      default: "DISPATCH",
      index: true,
    },
    sessionId: {
      type: String,
      default: "",
      index: true,
    },
    phoneNumber: {
      type: String,
      default: "",
      index: true,
    },
    status: {
      type: String,
      enum: ["DISPATCHED", "SENT", "DELIVERED", "FAILED", "SUCCESS"],
      default: "DISPATCHED",
      index: true,
    },
    messageId: {
      type: String,
      default: "",
    },
    dispatchLatencyMs: {
      type: Number,
      default: 0,
    },
    variables: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    errorMessage: {
      type: String,
      default: "",
    },
    ipAddress: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  }
);

templateLogSchema.index({ userId: 1, createdAt: -1 });
templateLogSchema.index({ phoneNumber: 1, createdAt: -1 });

export default mongoose.model("TemplateLog", templateLogSchema);
