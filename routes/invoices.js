import express from "express";
import authMiddleware from "../middleware/auth.js";
import upload from "../utils/fileUpload.js";
import invoiceReminderService from "../services/InvoiceReminderService.js";
import {
  listInvoices,
  getInvoiceStats,
  getInvoiceById,
  createInvoice,
  updateInvoice,
  deleteInvoice,
  recordInvoicePayment,
  sendInvoiceWhatsApp,
  addInvoiceNote,
  deleteInvoiceNote,
} from "../controllers/invoiceController.js";

const router = express.Router();

// All routes require user authentication
router.use(authMiddleware);

// Invoices CRUD & Statistics
router.get("/", listInvoices);
router.post("/", createInvoice);
router.get("/stats", getInvoiceStats);

// Automated Due Reminders (Schedule Status & Manual / Auto Trigger)
router.post("/process-due-reminders", async (req, res) => {
  try {
    const result = await invoiceReminderService.processDueReminders(req.user._id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

router.get("/reminder-schedule-status", (req, res) => {
  res.json({ success: true, status: invoiceReminderService.getStatus() });
});

router.get("/:id", getInvoiceById);
router.put("/:id", updateInvoice);
router.delete("/:id", deleteInvoice);

// Payment Recording
router.post("/:id/payments", recordInvoicePayment);

// Internal Track Record Notes
router.post("/:id/notes", addInvoiceNote);
router.delete("/:id/notes/:noteId", deleteInvoiceNote);

// WhatsApp Dispatch & Payment Reminder (Supports optional PDF attachment upload)
router.post("/:id/send-whatsapp", upload.any(), sendInvoiceWhatsApp);

export default router;

