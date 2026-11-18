import { WhatsAppSession, WhatsAppGroup } from "../models/index.js";
import WhatsAppService from "../services/WhatsAppService.js";
import groupSyncService from "../services/GroupSyncService.js";
import mongoose from "mongoose";
import SubscriptionService from "../services/SubscriptionService.js";
import { sendSubscriptionError } from "../utils/subscription.js";

export const createSession = async (req, res) => {
  try {
    const {
      name,
      enableChatView = false,
      chatPasscode = "",
      requirePasscode = false,
    } = req.body;

    if (!name || !String(name).trim()) {
      return res.status(400).json({ error: "Session name is required" });
    }

    const trimmedPasscode = String(chatPasscode || "").trim();
    if ((requirePasscode || trimmedPasscode.length > 0) && trimmedPasscode.length < 4) {
      return res
        .status(400)
        .json({ error: "Optional chat passcode must be at least 4 characters when enabled" });
    }

    await SubscriptionService.assertResourceLimit(req.user, "sessions", 1);

    console.log("Creating session for user:", req.user?._id, "name:", name);
    const result = await WhatsAppService.createSession(req.user._id, String(name).trim(), {
      enableChatView: !!enableChatView,
      chatPasscode: trimmedPasscode,
    });

    res.status(201).json(result);
  } catch (err) {
    console.error("Create session error:", err);
    return sendSubscriptionError(res, err, "Failed to create session");
  }
};

