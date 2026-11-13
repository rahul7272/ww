import { WaChatReminder, CrmContact } from "../models/index.js";
import WhatsAppService from "./WhatsAppService.js";
import CampaignService from "./CampaignService.js";
import { NextDueScheduler } from "../utils/nextDueScheduler.js";
import { join } from "path";

class ReminderService {
  constructor() {
    this.scheduler = new NextDueScheduler({
      name: "REMINDER SERVICE",
      getNextRunAt: () => this.getNextRunAt(),
      processDue: () => this.checkReminders(),
    });
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
    const [nextChatReminder, nextCrmAgg] = await Promise.all([
      WaChatReminder.findOne({
        isTriggered: false,
        isDismissed: { $ne: true },
        remindAt: { $ne: null },
      })
        .sort({ remindAt: 1 })
        .select("remindAt")
        .lean()
        .catch(() => null),
      CrmContact.aggregate([
        {
          $match: {
            activities: {
              $elemMatch: {
                hasReminder: true,
                isTriggered: false,
                isDismissed: { $ne: true },
                status: { $in: ["Open", "In Progress", "open", "pending"] },
              },
            },
          },
        },
        { $unwind: "$activities" },
        {
          $match: {
            "activities.hasReminder": true,
            "activities.isTriggered": false,
            "activities.isDismissed": { $ne: true },
            "activities.status": { $in: ["Open", "In Progress", "open", "pending"] },
          },
        },
        {
          $project: {
            nextAt: {
              $ifNull: [
                "$activities.snoozeUntil",
                { $ifNull: ["$activities.reminderTime", "$activities.dueDateTime"] },
              ],
            },
          },
        },
        { $match: { nextAt: { $ne: null } } },
        { $sort: { nextAt: 1 } },
        { $limit: 1 },
      ]).catch(() => []),
    ]);

    const candidates = [
      nextChatReminder?.remindAt,
      nextCrmAgg?.[0]?.nextAt,
    ]
      .filter(Boolean)
      .map((d) => new Date(d).getTime())
      .filter((ms) => Number.isFinite(ms));

    if (candidates.length === 0) return null;
    return new Date(Math.min(...candidates));
  }

