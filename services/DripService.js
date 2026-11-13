import { DripCampaign, DripRecipient, WhatsAppSession } from "../models/index.js";
import WhatsAppService from "./WhatsAppService.js";
import CampaignService from "./CampaignService.js";
import { NextDueScheduler } from "../utils/nextDueScheduler.js";
import { join } from "path";

/**
 * Resolves Spintax format: {Hi|Hello|Hey} -> Random choice
 */
function resolveSpintax(text = "") {
  if (!text || typeof text !== "string") return "";
  const spintaxRegex = /\{([^{}]+)\}/g;
  let result = text;
  while (spintaxRegex.test(result)) {
    result = result.replace(spintaxRegex, (match, choices) => {
      const options = choices.split("|");
      return options[Math.floor(Math.random() * options.length)];
    });
  }
  return result;
}

/**
 * Replaces dynamic placeholders like {{name}}, {{phone}}, {{custom}}
 */
function renderTemplate(text = "", recipient = {}) {
  let rendered = resolveSpintax(text);
  const name = recipient.contactName || "Friend";
  const phone = recipient.phone || "";

  rendered = rendered.replace(/\{\{\s*name\s*\}\}/gi, name);
  rendered = rendered.replace(/\{\{\s*phone\s*\}\}/gi, phone);
  rendered = rendered.replace(/\{\{\s*step\s*\}\}/gi, String(recipient.currentStep || 1));

  if (recipient.customVariables) {
    recipient.customVariables.forEach((val, key) => {
      rendered = rendered.replace(new RegExp(`\\{\\{\\s*${key}\\s*\\}\\}`, "gi"), val || "");
    });
  }

  return rendered;
}

/**
 * Calculates next date given delay value and unit
 */
function calculateNextDate(delayValue = 1, delayUnit = "days", fromDate = new Date()) {
  const next = new Date(fromDate);
  const val = Number(delayValue) || 1;

  switch (delayUnit) {
    case "minutes":
      next.setMinutes(next.getMinutes() + val);
      break;
    case "hours":
      next.setHours(next.getHours() + val);
      break;
    case "days":
    default:
      next.setDate(next.getDate() + val);
      break;
  }
  return next;
}

function formatDelayText(delayValue = 0, delayUnit = "minutes") {
  if (Number(delayValue) === 0) return "Instant (On Enroll)";
  return `+${delayValue} ${delayUnit}`;
}

class DripService {
  constructor() {
    this.isProcessing = false;
    this.io = null;
    this.scheduler = new NextDueScheduler({
      name: "DRIP SERVICE",
      getNextRunAt: () => this.getNextRunAt(),
      processDue: () => this.processDueSteps(),
    });
  }

  setSocketIO(io) {
    this.io = io;
  }

  start() {
    this.scheduler.start();
  }

  stop() {
    this.scheduler.stop();
  }

  reschedule() {
    return this.scheduler.reschedule();
  }

  async getNextRunAt() {
    const activeCampaignIds = await DripCampaign.find({ status: "active" })
      .distinct("_id")
      .catch(() => []);
    if (!activeCampaignIds || activeCampaignIds.length === 0) {
      return null;
    }

    const nextRecipient = await DripRecipient.findOne({
      status: "active",
      dripCampaignId: { $in: activeCampaignIds },
      nextExecutionTime: { $ne: null },
    })
      .sort({ nextExecutionTime: 1 })
      .select("nextExecutionTime")
      .lean()
      .catch(() => null);

    return nextRecipient?.nextExecutionTime || null;
  }

