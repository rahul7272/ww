import { CrmContact, WaChat, WhatsAppSession, Invoice, CompanyBillingSettings } from "../models/index.js";
import reminderService from "../services/ReminderService.js";
import { buildPhoneMatchKeys, syncWaChatsForCrmContact } from "../utils/crmChatLink.js";

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Standardize phone number: strips non-digit characters
 */
const cleanPhoneNumber = (phone) => {
  if (!phone) return "";
  let cleaned = String(phone).replace(/[^\d]/g, "");
  // Remove leading 0s if any
  cleaned = cleaned.replace(/^0+/, "");
  return cleaned;
};

/**
 * @desc Get CRM Contacts with filtering, pagination, search, sorting
 * @route GET /api/crm/contacts
 */
export const listContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      search = "",
      customerType,
      leadStatus,
      leadSource,
      assignedAgent,
      tag,
      city,
      product,
      page = 1,
      limit = 25,
      sortBy = "lastInteraction",
      sortOrder = "desc",
    } = req.query;

    const query = { userId };

    if (customerType && customerType !== "all") {
      query.customerType = customerType;
    }
    if (leadStatus && leadStatus !== "all") {
      query.leadStatus = leadStatus;
    }
    if (leadSource && leadSource !== "all") {
      query.leadSource = leadSource;
    }
    if (assignedAgent && assignedAgent !== "all") {
      query.assignedAgent = assignedAgent;
    }
    if (city && city.trim()) {
      query.city = { $regex: escapeRegex(city.trim()), $options: "i" };
    }
    if (tag && tag.trim()) {
      query.tags = tag.trim();
    }
    if (product && product !== "all" && product.trim()) {
      query.product = { $regex: escapeRegex(product.trim()), $options: "i" };
    }

    if (search && search.trim()) {
      const safeSearch = escapeRegex(search.trim());
      const regex = { $regex: safeSearch, $options: "i" };
      const searchConditions = [
        { name: regex },
        { phone: regex },
        { email: regex },
        { company: regex },
        { city: regex },
        { product: regex },
        { tags: regex },
        { queryId: regex },
        { queryTitle: regex },
      ];

      const cleanDigits = search.replace(/\D/g, "");
      if (cleanDigits.length >= 3) {
        searchConditions.push({ phone: { $regex: escapeRegex(cleanDigits) } });
      }

      query.$or = searchConditions;
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 25));
    const skip = (pageNum - 1) * limitNum;

    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [contacts, total] = await Promise.all([
      CrmContact.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
      CrmContact.countDocuments(query),
    ]);

    return res.json({
      success: true,
      contacts,
      total,
      page: pageNum,
      pages: Math.ceil(total / limitNum) || 1,
      limit: limitNum,
    });
  } catch (error) {
    console.error("Error listing CRM contacts:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch CRM contacts" });
  }
};

/**
 * @desc Get CRM Dashboard & Pipeline Stats
 * @route GET /api/crm/stats
 */
export const getCrmStats = async (req, res) => {
  try {
    const userId = req.user._id;

    // Aggregate status counts and budgets
    const [statusAgg, typeAgg, totalPurchasesAgg, recentContacts, productAgg] = await Promise.all([
      CrmContact.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: "$leadStatus",
            count: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
          },
        },
      ]),
      CrmContact.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: "$customerType",
            count: { $sum: 1 },
          },
        },
      ]),
      CrmContact.aggregate([
        { $match: { userId } },
        {
          $group: {
            _id: null,
            totalRevenue: { $sum: "$totalPurchases" },
            totalPipeline: { $sum: "$budget" },
            totalContacts: { $sum: 1 },
          },
        },
      ]),
      CrmContact.find({ userId })
        .sort({ lastInteraction: -1 })
        .limit(5)
        .select("name phone company leadStatus customerType budget lastInteraction")
        .lean(),
      CrmContact.aggregate([
        { $match: { userId, product: { $exists: true, $ne: "" } } },
        {
          $group: {
            _id: "$product",
            count: { $sum: 1 },
            totalBudget: { $sum: "$budget" },
          },
        },
        { $sort: { count: -1 } },
      ]),
    ]);

    // Format status map and budgets
    const statusCounts = {
      New: 0,
      "No Connect": 0,
      Contacted: 0,
      "Follow Up": 0,
      Qualified: 0,
      "Proposal Sent": 0,
      "Proposal Confirmed": 0,
      "In Negotiation": 0,
      "Hot Lead": 0,
      Confirmed: 0,
      Won: 0,
      Lost: 0,
      Churned: 0,
    };
    const statusBudgets = {};
    let wonRevenue = 0;

    statusAgg.forEach((item) => {
      if (item._id) {
        statusCounts[item._id] = item.count;
        statusBudgets[item._id] = item.totalBudget || 0;
      }
      if (item._id === "Won" || item._id === "Confirmed") {
        wonRevenue += item.totalBudget || 0;
      }
    });

    // Format type map
    const typeCounts = {
      Lead: 0,
      Prospect: 0,
      Customer: 0,
      VIP: 0,
      Partner: 0,
      Vendor: 0,
      Other: 0,
    };
    typeAgg.forEach((item) => {
      if (item._id && typeCounts.hasOwnProperty(item._id)) {
        typeCounts[item._id] = item.count;
      }
    });

    const summary = totalPurchasesAgg[0] || {
      totalRevenue: 0,
      totalPipeline: 0,
      totalContacts: 0,
    };

    const confirmedCount = (statusCounts.Won || 0) + (statusCounts.Confirmed || 0);
    const conversionRate = summary.totalContacts > 0
      ? Math.round((confirmedCount / summary.totalContacts) * 100)
      : 0;

    return res.json({
      success: true,
      stats: {
        totalContacts: summary.totalContacts,
        totalPipeline: summary.totalPipeline,
        wonRevenue,
        totalRevenue: summary.totalRevenue,
        conversionRate,
        statusCounts,
        statusBudgets,
        typeCounts,
        recentContacts,
        products: productAgg.map((p) => ({
          name: p._id,
          count: p.count,
          totalBudget: p.totalBudget || 0,
        })),
      },
    });
  } catch (error) {
    console.error("Error fetching CRM stats:", error);
    return res.status(500).json({ error: error.message || "Failed to fetch CRM statistics" });
  }
};

/**
 * @desc Get single contact by ID
 * @route GET /api/crm/contacts/:id
 */
export const getContact = async (req, res) => {
  try {
    const userId = req.user._id;
    const contact = await CrmContact.findOne({ _id: req.params.id, userId });
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }
    return res.json({ success: true, contact });
  } catch (error) {
    console.error("Error getting CRM contact:", error);
    return res.status(500).json({ error: error.message || "Failed to get contact" });
  }
};

/**
 * @desc Create new CRM Contact
 * @route POST /api/crm/contacts
 */
