import { Company, CrmContact, WaChat } from "../models/index.js";
import { syncWaChatsForCompany, clearWaChatCompanyLinks, buildPhoneMatchKeys } from "../utils/crmChatLink.js";

/**
 * @desc Get all companies with search, filtering, stats, and pagination
 * @route GET /api/companies
 */
export const listCompanies = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      search = "",
      filter = "all", // all | with_clients | with_pipelines
      page = 1,
      limit = 20,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 20));
    const skip = (pageNum - 1) * limitNum;

    // Build base query
    const query = { userId };

    if (search && search.trim()) {
      const regex = { $regex: search.trim(), $options: "i" };
      query.$or = [
        { name: regex },
        { email: regex },
        { phone: regex },
        { website: regex },
        { industry: regex },
        { gstNo: regex },
        { panNo: regex },
        { billingCity: regex },
        { billingState: regex },
      ];
    }

    // Find contacts grouped by company for this user to get counts and filter by clients/pipelines
    const contacts = await CrmContact.find(
      { userId, company: { $exists: true, $ne: "" } },
      "company leadStatus"
    ).lean();

    const companyClientCounts = {};
    const companyPipelineCounts = {};

    contacts.forEach((c) => {
      const compName = (c.company || "").trim().toLowerCase();
      if (!compName) return;

      companyClientCounts[compName] = (companyClientCounts[compName] || 0) + 1;

      const isClosed = ["Won", "Lost", "Churned"].includes(c.leadStatus);
      if (!isClosed) {
        companyPipelineCounts[compName] = (companyPipelineCounts[compName] || 0) + 1;
      }
    });

    // Handle filter tab
    if (filter === "with_clients") {
      const validNames = Object.keys(companyClientCounts);
      query.name = { $in: validNames.map((n) => new RegExp(`^${n}$`, "i")) };
    } else if (filter === "with_pipelines") {
      const validPipelineNames = Object.keys(companyPipelineCounts);
      query.name = { $in: validPipelineNames.map((n) => new RegExp(`^${n}$`, "i")) };
    }

    const sortObj = {};
    sortObj[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [companies, total] = await Promise.all([
      Company.find(query).sort(sortObj).skip(skip).limit(limitNum).lean(),
      Company.countDocuments(query),
    ]);

    // Enrich companies with linked WhatsApp chat indicator
    const directChats = companies.length > 0
      ? await WaChat.find({ userId, isGroup: { $ne: true } })
          .select("companyId phoneNumber chatJid sessionId lastMessage lastMessageTime unreadCount")
          .sort({ lastMessageTime: -1 })
          .lean()
      : [];

    const chatByCompanyId = new Map();
    const chatByKey = new Map();
    for (const ch of directChats) {
      if (ch.companyId && !chatByCompanyId.has(ch.companyId.toString())) {
        chatByCompanyId.set(ch.companyId.toString(), ch);
      }
      const keys = [
        ...buildPhoneMatchKeys(ch.phoneNumber),
        ...buildPhoneMatchKeys(ch.chatJid),
      ];
      for (const k of keys) {
        if (!chatByKey.has(k)) chatByKey.set(k, ch);
      }
    }

    // Attach counts & linked chat info to each company item
    const enrichedCompanies = companies.map((comp) => {
      const lowerName = (comp.name || "").trim().toLowerCase();
      const cKeys = buildPhoneMatchKeys(comp.phone);
      const matched =
        chatByCompanyId.get(comp._id.toString()) ||
        cKeys.map((k) => chatByKey.get(k)).find(Boolean) ||
        null;
      return {
        ...comp,
        clientsCount: companyClientCounts[lowerName] || 0,
        pipelinesCount: companyPipelineCounts[lowerName] || 0,
        hasChat: Boolean(matched),
        chatJid: matched?.chatJid || null,
        chatSessionId: matched?.sessionId || null,
        chatLastMessage: matched?.lastMessage || "",
        chatLastTime: matched?.lastMessageTime || null,
        chatUnreadCount: matched?.unreadCount || 0,
      };
    });

    // Compute stats for bottom bar
    const allUserCompanies = await Company.find({ userId }, "name").lean();
    const totalCompanies = allUserCompanies.length;
    let withClientsCount = 0;
    let withPipelinesCount = 0;

    allUserCompanies.forEach((comp) => {
      const lower = (comp.name || "").trim().toLowerCase();
      if (companyClientCounts[lower] > 0) withClientsCount++;
      if (companyPipelineCounts[lower] > 0) withPipelinesCount++;
    });

    res.json({
      success: true,
      data: enrichedCompanies,
      pagination: {
        total,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(total / limitNum) || 1,
      },
      stats: {
        totalCompanies,
        withClients: withClientsCount,
        withOpenPipelines: withPipelinesCount,
      },
    });
  } catch (error) {
    console.error("[COMPANY LIST ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc Create a new company
 * @route POST /api/companies
 */
export const createCompany = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      name,
      email,
      phone,
      website,
      description,
      gstNo,
      panNo,
      industry,
      billingStreet,
      billingCity,
      billingState,
      billingCountry,
      billingCode,
    } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Company name is required." });
    }

    if (!phone || !phone.trim()) {
      return res.status(400).json({ success: false, error: "Phone number is required." });
    }

    const company = await Company.create({
      userId,
      name: name.trim(),
      email: (email || "").trim(),
      phone: (phone || "").trim(),
      website: (website || "").trim(),
      description: (description || "").trim(),
      gstNo: (gstNo || "").trim(),
      panNo: (panNo || "").trim(),
      industry: (industry || "").trim(),
      billingStreet: (billingStreet || "").trim(),
      billingCity: (billingCity || "").trim(),
      billingState: (billingState || "").trim(),
      billingCountry: (billingCountry || "India").trim(),
      billingCode: (billingCode || "").trim(),
    });

    await syncWaChatsForCompany(userId, company).catch(() => {});

    res.status(201).json({
      success: true,
      message: "Company created successfully",
      company,
    });
  } catch (error) {
    console.error("[CREATE COMPANY ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc Get single company details with linked contacts
 * @route GET /api/companies/:id
 */
export const getCompany = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const company = await Company.findOne({ _id: id, userId }).lean();
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    // Fetch any associated queries/contacts
    const linkedContacts = await CrmContact.find({
      userId,
      company: new RegExp(`^${company.name.trim()}$`, "i"),
    })
      .select("name phone email leadStatus customerType lastInteraction")
      .sort({ updatedAt: -1 })
      .limit(50)
      .lean();

    res.json({
      success: true,
      company: {
        ...company,
        linkedContacts,
      },
    });
  } catch (error) {
    console.error("[GET COMPANY ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc Update company
 * @route PUT /api/companies/:id
 */
export const updateCompany = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      name,
      email,
      phone,
      website,
      description,
      gstNo,
      panNo,
      industry,
      billingStreet,
      billingCity,
      billingState,
      billingCountry,
      billingCode,
    } = req.body;

    const existing = await Company.findOne({ _id: id, userId });
    if (!existing) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    if (name && !name.trim()) {
      return res.status(400).json({ success: false, error: "Company name cannot be empty." });
    }

    if (phone && !phone.trim()) {
      return res.status(400).json({ success: false, error: "Phone number cannot be empty." });
    }

    const oldName = existing.name;

    existing.name = name !== undefined ? name.trim() : existing.name;
    existing.email = email !== undefined ? email.trim() : existing.email;
    existing.phone = phone !== undefined ? phone.trim() : existing.phone;
    existing.website = website !== undefined ? website.trim() : existing.website;
    existing.description = description !== undefined ? description.trim() : existing.description;
    existing.gstNo = gstNo !== undefined ? gstNo.trim() : existing.gstNo;
    existing.panNo = panNo !== undefined ? panNo.trim() : existing.panNo;
    existing.industry = industry !== undefined ? industry.trim() : existing.industry;
    existing.billingStreet = billingStreet !== undefined ? billingStreet.trim() : existing.billingStreet;
    existing.billingCity = billingCity !== undefined ? billingCity.trim() : existing.billingCity;
    existing.billingState = billingState !== undefined ? billingState.trim() : existing.billingState;
    existing.billingCountry = billingCountry !== undefined ? billingCountry.trim() : existing.billingCountry;
    existing.billingCode = billingCode !== undefined ? billingCode.trim() : existing.billingCode;

    await existing.save();
    await syncWaChatsForCompany(userId, existing).catch(() => {});

    // If company name was updated, update associated CrmContact company fields
    if (name && name.trim() !== oldName) {
      await CrmContact.updateMany(
        { userId, company: oldName },
        { $set: { company: name.trim() } }
      );
    }

    res.json({
      success: true,
      message: "Company updated successfully",
      company: existing,
    });
  } catch (error) {
    console.error("[UPDATE COMPANY ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc Delete single company
 * @route DELETE /api/companies/:id
 */
export const deleteCompany = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const company = await Company.findOneAndDelete({ _id: id, userId });
    if (!company) {
      return res.status(404).json({ success: false, error: "Company not found" });
    }

    await clearWaChatCompanyLinks(userId, [company._id]).catch(() => {});

    res.json({
      success: true,
      message: "Company deleted successfully",
    });
  } catch (error) {
    console.error("[DELETE COMPANY ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

/**
 * @desc Bulk delete companies
 * @route POST /api/companies/bulk-delete
 */
export const bulkDeleteCompanies = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, error: "No company IDs provided" });
    }

    const result = await Company.deleteMany({ _id: { $in: ids }, userId });

    await clearWaChatCompanyLinks(userId, ids).catch(() => {});

    res.json({
      success: true,
      message: `${result.deletedCount} companies deleted successfully`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("[BULK DELETE COMPANIES ERROR]:", error);
    res.status(500).json({ success: false, error: error.message });
  }
};

