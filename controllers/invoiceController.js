import mongoose from "mongoose";
import { existsSync } from "fs";
import { join } from "path";
import Invoice from "../models/Invoice.js";
import CompanyBillingSettings from "../models/CompanyBillingSettings.js";
import Client from "../models/Client.js";
import Company from "../models/Company.js";
import CrmContact from "../models/CrmContact.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppService from "../services/WhatsAppService.js";
import WaChatMessage from "../models/WaChatMessage.js";
import WaChat from "../models/WaChat.js";

// Helper: Round to 2 decimal places
const round2 = (num) => Math.round((Number(num) || 0) * 100) / 100;

// Helper: Generate UPI Pay URI
export const generateUpiUri = (upiId, companyName, amount, invoiceNo) => {
  if (!upiId) return "";
  const params = new URLSearchParams({
    pa: upiId.trim(),
    pn: (companyName || "Business").trim(),
    cu: "INR",
  });
  if (amount > 0) params.append("am", amount.toFixed(2));
  if (invoiceNo) params.append("tn", `Invoice ${invoiceNo}`);
  return `upi://pay?${params.toString()}`;
};

// Helper: Generate UPI QR Image URL
export const generateUpiQrUrl = (upiId, companyName, amount, invoiceNo) => {
  const uri = generateUpiUri(upiId, companyName, amount, invoiceNo);
  if (!uri) return "";
  return `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(uri)}`;
};

/**
 * 1. List Invoices with Search, Filter & Pagination + Real-time KPI Stats
 * GET /api/invoices
 */
