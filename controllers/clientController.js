import { Client, Company, SalesTeamMember, CrmContact, WaChat } from "../models/index.js";
import { syncWaChatsForClient, clearWaChatClientLinks, buildPhoneMatchKeys } from "../utils/crmChatLink.js";

const escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * @desc Get all clients with search, filtering, stats, and pagination
 * @route GET /api/clients
 */
export const listClients = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      search = "",
      filter = "all", // all | with_pipelines | without_pipelines | untouched
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
      const safeSearch = escapeRegex(search.trim());
      const regex = { $regex: safeSearch, $options: "i" };
      const searchConditions = [
        { firstName: regex },
        { lastName: regex },
        { title: regex },
        { email: regex },
        { mobile: regex },
        { companyName: regex },
        { description: regex },
        { owner: regex },
        { mailingCity: regex },
      ];
      const digitsOnly = search.replace(/\D/g, "");
      if (digitsOnly.length >= 3) {
        searchConditions.push({ mobile: { $regex: escapeRegex(digitsOnly) } });
      }
      query.$or = searchConditions;
    }

    // Apply Filter (Matching Image 1: All Clients, Clients With Open Pipelines, Without Pipelines, Untouched)
    if (filter === "with_pipelines") {
      query.openPipelines = { $gt: 0 };
    } else if (filter === "without_pipelines") {
      query.openPipelines = { $lte: 0 };
    } else if (filter === "untouched") {
      query.untouched = true;
    }

    // Sort order
    const sort = {};
    sort[sortBy] = sortOrder === "asc" ? 1 : -1;

    // Parallel fetch for clients and counts
    const [clients, totalFiltered, totalClients, withOpenPipelines, withoutPipelines, untouched] =
      await Promise.all([
        Client.find(query).sort(sort).skip(skip).limit(limitNum).lean(),
        Client.countDocuments(query),
        Client.countDocuments({ userId }),
        Client.countDocuments({ userId, openPipelines: { $gt: 0 } }),
        Client.countDocuments({ userId, openPipelines: { $lte: 0 } }),
        Client.countDocuments({ userId, untouched: true }),
      ]);

    const totalPages = Math.ceil(totalFiltered / limitNum) || 1;

    // Enrich clients with linked WhatsApp chat indicator
    const directChats = clients.length > 0
      ? await WaChat.find({ userId, isGroup: { $ne: true } })
          .select("clientId phoneNumber chatJid sessionId lastMessage lastMessageTime unreadCount")
          .sort({ lastMessageTime: -1 })
          .lean()
      : [];

    const chatByClientId = new Map();
    const chatByKey = new Map();
    for (const ch of directChats) {
      if (ch.clientId && !chatByClientId.has(ch.clientId.toString())) {
        chatByClientId.set(ch.clientId.toString(), ch);
      }
      const keys = [
        ...buildPhoneMatchKeys(ch.phoneNumber),
        ...buildPhoneMatchKeys(ch.chatJid),
      ];
      for (const k of keys) {
        if (!chatByKey.has(k)) chatByKey.set(k, ch);
      }
    }

    const enrichedClients = clients.map((cl) => {
      const cKeys = buildPhoneMatchKeys(cl.mobile);
      const matched =
        chatByClientId.get(cl._id.toString()) ||
        cKeys.map((k) => chatByKey.get(k)).find(Boolean) ||
        null;
      return {
        ...cl,
        hasChat: Boolean(matched),
        chatJid: matched?.chatJid || null,
        chatSessionId: matched?.sessionId || null,
        chatLastMessage: matched?.lastMessage || "",
        chatLastTime: matched?.lastMessageTime || null,
        chatUnreadCount: matched?.unreadCount || 0,
      };
    });

    return res.json({
      success: true,
      data: enrichedClients,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total: totalFiltered,
        totalPages,
      },
      stats: {
        totalClients,
        withOpenPipelines,
        withoutPipelines,
        untouched,
      },
    });
  } catch (error) {
    console.error("Error in listClients:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to fetch clients list.",
      details: error.message,
    });
  }
};

/**
 * @desc Get single client by ID
 * @route GET /api/clients/:id
 */
export const getClientById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const client = await Client.findOne({ _id: id, userId }).lean();
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found." });
    }

    return res.json({ success: true, data: client });
  } catch (error) {
    console.error("Error in getClientById:", error);
    return res.status(500).json({ success: false, error: "Failed to fetch client details." });
  }
};

/**
 * @desc Create new client (Matching Image 2 fields)
 * @route POST /api/clients
 */
