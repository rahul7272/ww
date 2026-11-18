import { WhatsAppSession, Message } from "../models/index.js";
import CampaignService from "../services/CampaignService.js";
import mongoose from "mongoose";
import { promises as fsPromises } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import NodeCache from "node-cache";
import { sendSubscriptionError } from "../utils/subscription.js";

// Idempotency cache: stores completed responses and in-progress requests for 30 minutes
const idempotencyCache = new NodeCache({
  stdTTL: 30 * 60, // 30 minutes
  checkperiod: 120,
  useClones: false,
});

export const sendMessage = async (req, res) => {
  let tempFilePath = null;
  const idempotencyKey =
    req.headers["idempotency-key"] ||
    req.headers["x-idempotency-key"] ||
    req.body?.idempotencyKey;

  try {
    const body = req.body;
    // Accept both field name styles:
    //   API-key users:   { session, to, message, contactName }
    //   Internal/legacy: { sessionId, phoneNumber, message, contactName }
    const sessionId = body.sessionId || body.session;
    const phoneNumber = body.phoneNumber || body.to;
    const { message, contactName, mediaBase64, mediaType, mediaName, ttlMs } = body;

    if (!sessionId || !phoneNumber || !message) {
      return res
        .status(400)
        .json({
          error:
            "session (or sessionId), to (or phoneNumber), and message are required",
        });
    }

    // Verify idempotency cache to protect against duplicate retry storms
    if (idempotencyKey) {
      const cached = idempotencyCache.get(idempotencyKey);
      if (cached) {
        if (cached.status === "processing") {
          return res.status(409).json({
            success: false,
            code: "IDEMPOTENT_OPERATION_IN_PROGRESS",
            error: "A request with this idempotency key is currently being processed.",
          });
        }
        if (cached.status === "completed") {
          return res.json(cached.response);
        }
      }
      idempotencyCache.set(idempotencyKey, { status: "processing", startedAt: Date.now() });
    }

    let mediaPath = null;

    // Handle base64 encoded media
    if (mediaBase64 && mediaType) {
      try {
        // Convert base64 to buffer
        const buffer = Buffer.from(mediaBase64, "base64");

        // Create temp file asynchronously without blocking the event loop
        tempFilePath = join(
          tmpdir(),
          `whatsapp-media-${Date.now()}-${mediaName || "file"}`,
        );
        await fsPromises.writeFile(tempFilePath, buffer);

        mediaPath = tempFilePath;
      } catch (err) {
        if (idempotencyKey) idempotencyCache.del(idempotencyKey);
        return res
          .status(400)
          .json({ error: `Failed to process media: ${err.message}` });
      }
    }

    const sendOptions = {};
    if (ttlMs && Number(ttlMs) > 0) {
      sendOptions.ttlMs = Number(ttlMs);
    }

    try {
      const result = await CampaignService.sendSingleMessage(
        req.user._id,
        sessionId,
        phoneNumber,
        message,
        contactName,
        mediaPath,
        mediaType,
        sendOptions,
      );

      if (idempotencyKey) {
        idempotencyCache.set(idempotencyKey, { status: "completed", response: result });
      }

      res.json(result);
    } finally {
      // Clean up temp file asynchronously
      if (tempFilePath) {
        try {
          await fsPromises.unlink(tempFilePath);
        } catch (err) {
          console.error("Failed to clean up temp file:", err.message);
        }
      }
    }
  } catch (err) {
    if (idempotencyKey) {
      idempotencyCache.del(idempotencyKey);
    }

    if (tempFilePath) {
      try {
        await fsPromises.unlink(tempFilePath);
      } catch (e) {
        console.error("Failed to clean up temp file:", e.message);
      }
    }

    if (err.status === 429 || err.code === "QUEUE_FULL") {
      return res.status(429).set("Retry-After", String(err.retryAfter || 5)).json({
        success: false,
        code: "QUEUE_FULL",
        error: err.message,
        retryAfter: err.retryAfter || 5,
      });
    }

    if (err.code === "QUEUE_TIMEOUT") {
      return res.status(504).json({
        success: false,
        code: "QUEUE_TIMEOUT",
        error: err.message,
      });
    }

    return sendSubscriptionError(res, err, "Failed to send message");
  }
};

export const getSessionMessages = async (req, res) => {
  try {
    const { id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const messages = await Message.find({ sessionId: session._id })
      .sort({ createdAt: -1 })
      .skip(parseInt(offset))
      .limit(parseInt(limit));

    const total = await Message.countDocuments({ sessionId: session._id });

    res.json({
      messages: messages.map((m) => ({
        messageId: m._id,
        phoneNumber: m.phoneNumber,
        contactName: m.contactName,
        message: m.message,
        status: m.status,
        error: m.error,
        sentAt: m.sentAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        createdAt: m.createdAt,
      })),
      total,
      limit: parseInt(limit),
      offset: parseInt(offset),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateMessageStatus = async (req, res) => {
  try {
    const messageId = req.params.messageId || req.body.messageId;
    const { status } = req.body;

    if (!messageId || !status) {
      return res
        .status(400)
        .json({ error: "messageId and status are required" });
    }

    if (!mongoose.Types.ObjectId.isValid(messageId)) {
      return res.status(400).json({ error: "Invalid messageId" });
    }

    // Validate status
    const validStatuses = ["pending", "sent", "failed", "delivered", "read"];
    if (!validStatuses.includes(status)) {
      return res
        .status(400)
        .json({
          error: `Invalid status. Must be one of: ${validStatuses.join(", ")}`,
        });
    }

    // Build update object
    const updateData = { status };
    if (status === "delivered") {
      updateData.deliveredAt = new Date();
    } else if (status === "read") {
      updateData.readAt = new Date();
    }

    // Verify the message belongs to one of the authenticated user's sessions
    const userSessionIds = await WhatsAppSession.find({
      userId: req.user._id,
    }).distinct("_id");

    const message = await Message.findOneAndUpdate(
      { _id: messageId, sessionId: { $in: userSessionIds } },
      updateData,
      { new: true },
    );

    if (!message) {
      return res.status(404).json({ error: "Message not found" });
    }

    res.json({
      success: true,
      message: {
        messageId: message._id,
        phoneNumber: message.phoneNumber,
        status: message.status,
        deliveredAt: message.deliveredAt,
        readAt: message.readAt,
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export default { sendMessage, getSessionMessages, updateMessageStatus };
