import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import mongoose from "mongoose";
import WhatsAppService from "../services/WhatsAppService.js";
import statusService from "../services/StatusService.js";
import { WaStatus } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * GET /api/chats/:sessionId/status/history
 * Fetch previous statuses with pagination, filters, and search
 */
export const getStatusHistory = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    const { status, search, month, page = 1, limit = 50 } = req.query;

    const query = { userId, sessionId };

    if (status && status !== "all") {
      query.status = status;
    }

    if (search && search.trim()) {
      query.$or = [
        { text: { $regex: search.trim(), $options: "i" } },
        { caption: { $regex: search.trim(), $options: "i" } },
        { campaignTitle: { $regex: search.trim(), $options: "i" } },
        { mediaFileName: { $regex: search.trim(), $options: "i" } },
      ];
    }

    if (month && month.match(/^\d{4}-\d{2}$/)) {
      query.scheduledDateKey = { $regex: `^${month}` };
    }

    const skip = (Math.max(1, parseInt(page)) - 1) * Math.max(1, parseInt(limit));
    const limitNum = Math.min(200, Math.max(1, parseInt(limit)));

    const [statuses, totalCount, stats] = await Promise.all([
      WaStatus.find(query)
        .sort({ scheduledFor: -1, createdAt: -1 })
        .skip(skip)
        .limit(limitNum)
        .lean(),
      WaStatus.countDocuments(query),
      WaStatus.aggregate([
        { $match: { userId: new mongoose.Types.ObjectId(userId), sessionId } },
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    const statsMap = { total: 0, scheduled: 0, sent: 0, failed: 0, sending: 0 };
    stats.forEach((s) => {
      if (statsMap[s._id] !== undefined) statsMap[s._id] = s.count;
      statsMap.total += s.count;
    });

    return res.json({
      success: true,
      data: statuses,
      pagination: {
        total: totalCount,
        page: parseInt(page),
        limit: limitNum,
        totalPages: Math.ceil(totalCount / limitNum),
      },
      stats: statsMap,
    });
  } catch (err) {
    console.error("[STATUS CONTROLLER] getStatusHistory error:", err);
    return res.status(500).json({ message: err.message || "Failed to load status history." });
  }
};

/**
 * GET /api/chats/:sessionId/status/calendar
 * Aggregate statuses by day for interactive monthly calendar view
 */
export const getMonthlyCalendarStatuses = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    let { month } = req.query; // e.g. "2026-11"

    if (!month || !month.match(/^\d{4}-\d{2}$/)) {
      const now = new Date();
      month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
    }

    const [yearStr, monthStr] = month.split("-");
    const year = parseInt(yearStr);
    const m = parseInt(monthStr);

    const startOfMonth = new Date(Date.UTC(year, m - 1, 1, 0, 0, 0));
    const endOfMonth = new Date(Date.UTC(year, m, 1, 0, 0, 0));

    const statuses = await WaStatus.find({
      userId,
      sessionId,
      $or: [
        { scheduledDateKey: { $regex: `^${month}` } },
        { scheduledFor: { $gte: startOfMonth, $lt: endOfMonth } },
        { createdAt: { $gte: startOfMonth, $lt: endOfMonth } },
      ],
    })
      .sort({ scheduledFor: 1, createdAt: 1 })
      .lean();

    const calendarMap = {};
    const summary = { totalScheduled: 0, totalSent: 0, totalFailed: 0 };

    statuses.forEach((st) => {
      let dayKey = st.scheduledDateKey;
      if (!dayKey) {
        const d = st.scheduledFor || st.postedAt || st.createdAt;
        if (d) {
          const dateObj = new Date(d);
          dayKey = `${dateObj.getFullYear()}-${String(dateObj.getMonth() + 1).padStart(2, "0")}-${String(
            dateObj.getDate()
          ).padStart(2, "0")}`;
        }
      }

      if (!dayKey) dayKey = `${month}-01`;

      if (!calendarMap[dayKey]) {
        calendarMap[dayKey] = [];
      }
      calendarMap[dayKey].push(st);

      if (st.status === "scheduled") summary.totalScheduled++;
      else if (st.status === "sent") summary.totalSent++;
      else if (st.status === "failed") summary.totalFailed++;
    });

    return res.json({
      success: true,
      month,
      calendarMap,
      summary,
      totalCount: statuses.length,
    });
  } catch (err) {
    console.error("[STATUS CONTROLLER] getMonthlyCalendarStatuses error:", err);
    return res.status(500).json({ message: err.message || "Failed to load monthly calendar." });
  }
};

