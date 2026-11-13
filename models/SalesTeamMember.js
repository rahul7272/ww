import mongoose from "mongoose";

const salesTeamMemberSchema = new mongoose.Schema(
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
    role: {
      type: String,
      default: "Sales Executive",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

salesTeamMemberSchema.index({ userId: 1, name: 1 });

const SalesTeamMember = mongoose.model("SalesTeamMember", salesTeamMemberSchema);
export default SalesTeamMember;

