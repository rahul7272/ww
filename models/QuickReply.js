import mongoose from "mongoose";

const quickReplyMessageSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: [
        "text",
        "image",
        "video",
        "audio",
        "document",
        "contact",
        "location",
        "buttons",
      ],
      default: "text",
    },
    text: { type: String, default: "" }, // supports template variables {{name}}, {{first_name}}, {{phone}}, {{agent_name}}
    header: { type: String, default: "" },
    footer: { type: String, default: "" },
    mediaUrl: { type: String, default: null },
    mediaName: { type: String, default: null },
    caption: { type: String, default: "" },
    contact: {
      name: { type: String, default: "" },
      phone: { type: String, default: "" },
      email: { type: String, default: "" },
      company: { type: String, default: "" },
    },
    location: {
      degreesLatitude: { type: Number, default: null },
      degreesLongitude: { type: Number, default: null },
      name: { type: String, default: "" },
      address: { type: String, default: "" },
    },
    buttons: [
      {
        id: { type: String, default: "" },
        text: { type: String, default: "" },
      },
    ],
    list: {
      title: { type: String, default: "" },
      buttonText: { type: String, default: "" },
      sections: [
        {
          title: { type: String, default: "" },
          rows: [
            {
              id: { type: String, default: "" },
              title: { type: String, default: "" },
              description: { type: String, default: "" },
            },
          ],
        },
      ],
    },
  },
  { _id: true }
);

const quickReplySchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
    },
    shortcut: {
      type: String,
      required: [true, "Shortcut is required"],
      trim: true,
      lowercase: true,
    },
    scope: {
      type: String,
      enum: ["all", "selected"],
      default: "all",
    },
    sessionIds: {
      type: [String],
      default: [],
    },
    behavior: {
      type: String,
      enum: ["edit", "send_now"],
      default: "edit",
    },
    messages: {
      type: [quickReplyMessageSchema],
      default: () => [{ type: "text", text: "" }],
    },
    order: {
      type: Number,
      default: 0,
    },
    usageCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

// Normalize shortcut to always have a leading '/' and lowercase
quickReplySchema.pre("save", function (next) {
  if (this.shortcut) {
    let clean = this.shortcut.trim().toLowerCase();
    if (!clean.startsWith("/")) {
      clean = `/${clean}`;
    }
    this.shortcut = clean;
  }
  next();
});

// Ensure unique shortcut per user
quickReplySchema.index({ userId: 1, shortcut: 1 }, { unique: true });

const QuickReply = mongoose.model("QuickReply", quickReplySchema);
export default QuickReply;

