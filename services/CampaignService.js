import WhatsAppService from "./WhatsAppService.js";
import { WhatsAppSession, Message, Campaign, WaChat, WaChatMessage, TemplateLog } from "../models/index.js";
import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import TemplateMessageService from "./TemplateMessageService.js";
import mongoose from "mongoose";
import SubscriptionService from "./SubscriptionService.js";


class CampaignService {
  constructor() {
    this.activeCampaigns = new Map();
    this.io = null;
    this.MAX_CONCURRENT_CAMPAIGNS = parseInt(process.env.MAX_CONCURRENT_CAMPAIGNS, 10) || 5;
  }

  async findUserSession(userId, sessionRef) {
    const baseQuery = { userId: new mongoose.Types.ObjectId(userId) };

    if (typeof sessionRef === "string" && sessionRef.startsWith("wa_")) {
      return WhatsAppSession.findOne({ ...baseQuery, sessionId: sessionRef });
    }

    if (mongoose.Types.ObjectId.isValid(sessionRef)) {
      return WhatsAppSession.findOne({
        ...baseQuery,
        _id: new mongoose.Types.ObjectId(sessionRef),
      });
    }

    // Fallback for unexpected but valid-looking values
    return WhatsAppSession.findOne({ ...baseQuery, sessionId: sessionRef });
  }

  setSocketIO(io) {
    this.io = io;
  }

  emit(event, data, userId = null) {
    if (!this.io) return;
    if (userId) {
      this.io.to(`user:${userId.toString()}`).emit(event, data);
    }
  }

  async createCampaign(
    userId,
    sessionId,
    name,
    message,
    numbers,
    delaySeconds = 10,
  ) {
    const session = await this.findUserSession(userId, sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "connected") {
      throw new Error("Session is not connected");
    }

    const maxCampaignSize = parseInt(process.env.MAX_CAMPAIGN_SIZE, 10) || 1000;
    const normalizedNumbers = this.normalizeNumbers(numbers);
    if (normalizedNumbers.length > maxCampaignSize) {
      throw new Error(`Campaign exceeds maximum allowed recipients (${normalizedNumbers.length}/${maxCampaignSize})`);
    }

    const minAllowedSec = Math.max(1, Math.floor(parseInt(process.env.MIN_MESSAGE_DELAY || "1000", 10) / 1000));
    const safeDelaySeconds = Math.max(Number(delaySeconds) || 10, minAllowedSec);

    const campaign = new Campaign({
      userId: new mongoose.Types.ObjectId(userId),
      sessionId: session._id,
      name,
      message,
      numbers: normalizedNumbers,
      status: "draft",
      delaySeconds: safeDelaySeconds,
      sentCount: 0,
      failedCount: 0,
      currentIndex: 0,
    });

    await campaign.save();

    return {
      campaignId: campaign._id,
      name: campaign.name,
      totalNumbers: campaign.numbers.length,
      status: campaign.status,
    };
  }

  normalizeNumbers(numbers) {
    return numbers
      .map((num) => {
        let clean = num.replace(/\D/g, "");
        if (clean.length === 10) {
          clean = "91" + clean;
        }
        return clean;
      })
      .filter((num) => num.length >= 12);
  }

  async startCampaign(campaignId, userId) {
    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(campaignId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "draft" && campaign.status !== "cancelled" && campaign.status !== "scheduled") {
      throw new Error("Campaign cannot be started");
    }

    // Bulkhead pattern: limit simultaneous active campaigns to prevent MongoDB pool starvation
    if (this.activeCampaigns.size >= this.MAX_CONCURRENT_CAMPAIGNS) {
      campaign.status = "scheduled";
      campaign.scheduledFor = new Date(Date.now() + 60 * 1000);
      await campaign.save();
      return {
        campaignId: campaign._id,
        status: "scheduled",
        queued: true,
        message: `System active campaign capacity reached (${this.activeCampaigns.size}/${this.MAX_CONCURRENT_CAMPAIGNS} active). Campaign queued to run automatically when a slot opens.`,
      };
    }

    campaign.status = "running";
    campaign.currentIndex = 0;
    await campaign.save();

    this.activeCampaigns.set(campaignId.toString(), {
      running: true,
      cancelled: false,
    });

    this.emit(
      "campaign:started",
      {
        campaignId: campaign._id,
        name: campaign.name,
      },
      userId,
    );

    this.processCampaign(campaign);

    return {
      campaignId: campaign._id,
      status: campaign.status,
      totalNumbers: campaign.numbers.length,
    };
  }