export const createClient = async (req, res) => {
  try {
    const userId = req.user._id;
    const {
      firstName,
      lastName = "",
      title = "",
      email = "",
      mobile,
      companyId = null,
      companyName = "",
      owner,
      description = "",
      dateOfBirth = "",
      mailingStreet = "",
      mailingCity = "",
      mailingZip = "",
      openPipelines = 0,
      untouched = true,
    } = req.body;

    if (!firstName || !firstName.trim()) {
      return res.status(400).json({
        success: false,
        error: "First name is required.",
      });
    }

    if (!mobile || !mobile.trim()) {
      return res.status(400).json({
        success: false,
        error: "Mobile number is required.",
      });
    }

    // Determine client owner (default to provided owner or logged in user name or "")
    const finalOwner =
      owner && owner.trim()
        ? owner.trim()
        : req.user?.name || "";

    // Auto-link company if companyName provided but no companyId
    let resolvedCompanyId = companyId;
    let resolvedCompanyName = companyName.trim();

    if (resolvedCompanyName && !resolvedCompanyId) {
      const existingComp = await Company.findOne({
        userId,
        name: { $regex: new RegExp(`^${resolvedCompanyName}$`, "i") },
      });
      if (existingComp) {
        resolvedCompanyId = existingComp._id;
        resolvedCompanyName = existingComp.name;
      }
    }

    const client = await Client.create({
      userId,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      title: title.trim(),
      email: email.trim().toLowerCase(),
      mobile: mobile.trim(),
      companyId: resolvedCompanyId || null,
      companyName: resolvedCompanyName,
      owner: finalOwner,
      description: description.trim(),
      dateOfBirth: dateOfBirth.trim(),
      mailingStreet: mailingStreet.trim(),
      mailingCity: mailingCity.trim(),
      mailingZip: mailingZip.trim(),
      openPipelines: Number(openPipelines) || 0,
      untouched: Boolean(untouched),
    });

    await syncWaChatsForClient(userId, client).catch(() => {});

    return res.status(201).json({
      success: true,
      message: "Client created successfully.",
      data: client,
    });
  } catch (error) {
    console.error("Error creating client:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to create client.",
      details: error.message,
    });
  }
};

/**
 * @desc Update client
 * @route PUT /api/clients/:id
 */
export const updateClient = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const {
      firstName,
      lastName,
      title,
      email,
      mobile,
      companyId,
      companyName,
      owner,
      description,
      dateOfBirth,
      mailingStreet,
      mailingCity,
      mailingZip,
      openPipelines,
      untouched,
    } = req.body;

    const client = await Client.findOne({ _id: id, userId });
    if (!client) {
      return res.status(404).json({ success: false, error: "Client not found." });
    }

    if (firstName !== undefined) client.firstName = firstName.trim();
    if (lastName !== undefined) client.lastName = lastName.trim();
    if (title !== undefined) client.title = title.trim();
    if (email !== undefined) client.email = email.trim().toLowerCase();
    if (mobile !== undefined) client.mobile = mobile.trim();
    if (owner !== undefined) client.owner = owner.trim();
    if (description !== undefined) client.description = description.trim();
    if (dateOfBirth !== undefined) client.dateOfBirth = dateOfBirth.trim();
    if (mailingStreet !== undefined) client.mailingStreet = mailingStreet.trim();
    if (mailingCity !== undefined) client.mailingCity = mailingCity.trim();
    if (mailingZip !== undefined) client.mailingZip = mailingZip.trim();
    if (openPipelines !== undefined) client.openPipelines = Number(openPipelines) || 0;
    if (untouched !== undefined) client.untouched = Boolean(untouched);

    if (companyName !== undefined) {
      client.companyName = companyName.trim();
      if (companyId !== undefined) {
        client.companyId = companyId;
      } else if (client.companyName) {
        const existingComp = await Company.findOne({
          userId,
          name: { $regex: new RegExp(`^${client.companyName}$`, "i") },
        });
        client.companyId = existingComp ? existingComp._id : null;
      } else {
        client.companyId = null;
      }
    }

    await client.save();
    await syncWaChatsForClient(userId, client).catch(() => {});

    return res.json({
      success: true,
      message: "Client updated successfully.",
      data: client,
    });
  } catch (error) {
    console.error("Error updating client:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to update client details.",
      details: error.message,
    });
  }
};

/**
 * @desc Delete single client
 * @route DELETE /api/clients/:id
 */
export const deleteClient = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const deleted = await Client.findOneAndDelete({ _id: id, userId });
    if (!deleted) {
      return res.status(404).json({ success: false, error: "Client not found." });
    }

    await clearWaChatClientLinks(userId, [deleted._id]).catch(() => {});

    return res.json({
      success: true,
      message: "Client deleted successfully.",
      data: { id },
    });
  } catch (error) {
    console.error("Error deleting client:", error);
    return res.status(500).json({ success: false, error: "Failed to delete client." });
  }
};

/**
 * @desc Bulk delete clients
 * @route POST /api/clients/bulk-delete
 */
