import mongoose from "mongoose";
import { existsSync } from "fs";
import { join } from "path";
import Invoice from "../models/Invoice.js";
import CompanyBillingSettings from "../models/CompanyBillingSettings.js";
import { WhatsAppSession, WaChatMessage, WaChat } from "../models/index.js";
import WhatsAppService from "./WhatsAppService.js";

/**
 * InvoiceReminderService
 * Automated scheduler & milestone-based WhatsApp reminder engine:
 * - Checks invoices 2 days before due date ("2_days_before")
 * - Checks invoices on the due date ("due_date")
 * - Checks invoices that have become overdue ("overdue_1")
 * - Respects CompanyBillingSettings toggles
 * - Strictly avoids duplicate milestone sends via invoice.remindersSent
 * - Persists message to WaChatMessage & WaChat with live Socket.io sync to /dashboard/chats
 */
class InvoiceReminderService {
  constructor() {
    this.intervalId = null;
    this.isRunning = false;
    this.lastRunAt = null;
    this.lastResult = null;
  }

  /**
   * Start automated scheduler (runs every 30 minutes)
   */
  start() {
    if (this.intervalId) return;
    this.isRunning = true;
    console.log("[INVOICE REMINDER SERVICE] Started automatic due date reminder scheduler.");

    // Initial check after 10s grace
    setTimeout(() => {
      this.processDueReminders().catch((err) =>
        console.error("[INVOICE REMINDER SERVICE] Initial run error:", err.message)
      );
    }, 10000);

    // Recurring check every 30 minutes
    this.intervalId = setInterval(() => {
      this.processDueReminders().catch((err) =>
        console.error("[INVOICE REMINDER SERVICE] Periodic run error:", err.message)
      );
    }, 30 * 60 * 1000);
  }

