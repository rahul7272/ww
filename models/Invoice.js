import mongoose from "mongoose";

const invoiceItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    hsnSac: { type: String, default: "998314", trim: true },
    quantity: { type: Number, default: 1, min: 0 },
    unitPrice: { type: Number, required: true, default: 0 },
    taxRate: { type: Number, default: 18 }, // Tax percentage (e.g. 18% GST)
    taxAmount: { type: Number, default: 0 },
    amount: { type: Number, required: true, default: 0 },
  },
  { _id: true }
);

const paymentRecordSchema = new mongoose.Schema(
  {
    amount: { type: Number, required: true },
    method: {
      type: String,
      enum: ["UPI", "Bank Transfer", "Credit/Debit Card", "Net Banking", "Cash", "Other"],
      default: "UPI",
    },
    reference: { type: String, default: "", trim: true }, // e.g. UTR / Transaction ID
    date: { type: Date, default: Date.now },
    notes: { type: String, default: "", trim: true },
  },
  { _id: true }
);

const invoiceNoteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    authorName: { type: String, default: "Admin", trim: true },
    createdAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const reminderRecordSchema = new mongoose.Schema(
  {
    milestone: {
      type: String,
      enum: ["2_days_before", "due_date", "overdue_1", "manual", "payment_receipt"],
      default: "manual",
    },
    sentAt: { type: Date, default: Date.now },
    recipientPhone: { type: String, default: "", trim: true },
    messageId: { type: String, default: "", trim: true },
    messageSnippet: { type: String, default: "", trim: true },
    pdfAttached: { type: Boolean, default: false },
    pdfUrl: { type: String, default: "", trim: true },
    sessionId: { type: String, default: "", trim: true },
    status: { type: String, default: "sent", trim: true },
  },
  { _id: true }
);

const invoiceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    contactId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "CrmContact",
      index: true,
      default: null,
    },
    clientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Client",
      index: true,
      default: null,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Company",
      index: true,
      default: null,
    },
    queryId: { type: String, default: "", index: true },

    invoiceNumber: { type: String, required: true, trim: true, index: true },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    templateId: {
      type: String,
      default: "corporate-gst",
      trim: true,
    },

    // Snapshotted Client Info
    client: {
      name: { type: String, required: true, trim: true },
      company: { type: String, default: "", trim: true },
      phone: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      gstin: { type: String, default: "", trim: true },
    },

    // Snapshotted Company / Billed-By Info
    company: {
      companyName: { type: String, default: "", trim: true },
      legalName: { type: String, default: "", trim: true },
      logoUrl: { type: String, default: "" },
      tagline: { type: String, default: "", trim: true },
      address: { type: String, default: "", trim: true },
      city: { type: String, default: "", trim: true },
      state: { type: String, default: "", trim: true },
      stateCode: { type: String, default: "", trim: true },
      pincode: { type: String, default: "", trim: true },
      country: { type: String, default: "India", trim: true },
      phone: { type: String, default: "", trim: true },
      email: { type: String, default: "", trim: true },
      website: { type: String, default: "", trim: true },
      gstin: { type: String, default: "", trim: true },
      pan: { type: String, default: "", trim: true },
      bankName: { type: String, default: "", trim: true },
      bankAccountHolder: { type: String, default: "", trim: true },
      bankAccountNo: { type: String, default: "", trim: true },
      bankIfsc: { type: String, default: "", trim: true },
      bankBranch: { type: String, default: "", trim: true },
      upiId: { type: String, default: "", trim: true },
      signatoryName: { type: String, default: "", trim: true },
      signatoryDesignation: { type: String, default: "", trim: true },
      signatureUrl: { type: String, default: "" },
    },

    // Line Items & Calculations
    items: [invoiceItemSchema],
    subtotal: { type: Number, default: 0 },
    discount: { type: Number, default: 0 },
    taxTotal: { type: Number, default: 0 },
    cgst: { type: Number, default: 0 },
    sgst: { type: Number, default: 0 },
    igst: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    grandTotal: { type: Number, required: true },

    // Payment Tracking
    paidAmount: { type: Number, default: 0 },
    balanceAmount: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ["Draft", "Unpaid", "Partially Paid", "Paid", "Overdue", "Cancelled"],
      default: "Unpaid",
      index: true,
    },

    // Terms, Notes & Audit
    terms: { type: String, default: "" },
    notes: { type: String, default: "" }, // Default terms/notes on printed invoice
    activityNotes: [invoiceNoteSchema], // Internal track record / brief notes
    payments: [paymentRecordSchema],

    // WhatsApp Reminder tracking
    whatsappReminderSentAt: { type: Date, default: null },
    whatsappReminderCount: { type: Number, default: 0 },
    pdfUrl: { type: String, default: "" },
    remindersSent: [reminderRecordSchema],
  },
  { timestamps: true }
);

invoiceSchema.index({ userId: 1, invoiceNumber: 1 });
invoiceSchema.index({ userId: 1, contactId: 1 });
invoiceSchema.index({ userId: 1, clientId: 1 });
invoiceSchema.index({ userId: 1, companyId: 1 });
invoiceSchema.index({ userId: 1, status: 1 });
invoiceSchema.index({ userId: 1, dueDate: 1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;

