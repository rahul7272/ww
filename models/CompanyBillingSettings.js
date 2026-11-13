import mongoose from "mongoose";

const companyBillingSettingsSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    // Company Profile & Identity
    companyName: { type: String, default: "TravBizz Technologies", trim: true },
    legalName: { type: String, default: "TravBizz Digital Media Private Limited", trim: true },
    logoUrl: { type: String, default: "" },
    tagline: { type: String, default: "Enterprise WhatsApp Business API & Digital Solutions", trim: true },
    email: { type: String, default: "billing@travbizz.com", trim: true },
    phone: { type: String, default: "919999999999", trim: true },
    website: { type: String, default: "https://travbizz.com", trim: true },

    // Tax Information
    gstin: { type: String, default: "", trim: true },
    pan: { type: String, default: "", trim: true },

    // Registered Billing Address
    address: { type: String, default: "Plot 104, Cyber City Phase 2", trim: true },
    city: { type: String, default: "Gurugram", trim: true },
    state: { type: String, default: "Haryana", trim: true },
    stateCode: { type: String, default: "06", trim: true },
    pincode: { type: String, default: "122002", trim: true },
    country: { type: String, default: "India", trim: true },

    // Banking & UPI Payment Details
    bankName: { type: String, default: "HDFC Bank Ltd", trim: true },
    bankAccountHolder: { type: String, default: "TravBizz Digital Media Pvt Ltd", trim: true },
    bankAccountNo: { type: String, default: "50200012345678", trim: true },
    bankIfsc: { type: String, default: "HDFC0001234", trim: true },
    bankBranch: { type: String, default: "Cyber City Branch, Gurugram", trim: true },
    upiId: { type: String, default: "travbizz@hdfcbank", trim: true },

    // Authorized Signatory
    signatoryName: { type: String, default: "Rahul Verma", trim: true },
    signatoryDesignation: { type: String, default: "Managing Director", trim: true },
    signatureUrl: { type: String, default: "" },

    // Invoice Defaults
    invoicePrefix: { type: String, default: "INV-", trim: true },
    nextInvoiceNumber: { type: Number, default: 1001 },
    defaultDueDays: { type: Number, default: 15 },
    defaultTerms: {
      type: String,
      default:
        "1. 100% advance or milestone payments as agreed upon.\n2. Invoices are due within 15 days of issuance.\n3. GST is charged as applicable under Indian Tax Laws (18% SAC 998314).\n4. All payments to be made in favor of company bank account or verified UPI ID.",
    },
    defaultNotes: {
      type: String,
      default:
        "Thank you for choosing us as your WhatsApp Business API & Digital Solutions partner!",
    },
  },
  { timestamps: true }
);

const CompanyBillingSettings = mongoose.model(
  "CompanyBillingSettings",
  companyBillingSettingsSchema
);

export default CompanyBillingSettings;