  /**
   * Enrolls an array of contacts into a Drip Sequence
   */
  async enrollContacts(dripCampaignId, contacts = [], userId) {
    const campaign = await DripCampaign.findOne({ _id: dripCampaignId, userId });
    if (!campaign) throw new Error("Drip campaign not found");

    if (!campaign.steps || campaign.steps.length === 0) {
      throw new Error("Cannot enroll contacts into a sequence with 0 steps");
    }

    const firstStep = campaign.steps[0];
    const initialDelayValue = firstStep.delayValue || 0;
    const initialDelayUnit = firstStep.delayUnit || "minutes";

    const initialExecutionTime =
      initialDelayValue === 0
        ? new Date()
        : calculateNextDate(initialDelayValue, initialDelayUnit, new Date());

    const initialDelayText = formatDelayText(initialDelayValue, initialDelayUnit);

    let enrolledCount = 0;
    const enrolledRecipients = [];

    for (const c of contacts) {
      const rawPhone = String(c.phone || c.number || "").trim();
      const digits = rawPhone.replace(/\D/g, "");
      if (!digits || digits.length < 6) continue;

      const chatJid = `${digits}@s.whatsapp.net`;
      const contactName = String(c.name || c.contactName || "").trim();

      const existing = await DripRecipient.findOne({
        dripCampaignId: campaign._id,
        chatJid,
        status: "active",
      });

      if (existing) continue;

      // Pre-calculate rendered message preview for step 1
      const previewText = renderTemplate(firstStep.message, {
        contactName,
        phone: digits,
        currentStep: 0,
        customVariables: c.customVariables || {},
      });

      const recipient = new DripRecipient({
        dripCampaignId: campaign._id,
        userId: campaign.userId,
        sessionId: campaign.sessionId,
        phone: digits,
        contactName,
        chatJid,
        currentStep: 0,
        nextStepIndex: 1,
        nextStepPreview: previewText,
        nextStepDelayText: initialDelayText,
        status: "active",
        enrolledAt: new Date(),
        nextExecutionTime: initialExecutionTime,
        customVariables: c.customVariables || {},
        logs: [],
      });

      await recipient.save();
      enrolledRecipients.push(recipient);
      enrolledCount++;
    }

    await DripCampaign.findByIdAndUpdate(campaign._id, {
      $inc: {
        "stats.totalEnrolled": enrolledCount,
        "stats.activeCount": enrolledCount,
      },
    });

    console.log(`[DRIP ENROLL] Enrolled ${enrolledCount} contacts into campaign "${campaign.name}"`);
    this.reschedule();
    return { enrolledCount, recipients: enrolledRecipients };
  }

  /**
   * Main scheduler tick: processes all due steps
   */
  async processDueSteps() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      const activeCampaignIds = await DripCampaign.find({ status: "active" }).distinct("_id");
      if (!activeCampaignIds || activeCampaignIds.length === 0) {
        return;
      }

      const now = new Date();
      const dueRecipients = await DripRecipient.find({
        status: "active",
        dripCampaignId: { $in: activeCampaignIds },
        nextExecutionTime: { $lte: now },
      })
        .populate("dripCampaignId")
        .sort({ nextExecutionTime: 1 })
        .limit(25);

      if (!dueRecipients || dueRecipients.length === 0) {
        return;
      }

