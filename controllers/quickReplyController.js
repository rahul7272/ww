import QuickReply from "../models/QuickReply.js";

/**
 * Normalize shortcut string to lowercase with leading '/'
 */
function normalizeShortcut(str) {
  if (!str) return "/";
  let clean = String(str).trim().toLowerCase();
  if (!clean.startsWith("/")) {
    clean = `/${clean}`;
  }
  return clean;
}

/**
 * GET /api/quick-replies
 * List quick replies for current user
 * Query params: search, sessionId, limit, page
 */
export const getQuickReplies = async (req, res) => {
  try {
    const userId = req.user._id;
    const { search, sessionId, limit = 100, page = 1 } = req.query;

    const query = { userId };

    // Search filter across name or shortcut or message text
    if (search && search.trim()) {
      const term = search.trim();
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      query.$or = [
        { name: { $regex: escaped, $options: "i" } },
        { shortcut: { $regex: escaped, $options: "i" } },
        { "messages.text": { $regex: escaped, $options: "i" } },
        { "messages.caption": { $regex: escaped, $options: "i" } },
      ];
    }

    // Filter by connected device/session if provided
    if (sessionId) {
      query.$or = query.$or
        ? [
            { $and: [query, { scope: "all" }] },
            { $and: [query, { scope: "selected", sessionIds: sessionId }] },
          ]
        : [{ scope: "all" }, { scope: "selected", sessionIds: sessionId }];
    }

    const skip = (Number(page) - 1) * Number(limit);
    const [quickReplies, total] = await Promise.all([
      QuickReply.find(query)
        .sort({ order: 1, usageCount: -1, createdAt: -1 })
        .skip(skip)
        .limit(Number(limit))
        .lean(),
      QuickReply.countDocuments(query),
    ]);

    res.json({
      success: true,
      data: quickReplies,
      total,
      page: Number(page),
      pages: Math.ceil(total / Number(limit)) || 1,
    });
  } catch (err) {
    console.error("[GET QUICK REPLIES ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/quick-replies/:id
 * Retrieve single quick reply
 */
export const getQuickReplyById = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const quickReply = await QuickReply.findOne({ _id: id, userId }).lean();
    if (!quickReply) {
      return res.status(404).json({ success: false, error: "Quick reply not found" });
    }

    res.json({ success: true, data: quickReply });
  } catch (err) {
    console.error("[GET QUICK REPLY BY ID ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/quick-replies
 * Create a new quick reply
 */
export const createQuickReply = async (req, res) => {
  try {
    const userId = req.user._id;
    const { name, shortcut, scope = "all", sessionIds = [], behavior = "edit", messages = [] } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }
    if (!shortcut || !shortcut.trim()) {
      return res.status(400).json({ success: false, error: "Shortcut is required" });
    }

    const cleanShortcut = normalizeShortcut(shortcut);

    // Check shortcut collision
    const existing = await QuickReply.findOne({ userId, shortcut: cleanShortcut });
    if (existing) {
      return res.status(400).json({
        success: false,
        error: `A quick reply with shortcut "${cleanShortcut}" already exists`,
      });
    }

    // Validate messages sequence
    const sanitizedMessages = Array.isArray(messages) && messages.length > 0
      ? messages.map((m) => ({
          type: m.type || "text",
          text: m.text || "",
          header: m.header || "",
          footer: m.footer || "",
          mediaUrl: m.mediaUrl || null,
          mediaName: m.mediaName || null,
          caption: m.caption || "",
          contact: m.contact || {},
          location: m.location || {},
          buttons: m.buttons || [],
          list: m.list || {},
        }))
      : [{ type: "text", text: "" }];

    const newQuickReply = await QuickReply.create({
      userId,
      name: name.trim(),
      shortcut: cleanShortcut,
      scope: scope === "selected" ? "selected" : "all",
      sessionIds: Array.isArray(sessionIds) ? sessionIds : [],
      behavior: behavior === "send_now" ? "send_now" : "edit",
      messages: sanitizedMessages,
    });

    res.status(201).json({
      success: true,
      message: "Quick reply created successfully",
      data: newQuickReply,
    });
  } catch (err) {
    console.error("[CREATE QUICK REPLY ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * PUT /api/quick-replies/:id
 * Update an existing quick reply
 */
export const updateQuickReply = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const { name, shortcut, scope, sessionIds, behavior, messages, order } = req.body;

    const quickReply = await QuickReply.findOne({ _id: id, userId });
    if (!quickReply) {
      return res.status(404).json({ success: false, error: "Quick reply not found" });
    }

    if (name !== undefined) quickReply.name = String(name).trim();

    if (shortcut !== undefined) {
      const cleanShortcut = normalizeShortcut(shortcut);
      if (cleanShortcut !== quickReply.shortcut) {
        const collision = await QuickReply.findOne({
          userId,
          shortcut: cleanShortcut,
          _id: { $ne: id },
        });
        if (collision) {
          return res.status(400).json({
            success: false,
            error: `Another quick reply with shortcut "${cleanShortcut}" already exists`,
          });
        }
        quickReply.shortcut = cleanShortcut;
      }
    }

    if (scope !== undefined) quickReply.scope = scope === "selected" ? "selected" : "all";
    if (sessionIds !== undefined) quickReply.sessionIds = Array.isArray(sessionIds) ? sessionIds : [];
    if (behavior !== undefined) quickReply.behavior = behavior === "send_now" ? "send_now" : "edit";
    if (order !== undefined) quickReply.order = Number(order) || 0;

    if (Array.isArray(messages) && messages.length > 0) {
      quickReply.messages = messages.map((m) => ({
        type: m.type || "text",
        text: m.text || "",
        header: m.header || "",
        footer: m.footer || "",
        mediaUrl: m.mediaUrl || null,
        mediaName: m.mediaName || null,
        caption: m.caption || "",
        contact: m.contact || {},
        location: m.location || {},
        buttons: m.buttons || [],
        list: m.list || {},
      }));
    }

    await quickReply.save();

    res.json({
      success: true,
      message: "Quick reply updated successfully",
      data: quickReply,
    });
  } catch (err) {
    console.error("[UPDATE QUICK REPLY ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * DELETE /api/quick-replies/:id
 * Delete a quick reply
 */
export const deleteQuickReply = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const result = await QuickReply.findOneAndDelete({ _id: id, userId });
    if (!result) {
      return res.status(404).json({ success: false, error: "Quick reply not found" });
    }

    res.json({ success: true, message: "Quick reply deleted successfully" });
  } catch (err) {
    console.error("[DELETE QUICK REPLY ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/quick-replies/:id/duplicate
 * Duplicate an existing quick reply
 */
export const duplicateQuickReply = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    const original = await QuickReply.findOne({ _id: id, userId }).lean();
    if (!original) {
      return res.status(404).json({ success: false, error: "Quick reply not found" });
    }

    let baseShortcut = original.shortcut.replace(/\/$/, "");
    let copyShortcut = `${baseShortcut}_copy`;
    let counter = 1;
    while (await QuickReply.findOne({ userId, shortcut: copyShortcut })) {
      counter += 1;
      copyShortcut = `${baseShortcut}_copy${counter}`;
    }

    const duplicate = await QuickReply.create({
      userId,
      name: `${original.name} (Copy)`,
      shortcut: copyShortcut,
      scope: original.scope,
      sessionIds: original.sessionIds,
      behavior: original.behavior,
      messages: original.messages,
      order: (original.order || 0) + 1,
      usageCount: 0,
    });

    res.status(201).json({
      success: true,
      message: "Quick reply duplicated successfully",
      data: duplicate,
    });
  } catch (err) {
    console.error("[DUPLICATE QUICK REPLY ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/quick-replies/:id/usage
 * Increment usage counter when used in chat
 */
export const incrementUsage = async (req, res) => {
  try {
    const userId = req.user._id;
    const { id } = req.params;

    await QuickReply.updateOne({ _id: id, userId }, { $inc: { usageCount: 1 } });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * GET /api/quick-replies/export/all
 * Export all quick replies for current user as clean JSON
 */
export const exportQuickReplies = async (req, res) => {
  try {
    const userId = req.user._id;
    const quickReplies = await QuickReply.find({ userId })
      .select("-__v -createdAt -updatedAt -userId")
      .sort({ shortcut: 1 })
      .lean();

    res.setHeader("Content-Disposition", "attachment; filename=quick_replies_export.json");
    res.setHeader("Content-Type", "application/json");
    res.json(quickReplies);
  } catch (err) {
    console.error("[EXPORT QUICK REPLIES ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * POST /api/quick-replies/import/all
 * Import quick replies array from JSON
 */
export const importQuickReplies = async (req, res) => {
  try {
    const userId = req.user._id;
    const items = req.body;

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: "Invalid data: Expected an array of quick replies" });
    }

    let importedCount = 0;
    let skippedCount = 0;

    for (const item of items) {
      if (!item.name || !item.shortcut) {
        skippedCount++;
        continue;
      }

      let shortcut = normalizeShortcut(item.shortcut);

      // If shortcut exists, append suffix to avoid collision
      let existing = await QuickReply.findOne({ userId, shortcut });
      if (existing) {
        let count = 1;
        while (await QuickReply.findOne({ userId, shortcut: `${shortcut}_${count}` })) {
          count++;
        }
        shortcut = `${shortcut}_${count}`;
      }

      await QuickReply.create({
        userId,
        name: item.name.trim(),
        shortcut,
        scope: item.scope === "selected" ? "selected" : "all",
        sessionIds: Array.isArray(item.sessionIds) ? item.sessionIds : [],
        behavior: item.behavior === "send_now" ? "send_now" : "edit",
        messages: Array.isArray(item.messages) && item.messages.length > 0 ? item.messages : [{ type: "text", text: "" }],
      });

      importedCount++;
    }

    res.json({
      success: true,
      message: `Successfully imported ${importedCount} quick replies (${skippedCount} skipped)`,
      importedCount,
      skippedCount,
    });
  } catch (err) {
    console.error("[IMPORT QUICK REPLIES ERROR]:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