  async checkReminders() {
    try {
      const now = new Date();
      const dueReminders = await WaChatReminder.find({
        isTriggered: false,
        isDismissed: { $ne: true },
        remindAt: { $lte: now },
      })
        .select("_id")
        .lean();

      for (const dueItem of dueReminders || []) {
        // Atomically claim so overlapping checks can never double-fire or double-send
        const reminder = await WaChatReminder.findOneAndUpdate(
          { _id: dueItem._id, isTriggered: false },
          { $set: { isTriggered: true } },
          { new: true }
        );
        if (!reminder) continue;

        // Auto-send message or media to WhatsApp contact if enabled
        if (reminder.autoSend && !reminder.isSent) {
          try {
            console.log(`[REMINDER AUTO-SEND] Sending message/image to ${reminder.chatJid}`);
            
            let fullMediaPath = reminder.mediaUrl;
            if (fullMediaPath && fullMediaPath.startsWith("/uploads/")) {
              fullMediaPath = join(process.cwd(), fullMediaPath);
            }

            const sendResult = await CampaignService.sendSingleMessage(
              reminder.userId,
              reminder.sessionId,
              reminder.chatJid,
              reminder.sendText || reminder.reminderText || "",
              reminder.contactName || "",
              fullMediaPath || null,
              reminder.mediaType || null
            );

            if (sendResult?.success) {
              reminder.isSent = true;
              reminder.sentAt = new Date();
              console.log(`[REMINDER AUTO-SEND SUCCESS] Sent to ${reminder.chatJid}`);
            }
          } catch (autoErr) {
            console.error(`[REMINDER AUTO-SEND ERROR] Failed to send to ${reminder.chatJid}:`, autoErr.message);
            reminder.sendError = autoErr.message;
          }
        }

        await reminder.save();

        const payload = {
          reminderId: reminder._id,
          sessionId: reminder.sessionId,
          chatJid: reminder.chatJid,
          contactName: reminder.contactName || "",
          phoneNumber: reminder.phoneNumber || "",
          reminderText: reminder.reminderText,
          remindAt: reminder.remindAt,
          autoSend: !!reminder.autoSend,
          isSent: !!reminder.isSent,
          sendText: reminder.sendText || "",
          mediaUrl: reminder.mediaUrl || "",
        };

        console.log(`[REMINDER ALERT] Triggering alert for ${reminder.chatJid} - "${reminder.reminderText}"`);

        // Realtime Socket.IO emission to browser for alert pop-up
        if (WhatsAppService.io) {
          WhatsAppService.io.to(reminder.sessionId).emit("chat:reminder_alert", payload);
          if (reminder.userId) {
            WhatsAppService.io.to(`user:${reminder.userId.toString()}`).emit("chat:reminder_alert", payload);
          }
        }
      }

      // ── 2. Check CRM Lead, Sales Task & Call Reminders ─────────────────────
      const crmReminders = await CrmContact.find({
        activities: {
          $elemMatch: {
            hasReminder: true,
            isTriggered: false,
            isDismissed: { $ne: true },
            status: { $in: ["Open", "In Progress", "open", "pending"] },
            $or: [
              { reminderTime: { $lte: now } },
              { reminderTime: null, dueDateTime: { $lte: now } },
              { snoozeUntil: { $lte: now } },
            ],
          },
        },
      }).select("userId name phone company queryId dealValue activities").lean();

      if (crmReminders && crmReminders.length > 0) {
        for (const contact of crmReminders) {
          let updated = false;
          for (const activity of contact.activities || []) {
            if (
              activity.hasReminder &&
              !activity.isTriggered &&
              !activity.isDismissed &&
              ["Open", "In Progress", "open", "pending"].includes(activity.status)
            ) {
              const triggerTime = activity.snoozeUntil || activity.reminderTime || activity.dueDateTime;
              if (triggerTime && new Date(triggerTime) <= now) {
                activity.isTriggered = true;
                updated = true;

                const alertPayload = {
                  activityId: activity._id,
                  contactId: contact._id,
                  contactName: contact.name,
                  phone: contact.phone,
                  company: contact.company,
                  queryId: contact.queryId,
                  dealValue: contact.dealValue,
                  type: activity.type || "task",
                  title: activity.title,
                  dueDateTime: activity.dueDateTime,
                  priority: activity.priority || "Normal",
                  owner: activity.owner,
                  notes: activity.description || activity.notes || "",
                  triggeredAt: new Date(),
                };

                console.log(`[CRM ALERT] Fired reminder alert for lead ${contact.name} - ${activity.type}: "${activity.title}"`);

                if (WhatsAppService.io && contact.userId) {
                  WhatsAppService.io.to(`user:${contact.userId.toString()}`).emit("crm:activity_reminder_alert", alertPayload);
                }

                // If autoSendWhatsApp is enabled, send automated reminder to lead
                if (activity.autoSendWhatsApp && contact.phone) {
                  try {
                    const cleanPhone = String(contact.phone).replace(/\D/g, "");
                    const targetJid = `${cleanPhone}@s.whatsapp.net`;
                    const defaultMsg = `Hello ${contact.name}, this is a reminder regarding: ${activity.title} scheduled for ${new Date(activity.dueDateTime).toLocaleString('en-IN')}.`;
                    const textToSend = activity.whatsAppText || defaultMsg;
                    console.log(`[CRM AUTO-SEND] Sending WhatsApp alert to ${targetJid}`);
                    await CampaignService.sendSingleMessage(
                      contact.userId,
                      null,
                      targetJid,
                      textToSend,
                      contact.name,
                      null,
                      null
                    );
                  } catch (e) {
                    console.error("[CRM AUTO-SEND ERROR]", e.message);
                  }
                }
              }
            }
          }

          if (updated) {
            await CrmContact.updateOne(
              { _id: contact._id },
              { $set: { activities: contact.activities } }
            );
          }
        }
      }
    } catch (err) {
      console.error("[REMINDER SERVICE ERROR]", err.message);
    }
  }
}

const reminderService = new ReminderService();
export default reminderService;
