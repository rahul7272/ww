import GroupMemberTask from "../models/GroupMemberTask.js";
import WhatsAppService from "./WhatsAppService.js";
import { WhatsAppSession as SessionModel } from "../models/index.js";

class GroupMemberTaskService {
  constructor() {
    this.activeTasks = new Map();
  }

  async init() {
    try {
      const runningTasks = await GroupMemberTask.find({ status: "running" });
      if (runningTasks.length > 0) {
        console.log(`[GroupMemberTask] Found ${runningTasks.length} running task(s) on startup. Setting to paused...`);
        for (const t of runningTasks) {
          t.status = "paused";
          t.lastError = "Server restarted. Click Resume to continue adding members.";
          await t.save();
        }
      }
    } catch (e) {
      console.warn("[GroupMemberTask] init error:", e.message);
    }
  }

  computeStats(members = []) {
    const added = members.filter((m) => m.status === "added").length;
    const invited = members.filter((m) => m.status === "invited").length;
    const failed = members.filter((m) => m.status === "failed").length;
    const pending = members.filter((m) => m.status === "pending").length;
    return {
      total: members.length,
      added,
      invited,
      failed,
      pending,
      notYetAdded: pending + failed,
    };
  }

  normalizePhoneNumber(rawPhone, countryCode = "91", autoAddCountryCode = true) {
    let clean = String(rawPhone || "").replace(/\D/g, "");
    const normalizedCountryCode = String(countryCode || "91").replace(/\D/g, "") || "91";
    if (clean.length === 10 && autoAddCountryCode !== false && normalizedCountryCode) {
      clean = `${normalizedCountryCode}${clean}`;
    }
    return clean;
  }

  assignSessionIdsToMembers(members, addingSessions, { rotationMode = "round-robin", quotaMode = "even", batchSize = 10 } = {}) {
    if (!addingSessions || addingSessions.length === 0) return members;
    const count = addingSessions.length;
    const bSize = Math.max(1, Number(batchSize) || 10);

    if (quotaMode === "custom") {
      let idx = 0;
      for (const s of addingSessions) {
        const q = Math.max(0, Number(s.quota) || 0);
        for (let i = 0; i < q && idx < members.length; i++) {
          members[idx].assignedSessionId = s.sessionId;
          idx++;
        }
      }
      let rem = 0;
      while (idx < members.length) {
        members[idx].assignedSessionId = addingSessions[rem % count].sessionId;
        idx++;
        rem++;
      }
      return members;
    }

    members.forEach((m, index) => {
      if (m.assignedSessionId && addingSessions.some((s) => s.sessionId === m.assignedSessionId)) {
        return;
      }
      const rotated =
        rotationMode === "batch-switch"
          ? addingSessions[Math.floor(index / bSize) % count]
          : addingSessions[index % count];
      m.assignedSessionId = rotated ? rotated.sessionId : addingSessions[0].sessionId;
    });
    return members;
  }

  async createTask(userId, data) {
    const {
      name,
      campaignName = "",
      targetGroup,
      addingSessions,
      members,
      delaySeconds = 8,
      delayMaxSeconds = 14,
      batchSize = 10,
      batchCooldownSeconds = 25,
      rotationMode = "round-robin",
      quotaMode = "even",
      autoSendInviteLink = false,
      skipExistingMembers = true,
      membersPerBatch = 2,
      status = "draft",
    } = data;

    if (!targetGroup || (!targetGroup.jid && !targetGroup.inviteUrl && !targetGroup.inviteCode)) {
      throw new Error("Target group or group invite link is required.");
    }

    if (!addingSessions || addingSessions.length === 0) {
      throw new Error("At least one adding WhatsApp account is required.");
    }

    if (!members || members.length === 0) {
      throw new Error("At least one member phone number is required.");
    }

    const {
      countryCode = "91",
      autoAddCountryCode = true,
      joinBeforeAdding = true,
      joinWaitSeconds = 30,
    } = data;

    const normalizedCountryCode = String(countryCode || "91").replace(/\D/g, "") || "91";

    const inviteCode = targetGroup.inviteCode || WhatsAppService.extractGroupInviteCode(targetGroup.inviteUrl);
    if (!targetGroup.jid && inviteCode) {
      for (const s of addingSessions) {
        try {
          const info = await WhatsAppService.getGroupInviteInfo(s?.sessionId, inviteCode);
          if (info?.id) {
            targetGroup.jid = info.id.includes("@") ? info.id : `${info.id}@g.us`;
            if (!targetGroup.subject && info.subject) {
              targetGroup.subject = info.subject;
            }
            break;
          }
        } catch (e) {
          // Can be resolved on join at runtime
        }
      }
    }

    const seenPhones = new Set();
    const formattedMembers = [];
    for (const m of members) {
      const clean = this.normalizePhoneNumber(m.phone, normalizedCountryCode, autoAddCountryCode);
      if (!clean || clean.length < 10 || seenPhones.has(clean)) continue;
      seenPhones.add(clean);
      formattedMembers.push({
        phone: clean,
        jid: `${clean}@s.whatsapp.net`,
        assignedSessionId: m.assignedSessionId || "",
        processedBySessionId: "",
        processedByPhoneNumber: "",
        processedByName: "",
        status: "pending",
      });
    }

    if (formattedMembers.length === 0) {
      throw new Error("At least one valid member phone number is required.");
    }

    this.assignSessionIdsToMembers(formattedMembers, addingSessions, {
      rotationMode,
      quotaMode,
      batchSize,
    });

    const minDelay = Math.max(2, Number(delaySeconds) || 8);
    const maxDelay = Math.max(minDelay, Number(delayMaxSeconds) || (minDelay + 6));

    const task = new GroupMemberTask({
      userId,
      name: name || `Add Members Task - ${targetGroup.subject || targetGroup.jid || "Invite Group"}`,
      campaignName: String(campaignName || "").trim(),
      targetGroup: {
        jid: targetGroup.jid || "",
        subject: targetGroup.subject || "",
        inviteCode: inviteCode || "",
        inviteUrl: targetGroup.inviteUrl || "",
      },
      addingSessions,
      members: formattedMembers,
      delaySeconds: minDelay,
      delayMaxSeconds: maxDelay,
      membersPerBatch: Math.max(1, Math.min(100, Number(membersPerBatch) || 2)),
      batchSize: Math.max(1, Number(batchSize) || 10),
      batchCooldownSeconds: Math.max(5, Number(batchCooldownSeconds) || 25),
      rotationMode: rotationMode || "round-robin",
      quotaMode: quotaMode === "custom" ? "custom" : "even",
      autoSendInviteLink: Boolean(autoSendInviteLink),
      skipExistingMembers: skipExistingMembers !== false,
      countryCode: normalizedCountryCode,
      autoAddCountryCode: autoAddCountryCode !== false,
      joinBeforeAdding: joinBeforeAdding !== false,
      joinWaitSeconds: Math.max(5, Number(joinWaitSeconds) || 30),
      status: status === "running" ? "running" : "draft",
      stats: this.computeStats(formattedMembers),
    });

    await task.save();

    if (status === "running") {
      try {
        await this.startTask(userId, task._id);
      } catch (startErr) {
        console.warn(`[GroupMemberTask] Task created but could not start immediately: ${startErr.message}`);
        task.status = "draft";
        task.lastError = startErr.message;
        await task.save();
      }
    }

    return task;
  }