export const listSessions = async (req, res) => {
  try {
    const includePending = req.query.includePending === "true" || req.query.includePending === "1";
    const filter = includePending
      ? { userId: req.user._id }
      : {
          userId: req.user._id,
          $or: [
            { isLinked: true },
            { phoneNumber: { $nin: ["", null] } },
            { lastConnected: { $ne: null } },
          ],
        };

    const sessions = await WhatsAppSession.find(filter)
      .select("-credentials")
      .sort({ createdAt: -1 });

    const sessionsWithStatus = sessions.map((session) => {
      const liveSession = WhatsAppService.getLiveSessionSnapshot(session);
      const isLinked = !!(session.isLinked || liveSession?.phoneNumber || session.phoneNumber || session.lastConnected);

      return {
        _id: session._id,
        sessionId: session.sessionId,
        name: session.name,
        status: liveSession?.status || session.status,
        phone: liveSession?.phoneNumber || session.phoneNumber,
        phoneNumber: liveSession?.phoneNumber || session.phoneNumber,
        isLinked,
        chatViewEnabled: !!session.chatViewEnabled,
        lastConnected: liveSession?.lastConnected || session.lastConnected,
        lastError: liveSession?.lastError || session.lastError || "",
        createdAt: session.createdAt,
      };
    });

    res.json({ success: true, data: sessionsWithStatus });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    }).select("-credentials");

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const liveSession = WhatsAppService.getLiveSessionSnapshot(session);
    const pendingQr = WhatsAppService.getPendingQR(id);
    const isLinked = !!(session.isLinked || liveSession?.phoneNumber || session.phoneNumber || session.lastConnected);

    res.json({
      sessionId: session.sessionId,
      name: session.name,
      status: liveSession?.status || session.status,
      phone: liveSession?.phoneNumber || session.phoneNumber,
      phoneNumber: liveSession?.phoneNumber || session.phoneNumber,
      isLinked,
      qr: pendingQr || null,
      chatViewEnabled: !!session.chatViewEnabled,
      lastConnected: liveSession?.lastConnected || session.lastConnected,
      lastError: liveSession?.lastError || session.lastError || "",
      createdAt: session.createdAt,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await WhatsAppService.deleteSession(id);

    res.json({
      success: true,
      message: "Session deleted and loaded chats, messages, and groups cleared.",
      deletedCounts: result?.deletedCounts || {},
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const bulkDeleteSessions = async (req, res) => {
  try {
    const { sessionIds } = req.body;
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ success: false, error: "No sessionIds provided" });
    }

    const sessions = await WhatsAppSession.find({
      sessionId: { $in: sessionIds },
      userId: req.user._id,
    });

    const deletedIds = [];
    for (const session of sessions) {
      try {
        await WhatsAppService.deleteSession(session.sessionId);
        deletedIds.push(session.sessionId);
      } catch (err) {
        console.error(`Failed to delete session ${session.sessionId}:`, err);
      }
    }

    res.json({
      success: true,
      message: `Deleted ${deletedIds.length} session(s) and cleared their loaded chats, messages, and groups.`,
      count: deletedIds.length,
      deletedIds,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getSessionQR = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // If session is ALREADY connected and working, never reconnect or prompt for QR!
    if (WhatsAppService.isSessionWorking(id)) {
      return res.json({
        connected: true,
        status: "connected",
        message: "Session is already connected and working",
      });
    }

    const fresh = req.query.fresh === "1" || req.query.fresh === "true";

    // Try to get QR code immediately unless fresh reset requested
    let qrCode = fresh ? null : WhatsAppService.getPendingQR(id);

    // Trigger on-demand QR connection (resets auto-retry exhaustion counters)
    if (!qrCode && !WhatsAppService.isSessionWorking(id)) {
      WhatsAppService.connectForQR(id, { fresh }).catch(() => {});
    }

    // Wait for QR code or spontaneous connection (max 20 seconds for slow handshakes)
    if (!qrCode) {
      const maxWaitTime = 20000;
      const checkInterval = 200;
      let waited = 0;

      while (!qrCode && waited < maxWaitTime) {
        if (WhatsAppService.isSessionWorking(id)) {
          const liveSnapshot = WhatsAppService.getLiveSessionSnapshot(session);
          return res.json({
            connected: true,
            status: "connected",
            session: liveSnapshot,
            message: "Session connected automatically",
          });
        }
        await new Promise((resolve) => setTimeout(resolve, checkInterval));
        waited += checkInterval;
        qrCode = WhatsAppService.getPendingQR(id);
      }
    }

    if (!qrCode) {
      return res.status(404).json({ error: "QR code not available" });
    }

    res.json({ qr: qrCode, sessionId: id });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const reconnectSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // NEVER reconnect a session that is already working and connected!
    if (WhatsAppService.isSessionWorking(id)) {
      return res.json({
        success: true,
        status: "connected",
        alreadyWorking: true,
        message: "Session is already connected and working.",
      });
    }

    const result = await WhatsAppService.connectSession(id, { manual: true });

    res.json({
      success: true,
      status: result?.status || "connecting",
      needsPairing: !!result?.needsPairing,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const reconnectAllSessions = async (req, res) => {
  try {
    const sessions = await WhatsAppSession.find({
      userId: req.user._id,
    }).lean();

    const results = await WhatsAppService.connectSessions(
      sessions.map((s) => s.sessionId)
    );

    res.json({ success: true, count: results.length, data: results });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

export const getPairingCode = async (req, res) => {
  try {
    const { id } = req.params;
    let { phoneNumber } = req.body;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!phoneNumber) {
      return res.status(400).json({ error: "Phone number is required" });
    }

    // Clean phone number: remove '+' and any non-digit characters
    phoneNumber = String(phoneNumber).replace(/\D/g, "");

    const code = await WhatsAppService.requestPairingCode(id, phoneNumber);
    res.json({ success: true, code });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const logoutSession = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await WhatsAppService.logoutSession(id);

    res.json({
      success: true,
      message: "WhatsApp account disconnected and loaded chats, messages, and groups cleared.",
      deletedCounts: result?.deletedCounts || {},
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const getSessionGroups = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const { search, page, limit, sort, light, force, refresh } = req.query;

    // If manual refresh requested via query parameter
    if (force === "true" || refresh === "true") {
      try {
        await WhatsAppService.syncSessionGroups(id, { prune: true });
      } catch (syncErr) {
        console.warn(`[GET GROUPS] Manual sync failed for ${id}:`, syncErr.message);
      }
    }

    // High-speed read from MongoDB
    let result = await groupSyncService.getGroups(id, req.user._id, {
      search,
      page,
      limit,
      sort,
      light,
    });

    // Auto-sync fallback: if 0 groups in DB and session is connected, run initial sync once
    if (result.total === 0 && !search && session.status === "connected") {
      try {
        await WhatsAppService.syncSessionGroups(id, { prune: true });
        result = await groupSyncService.getGroups(id, req.user._id, {
          search,
          page,
          limit,
          sort,
          light,
        });
      } catch (autoSyncErr) {
        console.warn(`[GET GROUPS] Auto-sync fallback failed for ${id}:`, autoSyncErr.message);
      }
    }

    res.json({
      success: true,
      data: result.groups,
      total: result.total,
      totalMembers: result.totalMembers || 0,
      adminCount: result.adminCount || 0,
      page: result.page,
      limit: result.limit,
      hasMore: result.hasMore,
      syncStatus: session.groupSyncStatus,
      lastSyncedAt: session.lastGroupSyncAt,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const syncSessionGroups = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const syncResult = await WhatsAppService.syncSessionGroups(id, { prune: true });
    const groups = await WhatsAppGroup.find({ sessionId: id, userId: req.user._id })
      .sort({ participantCount: -1 })
      .lean();

    const mapped = groups.map((g) => ({
      ...g,
      id: g.jid,
    }));

    const totalMembers = groups.reduce((acc, g) => acc + (g.participantCount || 0), 0);
    const adminCount = groups.filter((g) => g.isMeAdmin).length;

    res.json({
      success: true,
      message: "Groups synchronized successfully from WhatsApp",
      count: syncResult.count,
      total: groups.length,
      totalMembers,
      adminCount,
      data: mapped,
      lastSyncedAt: new Date(),
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const getGroupMetadata = async (req, res) => {
  try {
    const { id, groupId } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const sock = WhatsAppService.getSocket ? WhatsAppService.getSocket(id) : null;
    const metadata = await groupSyncService.getGroupMetadata(id, req.user._id, groupId, sock);

    if (!metadata) {
      return res.status(404).json({ success: false, error: "Group not found" });
    }

    res.json({ success: true, data: metadata });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const getGroupInviteLink = async (req, res) => {
  try {
    const { id, groupId } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    // 1. Check if inviteCode is already stored in MongoDB
    const cachedGroup = await WhatsAppGroup.findOne({ sessionId: id, jid: groupId }).select("inviteCode").lean();
    if (cachedGroup?.inviteCode) {
      return res.json({
        success: true,
        inviteCode: cachedGroup.inviteCode,
        link: `https://chat.whatsapp.com/${cachedGroup.inviteCode}`,
      });
    }

    // 2. Fallback to Baileys socket
    const link = await WhatsAppService.getGroupInviteLink(id, groupId);
    const code = WhatsAppService.extractGroupInviteCode(link);
    if (code) {
      await WhatsAppGroup.updateOne(
        { sessionId: id, jid: groupId },
        { $set: { inviteCode: code } }
      ).catch(() => {});
    }
    res.json({ success: true, inviteCode: code, link });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const getCommonMembers = async (req, res) => {
  try {
    const { id } = req.params;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    const result = await groupSyncService.getCommonMembers(id, req.user._id, req.query);
    res.json(result);
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const createGroups = async (req, res) => {
  try {
    const { id } = req.params;
    let { 
      subjects, 
      participants, 
      editGroupSettings, 
      sendNewMessages, 
      addOtherMembers, 
      sendMessageHistory, 
      inviteViaLink, 
      approveNewMembers 
    } = req.body;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    });

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!subjects || (Array.isArray(subjects) && subjects.length === 0)) {
      return res.status(400).json({ error: "At least one group subject is required" });
    }

    if (!Array.isArray(subjects)) {
      subjects = [subjects];
    }

    let participantJids = [];
    if (participants) {
      const parts = Array.isArray(participants)
        ? participants
        : String(participants).split(",").map(p => p.trim()).filter(Boolean);

      participantJids = parts.map(p => {
        const clean = p.replace(/\D/g, "");
        return clean ? `${clean}@s.whatsapp.net` : null;
      }).filter(Boolean);
    }

    const options = {
      editGroupSettings: editGroupSettings !== false,
      sendNewMessages: sendNewMessages !== false,
      memberAddMode: addOtherMembers === false ? "admin_add" : "all_member_add",
      joinApprovalMode: approveNewMembers === true ? "on" : "off",
      sendMessageHistory: sendMessageHistory !== false,
      inviteViaLink: inviteViaLink !== false,
    };

    const createdGroups = [];
    const errors = [];

    for (const subject of subjects) {
      try {
        const group = await WhatsAppService.createGroup(id, subject.trim(), participantJids, options);
        createdGroups.push({
          subject,
          id: group.id,
          participants: group.participants,
        });
      } catch (err) {
        console.error(`Failed to create group ${subject}:`, err.message);
        errors.push({
          subject,
          error: err.message,
        });
      }
    }

    res.json({
      success: true,
      created: createdGroups,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (err) {
    res.status(400).json({ success: false, error: err.message });
  }
};

export const createMultiAccountGroups = async (req, res) => {
  try {
    const {
      sessionIds,
      subjects,
      participants,
      maxMembersPerGroup = 100,
      editGroupSettings,
      sendNewMessages,
      addOtherMembers,
      sendMessageHistory,
      inviteViaLink,
      approveNewMembers,
    } = req.body;

    if (!sessionIds || !Array.isArray(sessionIds) || sessionIds.length === 0) {
      return res.status(400).json({ error: "At least one connected WhatsApp session must be selected" });
    }

    if (!subjects || (Array.isArray(subjects) && subjects.length === 0)) {
      return res.status(400).json({ error: "At least one group subject is required" });
    }

    const uniqueSessionIds = [...new Set(sessionIds.map((s) => String(s || "").trim()).filter(Boolean))];
    if (uniqueSessionIds.length === 0) {
      return res.status(400).json({ error: "Valid sessionIds are required" });
    }

    const ownedSessions = await WhatsAppSession.find({
      sessionId: { $in: uniqueSessionIds },
      userId: req.user._id,
    })
      .select("sessionId")
      .lean();

    if (ownedSessions.length !== uniqueSessionIds.length) {
      return res.status(404).json({ error: "One or more selected sessions were not found" });
    }

    const options = {
      editGroupSettings: editGroupSettings !== false,
      sendNewMessages: sendNewMessages !== false,
      memberAddMode: addOtherMembers === false ? "admin_add" : "all_member_add",
      joinApprovalMode: approveNewMembers === true ? "on" : "off",
      sendMessageHistory: sendMessageHistory !== false,
      inviteViaLink: inviteViaLink !== false,
    };

    const result = await WhatsAppService.createMultiAccountGroups(
      uniqueSessionIds,
      subjects,
      participants,
      maxMembersPerGroup,
      options
    );

    res.json(result);
  } catch (err) {
    console.error("createMultiAccountGroups error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

export const addGroupParticipants = async (req, res) => {
  try {
    const { id, groupId } = req.params;
    const { participants } = req.body;

    const session = await WhatsAppSession.findOne({
      sessionId: id,
      userId: req.user._id,
    }).lean();

    if (!session) {
      return res.status(404).json({ error: "Session not found" });
    }

    if (!groupId) {
      return res.status(400).json({ error: "Group ID is required" });
    }

    if (!participants || (Array.isArray(participants) && participants.length === 0)) {
      return res.status(400).json({ error: "At least one participant phone number is required" });
    }

    const result = await WhatsAppService.addParticipantsToGroup(id, groupId, participants);
    res.json(result);
  } catch (err) {
    console.error("addGroupParticipants error:", err);
    res.status(400).json({ success: false, error: err.message });
  }
};

export default {
  createSession,
  listSessions,
  getSession,
  getSessionQR,
  deleteSession,
  bulkDeleteSessions,
  logoutSession,
  reconnectSession,
  reconnectAllSessions,
  getPairingCode,
  getSessionGroups,
  syncSessionGroups,
  getGroupMetadata,
  getGroupInviteLink,
  getCommonMembers,
  createGroups,
  createMultiAccountGroups,
  addGroupParticipants,
};