export const createContact = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      name,
      phone,
      email,
      company,
      address,
      city,
      state,
      country = "India",
      customerType = "Lead",
      leadStatus = "New",
      leadSource = "Manual Entry",
      assignedAgent,
      budget = 0,
      currency = "INR",
      product,
      requirement,
      expectedClosingDate,
      tags = [],
      customFields = {},
      notes = [],
      totalPurchases = 0,
      sessionId,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Contact name is required" });
    }
    if (!phone || !phone.trim()) {
      return res.status(400).json({ error: "WhatsApp phone number is required" });
    }

    const cleanPhone = cleanPhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ error: "Please enter a valid phone number" });
    }

    // Check duplicate
    const existing = await CrmContact.findOne({ userId, phone: cleanPhone });
    if (existing) {
      return res.status(400).json({
        error: `A contact with phone +${cleanPhone} already exists (${existing.name}).`,
        contactId: existing._id,
      });
    }

    const chatJid = `${cleanPhone}@s.whatsapp.net`;

    // Format notes if provided
    const initialNotes = [];
    if (typeof notes === "string" && notes.trim()) {
      initialNotes.push({
        note: notes.trim(),
        createdBy: req.user.name || "User",
        createdAt: new Date(),
      });
    } else if (Array.isArray(notes)) {
      notes.forEach((n) => {
        if (typeof n === "string" && n.trim()) {
          initialNotes.push({ note: n.trim(), createdBy: req.user.name || "User" });
        } else if (n && n.note) {
          initialNotes.push({
            note: n.note,
            createdBy: n.createdBy || req.user.name || "User",
            createdAt: n.createdAt || new Date(),
          });
        }
      });
    }

    // Parse customFields
    const formattedCustomFields = {};
    if (customFields && typeof customFields === "object") {
      Object.keys(customFields).forEach((k) => {
        if (k && customFields[k] !== undefined) {
          formattedCustomFields[k] = String(customFields[k]);
        }
      });
    }

    const newContact = await CrmContact.create({
      userId,
      sessionId: sessionId || null,
      name: name.trim(),
      phone: cleanPhone,
      chatJid,
      email: (email || "").trim(),
      company: (company || "").trim(),
      address: (address || "").trim(),
      city: (city || "").trim(),
      state: (state || "").trim(),
      country: (country || "India").trim(),
      customerType,
      leadStatus,
      leadSource,
      assignedAgent: (assignedAgent || req.user?.name || "").trim(),
      salesOwner: (assignedAgent || req.user?.name || "").trim(),
      budget: Number(budget) || 0,
      currency: currency || "INR",
      product: (product || "").trim(),
      requirement: (requirement || "").trim(),
      expectedClosingDate: expectedClosingDate ? new Date(expectedClosingDate) : null,
      totalPurchases: Number(totalPurchases) || 0,
      totalConversations: 0,
      lastInteraction: new Date(),
      tags: Array.isArray(tags) ? tags.map((t) => String(t).trim()).filter(Boolean) : [],
      notes: initialNotes,
      customFields: formattedCustomFields,
    });

    return res.status(201).json({
      success: true,
      message: "Contact created successfully",
      contact: newContact,
    });
  } catch (error) {
    console.error("Error creating CRM contact:", error);
    return res.status(500).json({ error: error.message || "Failed to create contact" });
  }
};

/**
 * @desc Update existing CRM contact
 * @route PUT /api/crm/contacts/:id
 */
export const updateContact = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const {
      name,
      phone,
      email,
      company,
      address,
      city,
      state,
      country,
      customerType,
      leadStatus,
      leadSource,
      assignedAgent,
      budget,
      currency,
      product,
      requirement,
      expectedClosingDate,
      totalPurchases,
      tags,
      customFields,
    } = req.body;

    if (name !== undefined) contact.name = name.trim();
    if (email !== undefined) contact.email = email.trim();
    if (company !== undefined) contact.company = company.trim();
    if (address !== undefined) contact.address = address.trim();
    if (city !== undefined) contact.city = city.trim();
    if (state !== undefined) contact.state = state.trim();
    if (country !== undefined) contact.country = country.trim();
    if (customerType !== undefined) contact.customerType = customerType;
    if (leadStatus !== undefined) contact.leadStatus = leadStatus;
    if (leadSource !== undefined) contact.leadSource = leadSource;
    if (assignedAgent !== undefined) {
      contact.assignedAgent = assignedAgent.trim();
      contact.salesOwner = assignedAgent.trim();
    }
    if (budget !== undefined) contact.budget = Number(budget) || 0;
    if (currency !== undefined) contact.currency = currency;
    if (product !== undefined) contact.product = product.trim();
    if (requirement !== undefined) contact.requirement = requirement.trim();
    if (expectedClosingDate !== undefined) {
      contact.expectedClosingDate = expectedClosingDate ? new Date(expectedClosingDate) : null;
    }
    if (totalPurchases !== undefined) contact.totalPurchases = Number(totalPurchases) || 0;

    if (phone !== undefined) {
      const cleanPhone = cleanPhoneNumber(phone);
      if (cleanPhone && cleanPhone !== contact.phone) {
        // Ensure no other contact has this phone
        const existing = await CrmContact.findOne({
          userId,
          phone: cleanPhone,
          _id: { $ne: id },
        });
        if (existing) {
          return res.status(400).json({
            error: `Another contact already exists with phone +${cleanPhone}`,
          });
        }
        contact.phone = cleanPhone;
        contact.chatJid = `${cleanPhone}@s.whatsapp.net`;
      }
    }

    if (Array.isArray(tags)) {
      contact.tags = tags.map((t) => String(t).trim()).filter(Boolean);
    }

    if (customFields && typeof customFields === "object") {
      Object.keys(customFields).forEach((key) => {
        contact.customFields.set(key, String(customFields[key]));
      });
    }

    await contact.save();

    return res.json({
      success: true,
      message: "Contact updated successfully",
      contact,
    });
  } catch (error) {
    console.error("Error updating CRM contact:", error);
    return res.status(500).json({ error: error.message || "Failed to update contact" });
  }
};

/**
 * @desc Delete CRM contact
 * @route DELETE /api/crm/contacts/:id
 */
export const deleteContact = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const deleted = await CrmContact.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ error: "Contact not found" });
    }

    return res.json({ success: true, message: "Contact deleted successfully" });
  } catch (error) {
    console.error("Error deleting CRM contact:", error);
    return res.status(500).json({ error: error.message || "Failed to delete contact" });
  }
};

/**
 * @desc Bulk Delete CRM Contacts
 * @route POST /api/crm/contacts/bulk-delete
 */
export const bulkDeleteContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { contactIds } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "No contact IDs provided" });
    }

    const result = await CrmContact.deleteMany({
      _id: { $in: contactIds },
      userId,
    });

    return res.json({
      success: true,
      message: `${result.deletedCount} contacts deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting CRM contacts:", error);
    return res.status(500).json({ error: error.message || "Failed to bulk delete contacts" });
  }
};

/**
 * @desc Delete All CRM Contacts (or matching current filter)
 * @route POST /api/crm/contacts/delete-all
 */
export const deleteAllContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { leadStatus, customerType, leadSource } = req.body || {};

    const query = { userId };
    if (leadStatus && leadStatus !== "all") query.leadStatus = leadStatus;
    if (customerType && customerType !== "all") query.customerType = customerType;
    if (leadSource && leadSource !== "all") query.leadSource = leadSource;

    const result = await CrmContact.deleteMany(query);

    return res.json({
      success: true,
      message: `Successfully deleted ${result.deletedCount} contacts.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error deleting all CRM contacts:", error);
    return res.status(500).json({ error: error.message || "Failed to delete contacts" });
  }
};

/**
 * @desc Bulk Update Status / Agent
 * @route POST /api/crm/contacts/bulk-update
 */
export const bulkUpdateContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { contactIds, updates } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ error: "No contact IDs provided" });
    }

    const allowedUpdates = {};
    if (updates.leadStatus) allowedUpdates.leadStatus = updates.leadStatus;
    if (updates.customerType) allowedUpdates.customerType = updates.customerType;
    if (updates.assignedAgent !== undefined) allowedUpdates.assignedAgent = updates.assignedAgent;
    if (updates.tagToAdd) {
      await CrmContact.updateMany(
        { _id: { $in: contactIds }, userId },
        { $addToSet: { tags: updates.tagToAdd } }
      );
    }

    if (Object.keys(allowedUpdates).length > 0) {
      await CrmContact.updateMany(
        { _id: { $in: contactIds }, userId },
        { $set: allowedUpdates }
      );
    }

    return res.json({
      success: true,
      message: `${contactIds.length} contacts updated successfully`,
    });
  } catch (error) {
    console.error("Error bulk updating CRM contacts:", error);
    return res.status(500).json({ error: error.message || "Failed to bulk update contacts" });
  }
};

/**
 * @desc Add Note to Contact
 * @route POST /api/crm/contacts/:id/notes
 */