  async updateTask(userId, taskId, data) {
    let task = await GroupMemberTask.findOne({ _id: taskId, userId });
    if (!task) throw new Error("Task not found.");

    // Safely pause live execution loop before mutating task state
    const wasRunning = task.status === "running";
    if (wasRunning || this.activeTasks.has(String(taskId))) {
      await this.stopTask(userId, taskId);
      task = await GroupMemberTask.findOne({ _id: taskId, userId });
      if (!task) throw new Error("Task not found.");
    }

    if (data.name !== undefined) {
      task.name = String(data.name || "").trim() || task.name;
    }
    if (data.campaignName !== undefined) {
      task.campaignName = String(data.campaignName || "").trim();
    }

    const normalizedCountryCode =
      data.countryCode !== undefined
        ? String(data.countryCode || "91").replace(/\D/g, "") || "91"
        : task.countryCode || "91";
    const autoAddCC =
      data.autoAddCountryCode !== undefined ? data.autoAddCountryCode !== false : task.autoAddCountryCode !== false;

    task.countryCode = normalizedCountryCode;
    task.autoAddCountryCode = autoAddCC;

    if (data.targetGroup) {
      const nextInviteCode =
        data.targetGroup.inviteCode ||
        WhatsAppService.extractGroupInviteCode(data.targetGroup.inviteUrl) ||
        "";
      const nextJid = data.targetGroup.jid || "";
      const nextSubject = data.targetGroup.subject || "";
      const nextInviteUrl = data.targetGroup.inviteUrl || "";

      const destinationChanged =
        (nextJid && nextJid !== task.targetGroup?.jid) ||
        (nextInviteCode && nextInviteCode !== task.targetGroup?.inviteCode);

      task.targetGroup = {
        jid: nextJid,
        subject: nextSubject,
        inviteCode: nextInviteCode,
        inviteUrl: nextInviteUrl,
      };

      if (destinationChanged) {
        task.hasJoinedViaInvite = false;
      }

      if (!task.targetGroup.jid && nextInviteCode) {
        const lookupSessions =
          Array.isArray(data.addingSessions) && data.addingSessions.length > 0
            ? data.addingSessions
            : task.addingSessions || [];
        for (const s of lookupSessions) {
          try {
            const info = await WhatsAppService.getGroupInviteInfo(s?.sessionId, nextInviteCode);
            if (info?.id) {
              task.targetGroup.jid = info.id.includes("@") ? info.id : `${info.id}@g.us`;
              if (!task.targetGroup.subject && info.subject) {
                task.targetGroup.subject = info.subject;
              }
              break;
            }
          } catch (e) {}
        }
      }
    }

    if (Array.isArray(data.addingSessions)) {
      if (data.addingSessions.length === 0) {
        throw new Error("At least one adding WhatsApp account is required.");
      }
      task.addingSessions = data.addingSessions;
    }

    if (data.delaySeconds !== undefined) {
      task.delaySeconds = Math.max(2, Number(data.delaySeconds) || 8);
    }
    if (data.delayMaxSeconds !== undefined) {
      task.delayMaxSeconds = Math.max(task.delaySeconds, Number(data.delayMaxSeconds) || task.delaySeconds + 6);
    }
    if (data.membersPerBatch !== undefined) {
      task.membersPerBatch = Math.max(1, Math.min(100, Number(data.membersPerBatch) || 2));
    }
    if (data.batchSize !== undefined) {
      task.batchSize = Math.max(1, Number(data.batchSize) || 10);
    }
    if (data.batchCooldownSeconds !== undefined) {
      task.batchCooldownSeconds = Math.max(5, Number(data.batchCooldownSeconds) || 25);
    }
    if (data.rotationMode !== undefined) {
      task.rotationMode = data.rotationMode || "round-robin";
    }
    if (data.quotaMode !== undefined) {
      task.quotaMode = data.quotaMode === "custom" ? "custom" : "even";
    }
    if (data.autoSendInviteLink !== undefined) {
      task.autoSendInviteLink = Boolean(data.autoSendInviteLink);
    }
    if (data.skipExistingMembers !== undefined) {
      task.skipExistingMembers = data.skipExistingMembers !== false;
    }
    if (data.joinBeforeAdding !== undefined) {
      task.joinBeforeAdding = data.joinBeforeAdding !== false;
    }
    if (data.joinWaitSeconds !== undefined) {
      task.joinWaitSeconds = Math.max(5, Number(data.joinWaitSeconds) || 30);
    }

    if (Array.isArray(data.members)) {
      const keepProcessedHistory = data.keepProcessedHistory !== false;
      const resetFailedOnSave = Boolean(data.resetFailedOnSave);

      const existingByPhone = new Map();
      const preservedProcessed = [];
      for (const existing of task.members || []) {
        const cleanExisting = this.normalizePhoneNumber(existing.phone, normalizedCountryCode, autoAddCC);
        if (cleanExisting) {
          existingByPhone.set(cleanExisting, existing.toObject ? existing.toObject() : { ...existing });
        }
        if (keepProcessedHistory && (existing.status === "added" || existing.status === "invited")) {
          preservedProcessed.push(existing.toObject ? existing.toObject() : { ...existing });
        }
      }

      const seen = new Set();
      const mergedMembers = [];

      if (keepProcessedHistory) {
        for (const p of preservedProcessed) {
          const cleanP = this.normalizePhoneNumber(p.phone, normalizedCountryCode, autoAddCC);
          if (cleanP && !seen.has(cleanP)) {
            seen.add(cleanP);
            mergedMembers.push(p);
          }
        }
      }

      const queueMembers = [];
      for (const incoming of data.members) {
        const clean = this.normalizePhoneNumber(incoming.phone, normalizedCountryCode, autoAddCC);
        if (!clean || clean.length < 10 || seen.has(clean)) continue;
        seen.add(clean);

        const prev = existingByPhone.get(clean);
        if (prev && !keepProcessedHistory && (prev.status === "added" || prev.status === "invited") && incoming.status !== "pending") {
          mergedMembers.push(prev);
          continue;
        }

        const shouldKeepFailed = prev && prev.status === "failed" && !resetFailedOnSave && incoming.status !== "pending";
        queueMembers.push({
          phone: clean,
          jid: `${clean}@s.whatsapp.net`,
          assignedSessionId: incoming.assignedSessionId || "",
          processedBySessionId: shouldKeepFailed ? prev.processedBySessionId || "" : "",
          processedByPhoneNumber: shouldKeepFailed ? prev.processedByPhoneNumber || "" : "",
          processedByName: shouldKeepFailed ? prev.processedByName || "" : "",
          status: shouldKeepFailed ? "failed" : "pending",
          error: shouldKeepFailed ? prev.error || "" : "",
          addedAt: shouldKeepFailed ? prev.addedAt || null : null,
        });
      }

      this.assignSessionIdsToMembers(queueMembers, task.addingSessions, {
        rotationMode: task.rotationMode,
        quotaMode: task.quotaMode,
        batchSize: task.batchSize,
      });

      task.members = [...mergedMembers, ...queueMembers];
    } else if (data.rebalancePending || data.addingSessions || data.rotationMode || data.quotaMode || data.batchSize) {
      // Re-assign pending members when sender configuration changes even if members array was omitted
      const pendingList = [];
      for (const m of task.members || []) {
        if (m.status === "pending") {
          m.assignedSessionId = "";
          pendingList.push(m);
        }
      }
      this.assignSessionIdsToMembers(pendingList, task.addingSessions, {
        rotationMode: task.rotationMode,
        quotaMode: task.quotaMode,
        batchSize: task.batchSize,
      });
    }

    if (task.members.length === 0) {
      throw new Error("Task must retain at least one member phone number.");
    }

    task.stats = this.computeStats(task.members);
    task.lastError = "";

    const shouldStartNow = data.status === "running";
    if (task.stats.pending === 0 && task.stats.failed === 0 && task.stats.total > 0) {
      task.status = "completed";
    } else if (shouldStartNow) {
      task.status = "paused"; // startTask will transition to running cleanly
    } else if (task.status === "completed" || task.status === "failed") {
      task.status = "paused";
    }

    await task.save();

    if (shouldStartNow && (task.stats.pending > 0 || task.stats.failed > 0)) {
      await this.startTask(userId, task._id);
      const refreshed = await GroupMemberTask.findOne({ _id: taskId, userId }).lean();
      return this.populateTaskMemberReports(refreshed);
    }

    return this.populateTaskMemberReports(task.toObject());
  }