  async processCampaign(campaign) {
    const campaignId = campaign._id.toString();
    const userId = campaign.userId;
    const session = await WhatsAppSession.findById(campaign.sessionId);

    if (!session) {
      await this.failCampaign(campaign, "Session not found");
      return;
    }

    const sessionId = session.sessionId;
    const numbers = campaign.numbers;
    const message = campaign.message;
    const delayMs = campaign.delaySeconds * 1000;
    let sentCount = campaign.sentCount || 0;
    let failedCount = campaign.failedCount || 0;

    let templateDoc = null;
    if (campaign.templateId) {
      try {
        templateDoc = await WhatsAppTemplate.findById(campaign.templateId);
      } catch (err) {
        console.warn(`[CampaignService] Could not preload template ${campaign.templateId}:`, err.message);
      }
    }

    for (let i = campaign.currentIndex; i < numbers.length; i++) {
      const control = this.activeCampaigns.get(campaignId);

      if (!control || !control.running) {
        if (control && control.cancelled) {
          await Campaign.updateOne(
            { _id: campaign._id },
            { status: "cancelled" },
          );
          this.emit("campaign:cancelled", { campaignId: campaign._id }, userId);
        }
        return;
      }

      await Campaign.updateOne({ _id: campaign._id }, { currentIndex: i });

      const phoneNumber = numbers[i];
      const msgDoc = new Message({
        sessionId: campaign.sessionId,
        campaignId: campaign._id,
        phoneNumber,
        message,
        status: "pending",
      });
      await msgDoc.save();

      this.emit(
        "message:processing",
        {
          campaignId: campaign._id,
          index: i,
          total: numbers.length,
          phoneNumber,
        },
        userId,
      );

      try {
        await SubscriptionService.assertMessageQuota(
          { _id: campaign.userId },
          1,
        );

        let sendResult = null;
        if (templateDoc) {
          sendResult = await TemplateMessageService.dispatch(
            sessionId,
            phoneNumber,
            templateDoc,
            campaign.templateVariables || {}
          );

          // Log template campaign dispatch
          try {
            await TemplateLog.create({
              userId: campaign.userId,
              templateId: templateDoc._id,
              templateName: templateDoc.name,
              displayName: templateDoc.displayName,
              category: templateDoc.category,
              action: "DISPATCH",
              sessionId,
              phoneNumber,
              status: sendResult?.success ? "DISPATCHED" : "FAILED",
              messageId: sendResult?.messageId || sendResult?.key?.id || "",
              variables: campaign.templateVariables || {},
            });
          } catch (_) {}
        } else {
          sendResult = await WhatsAppService.sendMessage(
            sessionId,
            phoneNumber,
            message,
          );
        }

        await SubscriptionService.consumeMessageQuota(campaign.userId, 1);

        const resolvedMsgId = sendResult?.messageId || sendResult?.key?.id;

        await Message.updateOne(
          { _id: msgDoc._id },
          {
            status: "sent",
            sentAt: new Date(),
            ...(resolvedMsgId ? { messageId: resolvedMsgId } : {}),
          },
        );

        await Campaign.updateOne(
          { _id: campaign._id },
          { $inc: { sentCount: 1 } },
        );
        sentCount += 1;

        this.emit(
          "message:sent",
          {
            campaignId: campaign._id,
            phoneNumber,
            index: i,
            total: numbers.length,
          },
          userId,
        );
      } catch (err) {
        await Message.updateOne(
          { _id: msgDoc._id },
          { status: "failed", error: err.message },
        );

        await Campaign.updateOne(
          { _id: campaign._id },
          { $inc: { failedCount: 1 } },
        );
        failedCount += 1;

        this.emit(
          "message:failed",
          {
            campaignId: campaign._id,
            phoneNumber,
            error: err.message,
            index: i,
            total: numbers.length,
          },
          userId,
        );
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    await Campaign.updateOne({ _id: campaign._id }, { status: "completed" });
    this.activeCampaigns.delete(campaignId);
    this.triggerNextQueuedCampaign();

    this.emit(
      "campaign:completed",
      {
        campaignId: campaign._id,
        sentCount,
        failedCount,
      },
      userId,
    );
  }

  async cancelCampaign(campaignId, userId) {
    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(campaignId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      throw new Error("Campaign not found");
    }

    if (campaign.status !== "running") {
      throw new Error("Campaign is not running");
    }

    const control = this.activeCampaigns.get(campaignId.toString());
    if (control) {
      control.running = false;
      control.cancelled = true;
    }

    campaign.status = "cancelled";
    await campaign.save();

    this.activeCampaigns.delete(campaignId.toString());
    this.triggerNextQueuedCampaign();

    this.emit("campaign:cancelled", { campaignId: campaign._id }, userId);

    return {
      campaignId: campaign._id,
      status: campaign.status,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
    };
  }

  async failCampaign(campaign, error) {
    campaign.status = "failed";
    await campaign.save();

    this.activeCampaigns.delete(campaign._id.toString());
    this.triggerNextQueuedCampaign();

    this.emit(
      "campaign:failed",
      {
        campaignId: campaign._id,
        error,
      },
      campaign.userId,
    );
  }

  /**
   * Bulkhead consumer: automatically launches next queued campaign when capacity frees up
   */
  async triggerNextQueuedCampaign() {
    try {
      if (this.activeCampaigns.size >= this.MAX_CONCURRENT_CAMPAIGNS) return;

      const nextCampaign = await Campaign.findOne({
        status: "scheduled",
        scheduledFor: { $lte: new Date() },
      }).sort({ scheduledFor: 1, createdAt: 1 });

      if (nextCampaign) {
        console.log(
          `[CAMPAIGN BULKHEAD] Capacity available (${this.activeCampaigns.size}/${this.MAX_CONCURRENT_CAMPAIGNS}). Launching queued campaign ${nextCampaign._id}`
        );
        await this.startCampaign(nextCampaign._id, nextCampaign.userId);
      }
    } catch (err) {
      console.warn("[CAMPAIGN BULKHEAD] triggerNextQueuedCampaign notice:", err.message);
    }
  }

  /**
   * Post-boot recovery hook (Phase 2 - Task 2.1).
   * Delegates to recoverOrphanedCampaigns to restore running state or safely pause.
   */
  async resumeOrphanedCampaigns(io = null) {
    const { recoverOrphanedCampaigns } = await import("../controllers/campaignController.js");
    return recoverOrphanedCampaigns(io || this.io);
  }

  async getCampaign(campaignId, userId) {
    const campaign = await Campaign.findOne({
      _id: new mongoose.Types.ObjectId(campaignId),
      userId: new mongoose.Types.ObjectId(userId),
    });

    if (!campaign) {
      return null;
    }

    return {
      campaignId: campaign._id,
      name: campaign.name,
      sessionId: campaign.sessionId,
      status: campaign.status,
      totalNumbers: campaign.numbers.length,
      sentCount: campaign.sentCount,
      failedCount: campaign.failedCount,
      currentIndex: campaign.currentIndex,
      delaySeconds: campaign.delaySeconds,
      createdAt: campaign.createdAt,
    };
  }

  async listCampaigns(userId) {
    const campaigns = await Campaign.find({
      userId: new mongoose.Types.ObjectId(userId),
    }).sort({ createdAt: -1 });

    return campaigns.map((c) => ({
      campaignId: c._id,
      name: c.name,
      status: c.status,
      totalNumbers: c.numbers.length,
      sentCount: c.sentCount,
      failedCount: c.failedCount,
      createdAt: c.createdAt,
    }));
  }

  async sendSingleMessage(
    userId,
    sessionId,
    phoneNumber,
    message,
    contactName = "",
    mediaPath = null,
    mediaType = null,
    quotedOptions = null,
  ) {
    const session = await this.findUserSession(userId, sessionId);

    if (!session) {
      throw new Error("Session not found");
    }

    if (session.status !== "connected") {
      throw new Error("Session is not connected");
    }

    // If a full JID is passed (contains @), use it as-is; otherwise normalise digits
    let jid;
    if (String(phoneNumber).includes("@")) {
      jid = phoneNumber;
    } else {
      jid = String(phoneNumber).replace(/\D/g, "");
      if (jid.length === 10) jid = "91" + jid;
    }

    const isImage = mediaType?.startsWith("image");
    const isVideo = mediaType?.startsWith("video");
    const defaultMediaText = isImage ? "📷 Photo" : isVideo ? "🎥 Video" : "📎 Attachment";

    const msgDoc = new Message({
      sessionId: session._id,
      phoneNumber: jid,
      contactName,
      message: message || (mediaPath ? defaultMediaText : ""),
      mediaUrl: mediaPath || null,
      mediaType: mediaType || null,
      messageType: "single",
      status: "pending",
    });

    try {
      await SubscriptionService.assertMessageQuota({ _id: userId }, 1);

      // Send message with optional media and quoted options
      const sendResult = await WhatsAppService.sendMessage(
        session.sessionId,
        jid,
        message || "",
        mediaPath,
        mediaType,
        quotedOptions || {},
      );

      await SubscriptionService.consumeMessageQuota(userId, 1);

      const actualMessageId = sendResult?.key?.id || `msg_${msgDoc._id}`;
      msgDoc.messageId = actualMessageId;
      msgDoc.status = "sent";
      msgDoc.sentAt = new Date();
      await msgDoc.save();

      // Sync outgoing message to WaChatMessage and WaChat table for live inbox
      // (Skipped when called from chatController.sendChatMessage, which persists rich metadata once)
      let savedWaMsg = null;
      if (!quotedOptions?.skipWaChatSync) {
        let chatJid = String(jid).includes("@") ? jid : `${jid}@s.whatsapp.net`;
        if (!chatJid.endsWith("@g.us")) {
          chatJid = chatJid.replace(/:\d+@/, "@").replace(/@c\.us$/, "@s.whatsapp.net");
        }
        const isGroup = chatJid.endsWith("@g.us");

        let relativeMediaUrl = mediaPath;
        if (relativeMediaUrl && typeof relativeMediaUrl === "string") {
          const normalizedSlash = relativeMediaUrl.replace(/\\/g, "/");
          const uploadsIdx = normalizedSlash.lastIndexOf("/uploads/");
          if (uploadsIdx !== -1) {
            relativeMediaUrl = normalizedSlash.slice(uploadsIdx);
          } else if (normalizedSlash.startsWith("uploads/")) {
            relativeMediaUrl = `/${normalizedSlash}`;
          }
        }

        try {
          savedWaMsg = await WaChatMessage.findOneAndUpdate(
            { sessionId: session.sessionId, messageId: actualMessageId },
            {
              $set: {
                userId,
                sessionId: session.sessionId,
                chatJid,
                messageId: actualMessageId,
                text: message || (mediaPath ? defaultMediaText : ""),
                direction: "out",
                mediaType: mediaType
                  ? mediaType.startsWith("image")
                    ? "image"
                    : mediaType.startsWith("video")
                      ? "video"
                      : "document"
                  : null,
                mediaUrl: relativeMediaUrl || null,
                ...(quotedOptions?.quotedMessageDoc ? { quotedMessage: quotedOptions.quotedMessageDoc } : {}),
              },
              $setOnInsert: {
                status: "sent",
                timestamp: msgDoc.sentAt || new Date(),
              }
            },
            { upsert: true, new: true }
          );

          await WaChat.findOneAndUpdate(
            { userId, sessionId: session.sessionId, chatJid },
            {
              $set: {
                lastMessage: message || (mediaType ? `[${mediaType}]` : ""),
                lastMessageTime: msgDoc.sentAt || new Date(),
                isGroup,
              },
              $setOnInsert: {
                phoneNumber: chatJid.replace(/@.*/, ""),
                name: contactName || (isGroup ? "WhatsApp Group" : ""),
                contactName: contactName || "",
                unreadCount: 0,
              },
            },
            { upsert: true }
          );

          // Realtime Socket.IO emission to web inbox
          const ioInstance = this.io || WhatsAppService.io;
          if (ioInstance) {
            const socketPayload = {
              sessionId: session.sessionId,
              chatJid,
              from: chatJid.replace(/@.*/, ""),
              message: savedWaMsg,
            };
            const targetRoom = userId
              ? ioInstance.to(session.sessionId).to(`user:${userId.toString()}`)
              : ioInstance.to(session.sessionId);
            targetRoom.emit("chat:message", socketPayload);
          }
        } catch (waSyncErr) {
          console.error("[CAMPAIGN WA SYNC] Warning:", waSyncErr.message);
        }
      }

      return {
        success: true,
        messageId: actualMessageId,
        key: sendResult?.key || { id: actualMessageId },
        to: jid,
        status: "sent",
        timestamp: msgDoc.sentAt.toISOString(),
        savedWaMsg,
      };
    } catch (err) {
      msgDoc.status = "failed";
      msgDoc.error = err.message;
      await msgDoc.save();

      throw err;
    }

  }
}

export default new CampaignService();