export const addContactNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ error: "Note content cannot be empty" });
    }

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    const newNote = {
      note: note.trim(),
      createdBy: req.user.name || "User",
      createdAt: new Date(),
    };

    contact.notes.unshift(newNote);
    await contact.save();

    return res.json({
      success: true,
      message: "Note added successfully",
      notes: contact.notes,
    });
  } catch (error) {
    console.error("Error adding CRM contact note:", error);
    return res.status(500).json({ error: error.message || "Failed to add note" });
  }
};

/**
 * @desc Delete Note from Contact
 * @route DELETE /api/crm/contacts/:id/notes/:noteId
 */
export const deleteContactNote = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, noteId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });
    if (!contact) {
      return res.status(404).json({ error: "Contact not found" });
    }

    contact.notes = contact.notes.filter((n) => n._id.toString() !== noteId);
    await contact.save();

    return res.json({
      success: true,
      message: "Note deleted successfully",
      notes: contact.notes,
    });
  } catch (error) {
    console.error("Error deleting CRM contact note:", error);
    return res.status(500).json({ error: error.message || "Failed to delete note" });
  }
};

/**
 * @desc Auto-import contacts from existing WhatsApp chats
 * "Every WhatsApp number can become a CRM contact"
 * @route POST /api/crm/import-from-chats
 */