  async resolveGroupInvite(userId, sessionId, inviteUrlOrCode) {
    if (!sessionId) {
      throw new Error("A connected WhatsApp account session is required to preview group invite links.");
    }
    const cleanCode = WhatsAppService.extractGroupInviteCode(inviteUrlOrCode);
    if (!cleanCode) {
      throw new Error("Invalid WhatsApp group invite link or code.");
    }
    const info = await WhatsAppService.getGroupInviteInfo(sessionId, cleanCode);
    return info;
  }

  /**
   * Fetch all existing participants of a destination group (via groupJid or invite link)
   * to remove/filter duplicates from queued lists.
   */
  async getGroupParticipants(userId, sessionId, { groupJid, inviteUrl, autoJoin = false }) {
    let resolvedJid = groupJid || "";
    let resolvedSubject = "";
    let participants = [];

    // Find a working socket
    let sock = sessionId ? WhatsAppService.getSocket(sessionId) : null;
    if (!sock || !WhatsAppService.isSessionWorking(sessionId)) {
      if (sessionId) {
        sock = await this.waitForSessionConnection(sessionId, 3000);
      }
      if (!sock || !sock?.user?.id) {
        for (const [sId, s] of WhatsAppService.sockets.entries()) {
          if (WhatsAppService.isSessionWorking(sId)) {
            sock = s;
            sessionId = sId;
            break;
          }
        }
      }
    }

    if (!sock) {
      throw new Error("No connected WhatsApp account available. Please connect or select an active account.");
    }

    // 1. If groupJid provided and valid, query metadata
    if (resolvedJid && resolvedJid.includes("@")) {
      try {
        const metadata = await WhatsAppService.getGroupMetadata(sessionId, resolvedJid);
        if (metadata) {
          resolvedSubject = metadata.subject || "";
          if (Array.isArray(metadata.participants)) {
            for (const p of metadata.participants) {
              const num = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
              if (num && num.length >= 10) {
                participants.push({
                  phone: num,
                  jid: p.id || `${num}@s.whatsapp.net`,
                  isAdmin: p.admin === "admin" || p.admin === "superadmin",
                });
              }
            }
          }
        }
      } catch (err) {
        console.warn(`[getGroupParticipants] Error fetching metadata for ${resolvedJid}:`, err.message);
      }
    }

    // 2. If inviteUrl or code is provided
    if (inviteUrl) {
      const code = WhatsAppService.extractGroupInviteCode(inviteUrl);
      if (code) {
        // If autoJoin was requested and account is not in group yet, join it
        if (autoJoin) {
          try {
            console.log(`[getGroupParticipants] Joining group via invite code ${code} to fetch all participants...`);
            const joinedGid = await WhatsAppService.joinGroupViaInvite(sessionId, code);
            if (joinedGid) resolvedJid = joinedGid;
          } catch (joinErr) {
            console.warn(`[getGroupParticipants] Auto-join attempt notice:`, joinErr.message);
          }
        }

        try {
          const inviteInfo = await WhatsAppService.getGroupInviteInfo(sessionId, code);
          if (inviteInfo) {
            if (!resolvedJid && inviteInfo.id) resolvedJid = inviteInfo.id;
            if (!resolvedSubject && inviteInfo.subject) resolvedSubject = inviteInfo.subject;
            if (Array.isArray(inviteInfo.participants) && inviteInfo.participants.length > 0) {
              for (const p of inviteInfo.participants) {
                const num = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
                if (num && num.length >= 10 && !participants.some((item) => item.phone === num)) {
                  participants.push({
                    phone: num,
                    jid: p.id || `${num}@s.whatsapp.net`,
                    isAdmin: p.admin === "admin" || p.admin === "superadmin",
                  });
                }
              }
            }
          }
        } catch (inviteErr) {
          console.warn(`[getGroupParticipants] Error resolving invite info:`, inviteErr.message);
        }

        // If we have resolvedJid, try fetching full group metadata
        if (resolvedJid && resolvedJid.includes("@")) {
          try {
            const fullMeta = await WhatsAppService.getGroupMetadata(sessionId, resolvedJid);
            if (fullMeta?.participants && Array.isArray(fullMeta.participants)) {
              const fullList = [];
              for (const p of fullMeta.participants) {
                const num = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
                if (num && num.length >= 10) {
                  fullList.push({
                    phone: num,
                    jid: p.id || `${num}@s.whatsapp.net`,
                    isAdmin: p.admin === "admin" || p.admin === "superadmin",
                  });
                }
              }
              if (fullList.length > 0) {
                participants = fullList;
              }
            }
          } catch (metaErr) {
            // ignore
          }
        }
      }
    }

    // De-duplicate participants by phone
    const seen = new Set();
    const uniqueParticipants = [];
    for (const p of participants) {
      if (!seen.has(p.phone)) {
        seen.add(p.phone);
        uniqueParticipants.push(p);
      }
    }

    // Fallback: If live socket returned 0 participants, check MongoDB WhatsAppGroup cache
    if (uniqueParticipants.length === 0 && resolvedJid) {
      try {
        const { default: WhatsAppGroup } = await import("../models/WhatsAppGroup.js");
        const cachedGroup = await WhatsAppGroup.findOne({ jid: resolvedJid }).lean();
        if (cachedGroup?.participants && Array.isArray(cachedGroup.participants)) {
          if (!resolvedSubject && cachedGroup.subject) resolvedSubject = cachedGroup.subject;
          for (const p of cachedGroup.participants) {
            const num = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
            if (num && num.length >= 10 && !seen.has(num)) {
              seen.add(num);
              uniqueParticipants.push({
                phone: num,
                jid: p.id || `${num}@s.whatsapp.net`,
                isAdmin: p.admin === "admin" || p.admin === "superadmin",
              });
            }
          }
        }
      } catch (dbErr) {
        // ignore
      }
    }

    return {
      groupJid: resolvedJid,
      subject: resolvedSubject || "Target WhatsApp Group",
      count: uniqueParticipants.length,
      participants: uniqueParticipants,
    };
  }

