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
    queryId: { type: String, default: "", index: true },

    invoiceNumber: { type: String, required: true, trim: true, index: true },
    issueDate: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    templateId: {
      type: String,
      enum: ["template-1", "template-2", "template-3", "template-4"],
      default: "template-1",
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
    notes: { type: String, default: "" },
    payments: [paymentRecordSchema],
  },
  { timestamps: true }
);

invoiceSchema.index({ userId: 1, invoiceNumber: 1 });
invoiceSchema.index({ userId: 1, contactId: 1 });

const Invoice = mongoose.model("Invoice", invoiceSchema);
export default Invoice;

