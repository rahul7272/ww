import mongoose from "mongoose";

const whatsAppAutomationStateSchema = new mongoose.Schema(
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
      trim: true,
    },
    chatJid: {
      type: String,
      required: true,
      index: true,
      trim: true,
    },
    customerName: {
      type: String,
      default: "",
      trim: true,
    },
    phoneNumber: {
      type: String,
      default: "",
      trim: true,
    },
    welcomeMessageSent: {
      type: Boolean,
      default: false,
    },
    welcomeMessageSentAt: {
      type: Date,
      default: null,
    },
    lastAwayMessageSentAt: {
      type: Date,
      default: null,
    },
    awayMessageCount: {
      type: Number,
      default: 0,
    },
    assignedTeamId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AgentTeam",
      default: null,
      index: true,
    },
    assignedMemberId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SalesTeamMember",
      default: null,
      index: true,
    },
    lastInboundMessageAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

whatsAppAutomationStateSchema.index(
  { userId: 1, sessionId: 1, chatJid: 1 },
  { unique: true }
);

const WhatsAppAutomationState = mongoose.model(
  "WhatsAppAutomationState",
  whatsAppAutomationStateSchema
);

export default WhatsAppAutomationState;
