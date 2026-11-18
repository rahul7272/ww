import mongoose from "mongoose";

const templateButtonSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["COPY_CODE", "URL", "PHONE_NUMBER", "QUICK_REPLY"],
      required: true,
      default: "QUICK_REPLY",
    },
    text: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      default: "",
      trim: true,
    },
    connectionType: {
      type: String,
      enum: ["PAYLOAD", "AUTO_REPLY", "FLOW", "QUICK_REPLY_SHORTCUT"],
      default: "PAYLOAD",
    },
    autoReplyText: {
      type: String,
      default: "",
      trim: true,
    },
    flowId: {
      type: String,
      default: "",
      trim: true,
    },
    flowScreen: {
      type: String,
      default: "START",
      trim: true,
    },
  },
  { _id: false }
);

const whatsappTemplateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      default: "",
      trim: true,
    },
    name: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["AUTHENTICATION", "MARKETING", "UTILITY"],
      default: "AUTHENTICATION",
      index: true,
    },
    language: {
      type: String,
      default: "en_US",
    },
    messageType: {
      type: String,
      enum: ["STANDARD", "CAROUSEL", "LIMITED_TIME_OFFER", "CATALOG", "MULTI_PRODUCT"],
      default: "STANDARD",
    },
    header: {
      format: {
        type: String,
        enum: ["NONE", "TEXT", "IMAGE", "VIDEO", "DOCUMENT"],
        default: "NONE",
      },
      text: {
        type: String,
        default: "",
      },
      mediaUrl: {
        type: String,
        default: "",
      },
    },
    body: {
      type: String,
      required: true,
    },
    exampleValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    footer: {
      type: String,
      default: "",
    },
    buttons: [templateButtonSchema],
    status: {
      type: String,
      enum: ["ACTIVE", "DRAFT", "ARCHIVED"],
      default: "ACTIVE",
      index: true,
    },
    clonedFrom: {
      type: String,
      default: "",
      trim: true,
      index: true,
    },
    stats: {
      sentCount: { type: Number, default: 0 },
      deliveredCount: { type: Number, default: 0 },
      failedCount: { type: Number, default: 0 },
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to ensure unique template name per user
whatsappTemplateSchema.index({ userId: 1, name: 1 }, { unique: true });

export default mongoose.model("WhatsAppTemplate", whatsappTemplateSchema);