  // Helper to ensure member report contains processedBy info for UI display
  populateTaskMemberReports(taskDoc) {
    if (!taskDoc || !taskDoc.members) return taskDoc;
    const sessionMap = {};
    for (const s of taskDoc.addingSessions || []) {
      sessionMap[s.sessionId] = s;
    }

    for (const m of taskDoc.members) {
      if (m.status === "pending") continue;
      const targetSessionId = m.processedBySessionId || m.assignedSessionId;
      const meta = sessionMap[targetSessionId];
      if (!m.processedByPhoneNumber && meta) {
        m.processedByPhoneNumber = meta.phoneNumber || "";
      }
      if (!m.processedByName && meta) {
        m.processedByName = meta.name || "";
      }
    }
    return taskDoc;
  }

  async listTasks(userId) {
    const tasks = await GroupMemberTask.find({ userId })
      .select("-members")
      .sort({ createdAt: -1 })
      .lean();
    return tasks;
  }

  async getTask(userId, taskId) {
    const task = await GroupMemberTask.findOne({ _id: taskId, userId }).lean();
    if (!task) throw new Error("Task not found.");
    return this.populateTaskMemberReports(task);
  }

  async deleteTask(userId, taskId) {
    this.stopTask(userId, taskId);
    return GroupMemberTask.findOneAndDelete({ _id: taskId, userId });
  }

  async resetFailedMembers(userId, taskId) {
    const task = await GroupMemberTask.findOne({ _id: taskId, userId });
    if (!task) throw new Error("Task not found.");

    for (const m of task.members) {
      if (m.status === "failed") {
        m.status = "pending";
        m.error = "";
      }
    }

    task.stats = {
      total: task.members.length,
      added: task.members.filter((m) => m.status === "added").length,
      invited: task.members.filter((m) => m.status === "invited").length,
      failed: task.members.filter((m) => m.status === "failed").length,
      pending: task.members.filter((m) => m.status === "pending").length,
    };

    if (task.status === "completed") {
      task.status = "draft";
    }
    task.lastError = "";
    await task.save();
    return task;
  }

  async startTask(userId, taskId) {
    const task = await GroupMemberTask.findOne({ _id: taskId, userId });
    if (!task) throw new Error("Task not found.");

    if (task.status === "running" && this.activeTasks.has(String(taskId))) {
      return task;
    }

    // Auto-reset failed members if there are no pending members remaining!
    const pendingCount = task.members.filter((m) => m.status === "pending").length;
    if (pendingCount === 0 && task.stats.failed > 0) {
      for (const m of task.members) {
        if (m.status === "failed") {
          m.status = "pending";
          m.error = "";
        }
      }
      task.stats = {
        total: task.members.length,
        added: task.members.filter((m) => m.status === "added").length,
        invited: task.members.filter((m) => m.status === "invited").length,
        failed: task.members.filter((m) => m.status === "failed").length,
        pending: task.members.filter((m) => m.status === "pending").length,
      };
    }

    // Evenly rotate pending members round-robin across all live connected addingSessions
    const liveSessions = [];
    for (const s of task.addingSessions || []) {
      if (WhatsAppService.isSessionWorking(s.sessionId)) {
        liveSessions.push(s);
      }
    }
    if (liveSessions.length === 0) {
      throw new Error(
        "Cannot start task: All WhatsApp sender accounts are currently disconnected. Please connect or scan your account in WhatsApp Accounts, then click Start / Resume."
      );
    }

    if (liveSessions.length > 0) {
      const liveSessionIds = new Set(liveSessions.map((s) => s.sessionId));
      const hasPreassignedLiveSessions = task.members.some(
        (m) => m.status === "pending" && m.assignedSessionId && liveSessionIds.has(m.assignedSessionId)
      );

      // Only rebalance pending members if existing assigned accounts are completely missing or offline
      if (!hasPreassignedLiveSessions) {
        const batchSz = Math.max(1, task.batchSize || 10);
        let liveIdx = 0;
        for (const m of task.members) {
          if (m.status === "pending") {
            let selectedSession;
            if (task.rotationMode === "batch-switch") {
              const sessionIdx = Math.floor(liveIdx / batchSz) % liveSessions.length;
              selectedSession = liveSessions[sessionIdx];
            } else {
              selectedSession = liveSessions[liveIdx % liveSessions.length];
            }
            if (selectedSession) {
              m.assignedSessionId = selectedSession.sessionId;
            }
            liveIdx++;
          }
        }
      }
    }

    task.status = "running";
    task.lastError = "";
    await task.save();

    const controlState = { abort: false };
    this.activeTasks.set(String(taskId), controlState);

    // Asynchronously run task loop in background
    this.runTaskLoop(task._id, controlState).catch((err) => {
      console.error(`[GroupMemberTask] Error in task ${taskId}:`, err);
    });

    return task;
  }

  async stopTask(userId, taskId) {
    const task = await GroupMemberTask.findOne({ _id: taskId, userId });
    if (!task) throw new Error("Task not found.");

    if (this.activeTasks.has(String(taskId))) {
      const controlState = this.activeTasks.get(String(taskId));
      controlState.abort = true;
      this.activeTasks.delete(String(taskId));
    }

    if (task.status === "running") {
      task.status = "paused";
      await task.save();
    }

    return task;
  }

