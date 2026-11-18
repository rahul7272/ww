import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import TemplateMessageService from "../services/TemplateMessageService.js";
import { WhatsAppSession, TemplateLog, OtpLog } from "../models/index.js";
import MediaCollection from "../models/Media.js";
import WhatsAppService from "../services/WhatsAppService.js";

// GET /api/templates
export async function getTemplates(req, res) {
  try {
    const { category, search, status } = req.query;
    const filter = { userId: req.user._id };

    if (category && category !== "ALL") {
      filter.category = category;
    }
    if (status) {
      filter.status = status;
    }
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: "i" } },
        { displayName: { $regex: search, $options: "i" } },
        { body: { $regex: search, $options: "i" } },
      ];
    }

    const templates = await WhatsAppTemplate.find(filter)
      .sort("-createdAt")
      .lean();

    res.json({ success: true, count: templates.length, data: templates });
  } catch (err) {
    console.error("[TemplateController] getTemplates:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/templates/:id
export async function getTemplateById(req, res) {
  try {
    const template = await WhatsAppTemplate.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }
    res.json({ success: true, data: template });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/templates
export async function createTemplate(req, res) {
  try {
    const {
      name,
      displayName,
      category,
      language,
      messageType,
      header,
      body,
      exampleValues,
      footer,
      buttons,
      sessionId,
      status,
    } = req.body;

    if (!name || !body) {
      return res.status(400).json({
        success: false,
        error: "Template name and body text are required.",
      });
    }

    const cleanName = String(name).toLowerCase().trim().replace(/\s+/g, "_");

    // Check unique name per user
    const existing = await WhatsAppTemplate.findOne({
      userId: req.user._id,
      name: cleanName,
    });

    if (existing) {
      return res.status(409).json({
        success: false,
        error: `A template named "${cleanName}" already exists. Please choose a different name.`,
      });
    }

    const template = await WhatsAppTemplate.create({
      userId: req.user._id,
      sessionId: sessionId || "",
      name: cleanName,
      displayName: displayName || name,
      category: category || "AUTHENTICATION",
      language: language || "en_US",
      messageType: messageType || "STANDARD",
      header: header || { format: "NONE" },
      body,
      exampleValues: exampleValues || {},
      footer: footer || "",
      buttons: Array.isArray(buttons) ? buttons : [],
      status: status || "ACTIVE",
    });

    // Automatically record template creation log
    try {
      await TemplateLog.create({
        userId: req.user._id,
        templateId: template._id,
        templateName: template.name,
        displayName: template.displayName,
        category: template.category,
        action: "CREATED",
        sessionId: template.sessionId || "",
        status: "SUCCESS",
        variables: template.exampleValues || {},
        ipAddress: req.ip || "",
      });
    } catch (logErr) {
      console.warn("[createTemplate] Log entry note:", logErr.message);
    }

    res.status(201).json({ success: true, data: template });
  } catch (err) {
    console.error("[TemplateController] createTemplate:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
}

// PUT /api/templates/:id
export async function updateTemplate(req, res) {
  try {
    const {
      displayName,
      category,
      language,
      messageType,
      header,
      body,
      exampleValues,
      footer,
      buttons,
      sessionId,
      status,
    } = req.body;

    const template = await WhatsAppTemplate.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }

    if (displayName) template.displayName = displayName;
    if (category) template.category = category;
    if (language) template.language = language;
    if (messageType) template.messageType = messageType;
    if (header) template.header = header;
    if (body) template.body = body;
    if (exampleValues) template.exampleValues = exampleValues;
    if (footer !== undefined) template.footer = footer;
    if (buttons) template.buttons = buttons;
    if (sessionId !== undefined) template.sessionId = sessionId;
    if (status) template.status = status;

    await template.save();

    // Automatically record template update log
    try {
      await TemplateLog.create({
        userId: req.user._id,
        templateId: template._id,
        templateName: template.name,
        displayName: template.displayName,
        category: template.category,
        action: "UPDATED",
        sessionId: template.sessionId || "",
        status: "SUCCESS",
        variables: template.exampleValues || {},
        ipAddress: req.ip || "",
      });
    } catch (logErr) {
      console.warn("[updateTemplate] Log entry note:", logErr.message);
    }

    res.json({ success: true, data: template });
  } catch (err) {
    console.error("[TemplateController] updateTemplate:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
}

// DELETE /api/templates/:id
export async function deleteTemplate(req, res) {
  try {
    const template = await WhatsAppTemplate.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }

    res.json({ success: true, message: "Template deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/templates/:id/test-send
export async function testSendTemplate(req, res) {
  try {
    const { phoneNumber, variables, sessionId } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Recipient phone number is required.",
      });
    }

    const template = await WhatsAppTemplate.findOne({
      _id: req.params.id,
      userId: req.user._id,
    });

    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found" });
    }

    // Determine session with automatic fallback to any active connected session
    let targetSessionId = sessionId || template.sessionId;
    let isSocketActive = targetSessionId ? !!WhatsAppService.getSocket(targetSessionId) : false;

    if (!isSocketActive) {
      // 1. Try to find user's active session in DB
      let activeSession = await WhatsAppSession.findOne({
        userId: req.user._id,
        status: "connected",
      });
      // 2. Try any connected session in DB
      if (!activeSession) {
        activeSession = await WhatsAppSession.findOne({
          status: "connected",
        });
      }

      if (activeSession && WhatsAppService.getSocket(activeSession.sessionId)) {
        targetSessionId = activeSession.sessionId;
      } else {
        // 3. Fallback to any live in-memory socket
        const liveSockets = Array.from(WhatsAppService.sockets.keys());
        if (liveSockets.length > 0) {
          targetSessionId = liveSockets[0];
        } else if (activeSession) {
          targetSessionId = activeSession.sessionId;
        }
      }
    }

    if (!targetSessionId) {
      return res.status(400).json({
        success: false,
        error: "No connected WhatsApp session found. Please connect a number first under Devices.",
      });
    }

    // Auto-update template if its sessionId was outdated or missing
    if (template._id && template.sessionId !== targetSessionId) {
      template.sessionId = targetSessionId;
      await template.save().catch(() => {});
    }

    // Use passed variables or fallback to template.exampleValues
    const mergedVars = {
      ...(template.exampleValues || {}),
      ...(variables || {}),
    };

    const startTime = Date.now();
    let result = null;
    let dispatchErr = null;

    try {
      result = await TemplateMessageService.dispatch(
        targetSessionId,
        phoneNumber,
        template,
        mergedVars
      );
    } catch (err) {
      dispatchErr = err;
    }

    const latency = Date.now() - startTime;
    const isSuccess = !dispatchErr && result?.success;

    // Automatically record test dispatch in TemplateLog
    try {
      await TemplateLog.create({
        userId: req.user._id,
        templateId: template._id,
        templateName: template.name,
        displayName: template.displayName,
        category: template.category,
        action: "TEST_SEND",
        sessionId: targetSessionId,
        phoneNumber,
        status: isSuccess ? "DISPATCHED" : "FAILED",
        messageId: result?.messageId || result?.key?.id || "",
        dispatchLatencyMs: latency,
        variables: mergedVars,
        errorMessage: dispatchErr ? dispatchErr.message : (result?.error || ""),
        ipAddress: req.ip || "",
      });
    } catch (logErr) {
      console.warn("[testSendTemplate] Log entry note:", logErr.message);
    }

    if (dispatchErr) {
      return res.status(500).json({ success: false, error: dispatchErr.message });
    }

    res.json({
      success: true,
      message: "Template test message sent successfully!",
      result,
    });
  } catch (err) {
    console.error("[TemplateController] testSendTemplate error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/templates/send or POST /api/v1/templates/send
export async function sendTemplateUnified(req, res) {
  try {
    const { templateId, templateName, phoneNumber, variables, sessionId } = req.body;
    const targetId = req.params.id || templateId;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Recipient phone number is required.",
      });
    }

    let template = null;
    if (targetId) {
      template = await WhatsAppTemplate.findOne({
        _id: targetId,
        userId: req.user._id,
      });
    } else if (templateName) {
      template = await WhatsAppTemplate.findOne({
        name: templateName.trim(),
        userId: req.user._id,
      });
      if (!template) {
        template = await WhatsAppTemplate.findOne({
          name: templateName.trim(),
        });
      }
    }

    if (!template) {
      return res.status(404).json({ success: false, error: "Template not found." });
    }

    // Determine session with automatic active fallback
    let targetSessionId = sessionId || template.sessionId;
    let isSocketActive = targetSessionId ? !!WhatsAppService.getSocket(targetSessionId) : false;

    if (!isSocketActive) {
      let activeSession = await WhatsAppSession.findOne({
        userId: req.user._id,
        status: "connected",
      });
      if (!activeSession) {
        activeSession = await WhatsAppSession.findOne({
          status: "connected",
        });
      }

      if (activeSession && WhatsAppService.getSocket(activeSession.sessionId)) {
        targetSessionId = activeSession.sessionId;
      } else {
        const liveSockets = Array.from(WhatsAppService.sockets.keys());
        if (liveSockets.length > 0) {
          targetSessionId = liveSockets[0];
        } else if (activeSession) {
          targetSessionId = activeSession.sessionId;
        }
      }
    }

    if (!targetSessionId) {
      return res.status(400).json({
        success: false,
        error: "No connected WhatsApp session found. Please link a device under Devices first.",
      });
    }

    // Auto-update template if sessionId was outdated
    if (template._id && template.sessionId !== targetSessionId) {
      template.sessionId = targetSessionId;
      await template.save().catch(() => {});
    }

    const mergedVars = {
      ...(template.exampleValues || {}),
      ...(variables || {}),
    };

    const startTime = Date.now();
    let result = null;
    let dispatchErr = null;

    try {
      result = await TemplateMessageService.dispatch(
        targetSessionId,
        phoneNumber,
        template,
        mergedVars
      );
    } catch (err) {
      dispatchErr = err;
    }

    const latency = Date.now() - startTime;
    const isSuccess = !dispatchErr && result?.success;

    // Automatically record dispatch in TemplateLog
    try {
      await TemplateLog.create({
        userId: req.user._id,
        templateId: template._id,
        templateName: template.name,
        displayName: template.displayName,
        category: template.category,
        action: "DISPATCH",
        sessionId: targetSessionId,
        phoneNumber,
        status: isSuccess ? "DISPATCHED" : "FAILED",
        messageId: result?.messageId || result?.key?.id || "",
        dispatchLatencyMs: latency,
        variables: mergedVars,
        errorMessage: dispatchErr ? dispatchErr.message : (result?.error || ""),
        ipAddress: req.ip || "",
      });
    } catch (logErr) {
      console.warn("[sendTemplateUnified] Log entry note:", logErr.message);
    }

    if (dispatchErr) {
      return res.status(500).json({ success: false, error: dispatchErr.message });
    }

    res.json({
      success: true,
      message: "Template message dispatched successfully!",
      result,
    });
  } catch (err) {
    console.error("[TemplateController] sendTemplateUnified error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/templates/logs
export async function getTemplateLogs(req, res) {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };

    if (req.query.category && req.query.category !== "ALL") {
      filter.category = req.query.category;
    }
    if (req.query.action && req.query.action !== "ALL") {
      filter.action = req.query.action;
    }
    if (req.query.status && req.query.status !== "ALL") {
      filter.status = req.query.status;
    }
    if (req.query.search) {
      const s = req.query.search.trim();
      filter.$or = [
        { phoneNumber: { $regex: s, $options: "i" } },
        { templateName: { $regex: s, $options: "i" } },
        { displayName: { $regex: s, $options: "i" } },
      ];
    }

    const [total, logs] = await Promise.all([
      TemplateLog.countDocuments(filter),
      TemplateLog.find(filter).sort("-createdAt").skip(skip).limit(limit).lean(),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      data: logs,
    });
  } catch (err) {
    console.error("[TemplateController] getTemplateLogs error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/templates/logs/:id
export async function deleteTemplateLog(req, res) {
  try {
    const { id } = req.params;
    const deleted = await TemplateLog.findOneAndDelete({
      _id: id,
      userId: req.user._id,
    });

    if (!deleted) {
      await OtpLog.findOneAndDelete({ _id: id, userId: req.user._id });
    }

    res.json({
      success: true,
      message: "Template log deleted successfully.",
    });
  } catch (err) {
    console.error("[TemplateController] deleteTemplateLog error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/templates/logs or POST /api/templates/logs/clear
export async function clearTemplateLogs(req, res) {
  try {
    const filter = { userId: req.user._id };
    if (req.query.category && req.query.category !== "ALL") {
      filter.category = req.query.category;
    }

    await Promise.all([
      TemplateLog.deleteMany(filter),
      OtpLog.deleteMany({ userId: req.user._id }),
    ]);

    res.json({
      success: true,
      message: "All template logs cleared successfully.",
    });
  } catch (err) {
    console.error("[TemplateController] clearTemplateLogs error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/templates/upload-media
export async function uploadTemplateMedia(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No file provided" });
    }

    const filename = req.file.filename;
    const fileUrl = `/uploads/${filename}`;
    const fullUrl = `${req.protocol}://${req.get("host")}${fileUrl}`;
    const mime = (req.file.mimetype || "").toLowerCase();

    let mediaType = "document";
    if (mime.startsWith("image/")) mediaType = "image";
    else if (mime.startsWith("video/")) mediaType = "video";
    else if (mime.startsWith("audio/")) mediaType = "audio";

    // Auto-index into user's Media Collection for Gallery reusability
    try {
      const userId = req.user.id || req.user._id;
      let col = await MediaCollection.findOne({ userId, name: "Template Media" });
      if (!col) {
        col = new MediaCollection({
          userId,
          id: `col${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          name: "Template Media",
          colorId: "emerald",
          media: [],
          subcollections: [],
        });
      }
      col.media.unshift({
        id: `m${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: req.file.originalname,
        type: mediaType,
        size: `${Math.round(req.file.size / 1024)} KB`,
        created: new Date(),
        usedIn: 1,
        fileUrl,
        fileSize: req.file.size,
      });
      await col.save();
    } catch (saveErr) {
      console.warn("[uploadTemplateMedia] MediaCollection indexing note:", saveErr.message);
    }

    res.status(201).json({
      success: true,
      url: fileUrl,
      fullUrl,
      filename: req.file.originalname,
      mediaType,
      size: req.file.size,
    });
  } catch (err) {
    console.error("[TemplateController] uploadTemplateMedia error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
}