/**
 * DELETE /api/chats/:sessionId/status/:statusId
 * Delete or cancel a scheduled status
 */
export const deleteStatus = async (req, res) => {
  try {
    const { sessionId, statusId } = req.params;
    const userId = req.user._id || req.user.id;

    await WaStatus.findOneAndDelete({ _id: statusId, userId, sessionId });
    statusService.reschedule();
    return res.json({ success: true, message: "Status removed successfully." });
  } catch (err) {
    console.error("[STATUS CONTROLLER] deleteStatus error:", err);
    return res.status(500).json({ message: err.message || "Failed to delete status." });
  }
};

/**
 * POST /api/chats/:sessionId/status/bulk-delete
 * Delete multiple statuses by array of IDs or by batchId
 */
export const bulkDeleteStatuses = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    const { statusIds, batchId } = req.body;

    const query = { userId, sessionId };
    if (Array.isArray(statusIds) && statusIds.length > 0) {
      query._id = { $in: statusIds };
    } else if (batchId) {
      query.batchId = batchId;
    } else {
      return res.status(400).json({ message: "Provide either statusIds array or batchId to delete." });
    }

    const result = await WaStatus.deleteMany(query);
    statusService.reschedule();

    return res.json({
      success: true,
      deletedCount: result.deletedCount,
      message: `${result.deletedCount} status(es) removed successfully.`,
    });
  } catch (err) {
    console.error("[STATUS CONTROLLER] bulkDeleteStatuses error:", err);
    return res.status(500).json({ message: err.message || "Failed to bulk delete statuses." });
  }
};

/**
 * PUT /api/chats/:sessionId/status/:statusId
 * Edit caption, text, or scheduled date/time of a queued status
 */
export const updateScheduledStatus = async (req, res) => {
  try {
    const { sessionId, statusId } = req.params;
    const userId = req.user._id || req.user.id;
    const { text, caption, backgroundColor, scheduledFor, mediaUrl, mediaType } = req.body;

    const statusDoc = await WaStatus.findOne({ _id: statusId, userId, sessionId });
    if (!statusDoc) {
      return res.status(404).json({ message: "Status not found." });
    }

    if (statusDoc.status !== "scheduled" && statusDoc.status !== "failed") {
      return res.status(400).json({ message: "Only scheduled or failed statuses can be modified." });
    }

    if (text !== undefined) statusDoc.text = text.trim();
    if (caption !== undefined) statusDoc.caption = caption.trim();
    if (backgroundColor !== undefined) statusDoc.backgroundColor = backgroundColor;
    if (mediaUrl !== undefined) statusDoc.mediaUrl = mediaUrl;
    if (mediaType !== undefined) statusDoc.mediaType = mediaType;

    if (scheduledFor) {
      const newSchedule = new Date(scheduledFor);
      if (newSchedule <= new Date()) {
        return res.status(400).json({ message: "Scheduled date must be in the future." });
      }
      statusDoc.scheduledFor = newSchedule;
      statusDoc.scheduledDateKey = `${newSchedule.getFullYear()}-${String(newSchedule.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(newSchedule.getDate()).padStart(2, "0")}`;
      statusDoc.status = "scheduled";
      statusDoc.errorMessage = "";
    }

    await statusDoc.save();
    statusService.reschedule();

    return res.json({
      success: true,
      message: "Scheduled status updated successfully.",
      data: statusDoc,
    });
  } catch (err) {
    console.error("[STATUS CONTROLLER] updateScheduledStatus error:", err);
    return res.status(500).json({ message: err.message || "Failed to update scheduled status." });
  }
};

/**
 * POST /api/chats/:sessionId/status/:statusId/retry
 * Retry dispatching a failed status immediately
 */
