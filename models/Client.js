import mongoose from "mongoose";

const clientSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    firstName: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    lastName: {
      type: String,
      default: "",
      trim: true,
    },
    title: {
      type: String,
      default: "",
      trim: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
      lowercase: true,
    },
    mobile: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      default: null,
    },
    companyName: {
      type: String,
      default: "",
      trim: true,
    },
    owner: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    dateOfBirth: {
      type: String,
      default: "",
      trim: true,
    },

    // Address Information
    mailingStreet: {
      type: String,
      default: "",
      trim: true,
    },
    mailingCity: {
      type: String,
      default: "",
      trim: true,
    },
    mailingZip: {
      type: String,
      default: "",
      trim: true,
    },

    // Pipeline & Contact metrics (Matching Image 1 filters & stats)
    openPipelines: {
      type: Number,
      default: 0,
    },
    untouched: {
      type: Boolean,
      default: true,
    },
    lastContactedAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

clientSchema.index({ userId: 1, mobile: 1 });
clientSchema.index({ userId: 1, email: 1 });
clientSchema.index({ userId: 1, companyName: 1 });
clientSchema.index({ userId: 1, openPipelines: 1 });
clientSchema.index({ userId: 1, untouched: 1 });
clientSchema.index({ userId: 1, owner: 1 });
clientSchema.index({ userId: 1, createdAt: -1 });

const Client = mongoose.model("Client", clientSchema);
export default Client;