export const importFromChats = async (req, res) => {
  try {
    const userId = req.user._id;
    const { sessionId } = req.body;

    const chatQuery = {
      userId,
      isGroup: false, // only direct 1-to-1 contacts
    };
    if (sessionId) {
      chatQuery.sessionId = sessionId;
    }

    const chats = await WaChat.find(chatQuery).sort({ lastMessageTime: -1 }).lean();

    if (!chats || chats.length === 0) {
      return res.json({
        success: true,
        message: "No direct WhatsApp chats found to import",
        importedCount: 0,
        totalScanned: 0,
      });
    }

    // High performance bulk processing for thousands of contacts
    // 1. Fetch all existing CRM contacts for this user in 1 single fast indexed query
    const existingList = await CrmContact.find(
      { userId },
      { _id: 1, phone: 1, name: 1, lastInteraction: 1 }
    ).lean();

    const existingMap = new Map();
    for (const c of existingList) {
      existingMap.set(c.phone, c);
    }

    const bulkOps = [];
    const seenPhonesInBatch = new Set();
    let importedCount = 0;
    let updatedCount = 0;

    for (const chat of chats) {
      const cleanPhone = cleanPhoneNumber(chat.phoneNumber || chat.chatJid);
      if (!cleanPhone || cleanPhone.length < 7) continue;
      if (seenPhonesInBatch.has(cleanPhone)) continue;
      seenPhonesInBatch.add(cleanPhone);

      const chatJid = chat.chatJid || `${cleanPhone}@s.whatsapp.net`;
      const contactName =
        (chat.name && !chat.name.startsWith("+") && !chat.name.includes("@") ? chat.name : null) ||
        chat.contactName ||
        `+${cleanPhone}`;

      const existing = existingMap.get(cleanPhone);

      if (!existing) {
        const digits = cleanPhone.replace(/\D/g, "");
        const queryId = digits.length >= 8 ? `TB${digits.slice(-10)}` : `TB${Date.now().toString(36).toUpperCase()}`;

        bulkOps.push({
          insertOne: {
            document: {
              userId,
              sessionId: chat.sessionId || null,
              name: contactName,
              phone: cleanPhone,
              chatJid,
              customerType: "Lead",
              leadStatus: "New",
              leadSource: "WhatsApp Inbound",
              queryId,
              queryTitle: `${contactName} - WhatsApp Inquiry`,
              lastInteraction: chat.lastMessageTime || chat.updatedAt || new Date(),
              lastInteractionText: (chat.lastMessage || "").slice(0, 500),
              totalConversations: 1,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          },
        });
        importedCount++;
      } else {
        const updateFields = {};
        if (
          chat.lastMessageTime &&
          (!existing.lastInteraction || new Date(chat.lastMessageTime) > new Date(existing.lastInteraction))
        ) {
          updateFields.lastInteraction = chat.lastMessageTime;
          updateFields.lastInteractionText = (chat.lastMessage || "").slice(0, 500);
        }
        if (
          existing.name &&
          existing.name.startsWith("+") &&
          contactName &&
          !contactName.startsWith("+")
        ) {
          updateFields.name = contactName;
        }

        if (Object.keys(updateFields).length > 0) {
          updateFields.updatedAt = new Date();
          bulkOps.push({
            updateOne: {
              filter: { _id: existing._id },
              update: { $set: updateFields },
            },
          });
          updatedCount++;
        }
      }
    }

    // Execute bulkWrite in chunks of 500 for optimal memory & socket throughput
    const CHUNK_SIZE = 500;
    for (let i = 0; i < bulkOps.length; i += CHUNK_SIZE) {
      const chunk = bulkOps.slice(i, i + CHUNK_SIZE);
      await CrmContact.bulkWrite(chunk, { ordered: false });
    }

    return res.json({
      success: true,
      message: `Successfully imported ${importedCount} new CRM contacts (${updatedCount} updated).`,
      importedCount,
      updatedCount,
      totalScanned: chats.length,
    });
  } catch (error) {
    console.error("Error importing CRM contacts from chats:", error);
    return res.status(500).json({ error: error.message || "Failed to import contacts from chats" });
  }
};

/**
 * @desc Export CRM Contacts as CSV
 * @route GET /api/crm/export
 */
export const exportContacts = async (req, res) => {
  try {
    const userId = req.user._id;
    const { customerType, leadStatus, leadSource } = req.query;

    const query = { userId };
    if (customerType && customerType !== "all") query.customerType = customerType;
    if (leadStatus && leadStatus !== "all") query.leadStatus = leadStatus;
    if (leadSource && leadSource !== "all") query.leadSource = leadSource;

    const contacts = await CrmContact.find(query)
      .select(
        "name phone email company customerType leadStatus leadSource assignedAgent budget currency product requirement expectedClosingDate city state country totalPurchases totalConversations tags lastInteraction lastInteractionText createdAt"
      )
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();

    const headers = [
      "Customer Name",
      "WhatsApp Number",
      "Email",
      "Company",
      "Customer Type",
      "Lead Status",
      "Lead Source",
      "Assigned Agent",
      "Deal Budget",
      "Currency",
      "Product",
      "Requirement",
      "Expected Closing Date",
      "City",
      "State",
      "Country",
      "Total Purchases",
      "Total Conversations",
      "Tags",
      "Last Interaction Date",
      "Last Interaction Message",
      "Created At",
    ];

    const escapeCsv = (str) => {
      if (str === null || str === undefined) return '""';
      const escaped = String(str).replace(/"/g, '""');
      return `"${escaped}"`;
    };

    const rows = contacts.map((c) => [
      escapeCsv(c.name),
      escapeCsv(`+${c.phone}`),
      escapeCsv(c.email),
      escapeCsv(c.company),
      escapeCsv(c.customerType),
      escapeCsv(c.leadStatus),
      escapeCsv(c.leadSource),
      escapeCsv(c.assignedAgent),
      c.budget || 0,
      escapeCsv(c.currency || "INR"),
      escapeCsv(c.product),
      escapeCsv(c.requirement),
      escapeCsv(c.expectedClosingDate ? new Date(c.expectedClosingDate).toISOString().split("T")[0] : ""),
      escapeCsv(c.city),
      escapeCsv(c.state),
      escapeCsv(c.country),
      c.totalPurchases || 0,
      c.totalConversations || 0,
      escapeCsv((c.tags || []).join(", ")),
      escapeCsv(c.lastInteraction ? new Date(c.lastInteraction).toISOString() : ""),
      escapeCsv(c.lastInteractionText || ""),
      escapeCsv(c.createdAt ? new Date(c.createdAt).toISOString() : ""),
    ]);

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename=crm_contacts_${Date.now()}.csv`);
    return res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error exporting CRM contacts:", error);
    return res.status(500).json({ error: error.message || "Failed to export contacts" });
  }
};

/**
 * @desc Get single Query Details workspace for /dashboard/crm/query/:id
 * @route GET /api/crm/queries/:id
 */
export const getQueryDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    let contact = null;
    if (id && id.match(/^[0-9a-fA-F]{24}$/)) {
      contact = await CrmContact.findOne({ _id: id, userId });
    }
    if (!contact) {
      contact = await CrmContact.findOne({ queryId: id, userId });
    }
    if (!contact) {
      // Fallback: try searching by phone or id prefix
      contact = await CrmContact.findOne({
        userId,
        $or: [{ phone: id }, { phone: id.replace(/^TB/, '') }],
      });
    }

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    // Auto-generate queryId if missing
    let modified = false;
    if (!contact.queryId) {
      const digits = String(contact.phone || "").replace(/\D/g, "");
      contact.queryId = digits.length >= 8 ? `TB${digits.slice(-10)}` : `TB${String(contact._id).slice(-8).toUpperCase()}`;
      modified = true;
    }

    if (!contact.queryTitle) {
      contact.queryTitle = `${contact.name} - ${contact.serviceType || "Full Package"} - ${contact.toDestination || "Dubai"}`;
      modified = true;
    }

    if (modified) {
      await contact.save();
    }

    return res.json({
      success: true,
      data: contact,
    });
  } catch (error) {
    console.error("Error fetching query details:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch query details" });
  }
};

/**
 * @desc Update Query Details (Stage, Travel Info, Title, Priority, etc.)
 * @route PUT /api/crm/queries/:id
 */
export const updateQueryDetails = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      queryTitle,
      name,
      email,
      phone,
      company,
      city,
      state,
      country,
      customerType,
      leadStatus,
      leadSource,
      priority,
      dealType,
      bookingType,
      product,
      budget,
      dealValue,
      assignedAgent,
      salesOwner,
      expectedClosingDate,
      requirement,
      notes,
    } = req.body;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    if (queryTitle !== undefined) contact.queryTitle = queryTitle.trim();
    if (name !== undefined) contact.name = name.trim();
    if (email !== undefined) contact.email = email.trim();
    if (phone !== undefined) contact.phone = phone.trim();
    if (company !== undefined) contact.company = company.trim();
    if (city !== undefined) contact.city = city.trim();
    if (state !== undefined) contact.state = state.trim();
    if (country !== undefined) contact.country = country.trim();
    if (customerType !== undefined) contact.customerType = customerType;
    if (leadStatus !== undefined) contact.leadStatus = leadStatus;
    if (leadSource !== undefined) contact.leadSource = leadSource;
    if (priority !== undefined) contact.priority = priority;
    if (dealType !== undefined) contact.dealType = dealType.trim();
    if (bookingType !== undefined) contact.bookingType = bookingType.trim();
    if (product !== undefined) contact.product = product.trim();
    if (budget !== undefined) contact.budget = Number(budget) || 0;
    if (dealValue !== undefined) contact.dealValue = Number(dealValue) || 0;
    if (assignedAgent !== undefined) {
      contact.assignedAgent = assignedAgent.trim();
      contact.salesOwner = assignedAgent.trim();
    }
    if (salesOwner !== undefined) {
      contact.salesOwner = salesOwner.trim();
      contact.assignedAgent = salesOwner.trim();
    }
    if (expectedClosingDate !== undefined) contact.expectedClosingDate = expectedClosingDate ? new Date(expectedClosingDate) : null;
    if (requirement !== undefined) contact.requirement = requirement.trim();

    await contact.save();

    return res.json({
      success: true,
      message: "Query details updated successfully",
      data: contact,
    });
  } catch (error) {
    console.error("Error updating query details:", error);
    return res.status(500).json({ success: false, error: "Failed to update query details" });
  }
};

/**
 * @desc Add a new Sales Quotation to Query
 * @route POST /api/crm/queries/:id/quotations
 */
export const addQueryQuotation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      title = "Sales Quotation",
      product = "",
      description = "",
      quantity = 1,
      unitPrice = 0,
      totalPrice = 0,
      currency = "INR",
      status = "Draft",
      validUntil = null,
      terms = "100% Advance Payment",
      items = [],
    } = req.body;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    const calculatedTotal = Number(totalPrice) || (Number(quantity) * Number(unitPrice)) || 0;

    const newQuotation = {
      title: title.trim() || `${product ? product + ' Quotation' : 'Sales Quotation'}`,
      product: product.trim() || contact.product || "WhatsApp Business API",
      description: description.trim(),
      quantity: Number(quantity) || 1,
      unitPrice: Number(unitPrice) || calculatedTotal,
      totalPrice: calculatedTotal,
      currency: currency.trim() || "INR",
      status,
      validUntil: validUntil ? new Date(validUntil) : null,
      terms: terms.trim(),
      items: Array.isArray(items) ? items : [],
      createdAt: new Date(),
    };

    contact.quotations.push(newQuotation);
    // If contact budget was 0, optionally align budget with quotation totalPrice
    if (!contact.budget || contact.budget === 0) {
      contact.budget = calculatedTotal;
      contact.dealValue = calculatedTotal;
    }
    await contact.save();

    return res.status(201).json({
      success: true,
      message: "Quotation created successfully",
      data: contact.quotations[contact.quotations.length - 1],
      quotations: contact.quotations,
    });
  } catch (error) {
    console.error("Error adding quotation:", error);
    return res.status(500).json({ success: false, error: "Failed to add quotation" });
  }
};

/**
 * @desc Delete a Quotation from Query
 * @route DELETE /api/crm/queries/:id/quotations/:quotationId
 */
export const deleteQueryQuotation = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, quotationId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    contact.quotations = contact.quotations.filter((q) => String(q._id) !== String(quotationId));
    await contact.save();

    return res.json({
      success: true,
      message: "Quotation deleted successfully",
      quotations: contact.quotations,
    });
  } catch (error) {
    console.error("Error deleting quotation:", error);
    return res.status(500).json({ success: false, error: "Failed to delete quotation" });
  }
};

/**
 * @desc Add an Activity (Task, Event, Call) to Query
 * @route POST /api/crm/queries/:id/activities
 */
export const addQueryActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      type = "task",
      title,
      dueDateTime,
      dueDate,
      status = "Open",
      priority = "Normal",
      owner = "TravBizz Admin",
      hasReminder = false,
      reminderOption = "On Due Date",
      hasRepeat = false,
      repeatFrequency = "Every Day",
      repeatUntil = null,
      description = "",
      notes = "",
      outcome = "",
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Subject / Title is required" });
    }

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    const resolvedDate = dueDateTime ? new Date(dueDateTime) : dueDate ? new Date(dueDate) : null;

    let reminderTime = resolvedDate ? new Date(resolvedDate) : null;
    if (reminderTime && hasReminder) {
      if (reminderOption === "5 Minutes Before") reminderTime = new Date(reminderTime.getTime() - 5 * 60 * 1000);
      else if (reminderOption === "15 Minutes Before") reminderTime = new Date(reminderTime.getTime() - 15 * 60 * 1000);
      else if (reminderOption === "30 Minutes Before") reminderTime = new Date(reminderTime.getTime() - 30 * 60 * 1000);
      else if (reminderOption === "1 Hour Before") reminderTime = new Date(reminderTime.getTime() - 60 * 60 * 1000);
      else if (reminderOption === "1 Day Before") reminderTime = new Date(reminderTime.getTime() - 24 * 60 * 60 * 1000);
    }

    const newActivity = {
      type: ["task", "event", "call"].includes(type) ? type : "task",
      title: title.trim(),
      dueDateTime: resolvedDate,
      dueDate: resolvedDate,
      status: status || "Open",
      priority: priority || "Normal",
      owner: owner ? owner.trim() : req.user.name || "",
      hasReminder: Boolean(hasReminder),
      reminderOption: reminderOption || "At Due Time",
      reminderTime,
      isTriggered: false,
      isDismissed: false,
      autoSendWhatsApp: Boolean(req.body.autoSendWhatsApp),
      whatsAppText: (req.body.whatsAppText || "").trim(),
      hasRepeat: Boolean(hasRepeat),
      repeatFrequency: repeatFrequency || "Every Day",
      repeatUntil: repeatUntil ? new Date(repeatUntil) : null,
      description: description.trim() || notes.trim(),
      notes: notes.trim() || description.trim(),
      outcome: outcome.trim(),
      createdAt: new Date(),
    };

    contact.activities.push(newActivity);
    await contact.save();
    if (newActivity.hasReminder) reminderService.reschedule();

    return res.status(201).json({
      success: true,
      message: `${type.toUpperCase()} added successfully`,
      data: contact.activities[contact.activities.length - 1],
      activities: contact.activities,
    });
  } catch (error) {
    console.error("Error adding activity:", error);
    return res.status(500).json({ success: false, error: "Failed to add activity" });
  }
};

/**
 * @desc Toggle Activity Status (Open <-> Completed)
 * @route PATCH /api/crm/queries/:id/activities/:activityId
 */
export const toggleQueryActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, activityId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    const activity = contact.activities.id(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, error: "Activity not found" });
    }

    const isDone = activity.status === "Completed" || activity.status === "completed";
    activity.status = isDone ? "Open" : "Completed";
    await contact.save();

    return res.json({
      success: true,
      message: `Activity marked as ${activity.status}`,
      activity,
      activities: contact.activities,
    });
  } catch (error) {
    console.error("Error toggling activity status:", error);
    return res.status(500).json({ success: false, error: "Failed to update activity status" });
  }
};

/**
 * @desc Update an Activity
 * @route PUT /api/crm/queries/:id/activities/:activityId
 */
export const updateQueryActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, activityId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    const activity = contact.activities.id(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, error: "Activity not found" });
    }

    const {
      title,
      dueDateTime,
      status,
      priority,
      owner,
      hasReminder,
      reminderOption,
      hasRepeat,
      repeatFrequency,
      repeatUntil,
      description,
    } = req.body;

    if (title !== undefined) activity.title = title.trim();
    if (dueDateTime !== undefined) {
      activity.dueDateTime = dueDateTime ? new Date(dueDateTime) : null;
      activity.dueDate = activity.dueDateTime;
    }
    if (status !== undefined) activity.status = status;
    if (priority !== undefined) activity.priority = priority;
    if (owner !== undefined) activity.owner = owner.trim();
    if (hasReminder !== undefined) activity.hasReminder = Boolean(hasReminder);
    if (reminderOption !== undefined) activity.reminderOption = reminderOption;

    if (activity.hasReminder && activity.dueDateTime) {
      let rTime = new Date(activity.dueDateTime);
      const opt = activity.reminderOption;
      if (opt === "5 Minutes Before") rTime = new Date(rTime.getTime() - 5 * 60 * 1000);
      else if (opt === "15 Minutes Before") rTime = new Date(rTime.getTime() - 15 * 60 * 1000);
      else if (opt === "30 Minutes Before") rTime = new Date(rTime.getTime() - 30 * 60 * 1000);
      else if (opt === "1 Hour Before") rTime = new Date(rTime.getTime() - 60 * 60 * 1000);
      else if (opt === "1 Day Before") rTime = new Date(rTime.getTime() - 24 * 60 * 60 * 1000);
      activity.reminderTime = rTime;
      activity.isTriggered = false; // reset alert trigger on edit
    }

    if (req.body.autoSendWhatsApp !== undefined) activity.autoSendWhatsApp = Boolean(req.body.autoSendWhatsApp);
    if (req.body.whatsAppText !== undefined) activity.whatsAppText = String(req.body.whatsAppText).trim();
    if (hasRepeat !== undefined) activity.hasRepeat = Boolean(hasRepeat);
    if (repeatFrequency !== undefined) activity.repeatFrequency = repeatFrequency;
    if (repeatUntil !== undefined) activity.repeatUntil = repeatUntil ? new Date(repeatUntil) : null;
    if (description !== undefined) {
      activity.description = description.trim();
      activity.notes = description.trim();
    }

    await contact.save();
    if (activity.hasReminder && !activity.isTriggered) reminderService.reschedule();

    return res.json({
      success: true,
      message: "Activity updated successfully",
      activity,
      activities: contact.activities,
    });
  } catch (error) {
    console.error("Error updating activity:", error);
    return res.status(500).json({ success: false, error: "Failed to update activity" });
  }
};

/**
 * @desc Delete an Activity from Query
 * @route DELETE /api/crm/queries/:id/activities/:activityId
 */
export const deleteQueryActivity = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, activityId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    contact.activities = contact.activities.filter((a) => String(a._id) !== String(activityId));
    await contact.save();

    return res.json({
      success: true,
      message: "Activity removed successfully",
      activities: contact.activities,
    });
  } catch (error) {
    console.error("Error deleting activity:", error);
    return res.status(500).json({ success: false, error: "Failed to delete activity" });
  }
};

/**
 * ═════════════════════════════════════════════════════════════════════════════
 * INVOICE & BILLING CONTROLLER METHODS
 * ═════════════════════════════════════════════════════════════════════════════
 */

/**
 * @desc Get all Invoices for a Query / Contact
 * @route GET /api/crm/queries/:id/invoices
 */
export const listQueryInvoices = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    // Fetch user's company billing settings
    let companySettings = await CompanyBillingSettings.findOne({ userId });
    if (!companySettings) {
      companySettings = await CompanyBillingSettings.create({
        userId,
        companyName: req.user.name ? `${req.user.name}'s Company` : "TravBizz Technologies",
        email: req.user.email || "billing@business.com",
      });
    }

    // Find all standalone invoices matching contact or query
    const invoices = await Invoice.find({
      userId,
      $or: [{ contactId: contact._id }, { queryId: contact.queryId || id }],
    }).sort({ createdAt: -1 });

    return res.json({
      success: true,
      data: invoices,
      contact: {
        _id: contact._id,
        name: contact.name,
        company: contact.company,
        phone: contact.phone,
        email: contact.email,
        city: contact.city,
      },
      companySettings,
    });
  } catch (error) {
    console.error("Error fetching query invoices:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch invoices" });
  }
};

