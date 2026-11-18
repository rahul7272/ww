import express from "express";
import authMiddleware from "../middleware/auth.js";
import upload from "../utils/fileUpload.js";
import { join, dirname, extname } from "path";
import { fileURLToPath } from "url";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import GroupBroadcast from "../models/GroupBroadcast.js";
import WhatsAppGroup from "../models/WhatsAppGroup.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WhatsAppService from "../services/WhatsAppService.js";
import groupSyncService from "../services/GroupSyncService.js";
import {
  startBroadcastCampaign,
  pauseBroadcastCampaign,
  removeCampaignTracking,
} from "../services/GroupBroadcastService.js";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const uploadsDir = join(__dirname, "..", "uploads");
if (!existsSync(uploadsDir)) {
  mkdirSync(uploadsDir, { recursive: true });
}

/**
 * Helper: Download remote media from URL and store in uploads directory
 */
async function saveMediaFromUrl(url, targetDir) {
  const response = await fetch(url, { redirect: "follow" });
  if (!response.ok) {
    throw new Error(`Failed to download media from URL (${response.status}: ${response.statusText})`);
  }
  const contentType = (response.headers.get("content-type") || "").toLowerCase();
  let ext = ".jpg";
  if (contentType.includes("png")) ext = ".png";
  else if (contentType.includes("webp")) ext = ".webp";
  else if (contentType.includes("gif")) ext = ".gif";
  else if (contentType.includes("mp4")) ext = ".mp4";
  else if (contentType.includes("pdf")) ext = ".pdf";
  else {
    try {
      const parsed = new URL(url);
      const urlExt = extname(parsed.pathname).toLowerCase();
      if (urlExt && [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".pdf"].includes(urlExt)) {
        ext = urlExt;
      }
    } catch {}
  }
  const filename = `broadcast_img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const filepath = join(targetDir, filename);
  const arrayBuffer = await response.arrayBuffer();
  writeFileSync(filepath, Buffer.from(arrayBuffer));
  return filename;
}

/**
 * Helper: Decode base64 media and save to uploads directory
 */
function saveMediaFromBase64(base64Data, targetDir, preferredMime = "") {
  let cleanBase64 = String(base64Data || "").trim();
  let ext = ".jpg";
  if (cleanBase64.startsWith("data:")) {
    const parts = cleanBase64.split(";base64,");
    const mimeMatch = parts[0].match(/data:(.*)/);
    if (mimeMatch && mimeMatch[1]) {
      const mime = mimeMatch[1].toLowerCase();
      if (mime.includes("png")) ext = ".png";
      else if (mime.includes("webp")) ext = ".webp";
      else if (mime.includes("gif")) ext = ".gif";
      else if (mime.includes("mp4")) ext = ".mp4";
      else if (mime.includes("pdf")) ext = ".pdf";
    }
    cleanBase64 = parts[1] || "";
  } else if (preferredMime) {
    const mime = preferredMime.toLowerCase();
    if (mime.includes("png")) ext = ".png";
    else if (mime.includes("webp")) ext = ".webp";
    else if (mime.includes("gif")) ext = ".gif";
    else if (mime.includes("mp4")) ext = ".mp4";
    else if (mime.includes("pdf")) ext = ".pdf";
  }
  const buffer = Buffer.from(cleanBase64, "base64");
  const filename = `broadcast_img_${Date.now()}_${Math.random().toString(36).substring(2, 8)}${ext}`;
  const filepath = join(targetDir, filename);
  writeFileSync(filepath, buffer);
  return filename;
}

/**
 * Optional file upload middleware: accepts multipart/form-data or application/json
 */
const handleUploadOptional = (req, res, next) => {
  const contentType = (req.headers["content-type"] || "").toLowerCase();
  if (contentType.includes("multipart/form-data")) {
    return upload.single("file")(req, res, (err) => {
      if (err) return res.status(400).json({ error: `File upload error: ${err.message}` });
      next();
    });
  }
  next();
};

/**
 * Common handler for retrieving available groups
 * GET /api/group-broadcast/groups
 * GET /api/group-broadcast/groups/:sessionId
 */
async function handleGetGroups(req, res) {
  try {
    const sessionId = (req.params.sessionId || req.query.sessionId || req.query.session || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId is required as URL param or query param (?sessionId=...)" });
    }

    const session = await WhatsAppSession.findOne({
      sessionId,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: `Session "${sessionId}" not found or unauthorized` });
    }

    const { search, refresh, force, canSendOnly, sort } = req.query;

    if (refresh === "true" || force === "true") {
      try {
        await WhatsAppService.syncSessionGroups(sessionId, { prune: true });
      } catch (syncErr) {
        console.warn(`[GroupBroadcast Groups] Manual refresh warning:`, syncErr.message);
      }
    }

    let result = await groupSyncService.getGroups(sessionId, req.user._id, {
      search,
      sort: sort || "participants",
      light: true,
    });

    if ((!result.groups || result.groups.length === 0) && !search && session.status === "connected") {
      try {
        await WhatsAppService.syncSessionGroups(sessionId, { prune: true });
        result = await groupSyncService.getGroups(sessionId, req.user._id, {
          search,
          sort: sort || "participants",
          light: true,
        });
      } catch (autoErr) {
        console.warn("[GroupBroadcast Groups] Auto-sync fallback warning:", autoErr.message);
      }
    }

    let groups = result.groups || [];
    if (canSendOnly === "true") {
      groups = groups.filter((g) => g.canSend !== false);
    }

    const mapped = groups.map((g) => ({
      id: g.jid,
      jid: g.jid,
      name: g.subject || "WhatsApp Group",
      subject: g.subject || "WhatsApp Group",
      memberCount: g.participantCount || (g.participants ? g.participants.length : 0),
      participantCount: g.participantCount || (g.participants ? g.participants.length : 0),
      canSend: g.canSend !== false,
      announce: g.announce || false,
      isMeAdmin: g.isMeAdmin || false,
      lastSyncedAt: g.lastSyncedAt || g.updatedAt,
    }));

    return res.json({
      success: true,
      sessionId,
      total: mapped.length,
      groups: mapped,
    });
  } catch (err) {
    console.error("[GroupBroadcast Groups Route] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * GET /api/group-broadcast/groups
 * GET /api/group-broadcast/groups/:sessionId
 * List available groups for session
 */
router.get("/groups", authMiddleware, handleGetGroups);
router.get("/groups/:sessionId", authMiddleware, handleGetGroups);

/**
 * POST /api/group-broadcast/send
 * Unified API to send group broadcast:
 * - Simple text message
 * - Image with message caption (via imageUrl, mediaBase64, or file upload)
 * - Anti-ban delay settings
 * - Synchronous or asynchronous execution
 */
router.post("/send", authMiddleware, handleUploadOptional, async (req, res) => {
  try {
    const userId = req.user._id;
    const sessionId = (req.body.sessionId || req.body.session || "").trim();
    if (!sessionId) {
      return res.status(400).json({ error: "sessionId (or session) is required" });
    }

    // Verify session
    const session = await WhatsAppSession.findOne({ sessionId, userId });
    if (!session) {
      return res.status(404).json({ error: `WhatsApp session "${sessionId}" not found or unauthorized` });
    }

    // Parse group JIDs
    let rawJids = req.body.groupJids || req.body.jids || req.body.groups;
    let groupJids = [];

    if (Array.isArray(rawJids)) {
      groupJids = rawJids.map((j) => String(j).trim()).filter(Boolean);
    } else if (typeof rawJids === "string") {
      rawJids = rawJids.trim();
      if (rawJids.startsWith("[") && rawJids.endsWith("]")) {
        try {
          groupJids = JSON.parse(rawJids).map((j) => String(j).trim()).filter(Boolean);
        } catch {
          return res.status(400).json({ error: "groupJids string is not valid JSON array" });
        }
      } else {
        groupJids = rawJids.split(",").map((j) => j.trim()).filter(Boolean);
      }
    }

    if (!groupJids.length) {
      return res.status(400).json({
        error: "groupJids is required and must contain at least one WhatsApp group JID (e.g. ['120363028391829@g.us'])",
      });
    }

    let message = req.body.message ?? req.body.text ?? req.body.caption ?? "";
    let imageUrl = (req.body.imageUrl || req.body.mediaUrl || "").trim();
    const mediaBase64 = (req.body.mediaBase64 || req.body.base64 || "").trim();

    // If generic 'url' parameter was sent:
    if (!imageUrl && req.body.url) {
      const passedUrl = String(req.body.url).trim();
      const lower = passedUrl.toLowerCase();
      const isDirectMedia = [".jpg", ".jpeg", ".png", ".webp", ".gif", ".mp4", ".pdf"].some((ext) => lower.includes(ext));
      if (isDirectMedia) {
        imageUrl = passedUrl;
      } else if (!message) {
        message = passedUrl;
      }
    }

    let mediaUrl = "";
    let mediaName = "";

    // Handle media attachment: uploaded file, remote image URL, or base64
    if (req.file) {
      mediaUrl = `/uploads/${req.file.filename}`;
      mediaName = req.file.filename;
    } else if (imageUrl) {
      try {
        mediaName = await saveMediaFromUrl(imageUrl, uploadsDir);
        mediaUrl = `/uploads/${mediaName}`;
      } catch (dlErr) {
        return res.status(400).json({ error: `Failed to download image from imageUrl: ${dlErr.message}` });
      }
    } else if (mediaBase64) {
      try {
        mediaName = saveMediaFromBase64(mediaBase64, uploadsDir, req.body.mediaType || req.body.mimetype);
        mediaUrl = `/uploads/${mediaName}`;
      } catch (b64Err) {
        return res.status(400).json({ error: `Failed to process mediaBase64: ${b64Err.message}` });
      }
    }

    if (!message?.trim() && !mediaName) {
      return res.status(400).json({
        error: "Either message text or an image/media (file, imageUrl, or mediaBase64) is required",
      });
    }

    // Lookup group subjects and member counts for comprehensive reporting
    const groupDocs = await WhatsAppGroup.find({
      sessionId,
      jid: { $in: groupJids },
    }).lean();

    const groupMap = new Map();
    groupDocs.forEach((g) => groupMap.set(g.jid, g));

    const targetGroups = groupJids.map((jid) => {
      const g = groupMap.get(jid);
      return {
        jid,
        groupName: g?.subject || "WhatsApp Group",
        memberCount: g?.participantCount || (g?.participants ? g.participants.length : 0),
      };
    });

    const totalMembers = targetGroups.reduce((sum, g) => sum + (Number(g.memberCount) || 0), 0);

    const mode = req.body.mode === "repeat" ? "repeat" : "instant";
    let intervalMs = null;
    if (mode === "repeat") {
      intervalMs = parseInt(req.body.intervalMs || (req.body.intervalMinutes ? parseInt(req.body.intervalMinutes) * 60000 : 0));
      if (!intervalMs || intervalMs < 10000) {
        return res.status(400).json({ error: "intervalMs must be at least 10000 (10 seconds)" });
      }
    }

    const minDelayMs = req.body.minDelayMs ? parseInt(req.body.minDelayMs) : 3000;
    const maxDelayMs = req.body.maxDelayMs ? parseInt(req.body.maxDelayMs) : 8000;
    const replyToLast = req.body.replyToLast === "true" || req.body.replyToLast === true;

    // Create the broadcast campaign record
    const campaign = await GroupBroadcast.create({
      userId,
      sessionId,
      groupJids,
      targetGroups,
      message: message?.trim() || "",
      mediaUrl,
      mediaName,
      mode,
      intervalMs,
      status: "draft",
      minDelayMs,
      maxDelayMs,
      replyToLast,
      stats: {
        total: groupJids.length,
        sent: 0,
        failed: 0,
        totalMembers,
        sentMembers: 0,
        failedMembers: 0,
      },
    });

    const isAsync = req.body.async !== false && req.body.async !== "false";

    if (!isAsync) {
      // Synchronous: wait for delivery loop and return complete results
      const finished = await startBroadcastCampaign(campaign._id.toString());
      return res.status(200).json({
        success: true,
        message: "Group broadcast finished",
        campaignId: finished._id,
        status: finished.status,
        stats: finished.stats,
        results: finished.results,
      });
    }

    // Asynchronous: start in background and immediately return campaign ID
    startBroadcastCampaign(campaign._id.toString()).catch((err) => {
      console.error(`[GroupBroadcast API] Background start error:`, err.message);
    });

    return res.status(201).json({
      success: true,
      message: "Group broadcast initiated successfully",
      campaignId: campaign._id,
      status: "running",
      totalGroups: groupJids.length,
      stats: campaign.stats,
    });
  } catch (err) {
    console.error("[GroupBroadcast Send Route] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/group-broadcast/status/:id
 * Retrieve live progress, stats, and delivery results of a broadcast campaign
 */
router.get("/status/:id", authMiddleware, async (req, res) => {
  try {
    const campaign = await GroupBroadcast.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) {
      return res.status(404).json({ error: "Broadcast campaign not found" });
    }
    return res.json({
      success: true,
      campaign: {
        _id: campaign._id,
        sessionId: campaign.sessionId,
        status: campaign.status,
        mode: campaign.mode,
        message: campaign.message,
        mediaUrl: campaign.mediaUrl,
        mediaName: campaign.mediaName,
        stats: campaign.stats,
        results: campaign.results,
        createdAt: campaign.createdAt,
      },
    });
  } catch (err) {
    console.error("[GroupBroadcast Status Route] Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/group-broadcast (and /api/group-broadcast/list)
 * Returns all group broadcasts for the logged-in user, sorted by date
 */
router.get(["/", "/list"], authMiddleware, async (req, res) => {
  try {
    const list = await GroupBroadcast.find({ userId: req.user._id }).sort({ createdAt: -1 });
    res.json({ success: true, list });
  } catch (err) {
    console.error("[GroupBroadcast List Route] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/group-broadcast/save
 * Composes a campaign and saves it as a "draft" in the DB.
 */
router.post(
  "/save",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = req.user._id;
      const { sessionId, message, mode = "instant", minDelayMs, maxDelayMs, replyToLast } = req.body;

      let groupJids;
      try {
        groupJids = JSON.parse(req.body.groupJids || "[]");
      } catch {
        return res.status(400).json({ error: "groupJids must be a valid JSON array" });
      }

      let targetGroups = [];
      try {
        if (req.body.targetGroups) {
          targetGroups = typeof req.body.targetGroups === "string" ? JSON.parse(req.body.targetGroups) : req.body.targetGroups;
        }
      } catch (e) {
        console.warn("[GroupBroadcast Save Route] Could not parse targetGroups JSON:", e.message);
      }

      if (!sessionId) return res.status(400).json({ error: "sessionId is required" });
      if (!groupJids?.length) return res.status(400).json({ error: "At least one group must be selected" });
      if (!message?.trim() && !req.file) return res.status(400).json({ error: "Message or media file is required" });

      let mediaUrl = "";
      let mediaName = "";
      if (req.file) {
        mediaUrl = `/uploads/${req.file.filename}`;
        mediaName = req.file.filename;
      }

      let intervalMs = null;
      if (mode === "repeat") {
        intervalMs = parseInt(req.body.intervalMs);
        if (!intervalMs || intervalMs < 10000) {
          return res.status(400).json({ error: "intervalMs must be at least 10000 (10 seconds)" });
        }
      }

      const totalMembers = Array.isArray(targetGroups)
        ? targetGroups.reduce((sum, g) => sum + (Number(g.memberCount) || 0), 0)
        : 0;

      const campaign = await GroupBroadcast.create({
        userId,
        sessionId,
        groupJids,
        targetGroups,
        message: message || "",
        mediaUrl,
        mediaName,
        mode,
        intervalMs,
        status: "draft",
        minDelayMs: minDelayMs ? parseInt(minDelayMs) : 3000,
        maxDelayMs: maxDelayMs ? parseInt(maxDelayMs) : 8000,
        replyToLast: replyToLast === "true" || replyToLast === true,
        stats: {
          total: groupJids.length,
          sent: 0,
          failed: 0,
          totalMembers,
          sentMembers: 0,
          failedMembers: 0,
        },
      });

      res.status(201).json({ success: true, campaign });
    } catch (err) {
      console.error("[GroupBroadcast Save Route] Error:", err.message);
      res.status(500).json({ error: err.message });
    }
  }
);

/**
 * POST /api/group-broadcast/:id/start
 * Launches or resumes a draft/paused campaign
 */
router.post("/:id/start", authMiddleware, async (req, res) => {
  try {
    const campaign = await GroupBroadcast.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const updated = await startBroadcastCampaign(campaign._id.toString());
    res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error("[GroupBroadcast Start Route] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/group-broadcast/:id/pause
 * Pauses a running repeating campaign
 */
router.post("/:id/pause", authMiddleware, async (req, res) => {
  try {
    const campaign = await GroupBroadcast.findOne({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    const updated = await pauseBroadcastCampaign(campaign._id.toString());
    res.json({ success: true, campaign: updated });
  } catch (err) {
    console.error("[GroupBroadcast Pause Route] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /api/group-broadcast/:id
 * Updates an existing campaign message, text, media, delay, and settings
 */
router.put(
  "/:id",
  authMiddleware,
  upload.single("file"),
  async (req, res) => {
    try {
      const userId = req.user._id;
      const campaignId = req.params.id;

      const campaign = await GroupBroadcast.findOne({ _id: campaignId, userId });
      if (!campaign) {
        return res.status(404).json({ success: false, error: "Campaign not found" });
      }

      const {
        message,
        mode,
        minDelayMs,
        maxDelayMs,
        replyToLast,
        removeMedia,
        intervalMs,
      } = req.body;

      // Update message text if provided
      if (typeof message === "string") {
        campaign.message = message;
      }

      // Handle media replacement or removal
      if (req.file) {
        campaign.mediaUrl = `/uploads/${req.file.filename}`;
        campaign.mediaName = req.file.filename;
      } else if (removeMedia === "true" || removeMedia === true) {
        campaign.mediaUrl = "";
        campaign.mediaName = "";
      }

      // Update mode if provided
      if (mode && ["instant", "repeat"].includes(mode)) {
        campaign.mode = mode;
      }

      if (campaign.mode === "repeat") {
        if (intervalMs) {
          const parsedInt = parseInt(intervalMs);
          if (parsedInt >= 10000) {
            campaign.intervalMs = parsedInt;
          }
        }
      } else {
        campaign.intervalMs = null;
      }

      // Update delay
      if (minDelayMs) campaign.minDelayMs = parseInt(minDelayMs);
      if (maxDelayMs) campaign.maxDelayMs = parseInt(maxDelayMs);

      // Update replyToLast
      if (replyToLast !== undefined) {
        campaign.replyToLast = replyToLast === "true" || replyToLast === true;
      }

      // Optional: update target groups if passed
      if (req.body.groupJids) {
        try {
          const parsedJids = typeof req.body.groupJids === "string" ? JSON.parse(req.body.groupJids) : req.body.groupJids;
          if (Array.isArray(parsedJids) && parsedJids.length > 0) {
            campaign.groupJids = parsedJids;
            campaign.stats.total = parsedJids.length;
          }
        } catch (e) {
          console.warn("[GroupBroadcast Update Route] Could not parse groupJids:", e.message);
        }
      }

      if (req.body.targetGroups) {
        try {
          const parsedTargets = typeof req.body.targetGroups === "string" ? JSON.parse(req.body.targetGroups) : req.body.targetGroups;
          if (Array.isArray(parsedTargets)) {
            campaign.targetGroups = parsedTargets;
            campaign.stats.totalMembers = parsedTargets.reduce((sum, g) => sum + (Number(g.memberCount) || 0), 0);
          }
        } catch (e) {
          console.warn("[GroupBroadcast Update Route] Could not parse targetGroups:", e.message);
        }
      }

      await campaign.save();

      res.json({ success: true, campaign });
    } catch (err) {
      console.error("[GroupBroadcast Update Route] Error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

// Alias: POST /:id/update
router.post(
  "/:id/update",
  authMiddleware,
  upload.single("file"),
  async (req, res, next) => {
    // Re-route to PUT logic
    try {
      const userId = req.user._id;
      const campaignId = req.params.id;

      const campaign = await GroupBroadcast.findOne({ _id: campaignId, userId });
      if (!campaign) {
        return res.status(404).json({ success: false, error: "Campaign not found" });
      }

      const {
        message,
        mode,
        minDelayMs,
        maxDelayMs,
        replyToLast,
        removeMedia,
        intervalMs,
      } = req.body;

      if (typeof message === "string") {
        campaign.message = message;
      }

      if (req.file) {
        campaign.mediaUrl = `/uploads/${req.file.filename}`;
        campaign.mediaName = req.file.filename;
      } else if (removeMedia === "true" || removeMedia === true) {
        campaign.mediaUrl = "";
        campaign.mediaName = "";
      }

      if (mode && ["instant", "repeat"].includes(mode)) {
        campaign.mode = mode;
      }

      if (campaign.mode === "repeat") {
        if (intervalMs) {
          const parsedInt = parseInt(intervalMs);
          if (parsedInt >= 10000) {
            campaign.intervalMs = parsedInt;
          }
        }
      } else {
        campaign.intervalMs = null;
      }

      if (minDelayMs) campaign.minDelayMs = parseInt(minDelayMs);
      if (maxDelayMs) campaign.maxDelayMs = parseInt(maxDelayMs);

      if (replyToLast !== undefined) {
        campaign.replyToLast = replyToLast === "true" || replyToLast === true;
      }

      await campaign.save();

      res.json({ success: true, campaign });
    } catch (err) {
      console.error("[GroupBroadcast Update Alias Route] Error:", err.message);
      res.status(500).json({ success: false, error: err.message });
    }
  }
);

/**
 * DELETE /api/group-broadcast/:id
 * Deletes a campaign from DB and halts interval tracking
 */
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const campaign = await GroupBroadcast.findOneAndDelete({ _id: req.params.id, userId: req.user._id });
    if (!campaign) return res.status(404).json({ error: "Campaign not found" });

    removeCampaignTracking(campaign._id.toString());
    res.json({ success: true });
  } catch (err) {
    console.error("[GroupBroadcast Delete Route] Error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