export const bulkDeleteClients = async (req, res) => {
  try {
    const userId = req.user._id;
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({
        success: false,
        error: "Please provide an array of client IDs to delete.",
      });
    }

    const result = await Client.deleteMany({
      _id: { $in: ids },
      userId,
    });

    await clearWaChatClientLinks(userId, ids).catch(() => {});

    return res.json({
      success: true,
      message: `${result.deletedCount} clients deleted successfully.`,
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Error bulk deleting clients:", error);
    return res.status(500).json({ success: false, error: "Failed to delete selected clients." });
  }
};

/**
 * @desc Get all sales team members for client owner selection
 * @route GET /api/clients/sales-team
 */
export const listSalesTeam = async (req, res) => {
  try {
    const userId = req.user._id;
    let members = await SalesTeamMember.find({ userId }).sort({ createdAt: 1 }).lean();

    // If user has zero members configured at all, initialize once with their account name
    if (members.length === 0) {
      try {
        const initial = [
          {
            userId,
            name: req.user?.name || "Owner",
            role: "Owner",
          },
        ];
        members = await SalesTeamMember.insertMany(initial);
      } catch (insertErr) {
        members = await SalesTeamMember.find({ userId }).sort({ createdAt: 1 }).lean();
      }
    }

    // Aggregate lead counts from Client collection
    const clientCounts = await Client.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: { $toLower: { $trim: { input: { $ifNull: ["$owner", ""] } } } },
          count: { $sum: 1 },
        },
      },
    ]);

    // Aggregate lead counts from CrmContact collection
    const crmCounts = await CrmContact.aggregate([
      { $match: { userId } },
      {
        $group: {
          _id: {
            $toLower: {
              $trim: {
                input: {
                  $ifNull: [
                    "$salesOwner",
                    { $ifNull: ["$assignedAgent", { $ifNull: ["$owner", ""] }] },
                  ],
                },
              },
            },
          },
          count: { $sum: 1 },
        },
      },
    ]);

    const clientCountMap = {};
    clientCounts.forEach((c) => {
      if (c._id) clientCountMap[c._id] = c.count;
    });

    const crmCountMap = {};
    crmCounts.forEach((c) => {
      if (c._id) crmCountMap[c._id] = c.count;
    });

    const enrichedMembers = members.map((m) => {
      const key = (m.name || "").trim().toLowerCase();
      const clientCount = clientCountMap[key] || 0;
      const crmCount = crmCountMap[key] || 0;
      const totalLeads = clientCount + crmCount;

      return {
        ...m,
        totalLeads,
        clientCount,
        crmCount,
      };
    });

    return res.json({
      success: true,
      data: enrichedMembers,
      stats: {
        totalMembers: enrichedMembers.length,
        totalAssignedLeads: enrichedMembers.reduce((acc, m) => acc + (m.totalLeads || 0), 0),
      },
    });
  } catch (error) {
    console.error("Error in listSalesTeam:", error);
    return res.status(500).json({ success: false, error: "Failed to load sales team members." });
  }
};

/**
 * @desc Add new sales team member / client owner
 * @route POST /api/clients/sales-team
 */
export const createSalesTeamMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, role = "Sales Executive", email = "", phone = "" } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({
        success: false,
        error: "Please enter the sales team member's name.",
      });
    }

    const trimmedName = name.trim();

    // Check if already exists for this user
    let existing = await SalesTeamMember.findOne({
      userId,
      name: { $regex: new RegExp(`^${trimmedName}$`, "i") },
    });

    if (existing) {
      return res.json({
        success: true,
        message: "Sales team member already exists.",
        data: {
          ...existing.toObject(),
          totalLeads: 0,
        },
      });
    }

    const newMember = await SalesTeamMember.create({
      userId,
      name: trimmedName,
      role: role.trim() || "Sales Executive",
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
    });

    return res.status(201).json({
      success: true,
      message: "New sales team member added successfully.",
      data: {
        ...newMember.toObject(),
        totalLeads: 0,
        clientCount: 0,
        crmCount: 0,
      },
    });
  } catch (error) {
    console.error("Error creating sales team member:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to add sales team member.",
      details: error.message,
    });
  }
};

/**
 * @desc Delete a sales team member
 * @route DELETE /api/clients/sales-team/:id
 */
export const deleteSalesTeamMember = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    let { reassignTo } = req.body || {};

    const memberToDelete = await SalesTeamMember.findOne({ _id: id, userId });
    if (!memberToDelete) {
      return res.status(404).json({ success: false, error: "Sales team member not found." });
    }

    // Determine target for lead reassignment (another team member or account owner)
    if (!reassignTo || reassignTo === memberToDelete.name) {
      const anotherMember = await SalesTeamMember.findOne({
        userId,
        _id: { $ne: id },
      }).lean();
      reassignTo = anotherMember?.name || req.user?.name || "Unassigned";
    }

    // Reassign any clients / leads currently owned by this member
    await Client.updateMany(
      { userId, owner: memberToDelete.name },
      { $set: { owner: reassignTo } }
    );
    await CrmContact.updateMany(
      {
        userId,
        $or: [
          { salesOwner: memberToDelete.name },
          { assignedAgent: memberToDelete.name },
          { owner: memberToDelete.name },
        ],
      },
      {
        $set: {
          salesOwner: reassignTo,
          assignedAgent: reassignTo,
          owner: reassignTo,
        },
      }
    );

    await SalesTeamMember.deleteOne({ _id: id, userId });

    return res.json({
      success: true,
      message: `Sales team member removed successfully. Leads reassigned to ${reassignTo}.`,
      data: { id, reassignedTo: reassignTo },
    });
  } catch (error) {
    console.error("Error deleting sales team member:", error);
    return res.status(500).json({ success: false, error: "Failed to remove sales team member." });
  }
};


