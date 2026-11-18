import mongoose from "mongoose";
import {
  WhatsAppAutomationRule,
  AgentTeam,
  WhatsAppAutomationState,
  SalesTeamMember,
  WaChat,
} from "../models/index.js";

/**
 * Replace template variables like {{name}} or {{phone}}
 */
export function interpolateText(template = "", variables = {}) {
  if (!template || typeof template !== "string") return "";
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, key) => {
    const lowerKey = key.toLowerCase();
    if (lowerKey === "name") {
      return (
        variables.name ||
        variables.pushName ||
        variables.phoneNumber ||
        "there"
      );
    }
    if (lowerKey === "phone" || lowerKey === "phonenumber") {
      return variables.phone || variables.phoneNumber || "";
    }
    return variables[key] !== undefined ? variables[key] : match;
  });
}

/**
 * Check if the business is currently open based on business hours schedule, timezone, split slots, and holidays.
 *
 * @param {Object} businessHoursConfig
 * @param {Date} date - Optional Date to evaluate (defaults to now)
 * @returns {Object} { isOpen: boolean, isConfigured: boolean, statusText: string, reason: string, ... }
 */
export function isBusinessOpen(businessHoursConfig, date = new Date()) {
  if (!businessHoursConfig || businessHoursConfig.enabled !== true) {
    // Off — the number counts as always open
    return {
      isOpen: true,
      isConfigured: false,
      statusText: "Off — the number counts as always open",
      reason: "hours_disabled",
    };
  }

  const timeZone = businessHoursConfig.timeZone || "Asia/Kolkata";

  let dateParts;
  try {
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    dateParts = formatter.formatToParts(date);
  } catch {
    // Fallback to UTC if invalid timezone provided
    const formatter = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "long",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
    dateParts = formatter.formatToParts(date);
  }

  const map = {};
  for (const p of dateParts) {
    map[p.type] = p.value;
  }

  const dayName = (map.weekday || "").toLowerCase(); // "monday", "tuesday", etc.
  const dayOfMonth = map.day || "01";
  const month = map.month || "01";
  const year = map.year || "2026";
  const hour = parseInt(map.hour || "0", 10);
  const minute = parseInt(map.minute || "0", 10);
  const currentMinutes = hour * 60 + minute;

  // Formats: dd-mm-yyyy and yyyy-mm-dd
  const ddmmyyyy = `${dayOfMonth}-${month}-${year}`;
  const yyyymmdd = `${year}-${month}-${dayOfMonth}`;

  // 1. Holiday Check
  const holidays = Array.isArray(businessHoursConfig.holidays)
    ? businessHoursConfig.holidays
    : [];
  const matchedHoliday = holidays.find(
    (h) => h && (h.date === ddmmyyyy || h.date === yyyymmdd)
  );

  if (matchedHoliday) {
    return {
      isOpen: false,
      isConfigured: true,
      statusText: `Closed — Holiday (${matchedHoliday.name || matchedHoliday.date})`,
      reason: "holiday",
      holiday: matchedHoliday,
    };
  }

  // 2. Day Schedule Check
  const schedule = Array.isArray(businessHoursConfig.schedule)
    ? businessHoursConfig.schedule
    : [];
  const dayConfig = schedule.find((d) => d.day === dayName);

  if (!dayConfig || !dayConfig.isOpen) {
    const formattedDay = dayName ? dayName.charAt(0).toUpperCase() + dayName.slice(1) : "Day";
    return {
      isOpen: false,
      isConfigured: true,
      statusText: `Closed — ${formattedDay} is closed`,
      reason: "day_closed",
      dayName,
    };
  }

  // 3. Time Slots Check (Supports Split Shifts)
  const slots =
    Array.isArray(dayConfig.slots) && dayConfig.slots.length > 0
      ? dayConfig.slots
      : [{ start: "09:00", end: "18:00" }];

  let isInsideSlot = false;
  let activeSlot = null;

  for (const slot of slots) {
    if (!slot || !slot.start || !slot.end) continue;
    const [sH = 0, sM = 0] = slot.start.split(":").map(Number);
    const [eH = 0, eM = 0] = slot.end.split(":").map(Number);
    const slotStart = sH * 60 + sM;
    const slotEnd = eH * 60 + eM;

    if (currentMinutes >= slotStart && currentMinutes < slotEnd) {
      isInsideSlot = true;
      activeSlot = slot;
      break;
    }
  }

  if (isInsideSlot) {
    return {
      isOpen: true,
      isConfigured: true,
      statusText: "On — open right now",
      reason: "within_business_hours",
      activeSlot,
    };
  }

  return {
    isOpen: false,
    isConfigured: true,
    statusText: "On — closed right now (outside business hours)",
    reason: "outside_hours",
  };
}