/**
 * @desc Create a new Invoice for a Query / Contact
 * @route POST /api/crm/queries/:id/invoices
 */
export const createQueryInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Query not found" });
    }

    // Fetch Company Billing Profile
    let companySettings = await CompanyBillingSettings.findOne({ userId });
    if (!companySettings) {
      companySettings = await CompanyBillingSettings.create({
        userId,
        companyName: req.user.name ? `${req.user.name}'s Company` : "TravBizz Technologies",
        email: req.user.email || "billing@business.com",
      });
    }

    const {
      invoiceNumber: customInvoiceNum,
      issueDate = new Date(),
      dueDate,
      templateId = "template-1",
      items = [],
      discount = 0,
      paidAmount = 0,
      terms = companySettings.defaultTerms || "",
      notes = companySettings.defaultNotes || "",
      client: clientOverride = {},
    } = req.body;

    // Generate Invoice Number if not provided
    let invoiceNumber = customInvoiceNum ? customInvoiceNum.trim() : "";
    if (!invoiceNumber) {
      const prefix = companySettings.invoicePrefix || "INV-";
      const nextNum = companySettings.nextInvoiceNumber || 1001;
      invoiceNumber = `${prefix}${nextNum}`;
      companySettings.nextInvoiceNumber = nextNum + 1;
      await companySettings.save();
    }

    // Calculate Items & Tax
    let subtotal = 0;
    let taxTotal = 0;
    const processedItems = (items.length > 0 ? items : [
      {
        name: "WhatsApp Business Cloud API Setup & Plan",
        description: "Official Meta WhatsApp Cloud API onboarding and verified sender setup",
        hsnSac: "998314",
        quantity: 1,
        unitPrice: Number(contact.dealValue || contact.budget || 25000),
        taxRate: 18,
        taxAmount: Math.round(Number(contact.dealValue || contact.budget || 25000) * 0.18),
        amount: Math.round(Number(contact.dealValue || contact.budget || 25000) * 1.18),
      },
    ]).map((item) => {
      const qty = Number(item.quantity) || 1;
      const rate = Number(item.unitPrice) || 0;
      const taxPct = Number(item.taxRate) || 0;
      const itemSubtotal = qty * rate;
      const itemTax = Math.round((itemSubtotal * taxPct) / 100);
      const totalAmount = itemSubtotal + itemTax;

      subtotal += itemSubtotal;
      taxTotal += itemTax;

      return {
        name: item.name || "Service / Product",
        description: item.description || "",
        hsnSac: item.hsnSac || "998314",
        quantity: qty,
        unitPrice: rate,
        taxRate: taxPct,
        taxAmount: itemTax,
        amount: totalAmount,
      };
    });

    const numDiscount = Number(discount) || 0;
    const cgst = Math.round(taxTotal / 2);
    const sgst = taxTotal - cgst;
    const calculatedGrandTotal = Math.max(0, Math.round(subtotal + taxTotal - numDiscount));
    const numPaid = Number(paidAmount) || 0;
    const balanceAmount = Math.max(0, calculatedGrandTotal - numPaid);

    let calculatedStatus = "Unpaid";
    if (numPaid >= calculatedGrandTotal && calculatedGrandTotal > 0) {
      calculatedStatus = "Paid";
    } else if (numPaid > 0) {
      calculatedStatus = "Partially Paid";
    }

    // Snapshot Company Details
    const companySnapshot = {
      companyName: companySettings.companyName || "TravBizz Technologies",
      legalName: companySettings.legalName || "TravBizz Digital Media Pvt Ltd",
      logoUrl: companySettings.logoUrl || "",
      tagline: companySettings.tagline || "",
      address: companySettings.address || "",
      city: companySettings.city || "",
      state: companySettings.state || "",
      stateCode: companySettings.stateCode || "",
      pincode: companySettings.pincode || "",
      country: companySettings.country || "India",
      phone: companySettings.phone || "",
      email: companySettings.email || "",
      website: companySettings.website || "",
      gstin: companySettings.gstin || "",
      pan: companySettings.pan || "",
      bankName: companySettings.bankName || "",
      bankAccountHolder: companySettings.bankAccountHolder || "",
      bankAccountNo: companySettings.bankAccountNo || "",
      bankIfsc: companySettings.bankIfsc || "",
      bankBranch: companySettings.bankBranch || "",
      upiId: companySettings.upiId || "",
      signatoryName: companySettings.signatoryName || "Authorized Signatory",
      signatoryDesignation: companySettings.signatoryDesignation || "Director",
      signatureUrl: companySettings.signatureUrl || "",
    };

    // Snapshot Client Details
    const clientSnapshot = {
      name: clientOverride.name || contact.name || "Valued Client",
      company: clientOverride.company || contact.company || "",
      phone: clientOverride.phone || contact.phone || "",
      email: clientOverride.email || contact.email || "",
      address: clientOverride.address || contact.address || "",
      city: clientOverride.city || contact.city || "India",
      gstin: clientOverride.gstin || contact.gstNo || "",
    };

    // Default due date: issueDate + defaultDueDays (15 days)
    const finalDueDate = dueDate
      ? new Date(dueDate)
      : new Date(Date.now() + (companySettings.defaultDueDays || 15) * 24 * 60 * 60 * 1000);

    const newInvoice = await Invoice.create({
      userId,
      contactId: contact._id,
      queryId: contact.queryId || id,
      invoiceNumber,
      issueDate: issueDate ? new Date(issueDate) : new Date(),
      dueDate: finalDueDate,
      templateId: templateId || "template-1",
      client: clientSnapshot,
      company: companySnapshot,
      items: processedItems,
      subtotal,
      discount: numDiscount,
      taxTotal,
      cgst,
      sgst,
      igst: 0,
      roundOff: 0,
      grandTotal: calculatedGrandTotal,
      paidAmount: numPaid,
      balanceAmount,
      status: calculatedStatus,
      terms,
      notes,
      payments: numPaid > 0 ? [{ amount: numPaid, method: "UPI", date: new Date(), notes: "Initial Payment" }] : [],
    });

    // Also push summary into contact.invoices for sync
    contact.invoices.push({
      invoiceNumber,
      amount: calculatedGrandTotal,
      paidAmount: numPaid,
      balanceAmount,
      status: calculatedStatus === "Paid" ? "Paid" : calculatedStatus === "Partially Paid" ? "Partially Paid" : "Unpaid",
      dueDate: finalDueDate,
      createdAt: new Date(),
    });
    await contact.save();

    console.log(`[✅ INVOICE] Created invoice ${invoiceNumber} for contact ${contact.name}`);

    return res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: newInvoice,
    });
  } catch (error) {
    console.error("Error creating invoice:", error);
    return res.status(500).json({ success: false, error: "Failed to create invoice" });
  }
};