export const listInvoices = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 20,
      search = "",
      status = "All",
      clientId = "",
      companyId = "",
      contactId = "",
      queryId = "",
      startDate = "",
      endDate = "",
      sortBy = "issueDate",
      sortOrder = "desc",
    } = req.query;

    const filter = { userId };

    // Search query across invoiceNumber, client name, company, phone, email
    if (search && search.trim()) {
      const s = search.trim();
      const regex = new RegExp(s, "i");
      filter.$or = [
        { invoiceNumber: regex },
        { "client.name": regex },
        { "client.company": regex },
        { "client.phone": regex },
        { "client.email": regex },
      ];
    }

    // Status filter
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const twoDaysLaterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59, 999);

    if (status && status !== "All") {
      if (status === "Overdue") {
        filter.status = { $ne: "Paid" };
        filter.balanceAmount = { $gt: 0 };
        filter.dueDate = { $lt: todayStart };
      } else if (status === "DueSoon" || status === "due_soon" || status === "Due2Days") {
        filter.status = { $ne: "Paid" };
        filter.balanceAmount = { $gt: 0 };
        filter.dueDate = { $gte: todayStart, $lte: twoDaysLaterEnd };
      } else {
        filter.status = status;
      }
    }

    // Specific entity links
    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) filter.clientId = clientId;
    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) filter.companyId = companyId;
    if (contactId && mongoose.Types.ObjectId.isValid(contactId)) filter.contactId = contactId;
    if (queryId) filter.queryId = queryId;

    // Date range filter
    if (startDate || endDate) {
      filter.issueDate = {};
      if (startDate) filter.issueDate.$gte = new Date(startDate);
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        filter.issueDate.$lte = end;
      }
    }

    const pageNum = Math.max(1, parseInt(page, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const skip = (pageNum - 1) * limitNum;

    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;
    sortObj.createdAt = -1;

    const [invoices, totalCount, allInvoicesStats] = await Promise.all([
      Invoice.find(filter)
        .sort(sortObj)
        .skip(skip)
        .limit(limitNum)
        .lean(),
      Invoice.countDocuments(filter),
      // Aggregate full KPI stats for user's entire invoice portfolio
      Invoice.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId) } },
        {
          $group: {
            _id: null,
            totalInvoiced: { $sum: "$grandTotal" },
            totalCollected: { $sum: "$paidAmount" },
            totalPending: { $sum: "$balanceAmount" },
            paidCount: {
              $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 1, 0] },
            },
            unpaidCount: {
              $sum: { $cond: [{ $eq: ["$status", "Unpaid"] }, 1, 0] },
            },
            partiallyPaidCount: {
              $sum: { $cond: [{ $eq: ["$status", "Partially Paid"] }, 1, 0] },
            },
            dueSoonCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$status", "Paid"] },
                      { $gt: ["$balanceAmount", 0] },
                      { $gte: ["$dueDate", todayStart] },
                      { $lte: ["$dueDate", twoDaysLaterEnd] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            dueSoonAmount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$status", "Paid"] },
                      { $gt: ["$balanceAmount", 0] },
                      { $gte: ["$dueDate", todayStart] },
                      { $lte: ["$dueDate", twoDaysLaterEnd] },
                    ],
                  },
                  "$balanceAmount",
                  0,
                ],
              },
            },
            overdueCount: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $ne: ["$status", "Paid"] },
                      { $gt: ["$balanceAmount", 0] },
                      { $lt: ["$dueDate", todayStart] },
                    ],
                  },
                  1,
                  0,
                ],
              },
            },
            totalCount: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statsRaw = allInvoicesStats[0] || {};
    const stats = {
      totalInvoiced: round2(statsRaw.totalInvoiced || 0),
      totalCollected: round2(statsRaw.totalCollected || 0),
      totalPending: round2(statsRaw.totalPending || 0),
      dueSoonAmount: round2(statsRaw.dueSoonAmount || 0),
      paidCount: statsRaw.paidCount || 0,
      unpaidCount: statsRaw.unpaidCount || 0,
      partiallyPaidCount: statsRaw.partiallyPaidCount || 0,
      dueSoonCount: statsRaw.dueSoonCount || 0,
      overdueCount: statsRaw.overdueCount || 0,
      totalCount: statsRaw.totalCount || 0,
    };

    // Auto-annotate due soon & overdue items in response
    const enrichedInvoices = invoices.map((inv) => {
      const invDue = inv.dueDate ? new Date(inv.dueDate) : null;
      let isOverdue = false;
      let isDueSoon = false;
      let isDueToday = false;
      let isDueTomorrow = false;
      let daysUntilDue = null;

      if (invDue && inv.status !== "Paid" && (inv.balanceAmount || 0) > 0) {
        const invDueMidnight = new Date(invDue.getFullYear(), invDue.getMonth(), invDue.getDate()).getTime();
        const todayMidnight = todayStart.getTime();
        const diffMs = invDueMidnight - todayMidnight;
        daysUntilDue = Math.round(diffMs / (1000 * 60 * 60 * 24));

        if (daysUntilDue < 0) {
          isOverdue = true;
        } else if (daysUntilDue === 0) {
          isDueToday = true;
          isDueSoon = true;
        } else if (daysUntilDue === 1) {
          isDueTomorrow = true;
          isDueSoon = true;
        } else if (daysUntilDue === 2) {
          isDueSoon = true;
        }
      }

      return {
        ...inv,
        isOverdue,
        isDueSoon,
        isDueToday,
        isDueTomorrow,
        daysUntilDue,
        upiQrUrl: generateUpiQrUrl(
          inv.company?.upiId,
          inv.company?.companyName,
          inv.balanceAmount,
          inv.invoiceNumber
        ),
      };
    });

    res.json({
      success: true,
      invoices: enrichedInvoices,
      data: enrichedInvoices,
      total: totalCount,
      page: pageNum,
      totalPages: Math.ceil(totalCount / limitNum) || 1,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitNum) || 1,
      },
      stats,
    });
  } catch (err) {
    console.error("[listInvoices Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 2. Get Global Invoice Stats & Alerts
 * GET /api/invoices/stats
 */
export const getInvoiceStats = async (req, res) => {
  try {
    const userId = req.user._id;
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
    const twoDaysLaterEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2, 23, 59, 59, 999);

    const statsAgg = await Invoice.aggregate([
      { $match: { userId: new mongoose.Types.ObjectId(userId) } },
      {
        $group: {
          _id: null,
          totalInvoiced: { $sum: "$grandTotal" },
          totalCollected: { $sum: "$paidAmount" },
          totalPending: { $sum: "$balanceAmount" },
          paidCount: { $sum: { $cond: [{ $eq: ["$status", "Paid"] }, 1, 0] } },
          unpaidCount: { $sum: { $cond: [{ $eq: ["$status", "Unpaid"] }, 1, 0] } },
          partiallyPaidCount: { $sum: { $cond: [{ $eq: ["$status", "Partially Paid"] }, 1, 0] } },
          dueSoonCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Paid"] },
                    { $gt: ["$balanceAmount", 0] },
                    { $gte: ["$dueDate", todayStart] },
                    { $lte: ["$dueDate", twoDaysLaterEnd] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          dueSoonAmount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Paid"] },
                    { $gt: ["$balanceAmount", 0] },
                    { $gte: ["$dueDate", todayStart] },
                    { $lte: ["$dueDate", twoDaysLaterEnd] },
                  ],
                },
                "$balanceAmount",
                0,
              ],
            },
          },
          overdueCount: {
            $sum: {
              $cond: [
                {
                  $and: [
                    { $ne: ["$status", "Paid"] },
                    { $gt: ["$balanceAmount", 0] },
                    { $lt: ["$dueDate", todayStart] },
                  ],
                },
                1,
                0,
              ],
            },
          },
          totalCount: { $sum: 1 },
        },
      },
    ]);

    const raw = statsAgg[0] || {};
    res.json({
      success: true,
      stats: {
        totalInvoiced: round2(raw.totalInvoiced || 0),
        totalCollected: round2(raw.totalCollected || 0),
        totalPending: round2(raw.totalPending || 0),
        dueSoonAmount: round2(raw.dueSoonAmount || 0),
        paidCount: raw.paidCount || 0,
        unpaidCount: raw.unpaidCount || 0,
        partiallyPaidCount: raw.partiallyPaidCount || 0,
        dueSoonCount: raw.dueSoonCount || 0,
        overdueCount: raw.overdueCount || 0,
        totalCount: raw.totalCount || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 3. Get Single Invoice by ID
 * GET /api/invoices/:id
 */
export const getInvoiceById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const invoice = await Invoice.findOne({ _id: id, userId }).lean();
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const now = new Date();
    const isOverdue = invoice.status !== "Paid" && new Date(invoice.dueDate) < now;
    const upiQrUrl = generateUpiQrUrl(
      invoice.company?.upiId,
      invoice.company?.companyName,
      invoice.balanceAmount,
      invoice.invoiceNumber
    );

    res.json({
      success: true,
      invoice: {
        ...invoice,
        isOverdue,
        upiQrUrl,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 4. Create New Invoice
 * POST /api/invoices
 */
export const createInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      clientId,
      companyId,
      contactId,
      queryId,
      invoiceNumber: customInvoiceNumber,
      issueDate = new Date(),
      dueDate,
      templateId,
      client: clientInput = {},
      company: companyInput = {},
      items = [],
      discount = 0,
      terms,
      notes,
      initialPayment,
    } = req.body;

    // Fetch user's persistent company billing settings (Image 1)
    let companySettings = await CompanyBillingSettings.findOne({ userId });
    if (!companySettings) {
      companySettings = await CompanyBillingSettings.create({ userId });
    }

    // Auto-populate Client info if clientId or companyId provided
    const clientData = {
      name: clientInput.name || "",
      company: clientInput.company || "",
      phone: clientInput.phone || "",
      email: clientInput.email || "",
      address: clientInput.address || "",
      city: clientInput.city || "",
      gstin: clientInput.gstin || "",
    };

    if (clientId && mongoose.Types.ObjectId.isValid(clientId)) {
      const clientDoc = await Client.findOne({ _id: clientId, userId }).lean();
      if (clientDoc) {
        if (!clientData.name) clientData.name = `${clientDoc.firstName || ""} ${clientDoc.lastName || ""}`.trim();
        if (!clientData.phone) clientData.phone = clientDoc.mobile || "";
        if (!clientData.email) clientData.email = clientDoc.email || "";
        if (!clientData.company) clientData.company = clientDoc.companyName || "";
        if (!clientData.address) clientData.address = clientDoc.mailingStreet || "";
        if (!clientData.city) clientData.city = clientDoc.mailingCity || "";
      }
    }

    if (companyId && mongoose.Types.ObjectId.isValid(companyId)) {
      const compDoc = await Company.findOne({ _id: companyId, userId }).lean();
      if (compDoc) {
        if (!clientData.company) clientData.company = compDoc.name || "";
        if (!clientData.gstin) clientData.gstin = compDoc.gstNo || "";
        if (!clientData.address) clientData.address = compDoc.billingStreet || clientData.address;
        if (!clientData.city) clientData.city = compDoc.billingCity || clientData.city;
        if (!clientData.phone) clientData.phone = compDoc.phone || clientData.phone;
        if (!clientData.email) clientData.email = compDoc.email || clientData.email;
      }
    }

    if ((contactId || queryId) && (!clientData.name || !clientData.phone)) {
      const queryDoc = await CrmContact.findOne({
        userId,
        $or: [
          ...(contactId && mongoose.Types.ObjectId.isValid(contactId) ? [{ _id: contactId }] : []),
          ...(queryId ? [{ queryId }] : []),
        ],
      }).lean();
      if (queryDoc) {
        if (!clientData.name) clientData.name = queryDoc.name || "";
        if (!clientData.phone) clientData.phone = queryDoc.phoneNumber || "";
        if (!clientData.email) clientData.email = queryDoc.email || "";
        if (!clientData.company) clientData.company = queryDoc.companyName || "";
      }
    }

    if (!clientData.name) {
      clientData.name = "Customer / Client";
    }

    // Company Snapshot (defaults from CompanyBillingSettings)
    const companySnapshot = {
      companyName: companyInput.companyName || companySettings.companyName || "TravBizz Technologies",
      legalName: companyInput.legalName || companySettings.legalName || "TravBizz Digital Media Private Limited",
      logoUrl: companyInput.logoUrl || companySettings.logoUrl || "",
      tagline: companyInput.tagline || companySettings.tagline || "",
      address: companyInput.address || companySettings.address || "",
      city: companyInput.city || companySettings.city || "",
      state: companyInput.state || companySettings.state || "",
      stateCode: companyInput.stateCode || companySettings.stateCode || "06",
      pincode: companyInput.pincode || companySettings.pincode || "",
      country: companyInput.country || companySettings.country || "India",
      phone: companyInput.phone || companySettings.phone || "",
      email: companyInput.email || companySettings.email || "",
      website: companyInput.website || companySettings.website || "",
      gstin: companyInput.gstin || companySettings.gstin || "",
      pan: companyInput.pan || companySettings.pan || "",
      bankName: companyInput.bankName || companySettings.bankName || "",
      bankAccountHolder: companyInput.bankAccountHolder || companySettings.bankAccountHolder || "",
      bankAccountNo: companyInput.bankAccountNo || companySettings.bankAccountNo || "",
      bankIfsc: companyInput.bankIfsc || companySettings.bankIfsc || "",
      bankBranch: companyInput.bankBranch || companySettings.bankBranch || "",
      upiId: companyInput.upiId || companySettings.upiId || "",
      signatoryName: companyInput.signatoryName || companySettings.signatoryName || "",
      signatoryDesignation: companyInput.signatoryDesignation || companySettings.signatoryDesignation || "",
      signatureUrl: companyInput.signatureUrl || companySettings.signatureUrl || "",
    };

    // Auto-generate invoice number (Prefix + Date + Sequence ID) if not provided or contains NaN
    let invoiceNumber = customInvoiceNumber ? String(customInvoiceNumber).trim() : "";
    const prefix = companySettings.invoicePrefix || "INV-";
    const nextNum = companySettings.nextInvoiceNumber || 1001;
    const cleanPrefix = prefix.endsWith("-") || prefix.endsWith("/") ? prefix : `${prefix}-`;
    
    // Ensure date is strictly valid
    let d = new Date();
    if (issueDate) {
      const parsed = new Date(issueDate);
      if (!isNaN(parsed.getTime())) {
        d = parsed;
      }
    }
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const dateFormatted = `${yyyy}${mm}${dd}`;

    if (!invoiceNumber || invoiceNumber.includes("NaN")) {
      invoiceNumber = `${cleanPrefix}${dateFormatted}-${nextNum}`;
      await CompanyBillingSettings.updateOne(
        { _id: companySettings._id },
        { $inc: { nextInvoiceNumber: 1 } }
      );
    } else if (
      invoiceNumber === `${prefix}${nextNum}` ||
      invoiceNumber === `${cleanPrefix}${dateFormatted}-${nextNum}` ||
      invoiceNumber.includes(String(nextNum))
    ) {
      // Advance counter if user's invoice number uses the sequential ID
      await CompanyBillingSettings.updateOne(
        { _id: companySettings._id },
        { $inc: { nextInvoiceNumber: 1 } }
      );
    }

    // Line items calculation
    const calculatedItems = (items || []).map((it) => {
      const q = Math.max(0, Number(it.quantity) || 1);
      const r = Math.max(0, Number(it.unitPrice) || 0);
      const taxRate = Number(it.taxRate) || 0;
      const amount = round2(q * r);
      const taxAmount = round2(amount * (taxRate / 100));
      return {
        name: it.name || "Service / Product",
        description: it.description || "",
        hsnSac: it.hsnSac || "998314",
        quantity: q,
        unitPrice: r,
        taxRate,
        taxAmount,
        amount,
      };
    });

    const subtotal = round2(calculatedItems.reduce((acc, it) => acc + it.amount, 0));
    const taxTotal = round2(calculatedItems.reduce((acc, it) => acc + it.taxAmount, 0));
    const discountVal = Math.max(0, Number(discount) || 0);

    // GST Breakdown (Intrastate CGST+SGST vs Interstate IGST)
    const isInterstate = Boolean(
      clientData.gstin &&
      companySnapshot.gstin &&
      clientData.gstin.slice(0, 2) !== companySnapshot.gstin.slice(0, 2)
    );
    const cgst = isInterstate ? 0 : round2(taxTotal / 2);
    const sgst = isInterstate ? 0 : round2(taxTotal / 2);
    const igst = isInterstate ? taxTotal : 0;

    const rawTotal = subtotal + taxTotal - discountVal;
    const roundedGrandTotal = Math.round(rawTotal);
    const roundOff = round2(roundedGrandTotal - rawTotal);
    const grandTotal = Math.max(0, roundedGrandTotal);

    // Due Date
    let computedDueDate = dueDate ? new Date(dueDate) : null;
    if (!computedDueDate || isNaN(computedDueDate.getTime())) {
      const dueDays = Number(companySettings.defaultDueDays) || 15;
      computedDueDate = new Date(new Date(issueDate).getTime() + dueDays * 24 * 60 * 60 * 1000);
    }

    // Initial Payment tracking if paid upfront
    const paymentsList = [];
    let initialPaid = 0;
    if (initialPayment && Number(initialPayment.amount) > 0) {
      const pAmt = round2(Number(initialPayment.amount));
      paymentsList.push({
        amount: pAmt,
        method: initialPayment.method || "UPI",
        reference: initialPayment.reference || "",
        date: initialPayment.date ? new Date(initialPayment.date) : new Date(),
        notes: initialPayment.notes || "Initial payment on invoice creation",
      });
      initialPaid = pAmt;
    }

    const paidAmount = round2(initialPaid);
    const balanceAmount = round2(Math.max(0, grandTotal - paidAmount));
    const status = paidAmount >= grandTotal ? "Paid" : paidAmount > 0 ? "Partially Paid" : "Unpaid";

    const newInvoice = await Invoice.create({
      userId,
      clientId: clientId || null,
      companyId: companyId || null,
      contactId: contactId || null,
      queryId: queryId || "",
      invoiceNumber,
      issueDate: new Date(issueDate),
      dueDate: computedDueDate,
      templateId: templateId || companySettings.defaultTemplateId || "template-1",
      client: clientData,
      company: companySnapshot,
      items: calculatedItems,
      subtotal,
      discount: discountVal,
      taxTotal,
      cgst,
      sgst,
      igst,
      roundOff,
      grandTotal,
      paidAmount,
      balanceAmount,
      status,
      terms: terms || companySettings.defaultTerms || "",
      notes: notes || companySettings.defaultNotes || "",
      payments: paymentsList,
    });

    const invoiceData = {
      ...newInvoice.toObject(),
      upiQrUrl: generateUpiQrUrl(
        newInvoice.company?.upiId,
        newInvoice.company?.companyName,
        newInvoice.balanceAmount,
        newInvoice.invoiceNumber
      ),
    };

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      invoice: invoiceData,
      data: invoiceData,
    });
  } catch (err) {
    console.error("[createInvoice Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 5. Update Invoice
 * PUT /api/invoices/:id
 */
export const updateInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      issueDate,
      dueDate,
      templateId,
      client: clientInput,
      items,
      discount,
      terms,
      notes,
      status: manualStatus,
    } = req.body;

    const invoice = await Invoice.findOne({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    if (issueDate) invoice.issueDate = new Date(issueDate);
    if (dueDate) invoice.dueDate = new Date(dueDate);
    if (templateId) invoice.templateId = templateId;
    if (terms !== undefined) invoice.terms = terms;
    if (notes !== undefined) invoice.notes = notes;

    if (clientInput) {
      invoice.client = {
        ...invoice.client,
        ...clientInput,
      };
    }

    if (Array.isArray(items)) {
      const calculatedItems = items.map((it) => {
        const q = Math.max(0, Number(it.quantity) || 1);
        const r = Math.max(0, Number(it.unitPrice) || 0);
        const taxRate = Number(it.taxRate) || 0;
        const amount = round2(q * r);
        const taxAmount = round2(amount * (taxRate / 100));
        return {
          name: it.name || "Service / Product",
          description: it.description || "",
          hsnSac: it.hsnSac || "998314",
          quantity: q,
          unitPrice: r,
          taxRate,
          taxAmount,
          amount,
        };
      });

      invoice.items = calculatedItems;
      invoice.subtotal = round2(calculatedItems.reduce((acc, it) => acc + it.amount, 0));
      invoice.taxTotal = round2(calculatedItems.reduce((acc, it) => acc + it.taxAmount, 0));

      const isInterstate = Boolean(
        invoice.client?.gstin &&
        invoice.company?.gstin &&
        invoice.client.gstin.slice(0, 2) !== invoice.company.gstin.slice(0, 2)
      );
      invoice.cgst = isInterstate ? 0 : round2(invoice.taxTotal / 2);
      invoice.sgst = isInterstate ? 0 : round2(invoice.taxTotal / 2);
      invoice.igst = isInterstate ? invoice.taxTotal : 0;
    }

    if (discount !== undefined) {
      invoice.discount = Math.max(0, Number(discount) || 0);
    }

    const rawTotal = invoice.subtotal + invoice.taxTotal - invoice.discount;
    const roundedGrandTotal = Math.round(rawTotal);
    invoice.roundOff = round2(roundedGrandTotal - rawTotal);
    invoice.grandTotal = Math.max(0, roundedGrandTotal);

    invoice.balanceAmount = round2(Math.max(0, invoice.grandTotal - invoice.paidAmount));

    if (manualStatus) {
      invoice.status = manualStatus;
    } else {
      invoice.status =
        invoice.paidAmount >= invoice.grandTotal
          ? "Paid"
          : invoice.paidAmount > 0
          ? "Partially Paid"
          : "Unpaid";
    }

    await invoice.save();

    const updatedData = {
      ...invoice.toObject(),
      upiQrUrl: generateUpiQrUrl(
        invoice.company?.upiId,
        invoice.company?.companyName,
        invoice.balanceAmount,
        invoice.invoiceNumber
      ),
    };

    res.json({
      success: true,
      message: "Invoice updated successfully",
      invoice: updatedData,
      data: updatedData,
    });
  } catch (err) {
    console.error("[updateInvoice Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 6. Delete Invoice
 * DELETE /api/invoices/:id
 */
export const deleteInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const invoice = await Invoice.findOneAndDelete({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 7. Record Payment for Invoice
 * POST /api/invoices/:id/payments
 */
export const recordInvoicePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { amount, method = "UPI", reference = "", date = new Date(), notes = "" } = req.body;

    const pAmt = round2(Number(amount));
    if (pAmt <= 0) {
      return res.status(400).json({ success: false, error: "Payment amount must be greater than zero" });
    }

    const invoice = await Invoice.findOne({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const newPayment = {
      amount: pAmt,
      method,
      reference: String(reference).trim(),
      date: new Date(date),
      notes: String(notes).trim(),
    };

    invoice.payments.push(newPayment);
    invoice.paidAmount = round2(invoice.payments.reduce((acc, p) => acc + (Number(p.amount) || 0), 0));
    invoice.balanceAmount = round2(Math.max(0, invoice.grandTotal - invoice.paidAmount));

    if (invoice.paidAmount >= invoice.grandTotal) {
      invoice.status = "Paid";
    } else if (invoice.paidAmount > 0) {
      invoice.status = "Partially Paid";
    } else {
      invoice.status = "Unpaid";
    }

    await invoice.save();

    res.json({
      success: true,
      message: `Payment of ₹${pAmt} recorded successfully!`,
      invoice: {
        ...invoice.toObject(),
        upiQrUrl: generateUpiQrUrl(
          invoice.company?.upiId,
          invoice.company?.companyName,
          invoice.balanceAmount,
          invoice.invoiceNumber
        ),
      },
      payment: newPayment,
    });
  } catch (err) {
    console.error("[recordInvoicePayment Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 8. Send Invoice / Payment Reminder to Client via WhatsApp (with PDF attachment & Chat Sync)
 * POST /api/invoices/:id/send-whatsapp
 */
export const sendInvoiceWhatsApp = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { sessionId: requestedSessionId, customMessage, phoneNumber: phoneOverride } = req.body;

    const invoice = await Invoice.findOne({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const rawPhone = (phoneOverride || invoice.client?.phone || "").trim();
    if (!rawPhone || !rawPhone.replace(/\D/g, "")) {
      return res.status(400).json({ success: false, error: "Client does not have a valid phone number" });
    }

    // Resolve an active connected WhatsApp session for user
    let session = null;
    if (requestedSessionId) {
      session = await WhatsAppSession.findOne({
        userId,
        sessionId: requestedSessionId,
        status: { $in: ["connected", "open"] },
      });
    }
    if (!session) {
      session = await WhatsAppSession.findOne({
        userId,
        status: { $in: ["connected", "open"] },
      }).sort({ updatedAt: -1 });
    }
    if (!session) {
      return res.status(400).json({
        success: false,
        error: "No connected WhatsApp device found. Please connect your WhatsApp device in Connected Devices first.",
      });
    }

    // Format phone number
    const cleanDigits = rawPhone.replace(/\D/g, "");
    const recipientNumber = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

    // Generate UPI Instant Pay Link
    const upiPayLink = generateUpiUri(
      invoice.company?.upiId,
      invoice.company?.companyName,
      invoice.balanceAmount,
      invoice.invoiceNumber
    );

    // Format professional WhatsApp bill alert
    const issueDateStr = new Date(invoice.issueDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
    const dueDateStr = new Date(invoice.dueDate).toLocaleDateString("en-IN", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });

    const isPastDue = invoice.status !== "Paid" && new Date(invoice.dueDate) < new Date();
    const alertHeader = isPastDue
      ? "⚠️ *PAYMENT OVERDUE REMINDER*"
      : invoice.status === "Paid"
      ? "✅ *TAX INVOICE RECEIPT*"
      : "🧾 *TAX INVOICE & PAYMENT DETAILS*";

    const defaultMsg = [
      alertHeader,
      `*From:* ${invoice.company?.companyName || "TravBizz Technologies"}`,
      `*Invoice #:* ${invoice.invoiceNumber}`,
      `*Issue Date:* ${issueDateStr}`,
      `*Due Date:* ${dueDateStr}`,
      "",
      `*Billed To:* ${invoice.client?.name || "Customer"}${invoice.client?.company ? ` (${invoice.client.company})` : ""}`,
      `*Total Amount:* ₹${invoice.grandTotal.toLocaleString("en-IN")}`,
      `*Amount Paid:* ₹${invoice.paidAmount.toLocaleString("en-IN")}`,
      `*Pending Balance:* ₹${invoice.balanceAmount.toLocaleString("en-IN")}`,
      `*Status:* ${invoice.status.toUpperCase()}`,
      "",
      invoice.balanceAmount > 0
        ? [
            "🏦 *Bank Account for Settlement:*",
            `• Bank: ${invoice.company?.bankName || "HDFC Bank"}`,
            `• A/C Holder: ${invoice.company?.bankAccountHolder || invoice.company?.companyName || ""}`,
            `• A/C No: ${invoice.company?.bankAccountNo || "50200012345678"}`,
            `• IFSC Code: ${invoice.company?.bankIfsc || "HDFC0001234"}`,
            ...(invoice.company?.bankBranch ? [`• Branch: ${invoice.company.bankBranch}`] : []),
            "",
            ...(invoice.company?.upiId
              ? [
                  "📱 *Instant UPI Payment:*",
                  `• UPI VPA: *${invoice.company.upiId}*`,
                  "• Accepted: GPay, PhonePe, Paytm, BHIM",
                  "",
                ]
              : []),
            "Please share transaction UTR once payment is completed.",
          ].filter(Boolean).join("\n")
        : "Thank you for your timely payment! We appreciate your business.",
      "",
      `_For questions, contact ${invoice.company?.phone || invoice.company?.email || "our support"}._`,
    ].filter(Boolean).join("\n");

    const messageToSend = customMessage ? String(customMessage).trim() : defaultMsg;

    // Check for optional uploaded PDF document
    const file = req.file || (req.files && req.files[0]) || null;
    const pdfFileName = `${invoice.invoiceNumber || "Invoice"}.pdf`;

    let filePathToAttach = file?.path || null;
    let fileMimeToAttach = file?.mimetype || "application/pdf";
    let relativeMediaUrl = file ? `/uploads/${file.filename}` : null;

    if (!filePathToAttach && invoice.pdfUrl) {
      const fallbackPath = join(process.cwd(), invoice.pdfUrl.replace(/^\//, ""));
      if (existsSync(fallbackPath)) {
        filePathToAttach = fallbackPath;
        relativeMediaUrl = invoice.pdfUrl;
      }
    }

    console.log(
      `[sendInvoiceWhatsApp] Invoice ${invoice.invoiceNumber}: fileUploaded=${Boolean(file)}, attachPath=${filePathToAttach}`
    );

    // Send via WhatsApp Service
    let sendResult;
    if (filePathToAttach) {
      sendResult = await WhatsAppService.sendMessage(
        session.sessionId,
        recipientNumber,
        messageToSend,
        filePathToAttach,
        fileMimeToAttach,
        {
          fileName: pdfFileName,
          caption: messageToSend,
        }
      );
    } else {
      sendResult = await WhatsAppService.sendMessage(
        session.sessionId,
        recipientNumber,
        messageToSend
      );
    }

    const cleanRecipientDigits = recipientNumber.replace(/\D/g, "");
    const chatJid = `${cleanRecipientDigits}@s.whatsapp.net`;
    const messageId =
      sendResult?.key?.id ||
      sendResult?.messageId ||
      `inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    const dbMediaType = filePathToAttach ? "document" : null;

    // 1. Persist outgoing message in WaChatMessage so it appears in /dashboard/chats
    const msgDoc = await WaChatMessage.create({
      userId,
      sessionId: session.sessionId,
      chatJid,
      messageId,
      text: messageToSend,
      direction: "out",
      status: "sent",
      mediaType: dbMediaType,
      mediaUrl: relativeMediaUrl,
      mediaName: filePathToAttach ? pdfFileName : null,
      timestamp: new Date(),
    });

    // 2. Upsert WaChat conversation summary
    const chatSummaryText = filePathToAttach
      ? `📄 Invoice ${invoice.invoiceNumber || ""}.pdf`
      : (messageToSend.split("\n")[0] || "Invoice Details");

    await WaChat.findOneAndUpdate(
      { userId, sessionId: session.sessionId, chatJid },
      {
        $set: {
          lastMessage: chatSummaryText,
          lastMessageTime: new Date(),
          phoneNumber: cleanRecipientDigits,
          name: invoice.client?.name || cleanRecipientDigits,
          contactName: invoice.client?.name || cleanRecipientDigits,
          clientId: invoice.clientId || null,
          clientName: invoice.client?.name || "",
          companyId: invoice.companyId || null,
          companyName: invoice.client?.company || "",
        },
        $setOnInsert: {
          userId,
          sessionId: session.sessionId,
          chatJid,
          isGroup: false,
          unreadCount: 0,
        },
      },
      { upsert: true, new: true }
    );

    // 3. Emit real-time WebSocket events so /dashboard/chats updates instantly
    const io = req.app.get("io");
    if (io) {
      io.to(`user_${userId}`).emit("new_message", {
        sessionId: session.sessionId,
        chatJid,
        message: msgDoc,
      });
      io.to(`user_${userId}`).emit("chat_updated", {
        sessionId: session.sessionId,
        chatJid,
        lastMessage: msgDoc.text,
        lastMessageTime: msgDoc.timestamp,
      });
    }

    // 4. Update tracking on invoice
    invoice.whatsappReminderSentAt = new Date();
    invoice.whatsappReminderCount = (invoice.whatsappReminderCount || 0) + 1;
    if (relativeMediaUrl) {
      invoice.pdfUrl = relativeMediaUrl;
    }

    const milestoneType =
      invoice.paidAmount >= invoice.grandTotal
        ? "payment_receipt"
        : new Date(invoice.dueDate) < new Date()
        ? "overdue_1"
        : "manual";

    if (!invoice.remindersSent) {
      invoice.remindersSent = [];
    }
    const reminderRecord = {
      milestone: milestoneType,
      sentAt: new Date(),
      recipientPhone: cleanRecipientDigits,
      messageId,
      messageSnippet: messageToSend.slice(0, 300),
      pdfAttached: Boolean(filePathToAttach),
      pdfUrl: relativeMediaUrl || "",
      sessionId: session.sessionId,
      status: "sent",
    };
    invoice.remindersSent.unshift(reminderRecord);

    await invoice.save();

    res.json({
      success: true,
      message: file
        ? `Invoice #${invoice.invoiceNumber} with attached PDF bill sent to WhatsApp successfully!`
        : `Invoice #${invoice.invoiceNumber} payment reminder sent to WhatsApp successfully!`,
      messageId,
      sentTo: `+${recipientNumber}`,
      hasPdf: Boolean(file),
      pdfUrl: relativeMediaUrl,
      reminderCount: invoice.whatsappReminderCount,
      reminderRecord,
      remindersSent: invoice.remindersSent,
      chatJid,
    });
  } catch (err) {
    console.error("[sendInvoiceWhatsApp Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 9. Add Internal Note to Invoice Track Record
 * POST /api/invoices/:id/notes
 */
export const addInvoiceNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: "Note content is required" });
    }

    const invoice = await Invoice.findOne({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const authorName = req.user.name || req.user.email || "Admin";
    const newNote = {
      note: note.trim(),
      authorName,
      createdAt: new Date(),
    };

    if (!invoice.activityNotes) {
      invoice.activityNotes = [];
    }
    invoice.activityNotes.unshift(newNote); // newest first

    await invoice.save();

    res.json({
      success: true,
      message: "Note added successfully",
      note: newNote,
      activityNotes: invoice.activityNotes,
    });
  } catch (err) {
    console.error("[addInvoiceNote Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * 10. Delete Internal Note from Invoice Track Record
 * DELETE /api/invoices/:id/notes/:noteId
 */
export const deleteInvoiceNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, noteId } = req.params;

    const invoice = await Invoice.findOne({ _id: id, userId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    invoice.activityNotes = (invoice.activityNotes || []).filter(
      (n) => n._id && n._id.toString() !== noteId
    );

    await invoice.save();

    res.json({
      success: true,
      message: "Note deleted successfully",
      activityNotes: invoice.activityNotes,
    });
  } catch (err) {
    console.error("[deleteInvoiceNote Error]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

