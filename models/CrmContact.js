import mongoose from "mongoose";

const crmNoteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true },
    createdBy: { type: String, default: "User" },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const crmActivitySchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["task", "event", "call"],
      default: "task",
    },
    title: { type: String, required: true, trim: true },
    dueDateTime: { type: Date, default: null },
    dueDate: { type: Date, default: null }, // for backwards compatibility
    status: {
      type: String,
      default: "Open", // "Open", "In Progress", "Completed", "Cancelled"
    },
    priority: {
      type: String,
      default: "Normal", // "Normal", "Low", "Medium", "High", "Urgent"
    },
    owner: { type: String, default: "", trim: true },
    hasReminder: { type: Boolean, default: false },
    reminderOption: { type: String, default: "At Due Time" },
    reminderTime: { type: Date, default: null },
    isTriggered: { type: Boolean, default: false },
    isDismissed: { type: Boolean, default: false },
    autoSendWhatsApp: { type: Boolean, default: false },
    whatsAppText: { type: String, default: "", trim: true },
    snoozeUntil: { type: Date, default: null },
    hasRepeat: { type: Boolean, default: false },
    repeatFrequency: { type: String, default: "Every Day" },
    repeatUntil: { type: Date, default: null },
    description: { type: String, default: "", trim: true },
    notes: { type: String, default: "", trim: true },
    outcome: { type: String, default: "", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const crmQuotationSchema = new mongoose.Schema(
  {
    title: { type: String, default: "Sales Quotation", trim: true },
    product: { type: String, default: "WhatsApp Business API", trim: true },
    description: { type: String, default: "", trim: true },
    quantity: { type: Number, default: 1 },
    unitPrice: { type: Number, default: 0 },
    totalPrice: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    status: {
      type: String,
      enum: ["Draft", "Sent", "Confirmed", "Rejected"],
      default: "Draft",
    },
    validUntil: { type: Date, default: null },
    terms: { type: String, default: "100% Advance Payment" },
    items: [
      {
        name: { type: String, default: "" },
        description: { type: String, default: "" },
        qty: { type: Number, default: 1 },
        rate: { type: Number, default: 0 },
        amount: { type: Number, default: 0 },
      },
    ],
    // Legacy fields preserved as optional for backward compatibility
    destination: { type: String, default: "" },
    nights: { type: Number, default: 0 },
    hotel: { type: String, default: "" },
    days: [
      {
        dayNumber: Number,
        title: String,
        description: String,
      },
    ],
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const crmInvoiceSchema = new mongoose.Schema(
  {
    invoiceNumber: { type: String, required: true },
    amount: { type: Number, default: 0 },
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Unpaid", "Partially Paid", "Paid"],
      default: "Unpaid",
    },
    dueDate: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const crmContactSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    sessionId: { type: String, default: null, index: true },
    name: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true, index: true },
    chatJid: { type: String, required: true, index: true },
    email: { type: String, default: "", trim: true },
    company: { type: String, default: "", trim: true },
    address: { type: String, default: "" },
    city: { type: String, default: "", trim: true },
    state: { type: String, default: "", trim: true },
    country: { type: String, default: "India", trim: true },

    // Query & Sales Deal Identification
    queryId: { type: String, default: "", trim: true, index: true },
    queryTitle: { type: String, default: "", trim: true },
    priority: {
      type: String,
      enum: ["Low", "Medium", "High", "Urgent"],
      default: "Medium",
    },
    dealType: { type: String, default: "Sales Deal", trim: true },
    dealValue: { type: Number, default: 0 },
    salesOwner: { type: String, default: "", trim: true },

    // Customer Classification
    customerType: {
      type: String,
      enum: ["Lead", "Prospect", "Customer", "VIP", "Partner", "Vendor", "Other"],
      default: "Lead",
      index: true,
    },
    leadStatus: {
      type: String,
      enum: [
        "New",
        "No Connect",
        "Contacted",
        "Follow Up",
        "Qualified",
        "Proposal Sent",
        "Proposal Confirmed",
        "In Negotiation",
        "Hot Lead",
        "Confirmed",
        "Won",
        "Lost",
        "Churned",
      ],
      default: "New",
      index: true,
    },
    leadSource: {
      type: String,
      enum: [
        "WhatsApp Inbound",
        "Broadcast Campaign",
        "Drip Sequence",
        "Website",
        "Facebook Ad",
        "Instagram",
        "Google",
        "Referral",
        "Cold Outreach",
        "Manual Entry",
        "Other",
      ],
      default: "WhatsApp Inbound",
      index: true,
    },

    // Sales Deal Info
    assignedAgent: { type: String, default: "", trim: true },
    budget: { type: Number, default: 0 },
    currency: { type: String, default: "INR" },
    product: { type: String, default: "" },
    requirement: { type: String, default: "" },
    expectedClosingDate: { type: Date, default: null },

    // Engagement Metrics
    totalPurchases: { type: Number, default: 0 },
    totalConversations: { type: Number, default: 0 },
    lastInteraction: { type: Date, default: Date.now },
    lastInteractionText: { type: String, default: "" },

    // Dynamic Segmentation, Notes, Activities & Quotations
    tags: [{ type: String, trim: true }],
    notes: [crmNoteSchema],
    activities: [crmActivitySchema],
    quotations: [crmQuotationSchema],
    invoices: [crmInvoiceSchema],
    customFields: { type: Map, of: String, default: {} },
  },
  { timestamps: true }
);

crmContactSchema.index({ userId: 1, phone: 1 }, { unique: true });
crmContactSchema.index({ userId: 1, leadStatus: 1 });
crmContactSchema.index({ userId: 1, customerType: 1 });
crmContactSchema.index({ userId: 1, queryId: 1 });
crmContactSchema.index({ userId: 1, lastInteraction: -1 });
crmContactSchema.index({ userId: 1, createdAt: -1 });
crmContactSchema.index({ userId: 1, assignedAgent: 1 });
crmContactSchema.index({ userId: 1, salesOwner: 1 });
crmContactSchema.index({ userId: 1, name: 1 });
crmContactSchema.index({ userId: 1, email: 1 });
crmContactSchema.index({ userId: 1, leadSource: 1 });

export default mongoose.model("CrmContact", crmContactSchema);