/**
 * @desc Get single Invoice details
 * @route GET /api/crm/queries/:id/invoices/:invoiceId
 */
export const getQueryInvoiceById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { invoiceId } = req.params;

    const invoice = await Invoice.findOne({ userId, _id: invoiceId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    return res.json({ success: true, data: invoice });
  } catch (error) {
    console.error("Error fetching invoice details:", error);
    return res.status(500).json({ success: false, error: "Failed to load invoice" });
  }
};

/**
 * @desc Delete an Invoice
 * @route DELETE /api/crm/queries/:id/invoices/:invoiceId
 */
export const deleteQueryInvoice = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, invoiceId } = req.params;

    const invoice = await Invoice.findOneAndDelete({ userId, _id: invoiceId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    // Also remove from contact.invoices
    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (contact) {
      contact.invoices = contact.invoices.filter((inv) => inv.invoiceNumber !== invoice.invoiceNumber);
      await contact.save();
    }

    return res.json({ success: true, message: "Invoice deleted successfully" });
  } catch (error) {
    console.error("Error deleting invoice:", error);
    return res.status(500).json({ success: false, error: "Failed to delete invoice" });
  }
};

/**
 * @desc Record a Payment for an Invoice
 * @route POST /api/crm/queries/:id/invoices/:invoiceId/payments
 */
export const recordInvoicePayment = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id, invoiceId } = req.params;
    const { amount, method = "UPI", reference = "", notes = "", date = new Date() } = req.body;

    const numAmount = Number(amount);
    if (!numAmount || numAmount <= 0) {
      return res.status(400).json({ success: false, error: "Valid payment amount is required" });
    }

    const invoice = await Invoice.findOne({ userId, _id: invoiceId });
    if (!invoice) {
      return res.status(404).json({ success: false, error: "Invoice not found" });
    }

    const newPayment = {
      amount: numAmount,
      method,
      reference,
      date: new Date(date),
      notes,
    };

    invoice.payments.push(newPayment);
    invoice.paidAmount = (Number(invoice.paidAmount) || 0) + numAmount;
    invoice.balanceAmount = Math.max(0, invoice.grandTotal - invoice.paidAmount);

    if (invoice.balanceAmount <= 0) {
      invoice.status = "Paid";
    } else {
      invoice.status = "Partially Paid";
    }

    await invoice.save();

    // Sync status to CrmContact
    const contact = await CrmContact.findOne({
      userId,
      $or: [
        ...(id && id.match(/^[0-9a-fA-F]{24}$/) ? [{ _id: id }] : []),
        { queryId: id },
      ],
    });

    if (contact) {
      const existingInv = contact.invoices.find((inv) => inv.invoiceNumber === invoice.invoiceNumber);
      if (existingInv) {
        existingInv.paidAmount = invoice.paidAmount;
        existingInv.balanceAmount = invoice.balanceAmount;
        existingInv.status = invoice.status === "Paid" ? "Paid" : "Partially Paid";
      }
      await contact.save();
    }

    return res.json({
      success: true,
      message: "Payment recorded successfully",
      data: invoice,
    });
  } catch (error) {
    console.error("Error recording invoice payment:", error);
    return res.status(500).json({ success: false, error: "Failed to record payment" });
  }
};