  /**
   * Parse participant status returned by WhatsApp socket groupParticipantsUpdate.
   * Handles direct phone JIDs, modern WhatsApp LIDs, positional index mapping, and batch results.
   */
  parseParticipantResult(response, member, memberIndex = -1, batchTotal = -1) {
    if (!response) return null;
    const cleanPhone = String(member?.phone || "").replace(/\D/g, "");

    // Check if response is an array or has a participants array
    const items = Array.isArray(response)
      ? response
      : (Array.isArray(response?.participants) ? response.participants : null);

    if (items) {
      // 1. Direct phone or JID match
      for (const item of items) {
        if (!item) continue;
        const rawJid = String(item.jid || item.id || "");
        const rawPhone = rawJid.split("@")[0].split(":")[0].replace(/\D/g, "");
        const contentPhone = String(
          item.content?.attrs?.phone_number ||
          item.content?.attrs?.user ||
          item.phoneNumber ||
          ""
        ).replace(/\D/g, "");

        if (
          rawJid === member.jid ||
          (rawPhone && (rawPhone === cleanPhone || (cleanPhone.length >= 10 && rawPhone.endsWith(cleanPhone.slice(-10))))) ||
          (contentPhone && (contentPhone === cleanPhone || (cleanPhone.length >= 10 && contentPhone.endsWith(cleanPhone.slice(-10)))))
        ) {
          const rawStatus = item.status !== undefined ? item.status : item.code;
          return {
            status: rawStatus !== undefined && rawStatus !== null ? String(rawStatus) : "200",
            message: item.message || item.error || "",
            data: item,
          };
        }
      }

      // 2. 1-to-1 Positional index matching: WhatsApp returns items in exact same order as requested batch JIDs
      if (memberIndex >= 0 && memberIndex < items.length) {
        const item = items[memberIndex];
        if (item) {
          const rawStatus = item.status !== undefined ? item.status : item.code;
          return {
            status: rawStatus !== undefined && rawStatus !== null ? String(rawStatus) : "200",
            message: item.message || item.error || "",
            data: item,
          };
        }
      }

      // 3. Batch Success Fallback: If array exists and every item indicates success (200 / 207 or no error)
      if (items.length > 0) {
        const hasExplicitFailure = items.some((it) => {
          const s = String(it?.status !== undefined ? it.status : it?.code || "200");
          return s !== "200" && s !== "207";
        });
        if (!hasExplicitFailure) {
          return {
            status: "200",
            message: "",
            data: items[0],
          };
        }
      }

      return null;
    }

    // Check if response is a keyed object
    if (typeof response === "object") {
      for (const [key, val] of Object.entries(response)) {
        const rawPhone = String(key).split("@")[0].split(":")[0].replace(/\D/g, "");
        if (
          key === member.jid ||
          (rawPhone && (rawPhone === cleanPhone || (cleanPhone.length >= 10 && rawPhone.endsWith(cleanPhone.slice(-10)))))
        ) {
          if (typeof val === "object" && val !== null) {
            const rawStatus = val.status !== undefined ? val.status : val.code;
            return {
              status: rawStatus !== undefined && rawStatus !== null ? String(rawStatus) : "200",
              message: val.message || val.error || "",
              data: val,
            };
          }
          return {
            status: String(val),
            message: "",
            data: val,
          };
        }
      }

      if (response.status !== undefined) {
        return {
          status: String(response.status),
          message: response.message || response.error || "",
          data: response,
        };
      }
    }

    return null;
  }

  /**
   * Robustly check if a WhatsApp session is connected and ready.
   * Uses both authenticated user ID and live WebSocket OPEN readyState.
   * If already working, returns immediately without reconnecting.
   */
  async waitForSessionConnection(sessionId, maxWaitMs = 6000, isAborted = () => false) {
    if (WhatsAppService.isSessionWorking(sessionId)) {
      return WhatsAppService.getSocket(sessionId);
    }

    const start = Date.now();
    while (Date.now() - start < maxWaitMs) {
      if (isAborted()) return null;

      if (WhatsAppService.isSessionWorking(sessionId)) {
        return WhatsAppService.getSocket(sessionId);
      }

      // Attempt connect ONLY if socket is missing or not open
      try {
        const hasCreds = await WhatsAppService.validateSessionCredentials(sessionId);
        if (!hasCreds) {
          // No credentials exist for this session in Mongo, don't wait!
          return null;
        }
        if (!WhatsAppService.pendingReconnects.has(sessionId)) {
          console.log(`[GroupMemberTask] Session ${sessionId} not active in memory. Connecting session...`);
          WhatsAppService.connectSession(sessionId).catch(() => {});
        }
      } catch (dbErr) {
        // ignore
      }

      await new Promise((r) => setTimeout(r, 1000));
    }

    if (WhatsAppService.isSessionWorking(sessionId)) {
      return WhatsAppService.getSocket(sessionId);
    }

    return null;
  }

