import mongoose from "mongoose";

const agentTeamSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    memberIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "SalesTeamMember",
      },
    ],
    routingStrategy: {
      type: String,
      enum: ["round_robin", "random", "least_busy"],
      default: "round_robin",
    },
    lastAssignedIndex: {
      type: Number,
      default: 0,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

agentTeamSchema.index({ userId: 1, name: 1 }, { unique: true });

const AgentTeam = mongoose.model("AgentTeam", agentTeamSchema);

export default AgentTeam;