// ── CRM Follow-up, Call, Task & Alert Reminders Engine ──────────────────────

/**
 * @desc Get all CRM reminders across leads, calls & tasks
 * @route GET /api/crm/reminders
 */
export const listCrmReminders = async (req, res) => {
  try {
    const userId = req.user._id;
    const { status = "active", type, search } = req.query; // active | all | overdue | today | upcoming | completed

    const contacts = await CrmContact.find({
      userId,
      "activities.0": { $exists: true },
    })
      .select("name phone company queryId queryTitle dealValue leadStatus assignedAgent activities")
      .lean();

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    const endOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    const allReminders = [];

    for (const c of contacts) {
      for (const a of c.activities || []) {
        if (!a.dueDateTime && !a.dueDate) continue;

        const due = new Date(a.dueDateTime || a.dueDate);
        const isDone = a.status === "Completed" || a.status === "completed";
        const isCancelled = a.status === "Cancelled" || a.status === "cancelled";

        let category = "upcoming";
        if (isDone) {
          category = "completed";
        } else if (isCancelled) {
          category = "cancelled";
        } else if (due < startOfToday) {
          category = "overdue";
        } else if (due <= endOfToday) {
          category = "today";
        }

        allReminders.push({
          activityId: a._id,
          contactId: c._id,
          contactName: c.name,
          phone: c.phone,
          company: c.company,
          queryId: c.queryId,
          queryTitle: c.queryTitle,
          dealValue: c.dealValue,
          leadStatus: c.leadStatus,
          type: a.type || "task",
          title: a.title,
          dueDateTime: due,
          status: a.status || "Open",
          priority: a.priority || "Normal",
          owner: a.owner || c.assignedAgent || "",
          hasReminder: Boolean(a.hasReminder),
          reminderOption: a.reminderOption || "At Due Time",
          reminderTime: a.reminderTime,
          isTriggered: Boolean(a.isTriggered),
          isDismissed: Boolean(a.isDismissed),
          autoSendWhatsApp: Boolean(a.autoSendWhatsApp),
          whatsAppText: a.whatsAppText || "",
          notes: a.notes || a.description || "",
          category,
          createdAt: a.createdAt,
        });
      }
    }

    // Sort by due date ascending (most urgent first)
    allReminders.sort((a, b) => new Date(a.dueDateTime) - new Date(b.dueDateTime));

    const counts = {
      total: allReminders.length,
      overdue: allReminders.filter((r) => r.category === "overdue").length,
      today: allReminders.filter((r) => r.category === "today").length,
      upcoming: allReminders.filter((r) => r.category === "upcoming").length,
      completed: allReminders.filter((r) => r.category === "completed").length,
      calls: allReminders.filter((r) => r.type === "call" && !["completed", "cancelled"].includes(r.category)).length,
      tasks: allReminders.filter((r) => r.type === "task" && !["completed", "cancelled"].includes(r.category)).length,
    };

    let filtered = allReminders;
    if (status === "active") {
      filtered = filtered.filter((r) => ["overdue", "today", "upcoming"].includes(r.category));
    } else if (status === "overdue") {
      filtered = filtered.filter((r) => r.category === "overdue");
    } else if (status === "today") {
      filtered = filtered.filter((r) => r.category === "today");
    } else if (status === "upcoming") {
      filtered = filtered.filter((r) => r.category === "upcoming");
    } else if (status === "completed") {
      filtered = filtered.filter((r) => r.category === "completed");
    }

    if (type && type !== "all") {
      filtered = filtered.filter((r) => r.type === type);
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (r) =>
          r.title?.toLowerCase().includes(q) ||
          r.contactName?.toLowerCase().includes(q) ||
          r.phone?.includes(q) ||
          r.company?.toLowerCase().includes(q)
      );
    }

    return res.json({
      success: true,
      counts,
      data: filtered,
    });
  } catch (error) {
    console.error("Error listing CRM reminders:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch reminders" });
  }
};

/**
 * @desc Quick add a Lead/Sale call or task reminder
 * @route POST /api/crm/reminders
 */
export const createCrmReminder = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      contactId,
      contactName,
      phone,
      type = "call", // call | task | event
      title,
      dueDateTime,
      priority = "Normal",
      owner = "",
      hasReminder = true,
      reminderOption = "At Due Time",
      autoSendWhatsApp = false,
      whatsAppText = "",
      notes = "",
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, error: "Reminder title/subject is required" });
    }

    const resolvedDate = dueDateTime ? new Date(dueDateTime) : new Date(Date.now() + 60 * 60 * 1000);

    let reminderTime = new Date(resolvedDate);
    if (reminderOption === "5 Minutes Before") reminderTime = new Date(resolvedDate.getTime() - 5 * 60 * 1000);
    else if (reminderOption === "15 Minutes Before") reminderTime = new Date(resolvedDate.getTime() - 15 * 60 * 1000);
    else if (reminderOption === "30 Minutes Before") reminderTime = new Date(resolvedDate.getTime() - 30 * 60 * 1000);
    else if (reminderOption === "1 Hour Before") reminderTime = new Date(resolvedDate.getTime() - 60 * 60 * 1000);
    else if (reminderOption === "1 Day Before") reminderTime = new Date(resolvedDate.getTime() - 24 * 60 * 60 * 1000);

    let contact = null;
    if (contactId) {
      contact = await CrmContact.findOne({ _id: contactId, userId });
    } else if (phone && phone.trim()) {
      const cleanPhone = cleanPhoneNumber(phone);
      contact = await CrmContact.findOne({ phone: cleanPhone, userId });
      if (!contact) {
        const digits = cleanPhone.replace(/\D/g, "");
        const queryId = digits.length >= 8 ? `TB${digits.slice(-10)}` : `TB${Date.now().toString(36).toUpperCase()}`;
        contact = await CrmContact.create({
          userId,
          name: contactName?.trim() || `+${cleanPhone}`,
          phone: cleanPhone,
          chatJid: `${cleanPhone}@s.whatsapp.net`,
          customerType: "Lead",
          leadStatus: "New",
          leadSource: "Manual Entry",
          queryId,
          queryTitle: `${contactName || cleanPhone} - Lead Follow-up`,
          assignedAgent: owner || req.user.name || "",
        });
      }
    }

    if (!contact) {
      contact = await CrmContact.findOne({ userId }).sort({ updatedAt: -1 });
      if (!contact) {
        return res.status(400).json({ success: false, error: "Please select or provide a lead contact" });
      }
    }

    const newActivity = {
      type: ["call", "task", "event"].includes(type) ? type : "call",
      title: title.trim(),
      dueDateTime: resolvedDate,
      dueDate: resolvedDate,
      status: "Open",
      priority: priority || "Normal",
      owner: owner || req.user.name || "",
      hasReminder: Boolean(hasReminder),
      reminderOption: reminderOption || "At Due Time",
      reminderTime,
      isTriggered: false,
      isDismissed: false,
      autoSendWhatsApp: Boolean(autoSendWhatsApp),
      whatsAppText: (whatsAppText || "").trim(),
      description: (notes || "").trim(),
      notes: (notes || "").trim(),
      createdAt: new Date(),
    };

    contact.activities.push(newActivity);
    await contact.save();
    if (newActivity.hasReminder) reminderService.reschedule();

    const createdActivity = contact.activities[contact.activities.length - 1];

    return res.status(201).json({
      success: true,
      message: `${type.toUpperCase()} reminder scheduled successfully`,
      data: {
        activityId: createdActivity._id,
        contactId: contact._id,
        contactName: contact.name,
        phone: contact.phone,
        ...newActivity,
      },
    });
  } catch (error) {
    console.error("Error creating CRM reminder:", error);
    return res.status(500).json({ success: false, error: "Failed to create reminder" });
  }
};