  /**
   * Stop automated scheduler
   */
  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log("[INVOICE REMINDER SERVICE] Stopped scheduler.");
  }

  /**
   * Helper: Generate UPI Pay URI
   */
  generateUpiUri(upiId, payeeName, amount, invoiceNumber) {
    if (!upiId) return "";
    const cleanUpi = upiId.trim();
    const cleanPayee = encodeURIComponent(payeeName || "Business");
    const cleanAmount = amount > 0 ? Number(amount).toFixed(2) : "0";
    const note = encodeURIComponent(`Invoice ${invoiceNumber || ""}`.trim());
    return `upi://pay?pa=${cleanUpi}&pn=${cleanPayee}&am=${cleanAmount}&cu=INR&tn=${note}`;
  }

  /**
   * Core Engine: Evaluate & dispatch milestone reminders
   * @param {string|null} specificUserId If set, only process for this user
   */
  async processDueReminders(specificUserId = null) {
    try {
      this.lastRunAt = new Date();
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

      const query = {
        status: { $nin: ["Paid", "Cancelled", "Draft"] },
        balanceAmount: { $gt: 0 },
        dueDate: { $ne: null },
      };
      if (specificUserId) {
        query.userId = new mongoose.Types.ObjectId(specificUserId);
      }

      const activeInvoices = await Invoice.find(query).lean();

      let processedCount = 0;
      let sentCount = 0;
      let skippedCount = 0;
      const details = [];

      for (const inv of activeInvoices) {
        processedCount++;
        try {
          const invDue = new Date(inv.dueDate);
        const dueMidnight = new Date(invDue.getFullYear(), invDue.getMonth(), invDue.getDate(), 0, 0, 0, 0);
        const diffMs = dueMidnight.getTime() - todayStart.getTime();
        const diffDays = Math.round(diffMs / (24 * 60 * 60 * 1000));

        // Determine which milestone applies (if any)
        let milestone = null;
        if (diffDays > 0 && diffDays <= 2) {
          milestone = "2_days_before";
        } else if (diffDays === 0) {
          milestone = "due_date";
        } else if (diffDays < 0) {
          milestone = "overdue_1";
        }

        if (!milestone) {
          skippedCount++;
          continue;
        }

        // Check if this milestone has already been sent
        const alreadySent = (inv.remindersSent || []).some((r) => r.milestone === milestone);
        if (alreadySent) {
          skippedCount++;
          continue;
        }

        // Fetch User's Company Billing Settings
        const settings = await CompanyBillingSettings.findOne({ userId: inv.userId }).lean();
        const autoRemindDueSoon = settings?.autoRemindDueSoon !== false;
        const autoRemindDueDate = settings?.autoRemindDueDate !== false;
        const autoRemindOverdue = settings?.autoRemindOverdue !== false;

        // Verify user preference allows this reminder
        if (milestone === "2_days_before" && !autoRemindDueSoon) {
          skippedCount++;
          continue;
        }
        if (milestone === "due_date" && !autoRemindDueDate) {
          skippedCount++;
          continue;
        }
        if (milestone === "overdue_1" && !autoRemindOverdue) {
          skippedCount++;
          continue;
        }

        // Check recipient phone
        const rawPhone = (inv.client?.phone || "").trim();
        const cleanDigits = rawPhone.replace(/\D/g, "");
        if (!cleanDigits || cleanDigits.length < 8) {
          details.push({
            invoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber,
            status: "skipped_no_phone",
          });
          skippedCount++;
          continue;
        }
        const recipientNumber = cleanDigits.length === 10 ? `91${cleanDigits}` : cleanDigits;

        // Resolve active connected WhatsApp session for this user
        const session = await WhatsAppSession.findOne({
          userId: inv.userId,
          status: "connected",
        }).sort({ updatedAt: -1 });

        if (!session) {
          details.push({
            invoiceId: inv._id,
            invoiceNumber: inv.invoiceNumber,
            status: "skipped_no_active_session",
          });
          skippedCount++;
          continue;
        }

        // Build Professional WhatsApp Message
        const issueDateStr = new Date(inv.issueDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });
        const dueDateStr = new Date(inv.dueDate).toLocaleDateString("en-IN", {
          day: "2-digit",
          month: "short",
          year: "numeric",
        });

        let alertHeader = "🧾 *TAX INVOICE & PAYMENT DETAILS*";
        if (milestone === "2_days_before") {
          alertHeader = `⏳ *UPCOMING PAYMENT REMINDER (Due in ${diffDays} Day${diffDays > 1 ? "s" : ""})*`;
        } else if (milestone === "due_date") {
          alertHeader = "⏳ *PAYMENT DUE TODAY REMINDER*";
        } else if (milestone === "overdue_1") {
          alertHeader = `⚠️ *PAYMENT OVERDUE REMINDER (Overdue by ${Math.abs(diffDays)} Days)*`;
        }

        const upiPayLink = this.generateUpiUri(
          inv.company?.upiId,
          inv.company?.companyName,
          inv.balanceAmount,
          inv.invoiceNumber
        );

        const messageText = [
          alertHeader,
          `*From:* ${inv.company?.companyName || "TravBizz Technologies"}`,
          `*Invoice #:* ${inv.invoiceNumber}`,
          `*Issue Date:* ${issueDateStr}`,
          `*Due Date:* ${dueDateStr}`,
          "",
          `*Billed To:* ${inv.client?.name || "Customer"}${inv.client?.company ? ` (${inv.client.company})` : ""}`,
          `*Total Amount:* ₹${Number(inv.grandTotal || 0).toLocaleString("en-IN")}`,
          `*Paid Amount:* ₹${Number(inv.paidAmount || 0).toLocaleString("en-IN")}`,
          `*Balance Due:* ₹${Number(inv.balanceAmount || 0).toLocaleString("en-IN")}`,
          "",
          "🏦 *Bank Account for Settlement:*",
          `• Bank: ${inv.company?.bankName || "HDFC Bank"}`,
          `• A/C Holder: ${inv.company?.bankAccountHolder || inv.company?.companyName || ""}`,
          `• A/C No: ${inv.company?.bankAccountNo || "50200012345678"}`,
          `• IFSC Code: ${inv.company?.bankIfsc || "HDFC0001234"}`,
          ...(inv.company?.bankBranch ? [`• Branch: ${inv.company.bankBranch}`] : []),
          "",
          ...(inv.company?.upiId
            ? [
                "📱 *Instant UPI Payment:*",
                `• UPI VPA: *${inv.company.upiId}*`,
                "• Accepted: GPay, PhonePe, Paytm, BHIM",
                "",
              ]
            : []),
          "Please share transaction reference / screenshot once payment is completed.",
          "",
          `_For assistance, contact ${inv.company?.phone || inv.company?.email || "our support"}._`,
        ].filter(Boolean).join("\n");

        // Check if PDF document exists on disk
        let attachedFilePath = null;
        if (inv.pdfUrl && typeof inv.pdfUrl === "string") {
          const possiblePath = join(process.cwd(), inv.pdfUrl.replace(/^\//, ""));
          if (existsSync(possiblePath)) {
            attachedFilePath = possiblePath;
          }
        }

        // Send via WhatsApp
        let sendResult;
        const pdfFileName = `${inv.invoiceNumber || "Invoice"}.pdf`;
        if (attachedFilePath) {
          sendResult = await WhatsAppService.sendMessage(
            session.sessionId,
            recipientNumber,
            messageText,
            attachedFilePath,
            "application/pdf",
            { fileName: pdfFileName, caption: messageText }
          );
        } else {
          sendResult = await WhatsAppService.sendMessage(
            session.sessionId,
            recipientNumber,
            messageText
          );
        }

        const cleanRecipientDigits = recipientNumber.replace(/\D/g, "");
        const chatJid = `${cleanRecipientDigits}@s.whatsapp.net`;
        const messageId =
          sendResult?.key?.id ||
          sendResult?.messageId ||
          `auto_inv_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

        // 1. Persist outgoing message in WaChatMessage
        const msgDoc = await WaChatMessage.create({
          userId: inv.userId,
          sessionId: session.sessionId,
          chatJid,
          messageId,
          text: messageText,
          direction: "out",
          status: "sent",
          mediaType: attachedFilePath ? "document" : null,
          mediaUrl: inv.pdfUrl || null,
          mediaName: attachedFilePath ? pdfFileName : null,
          timestamp: new Date(),
        });

        // 2. Upsert WaChat thread
        const chatSummary = attachedFilePath
          ? `📄 Invoice ${inv.invoiceNumber}.pdf`
          : messageText.split("\n")[0];

        await WaChat.findOneAndUpdate(
          { userId: inv.userId, sessionId: session.sessionId, chatJid },
          {
            $set: {
              lastMessage: chatSummary,
              lastMessageTime: new Date(),
              phoneNumber: cleanRecipientDigits,
              name: inv.client?.name || cleanRecipientDigits,
              contactName: inv.client?.name || cleanRecipientDigits,
              clientId: inv.clientId || null,
              clientName: inv.client?.name || "",
              companyId: inv.companyId || null,
              companyName: inv.client?.company || "",
            },
            $setOnInsert: {
              userId: inv.userId,
              sessionId: session.sessionId,
              chatJid,
              isGroup: false,
              unreadCount: 0,
            },
          },
          { upsert: true, new: true }
        );

        // 3. Emit real-time WebSocket events for /dashboard/chats
        const io = WhatsAppService.io;
        if (io) {
          io.to(`user_${inv.userId}`).emit("new_message", {
            sessionId: session.sessionId,
            chatJid,
            message: msgDoc,
          });
          io.to(`user_${inv.userId}`).emit("chat_updated", {
            sessionId: session.sessionId,
            chatJid,
            lastMessage: msgDoc.text,
            lastMessageTime: msgDoc.timestamp,
          });
        }

        // 4. Update Invoice Audit & Milestones
        await Invoice.updateOne(
          { _id: inv._id },
          {
            $set: { whatsappReminderSentAt: new Date() },
            $inc: { whatsappReminderCount: 1 },
            $push: {
              remindersSent: {
                milestone,
                sentAt: new Date(),
                recipientPhone: cleanRecipientDigits,
                messageId,
                messageSnippet: messageText.slice(0, 300),
                pdfAttached: Boolean(attachedFilePath),
                pdfUrl: inv.pdfUrl || "",
                sessionId: session.sessionId,
                status: "sent",
              },
            },
          }
        );

        sentCount++;
        details.push({
          invoiceId: inv._id,
          invoiceNumber: inv.invoiceNumber,
          milestone,
          recipient: recipientNumber,
          status: "sent",
        });

        console.log(
          `[INVOICE REMINDER SERVICE] ✅ Sent automated "${milestone}" reminder for invoice #${inv.invoiceNumber} to ${recipientNumber}`
        );
        } catch (invErr) {
          console.error(
            `[INVOICE REMINDER SERVICE] Error sending reminder for invoice #${inv?.invoiceNumber || inv?._id}:`,
            invErr.message || invErr
          );
          details.push({
            invoiceId: inv?._id,
            invoiceNumber: inv?.invoiceNumber,
            status: "failed",
            error: invErr.message || "Failed to send invoice reminder",
          });
        }
      }

      this.lastResult = {
        success: true,
        processedCount,
        sentCount,
        skippedCount,
        details,
        timestamp: new Date(),
      };

      return this.lastResult;
    } catch (err) {
      console.error("[INVOICE REMINDER SERVICE] processDueReminders Error:", err);
      throw err;
    }
  }

  getStatus() {
    return {
      isRunning: this.isRunning,
      lastRunAt: this.lastRunAt,
      lastResult: this.lastResult,
    };
  }
}

const invoiceReminderService = new InvoiceReminderService();
export default invoiceReminderService;