export const retryStatus = async (req, res) => {
  try {
    const { sessionId, statusId } = req.params;
    const userId = req.user._id || req.user.id;

    const statusDoc = await WaStatus.findOne({ _id: statusId, userId, sessionId });
    if (!statusDoc) {
      return res.status(404).json({ message: "Status not found." });
    }

    statusDoc.status = "sending";
    statusDoc.retryCount = (statusDoc.retryCount || 0) + 1;
    statusDoc.errorMessage = "";
    await statusDoc.save();

    try {
      const result = await statusService.broadcastStatus({
        userId,
        sessionId,
        type: statusDoc.type,
        text: statusDoc.caption || statusDoc.text,
        backgroundColor: statusDoc.backgroundColor,
        mediaType: statusDoc.mediaType,
        mediaUrl: statusDoc.mediaUrl,
      });

      statusDoc.status = "sent";
      statusDoc.postedAt = new Date();
      statusDoc.waMessageId = result.waMessageId || "";
      statusDoc.recipientsCount = result.recipientsCount || 0;
      statusDoc.debugInfo = {
        durationMs: result.durationMs,
        sampleRecipients: result.sampleRecipients,
      };
      await statusDoc.save();

      return res.json({
        success: true,
        message: "Status retried and posted successfully!",
        data: statusDoc,
      });
    } catch (broadcastErr) {
      statusDoc.status = "failed";
      statusDoc.errorMessage = broadcastErr.message || "Retry failed.";
      await statusDoc.save();
      return res.status(500).json({
        success: false,
        message: broadcastErr.message || "Retry broadcast failed.",
        data: statusDoc,
      });
    }
  } catch (err) {
    console.error("[STATUS CONTROLLER] retryStatus error:", err);
    return res.status(500).json({ message: err.message || "Failed to retry status." });
  }
};

/**
 * POST /api/chats/:sessionId/status/bulk-schedule
 * Schedule up to a full month of status updates with automatic daily distribution
 */
export const postBulkSchedule = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;

    let {
      campaignTitle = "Monthly Daily Status Campaign",
      batchId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      scheduleRules,
      items = [],
    } = req.body;

    if (typeof scheduleRules === "string") {
      try {
        scheduleRules = JSON.parse(scheduleRules);
      } catch (e) {
        scheduleRules = null;
      }
    }

    if (typeof items === "string") {
      try {
        items = JSON.parse(items);
      } catch (e) {
        items = [];
      }
    }

    // Process uploaded files if multipart files array passed
    if (Array.isArray(req.files) && req.files.length > 0) {
      items = req.files.map((file, idx) => {
        const itemCaption = Array.isArray(req.body.captions)
          ? req.body.captions[idx]
          : req.body[`caption_${idx}`] || "";
        return {
          type: "media",
          mediaUrl: `/uploads/${file.filename}`,
          mediaType: file.mimetype,
          mediaFileName: file.originalname,
          mediaFileSize: file.size,
          caption: itemCaption || "",
          text: itemCaption || "",
          orderIndex: idx,
        };
      });
    }

    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ message: "No status items provided to schedule." });
    }

    // Auto-distribution across days
    const startDate = scheduleRules?.startDate ? new Date(scheduleRules.startDate) : new Date();
    const postTimes = Array.isArray(scheduleRules?.postTimes) && scheduleRules.postTimes.length > 0
      ? scheduleRules.postTimes
      : ["09:30"];
    const activeDays = Array.isArray(scheduleRules?.daysOfWeek) && scheduleRules.daysOfWeek.length > 0
      ? scheduleRules.daysOfWeek
      : [0, 1, 2, 3, 4, 5, 6];

    let curDate = new Date(startDate);
    if (curDate < new Date()) {
      curDate = new Date();
    }

    let timeSlotIndex = 0;
    const docsToCreate = [];

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let targetTime;

      if (item.scheduledFor && new Date(item.scheduledFor) > new Date()) {
        targetTime = new Date(item.scheduledFor);
      } else {
        while (!activeDays.includes(curDate.getDay())) {
          curDate.setDate(curDate.getDate() + 1);
        }

        const slot = postTimes[timeSlotIndex % postTimes.length];
        const [hours, minutes] = slot.split(":").map(Number);

        targetTime = new Date(curDate);
        targetTime.setHours(hours || 9, minutes || 30, 0, 0);

        if (targetTime <= new Date()) {
          curDate.setDate(curDate.getDate() + 1);
          while (!activeDays.includes(curDate.getDay())) {
            curDate.setDate(curDate.getDate() + 1);
          }
          targetTime = new Date(curDate);
          targetTime.setHours(hours || 9, minutes || 30, 0, 0);
        }

        timeSlotIndex++;
        if (timeSlotIndex % postTimes.length === 0) {
          curDate.setDate(curDate.getDate() + 1);
        }
      }

      const dateKey = `${targetTime.getFullYear()}-${String(targetTime.getMonth() + 1).padStart(2, "0")}-${String(
        targetTime.getDate()
      ).padStart(2, "0")}`;

      docsToCreate.push({
        userId,
        sessionId,
        batchId,
        campaignTitle,
        type: item.type || (item.mediaUrl ? "media" : "text"),
        text: (item.text || item.caption || "").trim(),
        caption: (item.caption || item.text || "").trim(),
        backgroundColor: item.backgroundColor || "#008069",
        mediaUrl: item.mediaUrl || "",
        mediaType: item.mediaType || "",
        mediaFileName: item.mediaFileName || item.mediaName || "",
        mediaFileSize: item.mediaFileSize || 0,
        status: "scheduled",
        scheduledFor: targetTime,
        scheduledDateKey: dateKey,
        orderIndex: i,
      });
    }

    const createdDocs = await WaStatus.insertMany(docsToCreate);
    statusService.reschedule();

    return res.status(201).json({
      success: true,
      count: createdDocs.length,
      batchId,
      campaignTitle,
      data: createdDocs,
      message: `Successfully scheduled ${createdDocs.length} status posts for your campaign!`,
    });
  } catch (err) {
    console.error("[STATUS CONTROLLER] postBulkSchedule error:", err);
    return res.status(500).json({ message: err.message || "Failed to schedule bulk statuses." });
  }
};