/**
 * Fetch or initialize automation rules for a given user and WhatsApp session.
 */
export async function getOrCreateRules(userId, sessionId = "default") {
  let rule = await WhatsAppAutomationRule.findOne({ userId, sessionId });

  if (!rule) {
    // If asking for a specific number and none exists, see if default exists
    if (sessionId !== "default") {
      const defaultRule = await WhatsAppAutomationRule.findOne({
        userId,
        sessionId: "default",
      });
      if (defaultRule) {
        rule = await WhatsAppAutomationRule.create({
          userId,
          sessionId,
          welcomeMessage: defaultRule.welcomeMessage,
          awayMessage: defaultRule.awayMessage,
          businessHours: defaultRule.businessHours,
        });
        return rule;
      }
    }

    // Otherwise create with default schema values
    rule = await WhatsAppAutomationRule.create({
      userId,
      sessionId,
    });
  }

  return rule;
}

/**
 * Update automation rules for a given user and WhatsApp session.
 */
export async function updateRules(userId, sessionId = "default", updates = {}) {
  const allowedUpdates = {};

  if (updates.welcomeMessage) {
    allowedUpdates.welcomeMessage = updates.welcomeMessage;
  }
  if (updates.awayMessage) {
    allowedUpdates.awayMessage = updates.awayMessage;
  }
  if (updates.businessHours) {
    allowedUpdates.businessHours = updates.businessHours;
  }

  const rule = await WhatsAppAutomationRule.findOneAndUpdate(
    { userId, sessionId },
    { $set: allowedUpdates },
    { new: true, upsert: true, runValidators: true }
  );

  return rule;
}

/**
 * Evaluate an inbound WhatsApp message and determine if an automated reply should be sent.
 *
 * Rules precedence:
 * 1. If chatbotAnswered is true, skip ("Skipped when a chatbot already answered the message").
 * 2. If Welcome message is enabled and this is the customer's very first message, send Welcome.
 * 3. Else, if Away message is enabled and business hours are enabled and closed, and throttling allows, send Away.
 *
 * @returns {Promise<Object>} { action: "send_welcome" | "send_away" | "skip" | "none", text?: string, ... }
 */
export async function evaluateInboundMessage({
  userId,
  sessionId = "default",
  senderJid,
  pushName = "",
  phoneNumber = "",
  chatbotAnswered = false,
}) {
  if (!userId || !senderJid) {
    return { action: "none", reason: "missing_parameters" };
  }

  // Strictly skip groups, broadcasts, newsletters
  const isGroup =
    senderJid.endsWith("@g.us") ||
    senderJid.includes("@g.us") ||
    senderJid.endsWith("@broadcast") ||
    senderJid.endsWith("@newsletter");

  if (isGroup) {
    return { action: "none", reason: "group_or_broadcast" };
  }

  // Rule: "Skipped when a chatbot already answered the message"
  if (chatbotAnswered) {
    return { action: "skip", reason: "chatbot_precedence" };
  }

  // Get active rules for this session (or fallback to default)
  let rule = await WhatsAppAutomationRule.findOne({ userId, sessionId });
  if (!rule && sessionId !== "default") {
    rule = await WhatsAppAutomationRule.findOne({ userId, sessionId: "default" });
  }

  if (!rule) {
    return { action: "none", reason: "no_rules_configured" };
  }

  // Fetch or create customer state
  let state = await WhatsAppAutomationState.findOne({
    userId,
    sessionId,
    chatJid: senderJid,
  });

  const isFirstMessageEver = !state || !state.welcomeMessageSent;

  if (!state) {
    state = new WhatsAppAutomationState({
      userId,
      sessionId,
      chatJid: senderJid,
      customerName: pushName,
      phoneNumber,
      lastInboundMessageAt: new Date(),
    });
  } else {
    state.lastInboundMessageAt = new Date();
    if (pushName && !state.customerName) {
      state.customerName = pushName;
    }
  }

  const variables = {
    name: pushName || state.customerName || phoneNumber,
    pushName,
    phoneNumber,
  };

  // ── 1. Welcome Message Evaluation ──
  if (rule.welcomeMessage?.enabled && isFirstMessageEver) {
    const text = interpolateText(rule.welcomeMessage.text, variables);
    state.welcomeMessageSent = true;
    state.welcomeMessageSentAt = new Date();
    await state.save();

    return {
      action: "send_welcome",
      text,
      thenContinueType: rule.welcomeMessage.thenContinueType || "none",
      thenContinueTargetId: rule.welcomeMessage.thenContinueTargetId || "",
    };
  }

  // ── 2. Away Message Evaluation ──
  if (rule.awayMessage?.enabled) {
    // If business hours are off, number counts as always open -> never send away message
    if (rule.businessHours?.enabled !== true) {
      await state.save();
      return {
        action: "skip",
        reason: "business_hours_disabled_always_open",
      };
    }

    // Check if open or closed
    const status = isBusinessOpen(rule.businessHours);

    if (!status.isOpen) {
      // Business is closed! Check customer throttling
      const throttleHours = rule.awayMessage.throttleHours || 12;
      const lastSentTime = state.lastAwayMessageSentAt
        ? new Date(state.lastAwayMessageSentAt).getTime()
        : 0;

      const elapsedHours = lastSentTime > 0
        ? (Date.now() - lastSentTime) / (1000 * 60 * 60)
        : Infinity;

      if (elapsedHours < throttleHours) {
        // Throttled! Do not spam customer
        await state.save();
        return {
          action: "skip",
          reason: "throttled",
          elapsedHours,
          throttleHours,
        };
      }

      // Not throttled: send away message
      const text = interpolateText(rule.awayMessage.text, variables);
      state.lastAwayMessageSentAt = new Date();
      state.awayMessageCount = (state.awayMessageCount || 0) + 1;
      await state.save();

      return {
        action: "send_away",
        text,
        closedReason: status.reason,
      };
    }
  }

  await state.save();
  return { action: "none", reason: "no_action_triggered" };
}

