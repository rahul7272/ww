import mongoose from "mongoose";

const defaultSchedule = [
  { day: "monday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "tuesday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "wednesday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "thursday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "friday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "saturday", isOpen: false, slots: [{ start: "09:00", end: "18:00" }] },
  { day: "sunday", isOpen: false, slots: [{ start: "09:00", end: "18:00" }] },
];

const slotSchema = new mongoose.Schema(
  {
    start: { type: String, default: "09:00", trim: true },
    end: { type: String, default: "18:00", trim: true },
  },
  { _id: false }
);

const dayScheduleSchema = new mongoose.Schema(
  {
    day: {
      type: String,
      enum: ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"],
      required: true,
    },
    isOpen: { type: Boolean, default: true },
    slots: {
      type: [slotSchema],
      default: () => [{ start: "09:00", end: "18:00" }],
    },
  },
  { _id: false }
);

const holidaySchema = new mongoose.Schema(
  {
    date: { type: String, required: true, trim: true }, // Format: dd-mm-yyyy or yyyy-mm-dd
    name: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const whatsAppAutomationRuleSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: {
      type: String,
      default: "default",
      trim: true,
      index: true,
    },

    // ── Welcome Message ──
    welcomeMessage: {
      enabled: { type: Boolean, default: false },
      text: {
        type: String,
        default: "Hi {{name}}, welcome! 👋 Thanks for messaging us. How can we help you today?",
        trim: true,
      },
      thenContinueType: {
        type: String,
        enum: ["none", "flow", "ai_agent"],
        default: "none",
      },
      thenContinueTargetId: {
        type: String,
        default: "",
        trim: true,
      },
    },

    // ── Away Message ──
    awayMessage: {
      enabled: { type: Boolean, default: false },
      text: {
        type: String,
        default: "Hi {{name}}, thanks for your message! We are closed right now and will reply as soon as we are back.",
        trim: true,
      },
      throttleHours: {
        type: Number,
        default: 12,
        min: 1,
        max: 168,
      },
    },

    // ── Business Hours ──
    businessHours: {
      enabled: { type: Boolean, default: false },
      timeZone: {
        type: String,
        default: "Asia/Kolkata",
        trim: true,
      },
      schedule: {
        type: [dayScheduleSchema],
        default: () => defaultSchedule,
      },
      holidays: {
        type: [holidaySchema],
        default: () => [],
      },
    },
  },
  { timestamps: true }
);

// Compound unique index per user and session/number
whatsAppAutomationRuleSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

const WhatsAppAutomationRule = mongoose.model(
  "WhatsAppAutomationRule",
  whatsAppAutomationRuleSchema
);

export default WhatsAppAutomationRule;