  async runTaskLoop(taskId, controlState) {
    const sleep = (ms) =>
      new Promise((resolve) => {
        const checkInterval = 250;
        let elapsed = 0;
        const interval = setInterval(() => {
          elapsed += checkInterval;
          if (controlState.abort || elapsed >= ms) {
            clearInterval(interval);
            resolve();
          }
        }, checkInterval);
      });

    console.log(`[GroupMemberTask] Starting execution loop for task ${taskId}`);

    let loopCounter = 0;
    let cachedExistingParticipants = null;
    let cachedInviteCode = null;

    // Pre-execution: Auto-join group via invite code/link if enabled & wait cooldown
    try {
      const initialTask = await GroupMemberTask.findById(taskId);
      if (!initialTask || initialTask.status !== "running") return;

      const inviteCode =
        initialTask.targetGroup?.inviteCode ||
        WhatsAppService.extractGroupInviteCode(initialTask.targetGroup?.inviteUrl);

      if (inviteCode) {
        cachedInviteCode = inviteCode;
      }

      if (
        initialTask.joinBeforeAdding !== false &&
        inviteCode &&
        !initialTask.hasJoinedViaInvite
      ) {
        console.log(`[GroupMemberTask] Pre-join initiated for task ${taskId} using invite code: ${inviteCode}`);

        let resolvedJid = initialTask.targetGroup?.jid;
        let resolvedSubject = initialTask.targetGroup?.subject;

        await GroupMemberTask.findByIdAndUpdate(taskId, {
          lastError: "Joining target group via invite link before adding members...",
        });

        for (const sessionObj of initialTask.addingSessions || []) {
          if (controlState.abort) break;
          const sId = sessionObj.sessionId;
          try {
            console.log(`[GroupMemberTask] Session ${sId} joining group via invite code ${inviteCode}...`);
            const joinedGid = await WhatsAppService.joinGroupViaInvite(sId, inviteCode);
            if (joinedGid) {
              resolvedJid = joinedGid;
            }
          } catch (joinErr) {
            console.warn(`[GroupMemberTask] Session ${sId} failed to join via invite: ${joinErr.message}`);
          }
        }

        // If targetGroup.jid is not known yet, try resolving from invite info
        if (!resolvedJid) {
          for (const sessionObj of initialTask.addingSessions || []) {
            try {
              const info = await WhatsAppService.getGroupInviteInfo(sessionObj.sessionId, inviteCode);
              if (info?.id) {
                resolvedJid = info.id;
                if (!resolvedSubject && info.subject) resolvedSubject = info.subject;
                break;
              }
            } catch (e) {}
          }
        }

        const waitSec = Math.max(5, Number(initialTask.joinWaitSeconds) || 30);
        console.log(`[GroupMemberTask] Target group joined. Waiting ${waitSec}s cooldown before adding members...`);

        await GroupMemberTask.findByIdAndUpdate(taskId, {
          ...(resolvedJid ? { "targetGroup.jid": resolvedJid } : {}),
          ...(resolvedSubject ? { "targetGroup.subject": resolvedSubject } : {}),
          hasJoinedViaInvite: true,
          lastError: `Joined group via invite link. Waiting ${waitSec}s cooldown before starting member additions...`,
        });

        await sleep(waitSec * 1000);

        if (controlState.abort) return;

        // Clear temporary status message
        await GroupMemberTask.findByIdAndUpdate(taskId, {
          lastError: "",
        });
      }
    } catch (preJoinErr) {
      console.error(`[GroupMemberTask] Pre-join error in task ${taskId}:`, preJoinErr);
    }

    while (!controlState.abort) {
      const task = await GroupMemberTask.findById(taskId);
      if (!task || task.status !== "running") break;

      // Ensure targetGroup.jid is valid before attempting member addition
      if (!task.targetGroup?.jid || !task.targetGroup.jid.includes("@")) {
        const inviteCode =
          cachedInviteCode ||
          task.targetGroup?.inviteCode ||
          WhatsAppService.extractGroupInviteCode(task.targetGroup?.inviteUrl);

        if (inviteCode) {
          cachedInviteCode = inviteCode;
          for (const s of task.addingSessions || []) {
            try {
              const info = await WhatsAppService.getGroupInviteInfo(s.sessionId, inviteCode);
              if (info?.id) {
                const cleanJid = info.id.includes("@") ? info.id : `${info.id}@g.us`;
                task.targetGroup.jid = cleanJid;
                if (!task.targetGroup.subject && info.subject) task.targetGroup.subject = info.subject;
                await GroupMemberTask.findByIdAndUpdate(taskId, {
                  "targetGroup.jid": cleanJid,
                  "targetGroup.subject": task.targetGroup.subject,
                });
                break;
              }
            } catch (e) {}
          }
        }
      }

      if (!task.targetGroup?.jid || !task.targetGroup.jid.includes("@")) {
        console.warn(`[GroupMemberTask] Target group JID could not be resolved for task ${taskId}. Pausing task.`);
        task.status = "paused";
        task.lastError = "Target group WhatsApp ID could not be resolved. Please make sure the account has joined the group or select the destination group from 'Select from My Groups'.";
        await task.save();
        this.activeTasks.delete(String(taskId));
        break;
      }

      // Pre-cache existing group participants to accurately auto-skip duplicates when skipExistingMembers is enabled
      if (task.skipExistingMembers !== false && !cachedExistingParticipants && task.targetGroup?.jid) {
        for (const s of task.addingSessions || []) {
          try {
            const meta = await WhatsAppService.getGroupMetadata(s.sessionId, task.targetGroup.jid);
            if (meta?.participants && Array.isArray(meta.participants)) {
              cachedExistingParticipants = new Set();
              for (const p of meta.participants) {
                const pPhone = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
                if (pPhone) {
                  cachedExistingParticipants.add(pPhone);
                  if (pPhone.length > 10) cachedExistingParticipants.add(pPhone.slice(-10));
                }
              }
              console.log(`[GroupMemberTask] Cached ${cachedExistingParticipants.size / 2} existing group participants.`);
              break;
            }
          } catch (metaErr) {
            // Can be resolved as accounts connect
          }
        }
      }

      const batchLimit = Math.max(1, Math.min(100, Number(task.membersPerBatch) || 2));
      const eligiblePending = [];

      for (const m of task.members) {
        if (m.status === "pending") {
          const cleanPhone = String(m.phone).replace(/\D/g, "");
          const isAlreadyInGroup =
            task.skipExistingMembers !== false &&
            cachedExistingParticipants &&
            (cachedExistingParticipants.has(cleanPhone) ||
              (cleanPhone.length > 10 && cachedExistingParticipants.has(cleanPhone.slice(-10))));

          if (isAlreadyInGroup) {
            console.log(`[GroupMemberTask] Precaution: Skipping ${m.phone} - already present in target group.`);
            m.status = "added";
            m.addedAt = new Date();
            m.error = "Already in group (auto-skipped).";
            continue;
          }

          eligiblePending.push(m);
        }
      }

      if (eligiblePending.length === 0) {
        // Sync stats before completing
        task.stats = this.computeStats(task.members);

        const anyRemaining = task.members.some((m) => m.status === "pending");
        if (!anyRemaining && !controlState.abort) {
          task.status = "completed";
          task.lastError = "";
          await task.save();
          this.activeTasks.delete(String(taskId));
          console.log(`[GroupMemberTask] Task ${taskId} completed successfully!`);
          break;
        }
        if (controlState.abort) break;
        await GroupMemberTask.updateOne(
          { _id: taskId, status: "running" },
          { $set: { members: task.members, stats: task.stats } }
        );
        continue;
      }

      const addingSessions = task.addingSessions || [];
      if (addingSessions.length === 0) {
        if (!controlState.abort) {
          task.status = "paused";
          task.lastError = "No WhatsApp accounts assigned to this task.";
          await task.save();
        }
        this.activeTasks.delete(String(taskId));
        break;
      }

      // Check account connection status: Ensure at least one account is active/reachable
      let reachableAccountFound = false;
      for (const s of addingSessions) {
        if (WhatsAppService.isSessionWorking(s.sessionId)) {
          reachableAccountFound = true;
          break;
        }
      }

      // If no session working in memory, attempt quick connection
      if (!reachableAccountFound) {
        for (const s of addingSessions) {
          const testSock = await this.waitForSessionConnection(s.sessionId, 2500, () => controlState.abort);
          if (testSock && testSock?.user?.id) {
            reachableAccountFound = true;
            break;
          }
        }
      }

      // If ALL accounts are disconnected, PAUSE the task immediately to protect pending queue
      if (!reachableAccountFound) {
        if (!controlState.abort) {
          console.warn(`[GroupMemberTask] All assigned accounts for task ${taskId} are disconnected. Pausing task.`);
          task.status = "paused";
          task.lastError = "All assigned WhatsApp accounts are disconnected. Task paused automatically to protect your member queue. Please reconnect or scan your account in WhatsApp Accounts, then click Resume.";
          await task.save();
        }
        this.activeTasks.delete(String(taskId));
        break;
      }

      const rotationMode = task.rotationMode || "round-robin";

      // Determine primary account rotation for this batch, honoring pre-assigned session quotas when present
      let primaryIdx = 0;
      if (rotationMode === "batch-switch") {
        const batchSz = Math.max(1, task.batchSize || 10);
        primaryIdx = Math.floor(loopCounter / batchSz) % addingSessions.length;
      } else {
        primaryIdx = loopCounter % addingSessions.length;
      }

      let primarySession = addingSessions[primaryIdx];
      let pendingMembers = eligiblePending
        .filter((m) => m.assignedSessionId === primarySession?.sessionId)
        .slice(0, batchLimit);

      // If the rotated slot has no pending members left (e.g., custom quotas finished for that account),
      // pick the next session in rotation that still has pending work assigned to it.
      if (pendingMembers.length === 0) {
        for (let offset = 1; offset < addingSessions.length; offset++) {
          const altIdx = (primaryIdx + offset) % addingSessions.length;
          const altSess = addingSessions[altIdx];
          const altMembers = eligiblePending
            .filter((m) => m.assignedSessionId === altSess?.sessionId)
            .slice(0, batchLimit);
          if (altMembers.length > 0) {
            primarySession = altSess;
            primaryIdx = altIdx;
            pendingMembers = altMembers;
            break;
          }
        }
      }

      // Fallback if remaining pending members have stale/removed assignedSessionId
      if (pendingMembers.length === 0) {
        pendingMembers = eligiblePending.slice(0, batchLimit);
      }

      const orderedCandidateSessions = [
        addingSessions[primaryIdx],
        ...addingSessions.filter((_, idx) => idx !== primaryIdx),
      ].filter(Boolean);

      let unresolvedMembers = [...pendingMembers];
      let memberErrors = new Map();
      let attemptedAccountsCount = 0;

      // Multi-Account Failover Loop: Try adding the batch with primary account, fallback to other accounts for restricted numbers
      for (let attempt = 0; attempt < orderedCandidateSessions.length; attempt++) {
        if (controlState.abort || unresolvedMembers.length === 0) break;
        const candidate = orderedCandidateSessions[attempt];
        const sId = candidate.sessionId;

        const sock = await this.waitForSessionConnection(sId, 2500, () => controlState.abort);
        if (!sock || !sock?.user?.id) {
          console.warn(`[GroupMemberTask] Account ${candidate.name || sId} is not connected. Skipping to next account...`);
          continue;
        }

        attemptedAccountsCount++;
        const activePhone = (sock.user?.id || "").split("@")[0].split(":")[0];
        const sName = candidate.name || "WhatsApp Account";
        const batchJids = unresolvedMembers.map((m) => m.jid);
        const phonesList = unresolvedMembers.map((m) => `+${m.phone}`).join(", ");

        try {
          console.log(
            `[GroupMemberTask] Batch adding [${phonesList}] (${unresolvedMembers.length} numbers) to ${task.targetGroup.jid} via ${sName} (+${activePhone}) [Candidate ${attempt + 1}/${orderedCandidateSessions.length}]`
          );

          await GroupMemberTask.findByIdAndUpdate(taskId, {
            lastError: `Adding batch of ${unresolvedMembers.length} number(s) (${phonesList}) via account ${sName} (+${activePhone})...`,
          });

          const response = await sock.groupParticipantsUpdate(
            task.targetGroup.jid,
            batchJids,
            "add"
          );

          console.log(`[GroupMemberTask] Raw WhatsApp response:`, JSON.stringify(response || []));

          // Post-addition live group participant verification from WhatsApp
          let latestParticipants = null;
          try {
            const meta = await sock.groupMetadata(task.targetGroup.jid);
            if (meta?.participants && Array.isArray(meta.participants)) {
              latestParticipants = new Set();
              for (const p of meta.participants) {
                const pPhone = String(p.phoneNumber || p.id || "").split("@")[0].split(":")[0].replace(/\D/g, "");
                if (pPhone) {
                  latestParticipants.add(pPhone);
                  if (pPhone.length > 10) latestParticipants.add(pPhone.slice(-10));
                }
              }
              if (!cachedExistingParticipants) cachedExistingParticipants = new Set();
              for (const num of latestParticipants) {
                cachedExistingParticipants.add(num);
              }
            }
          } catch (mErr) {
            // ignore
          }

          const newlyResolved = [];

          for (let mIdx = 0; mIdx < unresolvedMembers.length; mIdx++) {
            const m = unresolvedMembers[mIdx];
            const cleanPhone = String(m.phone).replace(/\D/g, "");

            // Check if member is verified inside the group in WhatsApp
            const isConfirmedInGroup =
              (latestParticipants && (latestParticipants.has(cleanPhone) || (cleanPhone.length > 10 && latestParticipants.has(cleanPhone.slice(-10))))) ||
              (cachedExistingParticipants && (cachedExistingParticipants.has(cleanPhone) || (cleanPhone.length > 10 && cachedExistingParticipants.has(cleanPhone.slice(-10)))));

            const parsed = this.parseParticipantResult(response, m, mIdx, unresolvedMembers.length);
            const statusCode = String(parsed?.status || (isConfirmedInGroup ? "200" : (response !== null && response !== undefined ? "200" : "unknown")));

            if (statusCode === "200" || statusCode === "207" || isConfirmedInGroup) {
              // Successfully added directly to group
              m.status = "added";
              m.addedAt = new Date();
              m.error = "";
              m.assignedSessionId = sId;
              m.processedBySessionId = sId;
              m.processedByName = sName;
              m.processedByPhoneNumber = activePhone;
              newlyResolved.push(m);

              const cPhone = String(m.phone).replace(/\D/g, "");
              if (cachedExistingParticipants) {
                cachedExistingParticipants.add(cPhone);
                if (cPhone.length > 10) cachedExistingParticipants.add(cPhone.slice(-10));
              }
            } else if (statusCode === "409") {
              // Already a member of the group
              m.status = "added";
              m.addedAt = new Date();
              m.error = "Already in group (status 409)";
              m.assignedSessionId = sId;
              m.processedBySessionId = sId;
              m.processedByName = sName;
              m.processedByPhoneNumber = activePhone;
              newlyResolved.push(m);

              const cPhone = String(m.phone).replace(/\D/g, "");
              if (cachedExistingParticipants) {
                cachedExistingParticipants.add(cPhone);
                if (cPhone.length > 10) cachedExistingParticipants.add(cPhone.slice(-10));
              }
            } else if (statusCode === "403" || statusCode === "408") {
              // Direct add restricted by privacy settings or requires invite code
              memberErrors.set(
                m.jid,
                "Privacy settings restrict direct group addition (Contact only allows contacts or invite links)."
              );
              console.warn(`[GroupMemberTask] Account ${sName} received privacy restriction (status ${statusCode}) for +${m.phone}`);
            } else if (statusCode === "401") {
              // Sender account is not group admin
              memberErrors.set(
                m.jid,
                `Sender account ${sName} is not a group admin or unauthorized to add members.`
              );
              console.warn(`[GroupMemberTask] Account ${sName} is not group admin (status 401).`);
            } else if (statusCode === "404") {
              memberErrors.set(m.jid, "Phone number is not registered on WhatsApp (Status 404).");
            } else if (statusCode === "429") {
              memberErrors.set(m.jid, `WhatsApp temporary rate-limit triggered for account ${sName}.`);
            } else {
              memberErrors.set(
                m.jid,
                parsed?.message || (statusCode !== "unknown" ? `WhatsApp status code ${statusCode}` : "No confirmation received from WhatsApp for this number.")
              );
            }
          }

          unresolvedMembers = unresolvedMembers.filter((m) => !newlyResolved.includes(m));
        } catch (batchErr) {
          console.warn(`[GroupMemberTask] Batch add attempt failed for account ${sName}:`, batchErr.message);
          for (const m of unresolvedMembers) {
            memberErrors.set(m.jid, `Request failed via account ${sName}: ${batchErr.message || "Connection error"}`);
          }
          continue;
        }
      }

      // Handle any members that could not be added directly across all candidate accounts
      if (unresolvedMembers.length > 0) {
        // If not a single account could even be attempted because all disconnected during loop:
        if (attemptedAccountsCount === 0) {
          if (!controlState.abort) {
            console.warn(`[GroupMemberTask] No accounts reachable for batch in task ${taskId}. Pausing task.`);
            task.status = "paused";
            task.lastError = "Assigned WhatsApp accounts became disconnected during execution. Task paused to protect member queue.";
            await task.save();
          }
          this.activeTasks.delete(String(taskId));
          break;
        }

        // Attempt group invite link DM fallback if enabled
        let effectiveInviteCode =
          cachedInviteCode ||
          task.targetGroup?.inviteCode ||
          WhatsAppService.extractGroupInviteCode(task.targetGroup?.inviteUrl);

        if (!effectiveInviteCode && task.targetGroup?.jid && task.autoSendInviteLink) {
          for (const s of orderedCandidateSessions) {
            const liveSock = WhatsAppService.getSocket(s.sessionId);
            if (liveSock && WhatsAppService.isSessionWorking(s.sessionId)) {
              try {
                effectiveInviteCode = await liveSock.groupInviteCode(task.targetGroup.jid);
                if (effectiveInviteCode) {
                  cachedInviteCode = effectiveInviteCode;
                  break;
                }
              } catch (e) {}
            }
          }
        }

        const fallbackSession = orderedCandidateSessions[0] || addingSessions[0];
        for (const m of unresolvedMembers) {
          m.assignedSessionId = fallbackSession?.sessionId || m.assignedSessionId;
          m.processedBySessionId = fallbackSession?.sessionId || m.assignedSessionId;
          m.processedByName = fallbackSession?.name || "WhatsApp Account";
          m.processedByPhoneNumber = fallbackSession?.phoneNumber || "";

          let sentInvite = false;
          if (task.autoSendInviteLink && effectiveInviteCode) {
            for (const candidateSess of orderedCandidateSessions) {
              const liveSock = WhatsAppService.getSocket(candidateSess.sessionId);
              if (liveSock && WhatsAppService.isSessionWorking(candidateSess.sessionId)) {
                try {
                  const inviteUrl = `https://chat.whatsapp.com/${effectiveInviteCode}`;
                  await liveSock.sendMessage(m.jid, {
                    text: `Hello! You've been invited to join our WhatsApp group: ${inviteUrl}`,
                  });
                  sentInvite = true;
                  m.status = "invited";
                  m.addedAt = new Date();
                  m.error = "Privacy restricted: Group invite link sent via DM.";
                  m.processedBySessionId = candidateSess.sessionId;
                  m.processedByName = candidateSess.name;
                  m.processedByPhoneNumber = (liveSock.user?.id || "").split("@")[0].split(":")[0];
                  break;
                } catch (dmErr) {
                  console.warn(`[GroupMemberTask] Failed to send invite DM to +${m.phone} via ${candidateSess.name}:`, dmErr.message);
                }
              }
            }
          }

          if (!sentInvite) {
            m.status = "failed";
            m.error =
              memberErrors.get(m.jid) ||
              "Direct add restricted by WhatsApp (Contact's privacy settings restrict group additions or account is not admin).";
          }
        }
      }

      // Recompute stats directly from task.members to ensure 100% precision
      task.stats = this.computeStats(task.members);

      if (controlState.abort) break;

      const saveRes = await GroupMemberTask.updateOne(
        { _id: taskId, status: "running" },
        {
          $set: {
            members: task.members,
            stats: task.stats,
          },
        }
      );
      if (saveRes.matchedCount === 0) {
        // Task was paused, edited, or deleted concurrently
        break;
      }
      loopCounter++;

      // Anti-Ban Precaution 1: Periodic batch rest cooldown
      const batchSize = Math.max(1, task.batchSize || 10);
      const batchCooldownSec = Math.max(5, task.batchCooldownSeconds || 25);
      if (loopCounter > 0 && loopCounter % batchSize === 0) {
        console.log(`[GroupMemberTask] Anti-ban safety cooldown: Pausing task ${taskId} for ${batchCooldownSec}s after ${loopCounter} batches...`);
        await GroupMemberTask.findByIdAndUpdate(taskId, {
          lastError: `Safety rest break: Cooling down accounts for ${batchCooldownSec}s (completed ${loopCounter} batches)...`,
        });
        await sleep(batchCooldownSec * 1000);
        if (controlState.abort) break;
      }

      // Anti-Ban Precaution 2: Randomized Jitter Pacing Delay
      const minDelay = Math.max(2, Number(task.delaySeconds) || 8);
      const maxDelay = Math.max(minDelay, Number(task.delayMaxSeconds) || (minDelay + 6));
      const jitterSec = Math.floor(Math.random() * (maxDelay - minDelay + 1)) + minDelay;
      console.log(`[GroupMemberTask] Anti-ban jitter pacing: Waiting ${jitterSec}s before next batch addition...`);
      await GroupMemberTask.findByIdAndUpdate(taskId, {
        lastError: `Anti-ban jitter pacing: Waiting ${jitterSec}s before processing next batch...`,
      });
      await sleep(jitterSec * 1000);
    }

    if (controlState.abort) {
      console.log(`[GroupMemberTask] Task ${taskId} stopped by user.`);
    }
  }
}

export default new GroupMemberTaskService();
