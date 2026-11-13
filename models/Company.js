import mongoose from "mongoose";

const companySchema = new mongoose.Schema(
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
      index: true,
    },
    email: {
      type: String,
      default: "",
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    website: {
      type: String,
      default: "",
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    gstNo: {
      type: String,
      default: "",
      trim: true,
    },
    panNo: {
      type: String,
      default: "",
      trim: true,
    },
    industry: {
      type: String,
      default: "",
      trim: true,
    },

    // Address Information
    billingStreet: {
      type: String,
      default: "",
      trim: true,
    },
    billingCity: {
      type: String,
      default: "",
      trim: true,
    },
    billingState: {
      type: String,
      default: "",
      trim: true,
    },
    billingCountry: {
      type: String,
      default: "India",
      trim: true,
    },
    billingCode: {
      type: String,
      default: "",
      trim: true,
    },
  },
  { timestamps: true }
);

companySchema.index({ userId: 1, name: 1 });
companySchema.index({ userId: 1, phone: 1 });

const Company = mongoose.model("Company", companySchema);
export default Company;

