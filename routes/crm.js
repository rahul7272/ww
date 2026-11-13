import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  listContacts,
  getCrmStats,
  getContact,
  createContact,
  updateContact,
  deleteContact,
  bulkDeleteContacts,
  deleteAllContacts,
  bulkUpdateContacts,
  addContactNote,
  deleteContactNote,
  importFromChats,
  exportContacts,
  getQueryDetails,
  updateQueryDetails,
  addQueryQuotation,
  deleteQueryQuotation,
  addQueryActivity,
  toggleQueryActivity,
  updateQueryActivity,
  deleteQueryActivity,
  listQueryInvoices,
  createQueryInvoice,
  getQueryInvoiceById,
  deleteQueryInvoice,
  recordInvoicePayment,
  listCrmReminders,
  createCrmReminder,
  snoozeCrmReminder,
  completeCrmReminder,
  deleteCrmReminder,
  getContactByPhone,
  saveQueryFromChat,
} from "../controllers/crmController.js";

const router = express.Router();

// All CRM routes are authenticated
router.use(authMiddleware);

// Analytics & Bulk actions
router.get("/stats", getCrmStats);
router.get("/export", exportContacts);
router.post("/import-from-chats", importFromChats);
router.post("/contacts/bulk-delete", bulkDeleteContacts);
router.post("/contacts/delete-all", deleteAllContacts);
router.post("/contacts/bulk-update", bulkUpdateContacts);

// Contact CRUD
router.get("/contacts", listContacts);
router.get("/by-phone/:phone", getContactByPhone);
router.post("/save-from-chat", saveQueryFromChat);
router.post("/contacts", createContact);
router.get("/contacts/:id", getContact);
router.put("/contacts/:id", updateContact);
router.delete("/contacts/:id", deleteContact);

// Notes Sub-resource
router.post("/contacts/:id/notes", addContactNote);
router.delete("/contacts/:id/notes/:noteId", deleteContactNote);
router.post("/queries/:id/notes", addContactNote);
router.delete("/queries/:id/notes/:noteId", deleteContactNote);

// Query Workspace Endpoints (Matching TravBizz Query Details view)
router.get("/queries/:id", getQueryDetails);
router.put("/queries/:id", updateQueryDetails);
router.post("/queries/:id/quotations", addQueryQuotation);
router.delete("/queries/:id/quotations/:quotationId", deleteQueryQuotation);
router.post("/queries/:id/activities", addQueryActivity);
router.patch("/queries/:id/activities/:activityId", toggleQueryActivity);
router.put("/queries/:id/activities/:activityId", updateQueryActivity);
router.delete("/queries/:id/activities/:activityId", deleteQueryActivity);

// Invoices & Billing Endpoints
router.get("/queries/:id/invoices", listQueryInvoices);
router.post("/queries/:id/invoices", createQueryInvoice);
router.get("/queries/:id/invoices/:invoiceId", getQueryInvoiceById);
router.delete("/queries/:id/invoices/:invoiceId", deleteQueryInvoice);
router.post("/queries/:id/invoices/:invoiceId/payments", recordInvoicePayment);

// CRM Alerts, Calls, Tasks & Lead Reminders
router.get("/reminders", listCrmReminders);
router.post("/reminders", createCrmReminder);
router.patch("/reminders/:activityId/snooze", snoozeCrmReminder);
router.patch("/reminders/:activityId/complete", completeCrmReminder);
router.delete("/reminders/:activityId", deleteCrmReminder);

export default router;