      for (const recipient of dueRecipients) {
        const campaign = recipient.dripCampaignId;

        if (!campaign || campaign.status !== "active") {
          continue;
        }

        // Check Business Hours send window if enabled
        if (campaign.settings?.sendWindow?.enabled) {
          const currentHour = now.getHours();
          const startH = campaign.settings.sendWindow.startHour ?? 9;
          const endH = campaign.settings.sendWindow.endHour ?? 20;

          if (currentHour < startH || currentHour >= endH) {
            const deferredTime = new Date(now);
            if (currentHour >= endH) {
              deferredTime.setDate(deferredTime.getDate() + 1);
            }
            deferredTime.setHours(startH, 0, 0, 0);
            recipient.nextExecutionTime = deferredTime;
            await recipient.save();
            continue;
          }
        }

        const nextStepIndex = (recipient.currentStep || 0) + 1;
        const step = campaign.steps?.find((s) => s.stepIndex === nextStepIndex);

        if (!step) {
          recipient.status = "completed";
          recipient.nextExecutionTime = null;
          recipient.nextStepPreview = "";
          recipient.nextStepIndex = null;
          await recipient.save();

          await DripCampaign.findByIdAndUpdate(campaign._id, {
            $inc: { "stats.activeCount": -1, "stats.completedCount": 1 },
          });
          continue;
        }

        const renderedMessage = renderTemplate(step.message, recipient);

        let fullMediaPath = step.mediaUrl;
        if (fullMediaPath && fullMediaPath.startsWith("/uploads/")) {
          fullMediaPath = join(process.cwd(), fullMediaPath);
        }

        try {
          console.log(
            `[DRIP SEND] Sending Step ${step.stepIndex} to ${recipient.chatJid} (Campaign: ${campaign.name})`
          );

          const sendResult = await CampaignService.sendSingleMessage(
            recipient.userId,
            recipient.sessionId,
            recipient.chatJid,
            renderedMessage,
            recipient.contactName || "",
            fullMediaPath || null,
            step.mediaType || null
          );

          if (sendResult?.success) {
            recipient.currentStep = step.stepIndex;
            recipient.lastSentAt = new Date();

            recipient.logs.push({
              stepIndex: step.stepIndex,
              stepName: `Step ${step.stepIndex}`,
              sentAt: new Date(),
              executedAt: new Date(),
              status: "sent",
              messagePreview: renderedMessage,
              mediaUrl: step.mediaUrl || null,
              mediaType: step.mediaType || null,
              deliveryStatus: "sent",
            });

            // Calculate next upcoming step preview
            const futureStep = campaign.steps.find((s) => s.stepIndex === step.stepIndex + 1);
            if (futureStep) {
              recipient.nextStepIndex = futureStep.stepIndex;
              recipient.nextExecutionTime = calculateNextDate(
                futureStep.delayValue,
                futureStep.delayUnit,
                new Date()
              );
              recipient.nextStepDelayText = formatDelayText(futureStep.delayValue, futureStep.delayUnit);
              recipient.nextStepPreview = renderTemplate(futureStep.message, {
                ...recipient.toObject(),
                currentStep: step.stepIndex,
              });
            } else {
              recipient.status = "completed";
              recipient.nextExecutionTime = null;
              recipient.nextStepPreview = "";
              recipient.nextStepIndex = null;
              await DripCampaign.findByIdAndUpdate(campaign._id, {
                $inc: { "stats.activeCount": -1, "stats.completedCount": 1 },
              });
            }

            await recipient.save();
          } else {
            throw new Error(sendResult?.error || "Send returned false");
          }
        } catch (sendErr) {
          console.error(
            `[DRIP SEND ERROR] Failed step ${step.stepIndex} for ${recipient.chatJid}:`,
            sendErr.message
          );

          recipient.logs.push({
            stepIndex: step.stepIndex,
            sentAt: new Date(),
            executedAt: new Date(),
            status: "failed",
            error: sendErr.message,
          });

          recipient.nextExecutionTime = new Date(Date.now() + 10 * 60 * 1000);
          await recipient.save();
        }
      }
    } catch (err) {
      console.error("[DRIP SERVICE ERROR]", err.message);
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Manually dispatches the next step for a recipient immediately (bypassing timer)
   */
  async triggerRecipientNow(recipientId, userId) {
    const recipient = await DripRecipient.findOne({ _id: recipientId, userId }).populate("dripCampaignId");
    if (!recipient) throw new Error("Recipient not found");

    const campaign = recipient.dripCampaignId;
    if (!campaign) throw new Error("Campaign not found");

    const nextStepIndex = (recipient.currentStep || 0) + 1;
    const step = campaign.steps?.find((s) => s.stepIndex === nextStepIndex);

    if (!step) {
      recipient.status = "completed";
      recipient.nextExecutionTime = null;
      recipient.nextStepPreview = "";
      await recipient.save();
      return { success: true, message: "Sequence already completed for this contact" };
    }

    const renderedMessage = renderTemplate(step.message, recipient);
    let fullMediaPath = step.mediaUrl;
    if (fullMediaPath && fullMediaPath.startsWith("/uploads/")) {
      fullMediaPath = join(process.cwd(), fullMediaPath);
    }

    const sendResult = await CampaignService.sendSingleMessage(
      recipient.userId,
      recipient.sessionId,
      recipient.chatJid,
      renderedMessage,
      recipient.contactName || "",
      fullMediaPath || null,
      step.mediaType || null
    );

    if (!sendResult?.success) {
      throw new Error(sendResult?.error || "Send failed");
    }

    recipient.currentStep = step.stepIndex;
    recipient.lastSentAt = new Date();
    recipient.status = "active";

    recipient.logs.push({
      stepIndex: step.stepIndex,
      stepName: `Step ${step.stepIndex} (Manual)`,
      sentAt: new Date(),
      executedAt: new Date(),
      status: "sent",
      messagePreview: renderedMessage,
      mediaUrl: step.mediaUrl || null,
      mediaType: step.mediaType || null,
      deliveryStatus: "sent",
    });

    const futureStep = campaign.steps.find((s) => s.stepIndex === step.stepIndex + 1);
    if (futureStep) {
      recipient.nextStepIndex = futureStep.stepIndex;
      recipient.nextExecutionTime = calculateNextDate(
        futureStep.delayValue,
        futureStep.delayUnit,
        new Date()
      );
      recipient.nextStepDelayText = formatDelayText(futureStep.delayValue, futureStep.delayUnit);
      recipient.nextStepPreview = renderTemplate(futureStep.message, {
        ...recipient.toObject(),
        currentStep: step.stepIndex,
      });
    } else {
      recipient.status = "completed";
      recipient.nextExecutionTime = null;
      recipient.nextStepPreview = "";
      recipient.nextStepIndex = null;
      await DripCampaign.findByIdAndUpdate(campaign._id, {
        $inc: { "stats.activeCount": -1, "stats.completedCount": 1 },
      });
    }

    await recipient.save();
    this.reschedule();
    return { success: true, recipient };
  }

  /**
   * Skip current upcoming step and advance schedule to step after
   */
  async skipRecipientStep(recipientId, userId) {
    const recipient = await DripRecipient.findOne({ _id: recipientId, userId }).populate("dripCampaignId");
    if (!recipient) throw new Error("Recipient not found");

    const campaign = recipient.dripCampaignId;
    if (!campaign) throw new Error("Campaign not found");

    const skippedStepIndex = (recipient.currentStep || 0) + 1;
    recipient.currentStep = skippedStepIndex;

    recipient.logs.push({
      stepIndex: skippedStepIndex,
      stepName: `Step ${skippedStepIndex} (Skipped)`,
      sentAt: new Date(),
      executedAt: new Date(),
      status: "sent",
      messagePreview: "[Skipped by user]",
      deliveryStatus: "skipped",
    });

    const futureStep = campaign.steps.find((s) => s.stepIndex === skippedStepIndex + 1);
    if (futureStep) {
      recipient.nextStepIndex = futureStep.stepIndex;
      recipient.nextExecutionTime = calculateNextDate(
        futureStep.delayValue,
        futureStep.delayUnit,
        new Date()
      );
      recipient.nextStepDelayText = formatDelayText(futureStep.delayValue, futureStep.delayUnit);
      recipient.nextStepPreview = renderTemplate(futureStep.message, {
        ...recipient.toObject(),
        currentStep: skippedStepIndex,
      });
    } else {
      recipient.status = "completed";
      recipient.nextExecutionTime = null;
      recipient.nextStepPreview = "";
      recipient.nextStepIndex = null;
      await DripCampaign.findByIdAndUpdate(campaign._id, {
        $inc: { "stats.activeCount": -1, "stats.completedCount": 1 },
      });
    }

    await recipient.save();
    this.reschedule();
    return { success: true, recipient };
  }

  /**
   * Resumes a paused recipient
   */
  async resumeRecipient(recipientId, userId) {
    const recipient = await DripRecipient.findOne({ _id: recipientId, userId }).populate("dripCampaignId");
    if (!recipient) throw new Error("Recipient not found");

    const campaign = recipient.dripCampaignId;
    if (!campaign) throw new Error("Campaign not found");

    const nextStepIndex = (recipient.currentStep || 0) + 1;
    const step = campaign.steps.find((s) => s.stepIndex === nextStepIndex);

    if (step) {
      recipient.status = "active";
      recipient.nextStepIndex = step.stepIndex;
      recipient.nextExecutionTime = calculateNextDate(step.delayValue, step.delayUnit, new Date());
      recipient.nextStepDelayText = formatDelayText(step.delayValue, step.delayUnit);
      recipient.nextStepPreview = renderTemplate(step.message, recipient);
      await recipient.save();

      await DripCampaign.findByIdAndUpdate(campaign._id, {
        $inc: { "stats.activeCount": 1 },
      });
      this.reschedule();
    }

    return { success: true, recipient };
  }

  /**
   * Listener hook when an incoming WhatsApp reply is received from a contact
   */
  async handleIncomingReply(userId, sessionId, chatJid, text = "", rawPhoneNumber = "") {
    try {
      if (!chatJid && !rawPhoneNumber) return;

      // Resolve userId if not passed
      let effectiveUserId = userId;
      if (!effectiveUserId && sessionId) {
        const sessionDoc = await WhatsAppSession.findOne({ sessionId }).lean();
        if (sessionDoc?.userId) effectiveUserId = sessionDoc.userId;
      }

      const cleanDigits = (str) => String(str || "").replace(/\D/g, "");
      const phoneDigits = cleanDigits(chatJid) || cleanDigits(rawPhoneNumber);
      const rawDigits = cleanDigits(rawPhoneNumber);
      const mainDigits = phoneDigits || rawDigits;
      const last10 = mainDigits.length >= 10 ? mainDigits.slice(-10) : mainDigits;
      const normalizedJid = String(chatJid || "").replace(/:\d+@/, "@");

      const filterConditions = [
        { chatJid: normalizedJid },
        { chatJid: `${mainDigits}@s.whatsapp.net` },
        { phone: mainDigits },
      ];

      if (rawDigits && rawDigits !== mainDigits) {
        filterConditions.push({ phone: rawDigits });
        filterConditions.push({ chatJid: `${rawDigits}@s.whatsapp.net` });
      }

      if (last10 && last10.length >= 7) {
        filterConditions.push({ phone: last10 });
        filterConditions.push({ phone: new RegExp(`${last10}$`) });
        filterConditions.push({ chatJid: new RegExp(`${last10}@`) });
      }

      const query = {
        status: "active",
        $or: filterConditions,
      };

      if (sessionId && effectiveUserId) {
        query.$and = [
          {
            $or: [
              { sessionId: sessionId },
              { userId: effectiveUserId },
            ],
          },
        ];
      } else if (sessionId) {
        query.sessionId = sessionId;
      } else if (effectiveUserId) {
        query.userId = effectiveUserId;
      }

      const activeEnrollments = await DripRecipient.find(query).populate("dripCampaignId");
      console.log(
        `[DRIP INCOMING] Reply from ${chatJid} / ${mainDigits} (session: ${sessionId}): active leads matched = ${activeEnrollments.length}`
      );

      if (!activeEnrollments || activeEnrollments.length === 0) return;

      for (const recipient of activeEnrollments) {
        const campaign = recipient.dripCampaignId;
        if (!campaign) continue;

        const stopOnReply = campaign.settings?.stopOnReply !== false;

        if (stopOnReply) {
          const now = new Date();
          let replyLatency = null;
          if (recipient.lastSentAt) {
            replyLatency = Math.round((now.getTime() - new Date(recipient.lastSentAt).getTime()) / (1000 * 60));
          }

          recipient.status = "replied";
          recipient.repliedAt = now;
          recipient.replyMessage = text || "[Incoming reply]";
          recipient.replyStepIndex = recipient.currentStep || 1;
          recipient.replyLatencyMinutes = replyLatency;
          recipient.nextExecutionTime = null;
          recipient.nextStepPreview = "";

          recipient.logs.push({
            stepIndex: recipient.currentStep || 1,
            stepName: `Customer Reply to Step #${recipient.currentStep || 1}`,
            sentAt: now,
            executedAt: now,
            status: "sent",
            messagePreview: `Reply: ${text || "[Incoming reply]"}`,
            deliveryStatus: "replied",
          });

          await recipient.save();

          await DripCampaign.findByIdAndUpdate(campaign._id, {
            $inc: { "stats.activeCount": -1, "stats.repliedCount": 1 },
          });

          console.log(
            `🎯 [DRIP TRIGGER] Contact ${recipient.phone} replied to Step ${recipient.replyStepIndex}! Sequence stopped for "${campaign.name}".`
          );

          const targetUserId = effectiveUserId || recipient.userId;
          if (this.io && targetUserId && campaign.settings?.notifyOnReply !== false) {
            this.io.to(`user:${targetUserId.toString()}`).emit("drip:lead_reply", {
              campaignId: campaign._id,
              campaignName: campaign.name,
              contactName: recipient.contactName || `+${recipient.phone}`,
              phone: recipient.phone,
              chatJid: recipient.chatJid,
              replyText: text,
              replyStepIndex: recipient.replyStepIndex,
              replyLatencyMinutes: replyLatency,
              repliedAt: now,
            });
          }
        }
      }
    } catch (err) {
      console.error("[DRIP REPLY HANDLER ERROR]", err.message);
    }
  }

  /**
   * Calculates step-by-step conversion funnel statistics
   */
  async getFunnelStats(campaignId, userId) {
    const campaign = await DripCampaign.findOne({ _id: campaignId, userId }).lean();
    if (!campaign) throw new Error("Campaign not found");

    const totalRecipients = await DripRecipient.countDocuments({ dripCampaignId: campaignId });
    const stepsStats = [];

    for (const step of campaign.steps || []) {
      // How many leads have reached/passed this step
      const sentCount = await DripRecipient.countDocuments({
        dripCampaignId: campaignId,
        "logs.stepIndex": step.stepIndex,
      });

      // How many leads replied on this step
      const repliedCount = await DripRecipient.countDocuments({
        dripCampaignId: campaignId,
        status: "replied",
        replyStepIndex: step.stepIndex,
      });

      const conversionRate = sentCount > 0 ? Math.round((repliedCount / sentCount) * 100) : 0;

      stepsStats.push({
        stepIndex: step.stepIndex,
        delayValue: step.delayValue,
        delayUnit: step.delayUnit,
        delayText: formatDelayText(step.delayValue, step.delayUnit),
        message: step.message || "",
        messageSnippet: step.message ? (step.message.length > 60 ? step.message.substring(0, 60) + "..." : step.message) : "Media only",
        mediaUrl: step.mediaUrl || null,
        mediaType: step.mediaType || null,
        mediaName: step.mediaName || null,
        sentCount,
        reachedCount: sentCount,
        repliedCount,
        repliesAtStep: repliedCount,
        conversionRate,
        replyConversionRate: conversionRate,
      });
    }

    return {
      campaignName: campaign.name,
      totalEnrolled: totalRecipients,
      funnel: stepsStats,
    };
  }
}

const dripService = new DripService();
export default dripService;