/**
 * @desc Snooze a CRM reminder
 * @route PATCH /api/crm/reminders/:activityId/snooze
 */
export const snoozeCrmReminder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { activityId } = req.params;
    const { minutes = 15 } = req.body;

    const contact = await CrmContact.findOne({
      userId,
      "activities._id": activityId,
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Reminder not found" });
    }

    const activity = contact.activities.id(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, error: "Activity not found" });
    }

    const snoozeDate = new Date(Date.now() + parseInt(minutes, 10) * 60 * 1000);
    activity.snoozeUntil = snoozeDate;
    activity.isTriggered = false; // Reset so alert triggers again
    activity.isDismissed = false;
    await contact.save();
    reminderService.reschedule();

    return res.json({
      success: true,
      message: `Reminder snoozed for ${minutes} minutes until ${snoozeDate.toLocaleTimeString()}`,
      snoozeUntil: snoozeDate,
    });
  } catch (error) {
    console.error("Error snoozing reminder:", error);
    return res.status(500).json({ success: false, error: "Failed to snooze reminder" });
  }
};

/**
 * @desc Complete a CRM reminder
 * @route PATCH /api/crm/reminders/:activityId/complete
 */
export const completeCrmReminder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { activityId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      "activities._id": activityId,
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Reminder not found" });
    }

    const activity = contact.activities.id(activityId);
    if (!activity) {
      return res.status(404).json({ success: false, error: "Activity not found" });
    }

    activity.status = "Completed";
    activity.isDismissed = true;
    activity.isTriggered = true;
    await contact.save();

    return res.json({
      success: true,
      message: "Reminder marked as completed",
      activity,
    });
  } catch (error) {
    console.error("Error completing reminder:", error);
    return res.status(500).json({ success: false, error: "Failed to complete reminder" });
  }
};

/**
 * @desc Delete / dismiss a CRM reminder
 * @route DELETE /api/crm/reminders/:activityId
 */
export const deleteCrmReminder = async (req, res) => {
  try {
    const userId = req.user._id;
    const { activityId } = req.params;

    const contact = await CrmContact.findOne({
      userId,
      "activities._id": activityId,
    });

    if (!contact) {
      return res.status(404).json({ success: false, error: "Reminder not found" });
    }

    contact.activities = contact.activities.filter((a) => a._id.toString() !== activityId);
    await contact.save();

    return res.json({
      success: true,
      message: "Reminder removed successfully",
    });
  } catch (error) {
    console.error("Error deleting reminder:", error);
    return res.status(500).json({ success: false, error: "Failed to delete reminder" });
  }
};

/**
 * @desc Get CRM Contact by phone number (flexible matching for 10-digit / 12-digit / international)
 * @route GET /api/crm/by-phone/:phone
 */
export const getContactByPhone = async (req, res) => {
  try {
    const userId = req.user._id;
    const { phone } = req.params;
    if (!phone) return res.json({ success: true, contact: null });

    const phoneKeys = buildPhoneMatchKeys(phone);
    if (!phoneKeys || phoneKeys.length === 0) {
      const cleanDigits = String(phone).replace(/\D/g, "");
      if (cleanDigits.length >= 7) phoneKeys.push(cleanDigits);
    }

    if (phoneKeys.length === 0) {
      return res.json({ success: true, contact: null });
    }

    const contact = await CrmContact.findOne({
      userId,
      phone: { $in: phoneKeys },
    }).lean();

    return res.json({
      success: true,
      contact: contact || null,
    });
  } catch (error) {
    console.error("Error looking up contact by phone:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to find contact" });
  }
};

/**
 * @desc Save or update Query directly from WhatsApp Chat drawer
 * @route POST /api/crm/save-from-chat
 */
export const saveQueryFromChat = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      name,
      phone,
      leadStatus = "New",
      queryTitle = "",
      budget = 0,
      requirement = "",
      notes = "",
      product = "",
      sessionId,
      chatJid,
      assignedAgent,
    } = req.body;

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: "Phone number is required" });
    }

    const cleanPhone = cleanPhoneNumber(phone);
    if (!cleanPhone || cleanPhone.length < 7) {
      return res.status(400).json({ success: false, error: "Please enter a valid phone number" });
    }

    const phoneKeys = buildPhoneMatchKeys(cleanPhone);
    if (!phoneKeys.includes(cleanPhone)) phoneKeys.push(cleanPhone);

    // Check if contact already exists
    let contact = await CrmContact.findOne({
      userId,
      phone: { $in: phoneKeys },
    });

    const contactDisplayName = (name || contact?.name || `+${cleanPhone}`).trim();
    const finalChatJid = chatJid || contact?.chatJid || `${cleanPhone}@s.whatsapp.net`;
    const digits = cleanPhone.replace(/\D/g, "");
    const generatedQueryId = contact?.queryId || (digits.length >= 8 ? `TB${digits.slice(-10)}` : `TB${Date.now().toString(36).toUpperCase()}`);
    const finalTitle = queryTitle?.trim() || contact?.queryTitle || `${contactDisplayName} - WhatsApp Inquiry`;

    if (contact) {
      // Update existing contact query details
      contact.leadStatus = leadStatus || contact.leadStatus || "New";
      if (queryTitle?.trim()) contact.queryTitle = queryTitle.trim();
      if (budget !== undefined && budget !== null && budget !== "") contact.budget = Number(budget) || 0;
      if (requirement?.trim()) contact.requirement = requirement.trim();
      if (product?.trim()) contact.product = product.trim();
      if (sessionId) contact.sessionId = sessionId;
      if (assignedAgent) contact.assignedAgent = assignedAgent;
      contact.lastInteraction = new Date();

      if (notes && String(notes).trim()) {
        contact.notes.push({
          note: String(notes).trim(),
          createdBy: req.user.name || "User",
          createdAt: new Date(),
        });
      }

      await contact.save();
    } else {
      // Create new CrmContact / Query
      const initialNotes = [];
      if (notes && String(notes).trim()) {
        initialNotes.push({
          note: String(notes).trim(),
          createdBy: req.user.name || "User",
          createdAt: new Date(),
        });
      }

      contact = await CrmContact.create({
        userId,
        sessionId: sessionId || null,
        name: contactDisplayName,
        phone: cleanPhone,
        chatJid: finalChatJid,
        leadStatus: leadStatus || "New",
        leadSource: "WhatsApp Inbound",
        queryId: generatedQueryId,
        queryTitle: finalTitle,
        budget: Number(budget) || 0,
        currency: "INR",
        product: (product || "").trim(),
        requirement: (requirement || "").trim(),
        assignedAgent: (assignedAgent || req.user?.name || "").trim(),
        salesOwner: (assignedAgent || req.user?.name || "").trim(),
        notes: initialNotes,
        lastInteraction: new Date(),
      });
    }

    // Sync WaChat documents in the background
    await syncWaChatsForCrmContact(userId, contact).catch((err) => {
      console.warn("Failed syncing WaChats for CRM contact:", err.message);
    });

    return res.json({
      success: true,
      message: "Query saved successfully",
      contact,
    });
  } catch (error) {
    console.error("Error saving query from chat:", error);
    return res.status(500).json({ success: false, error: error.message || "Failed to save query" });
  }
};