/**
 * Assign an incoming chat to the next available agent on a team (Round-Robin).
 */
export async function assignChatToTeam({
  userId,
  teamId,
  chatJid,
  sessionId = "default",
}) {
  if (!userId || !teamId || !chatJid) {
    return { success: false, reason: "missing_parameters" };
  }

  const team = await AgentTeam.findOne({
    _id: teamId,
    userId,
    isActive: true,
  }).populate("memberIds");

  if (!team || !Array.isArray(team.memberIds) || team.memberIds.length === 0) {
    return { success: false, reason: "no_active_members" };
  }

  // Round-robin index calculation
  const nextIndex = (team.lastAssignedIndex + 1) % team.memberIds.length;
  const assignedMember = team.memberIds[nextIndex];

  // Update team round-robin index
  team.lastAssignedIndex = nextIndex;
  await team.save();

  // Update automation state
  await WhatsAppAutomationState.findOneAndUpdate(
    { userId, sessionId, chatJid },
    {
      $set: {
        assignedTeamId: team._id,
        assignedMemberId: assignedMember._id,
      },
    },
    { upsert: true }
  );

  // Sync assignment with WaChat if exists
  await WaChat.findOneAndUpdate(
    { userId, sessionId, chatJid },
    {
      $set: {
        leadStatus: `Assigned: ${team.name} (${assignedMember.name})`,
      },
    }
  ).exec().catch(() => {});

  return {
    success: true,
    teamName: team.name,
    member: {
      id: assignedMember._id,
      name: assignedMember.name,
      role: assignedMember.role,
      email: assignedMember.email,
    },
  };
}

/**
 * Agent Teams CRUD Operations
 */
export async function listAgentTeams(userId) {
  return await AgentTeam.find({ userId })
    .populate("memberIds", "name role email phone")
    .sort({ createdAt: -1 });
}

export async function createAgentTeam(userId, data = {}) {
  const { name, description = "", memberIds = [] } = data;
  if (!name?.trim()) {
    throw new Error("Team name is required");
  }

  const team = await AgentTeam.create({
    userId,
    name: name.trim(),
    description: description.trim(),
    memberIds: Array.isArray(memberIds) ? memberIds : [],
    routingStrategy: "round_robin",
    lastAssignedIndex: 0,
    isActive: true,
  });

  return await AgentTeam.findById(team._id).populate(
    "memberIds",
    "name role email phone"
  );
}

export async function updateAgentTeam(userId, teamId, data = {}) {
  const allowed = {};
  if (data.name !== undefined) allowed.name = data.name.trim();
  if (data.description !== undefined) allowed.description = data.description.trim();
  if (data.memberIds !== undefined) allowed.memberIds = data.memberIds;
  if (data.isActive !== undefined) allowed.isActive = Boolean(data.isActive);

  const team = await AgentTeam.findOneAndUpdate(
    { _id: teamId, userId },
    { $set: allowed },
    { new: true }
  ).populate("memberIds", "name role email phone");

  if (!team) {
    throw new Error("Agent team not found");
  }
  return team;
}

export async function deleteAgentTeam(userId, teamId) {
  const res = await AgentTeam.findOneAndDelete({ _id: teamId, userId });
  if (!res) {
    throw new Error("Agent team not found");
  }
  return { success: true };
}

export default {
  interpolateText,
  isBusinessOpen,
  getOrCreateRules,
  updateRules,
  evaluateInboundMessage,
  assignChatToTeam,
  listAgentTeams,
  createAgentTeam,
  updateAgentTeam,
  deleteAgentTeam,
};