/**
 * POST /api/chats/:sessionId/status
 * Post a WhatsApp Status update immediately or schedule for later (text, image, or video).
 */
export const postStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    const { text = "", caption = "", backgroundColor = "#008069", scheduledFor, campaignTitle = "" } = req.body;
    const file = req.file;

    const sock = WhatsAppService.sockets.get(sessionId);
    if (!sock?.user?.id) {
      return res.status(400).json({ message: "WhatsApp session is not connected." });
    }

    const finalCaption = (caption || text).trim();
    const type = file ? "media" : "text";
    let mediaUrl = "";
    let mediaType = "";
    let mediaBuffer = null;

    if (file) {
      mediaType = file.mimetype;
      if (!mediaType.startsWith("image/") && !mediaType.startsWith("video/")) {
        return res.status(400).json({ message: "Only image and video files are supported for status." });
      }
      mediaUrl = `/uploads/${file.filename}`;
      mediaBuffer = readFileSync(file.path);
    } else if (!finalCaption) {
      return res.status(400).json({ message: "Provide either text or a media file for the status." });
    }

    const isScheduled = !!scheduledFor && new Date(scheduledFor) > new Date();

    if (isScheduled) {
      const scheduleDate = new Date(scheduledFor);
      const scheduledDateKey = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(scheduleDate.getDate()).padStart(2, "0")}`;

      const scheduledDoc = await WaStatus.create({
        userId,
        sessionId,
        campaignTitle,
        type,
        text: finalCaption,
        caption: finalCaption,
        backgroundColor,
        mediaUrl,
        mediaType,
        mediaFileName: file ? file.originalname : "",
        mediaFileSize: file ? file.size : 0,
        status: "scheduled",
        scheduledFor: scheduleDate,
        scheduledDateKey,
      });

      statusService.reschedule();
      return res.json({
        success: true,
        message: "Status scheduled successfully!",
        data: scheduledDoc,
      });
    }

    // Create record with initial status "sending"
    const statusDoc = await WaStatus.create({
      userId,
      sessionId,
      campaignTitle,
      type,
      text: finalCaption,
      caption: finalCaption,
      backgroundColor,
      mediaUrl,
      mediaType,
      mediaFileName: file ? file.originalname : "",
      mediaFileSize: file ? file.size : 0,
      status: "sending",
    });

    try {
      const result = await statusService.broadcastStatus({
        userId,
        sessionId,
        type,
        text: finalCaption,
        backgroundColor,
        mediaBuffer,
        mediaType,
      });

      statusDoc.status = "sent";
      statusDoc.postedAt = new Date();
      statusDoc.waMessageId = result.waMessageId || "";
      statusDoc.recipientsCount = result.recipientsCount || 0;
      statusDoc.debugInfo = {
        durationMs: result.durationMs,
        sampleRecipients: result.sampleRecipients,
      };
      await statusDoc.save();

      return res.json({
        success: true,
        message: `Status posted successfully to ${result.recipientsCount} contact(s)!`,
        data: statusDoc,
      });
    } catch (broadcastErr) {
      console.error("[STATUS CONTROLLER] Error posting status:", broadcastErr);
      statusDoc.status = "failed";
      statusDoc.errorMessage = broadcastErr.message || "Failed to dispatch status to WhatsApp.";
      statusDoc.debugInfo = { error: broadcastErr.message, failedAt: new Date() };
      await statusDoc.save();

      return res.status(500).json({
        success: false,
        message: broadcastErr.message || "Failed to post status.",
        data: statusDoc,
      });
    }
  } catch (err) {
    console.error("[STATUS CONTROLLER] Error posting status:", err);
    return res.status(500).json({ message: err.message || "Failed to post status." });
  }
};

/**
 * POST /api/chats/:sessionId/status/from-media
 * Post a status update from media library
 */
export const postStatusFromMedia = async (req, res) => {
  try {
    const { sessionId } = req.params;
    const userId = req.user._id || req.user.id;
    const { mediaUrl, mediaType, text = "", caption = "", scheduledFor, campaignTitle = "" } = req.body;

    const sock = WhatsAppService.sockets.get(sessionId);
    if (!sock?.user?.id && !sock?.authState?.creds?.me?.id) {
      return res.status(400).json({ message: "WhatsApp session is not connected." });
    }

    if (!mediaUrl || !mediaType) {
      return res.status(400).json({ message: "mediaUrl and mediaType are required." });
    }

    const finalCaption = (caption || text).trim();
    const isScheduled = !!scheduledFor && new Date(scheduledFor) > new Date();

    if (isScheduled) {
      const scheduleDate = new Date(scheduledFor);
      const scheduledDateKey = `${scheduleDate.getFullYear()}-${String(scheduleDate.getMonth() + 1).padStart(
        2,
        "0"
      )}-${String(scheduleDate.getDate()).padStart(2, "0")}`;

      const scheduledDoc = await WaStatus.create({
        userId,
        sessionId,
        campaignTitle,
        type: "media",
        text: finalCaption,
        caption: finalCaption,
        mediaUrl,
        mediaType,
        status: "scheduled",
        scheduledFor: scheduleDate,
        scheduledDateKey,
      });

      statusService.reschedule();
      return res.json({
        success: true,
        message: "Media status scheduled successfully!",
        data: scheduledDoc,
      });
    }

    const statusDoc = await WaStatus.create({
      userId,
      sessionId,
      campaignTitle,
      type: "media",
      text: finalCaption,
      caption: finalCaption,
      backgroundColor: "#008069",
      mediaUrl,
      mediaType,
      status: "sending",
    });

    try {
      const result = await statusService.broadcastStatus({
        userId,
        sessionId,
        type: "media",
        text: finalCaption,
        backgroundColor: "#008069",
        mediaType,
        mediaUrl,
      });

      statusDoc.status = "sent";
      statusDoc.postedAt = new Date();
      statusDoc.waMessageId = result.waMessageId || "";
      statusDoc.recipientsCount = result.recipientsCount || 0;
      statusDoc.debugInfo = {
        durationMs: result.durationMs,
        sampleRecipients: result.sampleRecipients,
      };
      await statusDoc.save();

      return res.json({
        success: true,
        message: `Media status posted successfully to ${result.recipientsCount} contact(s)!`,
        data: statusDoc,
      });
    } catch (broadcastErr) {
      console.error("[STATUS CONTROLLER] Broadcast media error:", broadcastErr);
      statusDoc.status = "failed";
      statusDoc.errorMessage = broadcastErr.message || "Failed to dispatch media status.";
      statusDoc.debugInfo = { error: broadcastErr.message, failedAt: new Date() };
      await statusDoc.save();

      return res.status(500).json({
        success: false,
        message: broadcastErr.message || "Failed to post status from media gallery.",
        data: statusDoc,
      });
    }
  } catch (err) {
    console.error("[STATUS CONTROLLER] Error posting status from media:", err);
    return res.status(500).json({ message: err.message || "Failed to post status." });
  }
};
