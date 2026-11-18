import mongoose from "mongoose";

const prebuiltButtonSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["QUICK_REPLY", "URL", "PHONE_NUMBER", "COPY_CODE"],
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
    url: {
      type: String,
      default: "",
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { _id: false }
);

const localizedContentSchema = new mongoose.Schema(
  {
    language: {
      type: String,
      required: true, // 'en', 'hi', 'gu'
      trim: true,
    },
    languageLabel: {
      type: String,
      required: true, // 'English', 'हिंदी', 'ગુજરાતી'
      trim: true,
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
    footer: {
      type: String,
      default: "",
    },
    buttons: [prebuiltButtonSchema],
    sampleValues: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  { _id: false }
);

const prebuiltTemplateSchema = new mongoose.Schema(
  {
    slug: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    industry: {
      type: String,
      enum: [
        "Ecommerce",
        "Restaurant",
        "Finance",
        "General",
        "Salon & spa",
        "Clinic & healthcare",
        "Education",
        "Real estate",
        "Travel",
        "Events",
        "Services",
      ],
      required: true,
      index: true,
    },
    category: {
      type: String,
      enum: ["UTILITY", "MARKETING", "AUTHENTICATION"],
      required: true,
      index: true,
    },
    format: {
      type: String,
      enum: ["TEXT", "BUTTONS_TEXT", "MEDIA_BUTTONS", "CAROUSEL"],
      default: "TEXT",
      index: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    metaComplianceNote: {
      type: String,
      default: "Written to pass Meta review",
    },
    localizations: [localizedContentSchema],
    defaultLanguage: {
      type: String,
      default: "en",
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Indexes for high-speed multi-criteria filtering
prebuiltTemplateSchema.index({ industry: 1, category: 1, format: 1 });
prebuiltTemplateSchema.index({ title: "text", description: "text" });

export default mongoose.model("PrebuiltTemplate", prebuiltTemplateSchema);
