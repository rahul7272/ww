import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  Browsers,
  downloadMediaMessage,
  jidNormalizedUser,
  getUrlInfo,
  extractUrlFromText,
  generateWAMessageFromContent,
  proto,
} from "@whiskeysockets/baileys";
import { generateRichLinkPreview } from "../utils/linkPreviewHelper.js";
import { findMatchingCrmRecords } from "../utils/crmChatLink.js";
import { processIncomingMediaMessage } from "../utils/mediaSettingsHelper.js";
import NodeCache from "node-cache";
import bcrypt from "bcryptjs";
import { useMongoAuthState } from "../utils/mongoAuthState.js";
import {
  markSessionDeactivated,
  clearSessionDeactivated,
  isSessionWriteAllowed,
  cleanupUnusedChatMediaUrls,
} from "../utils/sessionLifecycle.js";
import { Boom } from "@hapi/boom";
import mongoose from "mongoose";
import * as qrcode from "qrcode";
import {
  writeFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  readFileSync,
  statSync,
} from "fs";
import { join, dirname, basename } from "path";
import { fileURLToPath } from "url";
import {
  WhatsAppSession as SessionModel,
  Message,
  WaChat,
  WaChatMessage,
  WaContact,
  WaChatNote,
  WaChatReminder,
  WhatsAppAuthState,
  CrmContact,
  WhatsAppGroup,
} from "../models/index.js";
import groupSyncService from "./GroupSyncService.js";
import chatSyncService from "./ChatSyncService.js";
import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import { handleIncomingMessage } from "./AiAgentService.js";
import { executeFlowOnMessage } from "../controllers/flowExecutionController.js";
import dripService from "./DripService.js";
import { evaluateInboundMessage } from "./whatsappAutomationService.js";
import { isMetaAiJid, META_AI_NORMALIZED_JID, resolveMetaAiBot } from "./MetaAiService.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SESSIONS_DIR =
  process.env.SESSIONS_DIR ||
  (existsSync(join(__dirname, "..", "..", "wa-sessions"))
    ? join(__dirname, "..", "..", "wa-sessions")
    : join(__dirname, "..", "wa-sessions"));

if (!existsSync(SESSIONS_DIR)) {
  try {
    mkdirSync(SESSIONS_DIR, { recursive: true });
  } catch (_) { }
}

/**
 * WhatsApp Service with reconnect storm prevention
 *
 * Features implemented to prevent reconnect loops:
 * 1. Reconnect Cooldown: 15-second minimum between reconnects per session
 * 2. Retry Limit: Maximum 5 reconnect attempts before pausing
 * 3. 515 Error Handling: 5-second delayed restart for stream errors (was 2s)
 * 4. Single Socket Enforcement: Prevents duplicate socket creation per session
 * 5. Active Socket Tracking: Uses activeSockets Set to track live connections
 * 6. Exponential Backoff: Gradual increase in reconnect delays (base * 1.5^attempts)
 * 7. Proper Cleanup: removeSocket() method cleans up all tracking maps/sets
 *
 * These features eliminate the "reconnect storm" where 515 errors cause
 * immediate reconnection attempts, creating instability loops.
 */
/**
 * Concurrently resolves WhatsApp LID-based identifiers to legacy phone-number-based JIDs (PNs)
 * in cooperative micro-batches so the Node.js event loop is never blocked.
 */
async function resolveGroupParticipantsLids(sock, participants) {
  if (!participants || !Array.isArray(participants) || !sock) return;

  // Extract unique LIDs that do not already have phone numbers resolved
  const lidsToResolve = [...new Set(
    participants
      .filter(p => p.id && p.id.endsWith('@lid') && !p.phoneNumber)
      .map(p => p.id)
  )];

  if (lidsToResolve.length === 0) return;

  const resolvedMappings = {};
  const BATCH_SIZE = 25;

  for (let i = 0; i < lidsToResolve.length; i += BATCH_SIZE) {
    const chunk = lidsToResolve.slice(i, i + BATCH_SIZE);
    await Promise.all(
      chunk.map(async (lid) => {
        try {
          const pnJid = await sock.signalRepository?.lidMapping?.getPNForLID(lid);
          if (pnJid) {
            resolvedMappings[lid] = pnJid;
          }
        } catch (err) {
          // Ignore individual LID mapping misses
        }
      })
    );
    // Yield to the Node.js event loop between batches so WebSocket pings/pongs are never delayed
    if (i + BATCH_SIZE < lidsToResolve.length) {
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  for (const p of participants) {
    if (p.id && resolvedMappings[p.id]) {
      p.phoneNumber = resolvedMappings[p.id];
    }
  }
}

async function waitForSocketOpenWithTimeout(sock, timeoutMs = 8000) {
  if (!sock) {
    throw new Error("Socket connection not found.");
  }
  const ws = sock.ws;
  const isOpen = ws ? (ws.isOpen ?? (ws.readyState === 1 || ws.socket?.readyState === 1)) : false;
  if (isOpen) {
    return;
  }
  if (typeof sock.waitForSocketOpen !== "function") {
    return;
  }
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error("Timeout waiting for WhatsApp connection. Please verify your phone is connected and active."));
    }, timeoutMs);
  });
  try {
    await Promise.race([
      sock.waitForSocketOpen(),
      timeoutPromise
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

class WhatsAppService {
  constructor() {
    this.sockets = new Map();
    this.io = null;
    this.pendingQRCodes = new Map();
    this.reconnectAttempts = new Map();
    this.pendingReconnects = new Set();
    this.reconnectTimers = new Map(); // Active auto-retry setTimeout handles per session
    this.heartbeats = new Map();
    this.reconnectCooldown = new Map(); // Tracks last reconnect time per session
    this.activeSockets = new Set(); // Tracks currently active socket connections
    this.taskQueues = new Map(); // Per-session serialized execution queue
    this.queueDepths = new Map(); // Per-session active pending queue depth counter
    this.MAX_SESSION_QUEUE_DEPTH = parseInt(process.env.MAX_SESSION_QUEUE_DEPTH, 10) || 200;
    this.messageCache = new Map(); // Recent message proto cache for getMessage (bounded size 1000)

    // Telemetry & Backpressure Counters (Phase 3 - Task 3.1)
    this.rejectedTasksCount = 0; // Tracks task rejections due to bounded queue saturation (HTTP 429)
    this.expiredTasksCount = 0; // Tracks tasks discarded due to queue TTL expiration
    this.totalEnqueuedTasks = 0; // Total lifetime enqueued socket tasks

    this.MAX_AUTO_RECONNECT_ATTEMPTS = 2;
    this.cachedWaVersion = null;
    this.cachedWaVersionAt = 0;

    // High-performance group metadata cache (5 minutes TTL, useClones: false to eliminate memory/CPU overhead)
    this.groupCache = new NodeCache({
      stdTTL: 5 * 60, // 300 seconds (5 minutes)
      useClones: false,
    });

    this.isRestoring = false; // Prevents concurrent boot restore collisions

    if (!existsSync(SESSIONS_DIR)) mkdirSync(SESSIONS_DIR, { recursive: true });
    this.startAutoReconnectWatchdog();
  }

  /**
   * Returns current pending task count queued for a session
   */
  getQueueDepth(sessionId) {
    return this.queueDepths.get(sessionId) || 0;
  }

  /**
   * Returns aggregated queue telemetry and backpressure capacity metrics across all sessions (Phase 3 - Task 3.1)
   */
  getQueueStats() {
    const queueDepthsBySession = {};
    let totalQueuedTasks = 0;
    for (const [sessionId, depth] of this.queueDepths.entries()) {
      if (depth > 0) {
        queueDepthsBySession[sessionId] = depth;
        totalQueuedTasks += depth;
      }
    }

    return {
      totalQueuedTasks,
      maxPerSessionCapacity: this.MAX_SESSION_QUEUE_DEPTH,
      activeQueuesCount: Object.keys(queueDepthsBySession).length,
      sessionDepths: queueDepthsBySession,
      rejectedTasksCount: this.rejectedTasksCount || 0,
      expiredTasksCount: this.expiredTasksCount || 0,
      totalEnqueuedTasks: this.totalEnqueuedTasks || 0,
    };
  }

  /**
   * Enqueues an async task (e.g. sending message) on a specific session's socket.
   * Ensures tasks execute sequentially with adaptive micro-delay to prevent socket 515/428 stream errors.
   * Enforces bounded queue capacity and task expiration deadlines (TTL).
   */
  async enqueueSessionTask(sessionId, taskFn, minDelayMs = 150, options = {}) {
    const currentDepth = this.queueDepths.get(sessionId) || 0;
    if (currentDepth >= this.MAX_SESSION_QUEUE_DEPTH) {
      this.rejectedTasksCount = (this.rejectedTasksCount || 0) + 1;
      const err = new Error(
        `Session queue saturated (${currentDepth}/${this.MAX_SESSION_QUEUE_DEPTH} pending). Please retry shortly.`
      );
      err.status = 429;
      err.code = "QUEUE_FULL";
      err.retryAfter = 5;
      throw err;
    }

    this.totalEnqueuedTasks = (this.totalEnqueuedTasks || 0) + 1;

    // Increment pending queue depth
    this.queueDepths.set(sessionId, currentDepth + 1);

    const expiresAt = options?.ttlMs ? Date.now() + options.ttlMs : (options?.expiresAt || null);

    const prevPromise = this.taskQueues.get(sessionId) || Promise.resolve();

    let taskResultPromise;
    const nextPromise = prevPromise
      .catch(() => { }) // Don't let previous failures break subsequent tasks
      .then(async () => {
        if (expiresAt && Date.now() > expiresAt) {
          this.expiredTasksCount = (this.expiredTasksCount || 0) + 1;
          const timeoutErr = new Error("Task expired in queue before delivery");
          timeoutErr.code = "QUEUE_TIMEOUT";
          throw timeoutErr;
        }
        const result = await taskFn();
        if (minDelayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, minDelayMs));
        }
        return result;
      });

    this.taskQueues.set(sessionId, nextPromise);

    // Clean up queue entry and decrement depth when done
    nextPromise.finally(() => {
      const depth = this.queueDepths.get(sessionId) || 1;
      if (depth <= 1) {
        this.queueDepths.delete(sessionId);
      } else {
        this.queueDepths.set(sessionId, depth - 1);
      }

      if (this.taskQueues.get(sessionId) === nextPromise) {
        this.taskQueues.delete(sessionId);
      }
    });

    return nextPromise;
  }

  setSocketIO(io) {
    this.io = io;
  }

  clearHeartbeat(sessionId) {
    const t = this.heartbeats.get(sessionId);
    if (t) clearInterval(t);
    this.heartbeats.delete(sessionId);
  }

  clearReconnectTimer(sessionId) {
    const timer = this.reconnectTimers.get(sessionId);
    if (timer) clearTimeout(timer);
    this.reconnectTimers.delete(sessionId);
  }

  /**
   * Deletes all loaded/synced WhatsApp chats, messages, contacts, notes, reminders,
   * and participating groups for a session (plus downloaded chat media files),
   * while leaving unrelated campaigns, templates, billing, or other sessions intact.
   */
  async clearSessionLoadedData(sessionId, options = {}) {
    if (!sessionId) {
      return { success: false, deletedCounts: {} };
    }
    const {
      resetSyncMeta = false,
      reason = "cleared",
      userId: knownUserId = null,
    } = options;

    let sessionUserId = knownUserId;
    if (!sessionUserId) {
      const sessionDoc = await SessionModel.findOne({ sessionId }).select("userId").lean().catch(() => null);
      sessionUserId = sessionDoc?.userId || null;
    }

    // 1. Collect local downloaded media URLs for this session's messages before deleting
    let candidateMediaUrls = [];
    try {
      const mediaRows = await WaChatMessage.find({
        sessionId,
        mediaUrl: { $regex: "^/uploads/chat_media/" },
      })
        .select("mediaUrl")
        .lean();
      candidateMediaUrls = (mediaRows || []).map((m) => m.mediaUrl).filter(Boolean);
    } catch (mediaErr) {
      console.warn(`[WA CLEANUP] Media query warning for ${sessionId}:`, mediaErr.message);
    }

    // 2. Delete all synced/loaded inbox & group collections for this sessionId
    const [
      chatsRes,
      messagesRes,
      groupsRes,
      contactsRes,
      notesRes,
      remindersRes,
    ] = await Promise.all([
      WaChat.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
      WaChatMessage.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
      WhatsAppGroup.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
      WaContact.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
      WaChatNote.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
      WaChatReminder.deleteMany({ sessionId }).catch(() => ({ deletedCount: 0 })),
    ]);

    if (candidateMediaUrls.length > 0) {
      await cleanupUnusedChatMediaUrls(WaChatMessage, candidateMediaUrls).catch((mediaErr) => {
        console.warn(`[WA CLEANUP] Media file cleanup warning for ${sessionId}:`, mediaErr.message);
      });
    }

    const deletedCounts = {
      chats: chatsRes?.deletedCount || 0,
      messages: messagesRes?.deletedCount || 0,
      groups: groupsRes?.deletedCount || 0,
      contacts: contactsRes?.deletedCount || 0,
      notes: notesRes?.deletedCount || 0,
      reminders: remindersRes?.deletedCount || 0,
    };

    // 3. Clear in-memory caches & sync tracking state for this session
    this.invalidateGroupMetadataCache(sessionId);
    if (chatSyncService?.syncStateMap) {
      chatSyncService.syncStateMap.delete(sessionId);
    }
    if (chatSyncService?.activeSyncPromises) {
      chatSyncService.activeSyncPromises.delete(sessionId);
    }

    // 4. Reset session device/group sync fields when keeping the session slot
    if (resetSyncMeta) {
      await SessionModel.updateOne(
        { sessionId },
        {
          $set: {
            isLinked: false,
            phoneNumber: "",
            groupsCount: 0,
            groupSyncStatus: "pending",
            lastGroupSyncAt: null,
          },
        }
      ).catch(() => { });
    }

    console.log(`[WA CLEANUP] Cleared loaded session data (${reason}) for ${sessionId}:`, deletedCounts);

    // 5. Notify connected clients so open /dashboard/chats & /dashboard/sessions clear cached UI state
    if (this.io) {
      const payload = { sessionId, reason, deletedCounts, clearedAt: new Date() };
      this.io.to(sessionId).emit("session:data_cleared", payload);
      this.io.to(sessionId).emit("chats:synced", { sessionId, count: 0, groupsCount: 0, directCount: 0 });
      this.io.to(sessionId).emit("groups:synced", { sessionId, count: 0 });
      if (sessionUserId) {
        const userRoom = `user:${sessionUserId.toString()}`;
        this.io.to(userRoom).emit("session:data_cleared", payload);
        this.io.to(userRoom).emit("chats:synced", { sessionId, count: 0, groupsCount: 0, directCount: 0 });
        this.io.to(userRoom).emit("groups:synced", { sessionId, count: 0 });
      }
    }

    return { success: true, deletedCounts };
  }

  /**
   * Sweeps any orphaned synced WhatsApp data (wachats, wacontacts, wachatmessages,
   * whatsappgroups, notes, reminders, auth states) whose session no longer exists
   * or is cleanly disconnected & unlinked.
   */
  async cleanupOrphanedSessionData() {
    try {
      const [
        activeSessions,
        chatSids,
        contactSids,
        msgSids,
        groupSids,
        noteSids,
        remSids,
        authSids,
      ] = await Promise.all([
        SessionModel.find({
          $or: [
            { status: { $ne: "disconnected" } },
            { isLinked: true },
          ],
        })
          .select("sessionId")
          .lean(),
        WaChat.distinct("sessionId").catch(() => []),
        WaContact.distinct("sessionId").catch(() => []),
        WaChatMessage.distinct("sessionId").catch(() => []),
        WhatsAppGroup.distinct("sessionId").catch(() => []),
        WaChatNote.distinct("sessionId").catch(() => []),
        WaChatReminder.distinct("sessionId").catch(() => []),
        WhatsAppAuthState.distinct("sessionId").catch(() => []),
      ]);

      const keepSet = new Set(activeSessions.map((s) => s.sessionId).filter(Boolean));
      const allDataSids = new Set([
        ...chatSids,
        ...contactSids,
        ...msgSids,
        ...groupSids,
        ...noteSids,
        ...remSids,
        ...authSids,
      ]);

      let cleaned = 0;
      for (const sid of allDataSids) {
        if (!sid || keepSet.has(sid) || this.sockets.has(sid)) continue;
        markSessionDeactivated(sid);
        await this.removeSessionFiles(sid).catch(() => { });
        await this.clearSessionLoadedData(sid, { resetSyncMeta: false, reason: "orphan_cleanup" }).catch(() => { });
        cleaned++;
      }
      if (cleaned > 0) {
        console.log(`[WA CLEANUP] Purged orphaned data for ${cleaned} deleted/disconnected session(s)`);
      }
      return cleaned;
    } catch (err) {
      console.warn("[WA CLEANUP] Orphan sweep warning:", err.message);
      return 0;
    }
  }

  /**
   * Stops all sockets, heartbeats, and pending retry timers for a session,
   * putting it cleanly into idle pairing ('pending') with zero background server load.
   */
  async moveToPairingIdle(sessionId, options = {}) {
    const {
      errorMsg = "Auto-reconnect failed after 2 attempts. Please re-link via Pairing QR or Reconnect.",
      clearCreds = false,
      emitUnlinked = false,
    } = options;

    if (clearCreds) {
      markSessionDeactivated(sessionId);
      const sock = this.sockets.get(sessionId);
      sock?.authState?.abort?.();
    }

    this.clearReconnectTimer(sessionId);
    this.clearHeartbeat(sessionId);
    this.removeSocket(sessionId);
    this.pendingReconnects.delete(sessionId);
    this.pendingQRCodes.delete(sessionId);
    this.reconnectCooldown.delete(sessionId);

    if (clearCreds) {
      await this.removeSessionFiles(sessionId);
      await this.clearSessionLoadedData(sessionId, {
        resetSyncMeta: true,
        reason: emitUnlinked ? "unlinked" : "auth_expired",
      });
      this.reconnectAttempts.delete(sessionId);
    } else {
      // Mark auto-retry budget exhausted so watchdog/GET polls won't auto-loop again
      this.reconnectAttempts.set(sessionId, this.MAX_AUTO_RECONNECT_ATTEMPTS);
    }

    await this.handleSessionStateChange(sessionId, "pending", {
      ...(clearCreds
        ? {
          isLinked: false,
          phoneNumber: "",
          groupsCount: 0,
          groupSyncStatus: "pending",
          lastGroupSyncAt: null,
        }
        : {}),
      lastError: errorMsg,
    });

    if (emitUnlinked && this.io) {
      this.io.to(sessionId).emit("session:unlinked", {
        sessionId,
        error: errorMsg,
      });
    }

    return { sessionId, status: "pending", needsPairing: true };
  }

  /**
   * Schedules an automatic reconnect up to MAX_AUTO_RECONNECT_ATTEMPTS (2).
   * Once 2 attempts are exhausted, stops all background retries and moves to 'pending' (pairing).
   */
  async scheduleAutoReconnect(sessionId, options = {}) {
    const {
      delayMs = 4000,
      errorMsg = "Auto-reconnect failed after 2 attempts. Please scan Pairing QR or click Reconnect.",
      clearCredsOnExhaust = false,
      isRestart = false,
      allowQR = false,
      maxAttempts,
    } = options;

    this.clearReconnectTimer(sessionId);

    const maxAllowed =
      typeof maxAttempts === "number"
        ? maxAttempts
        : isRestart
          ? 4
          : this.MAX_AUTO_RECONNECT_ATTEMPTS;

    const currentAttempts = this.reconnectAttempts.get(sessionId) || 0;
    if (currentAttempts >= maxAllowed) {
      console.warn(
        `[WA RECONNECT] Max ${maxAllowed} auto-retry attempts reached for ${sessionId} -> switching to idle pairing`,
      );
      await this.moveToPairingIdle(sessionId, {
        errorMsg,
        clearCreds: clearCredsOnExhaust,
      });
      return false;
    }

    const nextAttempt = currentAttempts + 1;
    this.reconnectAttempts.set(sessionId, nextAttempt);

    console.log(
      `[WA RECONNECT] Scheduling auto-retry ${nextAttempt}/${maxAllowed} for ${sessionId} in ${delayMs}ms`,
    );

    await this.handleSessionStateChange(sessionId, "connecting", {
      lastError: isRestart
        ? "Completing WhatsApp device handshake..."
        : `Reconnecting (attempt ${nextAttempt}/${maxAllowed})...`,
    });

    const timer = setTimeout(() => {
      this.reconnectTimers.delete(sessionId);
      if (this.isSessionWorking(sessionId)) return;
      this.reconnectSession(sessionId, {
        fromAutoRetry: true,
        bypassCooldown: true,
        isRestart,
        allowQR,
      }).catch((err) => {
        console.warn(`[WA RECONNECT] Auto-retry ${nextAttempt} error for ${sessionId}:`, err?.message);
      });
    }, Math.max(500, delayMs));

    this.reconnectTimers.set(sessionId, timer);
    return true;
  }

  setCachedMessage(messageId, msgProto) {
    if (!messageId || !msgProto) return;
    if (this.messageCache.size >= 1000) {
      const firstKey = this.messageCache.keys().next().value;
      if (firstKey) this.messageCache.delete(firstKey);
    }
    this.messageCache.set(messageId, msgProto);
  }

  getCachedMessage(messageId) {
    if (!messageId) return null;
    return this.messageCache.get(messageId) || null;
  }

  getGroupMetadataFromCache(sessionId, jid) {
    if (!sessionId || !jid) return null;
    return this.groupCache.get(`${sessionId}:${jid}`) || null;
  }

  setGroupMetadataInCache(sessionId, jid, metadata, ttlSeconds = 300) {
    if (!sessionId || !jid || !metadata) return;
    this.groupCache.set(`${sessionId}:${jid}`, metadata, ttlSeconds);
  }

  invalidateGroupMetadataCache(sessionId, jid) {
    if (sessionId && jid) {
      this.groupCache.del(`${sessionId}:${jid}`);
    } else if (sessionId) {
      const keys = this.groupCache.keys();
      for (const k of keys) {
        if (k.startsWith(`${sessionId}:`)) {
          this.groupCache.del(k);
        }
      }
    }
  }

  async markMessagesRead(sessionId, chatJid, keys = []) {
    const sock = this.sockets.get(sessionId);
    if (!sock) return false;
    try {
      if (Array.isArray(keys) && keys.length > 0) {
        // 1. Send via Baileys readMessages
        try {
          if (typeof sock.readMessages === "function") {
            await sock.readMessages(keys);
          }
        } catch (readErr) {
          console.warn(`[WA READ] readMessages threw for session ${sessionId}:`, readErr.message);
        }

        // 2. Also send explicit 'read' receipt to ensure double blue ticks on WhatsApp
        try {
          if (typeof sock.sendReceipt === "function") {
            const cleanJid = chatJid?.includes("@") ? chatJid : `${chatJid}@s.whatsapp.net`;
            const isGroup = cleanJid.endsWith("@g.us");
            const msgIds = keys.map((k) => k.id || k.messageId).filter(Boolean);
            if (msgIds.length > 0) {
              const participant = isGroup ? (keys[0]?.participant || undefined) : undefined;
              await sock.sendReceipt(cleanJid, participant, msgIds, "read");
            }
          }
        } catch (receiptErr) {
          console.warn(`[WA READ] sendReceipt direct threw for session ${sessionId}:`, receiptErr.message);
        }

        return true;
      }
    } catch (err) {
      console.warn(`[WA READ] Failed to send read receipt for session ${sessionId}:`, err.message);
    }
    return false;
  }

  /**
   * Check if a session can reconnect based on cooldown period
   * @param {string} sessionId - The session ID
   * @param {boolean} force - Force bypass cooldown
   * @returns {boolean} - True if reconnect is allowed
   */
  canReconnect(sessionId, force = false) {
    if (force) return true;
    const lastReconnect = this.reconnectCooldown.get(sessionId) || 0;
    const now = Date.now();
    const timeSinceLastReconnect = now - lastReconnect;
    const cooldownMs = 15000; // 15 seconds cooldown

    if (timeSinceLastReconnect < cooldownMs) {
      console.log(
        `[WA RECONNECT] reconnect blocked (cooldown), ${Math.ceil((cooldownMs - timeSinceLastReconnect) / 1000)}s remaining`,
        {
          sessionId,
          lastReconnect: new Date(lastReconnect).toISOString(),
          timeSinceLastReconnect,
          cooldownMs,
        },
      );
      return false;
    }
    return true;
  }

  /**
   * Safely remove a socket from all tracking maps/sets
   * @param {string} sessionId - The session ID
   */
  removeSocket(sessionId) {
    this.destroySocket(sessionId);
    this.sockets.delete(sessionId);
    this.activeSockets.delete(sessionId);
    this.clearHeartbeat(sessionId);
  }

  /**
   * Universal WebSocket open check compatible with Baileys v7 WebSocketClient and standard WebSocket
   * @param {object} sock - Baileys WASocket instance
   * @returns {boolean}
   */
  isSocketOpen(sock) {
    if (!sock || sock._isDestroyed) return false;
    const ws = sock.ws;
    if (!ws) return false;
    if (typeof ws.isOpen === "boolean") return ws.isOpen;
    if (typeof ws.readyState === "number") return ws.readyState === 1;
    if (typeof ws.socket?.readyState === "number") return ws.socket.readyState === 1;
    return false;
  }

  /**
   * Universal WebSocket closed check
   * @param {object} sock - Baileys WASocket instance
   * @returns {boolean}
   */
  isSocketClosed(sock) {
    if (!sock || sock._isDestroyed) return true;
    const ws = sock.ws;
    if (!ws) return true;
    if (typeof ws.isClosed === "boolean") return ws.isClosed;
    if (typeof ws.readyState === "number") return ws.readyState === 3;
    if (typeof ws.socket?.readyState === "number") return ws.socket.readyState === 3;
    return false;
  }

  /**
   * Properly destroy a socket connection
   * @param {string} sessionId - The session ID
   */
  destroySocket(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (!sock) return;
    sock._isDestroyed = true;

    try {
      // Remove all event listeners first so no trailing connection.update fires
      if (sock.ev) {
        sock.ev.removeAllListeners();
      }
      // Close the WebSocket connection safely
      if (sock.ws) {
        if (typeof sock.ws.close === "function" && !sock.ws.isClosed) {
          sock.ws.close();
        } else if (sock.ws.readyState && sock.ws.readyState !== 3) {
          sock.ws.close();
        }
      }
      // End the socket gracefully
      if (typeof sock.end === "function") {
        sock.end({ reason: "destroy" });
      }
    } catch (e) {
      // Ignore errors during cleanup
    }
  }

  /**
   * Calculate exponential backoff delay for reconnects
   * @param {string} sessionId - The session ID
   * @param {number} baseDelay - Base delay in ms (default: 2000)
   * @param {number} maxDelay - Maximum delay in ms (default: 30000)
   * @returns {number} - Delay in milliseconds
   */
  getReconnectDelay(sessionId, baseDelay = 2000, maxDelay = 30000) {
    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    const ceiling = Math.min(maxDelay, baseDelay * Math.pow(1.5, attempts));
    // Full jitter: randomize between minDelay and ceiling to prevent synchronized reconnect floods
    const minDelay = Math.max(500, Math.floor(baseDelay * 0.5));
    const delay = Math.floor(minDelay + Math.random() * (ceiling - minDelay));
    console.log(
      `[WA BACKOFF] session ${sessionId}, attempts ${attempts}, jittered delay ${delay}ms (ceiling: ${ceiling}ms)`,
    );
    return delay;
  }

  canTransitionSessionStatus(sessionId, currentStatus, nextStatus) {
    if (!nextStatus) {
      return false;
    }
    // Allow state refresh with same status to patch phone numbers/lastConnected
    if (currentStatus === nextStatus) {
      return true;
    }

    const isLiveConnected = this.isSessionWorking(sessionId);

    // A stale reconnect tick should not downgrade a socket that is already live.
    if (currentStatus === "connected" && nextStatus === "connecting") {
      return !isLiveConnected;
    }

    const allowedTransitions = {
      pending: ["connecting", "connected", "disconnected", "failed"],
      connecting: ["pending", "connected", "disconnected", "failed"],
      connected: ["pending", "connecting", "disconnected", "failed"],
      disconnected: ["pending", "connecting", "connected", "failed"],
      failed: ["pending", "connecting", "disconnected"],
    };

    return (allowedTransitions[currentStatus] || []).includes(nextStatus);
  }

  async handleSessionStateChange(sessionId, status, patch = {}) {
    const session = await SessionModel.findOne({ sessionId }).lean();
    if (!session) {
      return null;
    }

    if (!this.canTransitionSessionStatus(sessionId, session.status, status)) {
      return {
        skipped: true,
        sessionId,
        currentStatus: session.status,
        requestedStatus: status,
      };
    }

    const updateData = {
      status,
      ...patch,
    };

    await SessionModel.updateOne({ sessionId }, updateData).catch(() => { });
    const emitted = await this.emitSessionUpdate(sessionId, updateData);
    if (!emitted) {
      await this.emitSessionUpdate(sessionId, updateData);
    }

    if (this.io) {
      const statusPayload = {
        sessionId,
        status,
        ...patch,
      };
      this.io.to(sessionId).emit("status", statusPayload);
      if (session.userId) {
        this.io.to(`user:${session.userId.toString()}`).emit("status", statusPayload);
      }
    }

    return updateData;
  }

  normalizeJid(phoneNumber) {
    const rawValue = String(phoneNumber || "").trim();

    if (!rawValue) {
      throw new Error("Phone number is required");
    }

    if (rawValue.includes("@")) {
      if (rawValue.endsWith("@c.us")) {
        return rawValue.replace(/@c\.us$/, "@s.whatsapp.net");
      }
      return rawValue;
    }

    const digits = rawValue.replace(/\D/g, "");
    if (!digits) {
      throw new Error("Invalid phone number");
    }

    const normalizedDigits = digits.length === 10 ? `91${digits}` : digits;
    return `${normalizedDigits}@s.whatsapp.net`;
  }

  buildMessagePayload(message, mediaPath = null, mediaType = null, options = {}) {
    // If caller provided explicit Baileys AnyMessageContent payload (location, contacts, poll, react, pin, delete, etc.)
    if (options.payload) {
      return options.payload;
    }

    if (options.location) {
      return {
        location: {
          degreesLatitude: options.location.degreesLatitude || options.location.latitude,
          degreesLongitude: options.location.degreesLongitude || options.location.longitude,
          name: options.location.name,
          address: options.location.address,
        },
      };
    }

    if (options.contacts) {
      return {
        contacts: {
          displayName: options.contacts.displayName || options.contacts[0]?.displayName || "Contact",
          contacts: Array.isArray(options.contacts) ? options.contacts : [options.contacts],
        },
      };
    }

    if (options.poll) {
      return {
        poll: {
          name: options.poll.name || options.poll.question || "Poll",
          values: options.poll.values || options.poll.options || ["Option 1", "Option 2"],
          selectableCount: options.poll.selectableCount || 1,
          toAnnouncementGroup: !!options.poll.toAnnouncementGroup,
        },
      };
    }

    if (options.react) {
      return {
        react: {
          text: options.react.text || options.react.emoji || "",
          key: options.react.key,
        },
      };
    }

    if (options.pin) {
      return {
        pin: {
          type: options.pin.type !== undefined ? options.pin.type : 1,
          time: options.pin.time || options.pin.durationSeconds || 86400,
          key: options.pin.key,
        },
      };
    }

    if (options.delete) {
      return {
        delete: options.delete,
      };
    }

    if (options.forward) {
      return {
        forward: options.forward,
      };
    }

    if (!mediaPath || !mediaType) {
      const textPayload = { text: message || "" };
      if (options.linkPreview) {
        textPayload.linkPreview = options.linkPreview;
      }
      if (Array.isArray(options.mentions) && options.mentions.length > 0) {
        textPayload.mentions = options.mentions;
      }
      return textPayload;
    }

    let mediaTarget;
    const isRemoteUrl =
      typeof mediaPath === "string" &&
      (mediaPath.startsWith("http://") || mediaPath.startsWith("https://"));

    if (isRemoteUrl) {
      mediaTarget = { url: mediaPath };
    } else if (Buffer.isBuffer(mediaPath)) {
      mediaTarget = mediaPath;
    } else {
      let resolvedPath = null;
      if (typeof mediaPath === "string") {
        const clean = mediaPath.replace(/\\/g, "/");
        const candidatePaths = [
          mediaPath,
          join(process.cwd(), clean),
          join(process.cwd(), "backend", clean.replace(/^\//, "")),
          join(process.cwd(), clean.replace(/^\//, "")),
        ];

        const uploadsIdx = clean.indexOf("/uploads/");
        if (uploadsIdx !== -1) {
          const subPath = clean.substring(uploadsIdx + 1); // e.g. "uploads/quick_replies/..."
          candidatePaths.push(
            join(process.cwd(), "backend", subPath),
            join(process.cwd(), subPath)
          );
        }

        for (const p of candidatePaths) {
          if (p && existsSync(p)) {
            resolvedPath = p;
            break;
          }
        }
      }

      if (resolvedPath && existsSync(resolvedPath)) {
        mediaTarget = readFileSync(resolvedPath);
      } else {
        mediaTarget = typeof mediaPath === "string" ? { url: mediaPath } : mediaPath;
      }
    }

    const mime = String(mediaType || "").toLowerCase();

    if (mime.startsWith("image/")) {
      const payload = {
        image: mediaTarget,
        mimetype: mediaType || "image/jpeg",
      };
      if (message || options.caption) payload.caption = message || options.caption;
      if (options.viewOnce) payload.viewOnce = true;
      if (Array.isArray(options.mentions) && options.mentions.length > 0) {
        payload.mentions = options.mentions;
      }
      return payload;
    }

    if (mime.startsWith("video/")) {
      const payload = {
        video: mediaTarget,
        mimetype: mediaType || "video/mp4",
      };
      if (message || options.caption) payload.caption = message || options.caption;
      if (options.gifPlayback) payload.gifPlayback = true;
      if (options.ptv) payload.ptv = true;
      if (options.viewOnce) payload.viewOnce = true;
      if (Array.isArray(options.mentions) && options.mentions.length > 0) {
        payload.mentions = options.mentions;
      }
      return payload;
    }

    if (mime.startsWith("audio/")) {
      const payload = {
        audio: mediaTarget,
        mimetype: mediaType || "audio/mp4",
        ptt: options.ptt !== undefined ? !!options.ptt : (mime.includes("ogg") || mime.includes("opus")),
      };
      if (options.viewOnce) payload.viewOnce = true;
      return payload;
    }

    const docPayload = {
      document: mediaTarget,
      mimetype: mediaType || "application/octet-stream",
      fileName: options.fileName || (typeof mediaPath === "string" ? basename(mediaPath) : "document"),
    };
    if (message) docPayload.caption = message;
    if (Array.isArray(options.mentions) && options.mentions.length > 0) {
      docPayload.mentions = options.mentions;
    }
    return docPayload;
  }

  async sendMessage(
    sessionId,
    phoneNumber,
    message,
    mediaPath = null,
    mediaType = null,
    options = {},
  ) {
    const sock = this.sockets.get(sessionId);

    if (!sock) {
      throw new Error("Session is not connected");
    }

    const jid = this.normalizeJid(phoneNumber);
    if (isMetaAiJid(jid)) {
      try {
        const botInfo = await resolveMetaAiBot(sock, sessionId);
        options.contextInfo = {
          ...(options.contextInfo || {}),
          botMetadata: {
            personaId: botInfo.personaId || "867051314767696$760019659443059",
          },
        };
      } catch (_) { }
    }

    // Automatically generate full high-quality link preview for text messages containing URLs
    if (
      (!mediaPath || !mediaType) &&
      typeof message === "string" &&
      (message.includes("http://") || message.includes("https://")) &&
      options.linkPreview !== false &&
      !options.payload
    ) {
      try {
        if (!options.linkPreview) {
          const lp = await generateRichLinkPreview(message, sock);
          if (lp) {
            options.linkPreview = lp;
          }
        }
      } catch (lpErr) {
        console.warn("[WhatsAppService] Link preview generation notice:", lpErr.message);
      }
    }

    // Interactive buttons message handling (Native Flow Buttons or formatted fallback)
    if (options.buttons && Array.isArray(options.buttons) && options.buttons.length > 0) {
      return this.enqueueSessionTask(sessionId, async () => {
        await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
        if (!sock?.user?.id || !this.isSocketOpen(sock)) {
          throw new Error("Session is not connected or reconnecting");
        }

        const buttonsList = options.buttons;
        const buttonObjects = buttonsList.map((btn, idx) => {
          const title = typeof btn === "string" ? btn : (btn.text || btn.title || `Button ${idx + 1}`);
          const id = (typeof btn === "object" && btn.id) ? btn.id : `btn_${idx + 1}`;
          return {
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({
              display_text: title,
              id: id,
            }),
          };
        });

        const interactiveMessage = {
          body: { text: message || "" },
          nativeFlowMessage: {
            buttons: buttonObjects,
          },
        };

        if (options.header) {
          interactiveMessage.header = {
            title: options.header,
            hasMediaAttachment: false,
          };
        }

        if (options.footer) {
          interactiveMessage.footer = {
            text: options.footer,
          };
        }

        try {
          // Direct native interactive message WITHOUT viewOnceMessage wrapper
          const waMessage = generateWAMessageFromContent(
            jid,
            {
              interactiveMessage,
            },
            {
              userJid: sock.user.id,
              quoted: options.quoted,
            }
          );

          const isPrivate = !jid.endsWith("@g.us");
          const additionalNodes = [
            {
              tag: "biz",
              attrs: {},
              content: [
                {
                  tag: "interactive",
                  attrs: {
                    type: "native_flow",
                    v: "1",
                  },
                  content: [
                    {
                      tag: "native_flow",
                      attrs: {
                        name: "mixed",
                        v: "9",
                      },
                    },
                  ],
                },
              ],
            },
          ];

          if (isPrivate) {
            additionalNodes.push({ tag: "bot", attrs: { biz_bot: "1" } });
          }

          await sock.relayMessage(jid, waMessage.message, {
            messageId: waMessage.key.id,
            additionalNodes,
          });
          if (waMessage?.key?.id && waMessage?.message) {
            this.setCachedMessage(waMessage.key.id, waMessage.message);
          }
          return {
            key: waMessage.key,
            message: waMessage.message,
            messageId: waMessage.key.id,
          };
        } catch (relayErr) {
          console.warn("[WhatsAppService] Interactive buttons relay failed, sending formatted text fallback:", relayErr.message);
          const fallbackText = [
            options.header ? `*${options.header}*` : "",
            message || "",
            buttonsList.map((b, i) => `🔘 ${typeof b === "string" ? b : (b.text || b.title || `Button ${i + 1}`)}`).join("\n"),
            options.footer ? `_${options.footer}_` : "",
          ].filter(Boolean).join("\n\n");

          const fallbackResult = await sock.sendMessage(jid, { text: fallbackText }, sendOptions);
          if (fallbackResult?.key?.id && fallbackResult?.message) {
            this.setCachedMessage(fallbackResult.key.id, fallbackResult.message);
          }
          return fallbackResult;
        }
      }, 150, options);
    }

    const payload = this.buildMessagePayload(message, mediaPath, mediaType, options);

    const sendOptions = {
      getUrlInfo: (text) =>
        getUrlInfo(text, {
          thumbnailWidth: 192,
          fetchOpts: {
            timeout: 12000,
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
          },
          uploadImage: sock?.waUploadToServer,
        }),
    };
    if (options.quoted) sendOptions.quoted = options.quoted;
    if (options.ephemeralExpiration) sendOptions.ephemeralExpiration = options.ephemeralExpiration;
    if (options.statusJidList) sendOptions.statusJidList = options.statusJidList;

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      if (!sock?.user?.id || !this.isSocketOpen(sock)) {
        throw new Error("Session is not connected or reconnecting");
      }
      const result = await sock.sendMessage(jid, payload, sendOptions);
      if (result?.key?.id && result?.message) {
        this.setCachedMessage(result.key.id, result.message);
      }
      return result;
    }, 150, options);
  }

  /**
   * Send reaction emoji to a message
   */
  async sendReaction(sessionId, chatJid, messageKey, emoji) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jid = this.normalizeJid(chatJid);

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      return await sock.sendMessage(jid, {
        react: {
          text: emoji || "",
          key: messageKey,
        },
      });
    });
  }

  /**
   * Persist & broadcast a reaction received from WhatsApp (contact or own phone) without duplicates
   */
  async applyReactionUpdate(sessionId, { targetMessageId, chatJid, emoji, fromMe = false, senderJid = "" }) {
    if (!sessionId || !targetMessageId) return;
    try {
      const sock = this.sockets.get(sessionId);
      if (sock && !isSessionWriteAllowed(sessionId, sock)) return;

      const msgDoc = await WaChatMessage.findOne({ sessionId, messageId: targetMessageId });
      if (!msgDoc) return;

      const normSender = fromMe
        ? "me"
        : (senderJid ? this.normalizeJid(senderJid) : (msgDoc.chatJid || "other"));
      const senderKey = fromMe ? "me" : (normSender || "other");

      const bySender = new Map();
      for (const r of msgDoc.reactions || []) {
        if (!r || !r.emoji) continue;
        const rIsMe = Boolean(r.fromMe === true || r.by === "me" || r.senderJid === "me");
        const rRaw = (r.senderJid || r.by || "").trim();
        const rKey = rIsMe ? "me" : (rRaw || "__legacy__");
        if (fromMe && (rIsMe || rKey === "__legacy__")) continue;
        bySender.set(rKey, {
          emoji: r.emoji,
          fromMe: rIsMe,
          senderJid: rKey,
          by: rKey,
        });
      }

      if (emoji && String(emoji).trim()) {
        bySender.set(senderKey, {
          emoji: String(emoji).trim(),
          fromMe: Boolean(fromMe),
          senderJid: senderKey,
          by: senderKey,
        });
      } else {
        bySender.delete(senderKey);
      }

      const updatedReactions = Array.from(bySender.values());
      msgDoc.reactions = updatedReactions;
      await msgDoc.save();

      if (this.io) {
        const sessionObj = await SessionModel.findOne({ sessionId }).select("userId").lean().catch(() => null);
        const payload = {
          sessionId,
          chatJid: chatJid || msgDoc.chatJid,
          messageId: targetMessageId,
          emoji: emoji ? String(emoji).trim() : "",
          fromMe: Boolean(fromMe),
          participantJid: senderKey,
          senderJid: senderKey,
          by: senderKey,
          reactions: updatedReactions,
        };
        const targetRoom = sessionObj?.userId
          ? this.io.to(sessionId).to(`user:${sessionObj.userId.toString()}`)
          : this.io.to(sessionId);
        targetRoom.emit("chat:reaction", payload);
      }
    } catch (err) {
      console.warn("[WA REACTION] Failed applying reaction update:", err.message);
    }
  }

  /**
   * Pin or unpin a message in a chat
   * @param {string} sessionId
   * @param {string} chatJid
   * @param {object} messageKey
   * @param {number} pinType - 1 to pin, 0 to unpin
   * @param {number} durationSeconds - 86400 (24h), 604800 (7d), 2592000 (30d)
   */
  async pinMessage(sessionId, chatJid, messageKey, pinType = 1, durationSeconds = 86400) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jid = this.normalizeJid(chatJid);

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      return await sock.sendMessage(jid, {
        pin: {
          type: pinType,
          time: durationSeconds,
          key: messageKey,
        },
      });
    });
  }

  /**
   * Delete message for everyone (Revoke)
   */
  async deleteMessageForEveryone(sessionId, chatJid, messageKey) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jid = this.normalizeJid(chatJid);

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      return await sock.sendMessage(jid, {
        delete: messageKey,
      });
    });
  }

  /**
   * Send Presence Update ('composing', 'recording', 'paused', 'available', 'unavailable')
   */
  async sendPresence(sessionId, chatJid, presenceType = "composing") {
    const sock = this.sockets.get(sessionId);
    if (!sock) return false;
    const jid = this.normalizeJid(chatJid);
    try {
      await sock.sendPresenceUpdate(presenceType, jid);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Subscribe to presence updates for a chat/contact
   */
  async subscribePresence(sessionId, chatJid) {
    const sock = this.sockets.get(sessionId);
    if (!sock) return false;
    const jid = this.normalizeJid(chatJid);
    try {
      await sock.presenceSubscribe(jid);
      return true;
    } catch (e) {
      return false;
    }
  }

  /**
   * Modify chat state on WhatsApp (pin, mute, archive, star, clear)
   */
  async modifyChat(sessionId, chatJid, modification) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jid = this.normalizeJid(chatJid);

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      return await sock.chatModify(modification, jid);
    });
  }

  /**
   * Pin or unpin a conversation
   */
  async pinChat(sessionId, chatJid, pin = true) {
    return this.modifyChat(sessionId, chatJid, { pin: !!pin });
  }

  /**
   * Mute or unmute a conversation
   * @param {number|null} durationMs - e.g. 8 * 60 * 60 * 1000 for 8h, or null to unmute
   */
  async muteChat(sessionId, chatJid, durationMs = null) {
    return this.modifyChat(sessionId, chatJid, { mute: durationMs });
  }

  /**
   * Archive or unarchive a conversation
   */
  async archiveChat(sessionId, chatJid, archive = true, lastMessages = []) {
    return this.modifyChat(sessionId, chatJid, { archive: !!archive, lastMessages });
  }

  /**
   * Star or unstar a message
   */
  async starMessage(sessionId, chatJid, messageId, fromMe = true, star = true) {
    return this.modifyChat(sessionId, chatJid, {
      star: {
        messages: [{ id: messageId, fromMe: !!fromMe }],
        star: !!star,
      },
    });
  }

  /**
   * Set Disappearing / Ephemeral Messages in Chat
   * @param {number} durationSeconds - 0 to disable, 86400 (24h), 604800 (7d), 7776000 (90d)
   */
  async setDisappearingMessages(sessionId, chatJid, durationSeconds = 0) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jid = this.normalizeJid(chatJid);

    return this.enqueueSessionTask(sessionId, async () => {
      await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });
      return await sock.sendMessage(jid, {
        disappearingMessagesInChat: durationSeconds > 0 ? durationSeconds : false,
      });
    });
  }

  /**
   * Check if phone numbers exist on WhatsApp
   */
  async checkOnWhatsApp(sessionId, jids = []) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    const jidList = Array.isArray(jids) ? jids : (jids ? [jids] : []);
    if (jidList.length === 0) return [];
    const cleanJids = jidList.map((j) => {
      try {
        return this.normalizeJid(j);
      } catch (e) {
        return null;
      }
    }).filter(Boolean);
    if (cleanJids.length === 0) return [];
    return await sock.onWhatsApp(...cleanJids);
  }

  /**
   * Fetch WhatsApp About/Status for contact
   */
  async fetchStatus(sessionId, jid) {
    const sock = this.sockets.get(sessionId);
    if (!sock) return null;
    const cleanJid = this.normalizeJid(jid);
    try {
      const status = await sock.fetchStatus(cleanJid);
      return status?.status || null;
    } catch (e) {
      return null;
    }
  }

  startHeartbeat(sessionId, sock) {
    this.clearHeartbeat(sessionId);
    console.log("[WA HEARTBEAT] started", {
      sessionId,
      activeSockets: this.sockets.size,
      activeHeartbeats: this.heartbeats.size,
    });

    const id = setInterval(async () => {
      try {
        const liveSock = this.sockets.get(sessionId) || sock;
        const isAuthenticated = !!liveSock?.user?.id;
        const isOpen = this.isSocketOpen(liveSock);

        // If the session is authenticated and open, treat it as healthy.
        if (isAuthenticated && isOpen) {
          return;
        }

        console.log("[WA HEARTBEAT] connection or auth lost, delegating to 2-retry auto-reconnect", {
          sessionId,
          isAuthenticated,
          isOpen,
        });

        this.clearHeartbeat(sessionId);
        this.removeSocket(sessionId);

        await this.scheduleAutoReconnect(sessionId, {
          delayMs: 2500,
          errorMsg: "Connection heartbeat lost after 2 auto-retry attempts. Please Reconnect or scan Pairing QR.",
        });
      } catch (err) {
        console.error("[WA HEARTBEAT ERROR]", err);
      }
    }, 60_000);
    this.heartbeats.set(sessionId, id);
  }

  async getSocketVersion() {
    const SIX_HOURS_MS = 6 * 60 * 60 * 1000;
    if (this.cachedWaVersion && Date.now() - this.cachedWaVersionAt < SIX_HOURS_MS) {
      return this.cachedWaVersion;
    }
    try {
      const { version } = await fetchLatestBaileysVersion();
      if (version) {
        this.cachedWaVersion = version;
        this.cachedWaVersionAt = Date.now();
      }
      return version;
    } catch (e) {
      return this.cachedWaVersion || undefined;
    }
  }

  async removeSessionFiles(sessionId) {
    try {
      await WhatsAppAuthState.deleteMany({ sessionId });
      console.log("[WA AUTH] Mongo auth state cleared", { sessionId });
    } catch (e) {
      console.error("[WA AUTH] failed to clear Mongo auth state", { sessionId, error: e.message });
    }
    const sessionPath = join(SESSIONS_DIR, sessionId);
    try {
      if (existsSync(sessionPath)) {
        rmSync(sessionPath, { recursive: true, force: true });
      }
    } catch (e) { }
  }

  isValidAuthState(authState) {
    if (!authState || !authState.state) return false;
    const creds = authState.state.creds;
    if (!creds) return false;
    if (!creds.me || !creds.me.id) return false;
    // Don't require 'registered' to be true - after pairing but before
    // complete registration, registered might be false temporarily
    // This prevents marking valid sessions as invalid after 515 restart
    return true;
  }

  async validateSessionCredentials(sessionId) {
    try {
      const doc = await WhatsAppAuthState.findOne({ sessionId, dataType: "creds", dataId: "creds" }).lean();
      if (!doc || !doc.dataJson) {
        console.log("[WA CREDS] mongo entry missing", { sessionId });
        return false;
      }
      const creds = JSON.parse(doc.dataJson);
      if (
        !creds ||
        typeof creds !== "object" ||
        Object.keys(creds).length === 0
      ) {
        console.warn("[WA CREDS] corrupted/empty in mongo", { sessionId });
        return false;
      }
      return true;
    } catch (err) {
      console.error("[WA CREDS] validation error", {
        sessionId,
        error: err.message,
      });
      return false;
    }
  }

  // Core socket factory + event handlers
  async createSocket(sessionId, authState, socketOptions = {}) {
    // Prevent duplicate active sockets
    if (this.activeSockets.has(sessionId)) {
      console.log(
        `[WA SOCKET] socket already active for session ${sessionId}, skipping creation`,
      );
      return this.sockets.get(sessionId);
    }

    const { allowQR = false } = socketOptions;

    const io = this.io;
    let isLoggingOut = false;
    let hasGeneratedQR = false;

    const version = await this.getSocketVersion();
    const sock = makeWASocket({
      auth: authState.state,
      version,
      printQRInTerminal: false,
      browser: Browsers.appropriate("Chrome"),
      markOnlineOnConnect: false,
      emitOwnEvents: false,
      fireInitQueries: true,
      syncFullHistory: false,
      qrTimeout: 90000,
      connectTimeoutMs: 75000,
      defaultQueryTimeoutMs: 75000,
      keepAliveIntervalMs: 25000,
      maxMsgRetryCount: 5,
      generateHighQualityLinkPreview: true,
      linkPreviewImageThumbnailWidth: 192,
      cachedGroupMetadata: async (jid) => {
        try {
          const cached = this.getGroupMetadataFromCache(sessionId, jid);
          if (cached) return cached;
          const meta = await sock.groupMetadata(jid);
          if (meta) {
            if (meta.participants) {
              await resolveGroupParticipantsLids(sock, meta.participants);
            }
            this.setGroupMetadataInCache(sessionId, jid, meta);
          }
          return meta;
        } catch (err) {
          return undefined;
        }
      },
      getMessage: async (key) => {
        if (!key?.id) return undefined;
        const inMem = this.getCachedMessage(key.id);
        if (inMem) return inMem;
        try {
          const dbMsg = await WaChatMessage.findOne({ sessionId, messageId: key.id }).lean();
          if (dbMsg && dbMsg.text) {
            return {
              conversation: dbMsg.text,
            };
          }
        } catch (err) {
          console.warn(`[WA RETRY] Error getting message for key ${key.id}:`, err.message);
        }
        return undefined;
      },
    });

    // Add to active sockets tracking
    sock.authState = authState;
    sock._allowQR = !!allowQR;
    this.sockets.set(sessionId, sock);
    this.activeSockets.add(sessionId);

    // CRITICAL: Wire saveCreds with error tracking and ensure it's called
    // Track last save time to prevent immediate restart before save
    let lastCredsSaveTime = 0;
    let saveCredsPending = false;

    const saveCredsWrapper = async () => {
      if (!isSessionWriteAllowed(sessionId, sock)) return;
      try {
        console.log(
          "[WA PERSIST] creds.update event triggered, saving credentials...",
          { sessionId },
        );
        saveCredsPending = true;
        await authState.saveCreds();
        lastCredsSaveTime = Date.now();
        saveCredsPending = false;
        console.log("[WA PERSIST] credentials saved to disk successfully", {
          sessionId,
          saveTime: new Date(lastCredsSaveTime).toISOString(),
        });
      } catch (err) {
        saveCredsPending = false;
        console.error("[WA PERSIST] failed to save creds", {
          sessionId,
          error: err.message,
          stack: err.stack,
        });
      }
    };

    // Attach the wrapper to creds.update event
    sock.ev.on("creds.update", saveCredsWrapper);

    // Credential updates are persisted automatically via creds.update event

    // QR handling
    sock.ev.on("connection.update", async (update) => {
      const { qr, connection, lastDisconnect } = update;

      if (connection === "connecting") {
        console.log(`[WA AUTH] session ${sessionId} connecting...`);
      }

      if (qr) {
        hasGeneratedQR = true;
        try {
          qrcode.toDataURL(qr, (err, url) => {
            if (!err && url) {
              this.pendingQRCodes.set(sessionId, url);
              this.emitSessionUpdate(sessionId, { status: "qr" });
              if (io) {
                io.to(sessionId).emit("qrcode", { sessionId, qr: url, expiresInSeconds: 90 });
                io.to(sessionId).emit("status", { sessionId, status: "qr" });
                io.to(sessionId).emit("session:pairing_progress", {
                  sessionId,
                  stage: "qr",
                  message: "QR code ready. Scan with WhatsApp on your phone.",
                });
              }
            }
          });
        } catch (e) { }
      }

      if (connection === "open") {
        // Mark connected
        const phone = (sock.user?.id || "").split("@")[0].split(":")[0];
        const isValidCreds = this.isValidAuthState(authState);
        console.log("[WA AUTH] connection open", {
          sessionId,
          phone,
          hasValidCreds: isValidCreds,
          registered: !!authState.state.creds?.registered,
        });

        // Ensure newly registered credentials flush cleanly on initial link
        if (saveCredsPending) {
          await new Promise((resolve) => setTimeout(resolve, 600));
        }

        this.clearReconnectTimer(sessionId);
        this.pendingQRCodes.delete(sessionId);
        this.reconnectAttempts.delete(sessionId);
        this.reconnectCooldown.delete(sessionId); // Reset cooldown on successful connection
        this.sockets.set(sessionId, sock);
        await this.handleSessionStateChange(sessionId, "connected", {
          phoneNumber: phone,
          isLinked: true,
          lastConnected: new Date(),
          lastError: "",
        });
        if (io) {
          io.to(sessionId).emit("session:pairing_progress", {
            sessionId,
            stage: "connected",
            phoneNumber: phone,
            message: "WhatsApp device authenticated and live!",
          });
        }
        this.startHeartbeat(sessionId, sock);

        // Emit immediate sync preparation state so /dashboard/chats shows loading/sync progress
        try {
          const openSessionDoc = await SessionModel.findOne({ sessionId }).select("userId").lean();
          chatSyncService.emitSyncProgress(io, sessionId, openSessionDoc?.userId, {
            status: "syncing",
            stage: "initializing",
            progress: 10,
            message: "WhatsApp connected! Preparing to load groups and conversations...",
          });
        } catch (_) { }

        // Initial background staged sync for groups & chats into MongoDB (non-blocking)
        setTimeout(() => {
          this.syncSessionChats(sessionId).catch((err) => {
            console.warn(`[WA INITIAL SYNC] Initial chat sync background error for ${sessionId}:`, err.message);
          });
          this.syncSessionGroups(sessionId, { prune: true }).catch((err) => {
            console.warn(`[WA INITIAL SYNC] Initial group sync background error for ${sessionId}:`, err.message);
          });
        }, 1200);
      }

      if (connection === "close") {
        if (isLoggingOut || sock._isDestroyed) {
          this.clearHeartbeat(sessionId);
          return;
        }

        const statusCode = lastDisconnect?.error?.output?.statusCode ?? null;
        const reason =
          statusCode ??
          (lastDisconnect?.error instanceof Boom
            ? lastDisconnect.error.output.statusCode
            : 0);
        const isLogout =
          statusCode === 401 || reason === DisconnectReason.loggedOut;
        const isRestartRequired = reason === DisconnectReason.restartRequired;
        const isTemporaryWebsocketBreak = statusCode === 428 || reason === 428;
        const isSoftRestart = statusCode === 515 || isTemporaryWebsocketBreak; // Stream error 515 or temporary 428 hiccup
        const isRegistered = !!authState.state.creds?.registered;
        const attempts = this.reconnectAttempts.get(sessionId) || 0;
        const isValidCreds = this.isValidAuthState(authState);

        console.log("[WA AUTH] connection close", {
          sessionId,
          statusCode,
          reason,
          isLogout,
          isRestartRequired,
          isSoftRestart,
          isRegistered,
          isValidCreds,
          attempts,
        });

        this.clearHeartbeat(sessionId);
        this.removeSocket(sessionId);

        // 1. restartRequired (e.g. initial pairing handshake right after QR scan):
        //    Wait briefly for creds flush so the post-scan socket starts with registered creds
        if (isRestartRequired) {
          const timeSinceLastSave = Date.now() - lastCredsSaveTime;
          if (saveCredsPending || timeSinceLastSave < 900) {
            await new Promise((resolve) => setTimeout(resolve, saveCredsPending ? 1500 : 900));
          }
          if (io) {
            io.to(sessionId).emit("session:pairing_progress", {
              sessionId,
              stage: "authenticating",
              message: "QR scanned! Finalizing encrypted WhatsApp handshake...",
            });
          }
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: attempts === 0 ? 1000 : 2500,
            isRestart: true,
            maxAttempts: 4,
            allowQR: !!sock._allowQR,
            errorMsg: "WhatsApp restart handshake timed out. Please scan Pairing QR again.",
          });
          return;
        }

        // 2. Soft stream restart (515 / 428): preserve creds, retry up to 2 times max
        if (isSoftRestart) {
          const now = Date.now();
          const timeSinceLastSave = now - lastCredsSaveTime;
          const isSavingInProgress = saveCredsPending;
          let additionalWait = 0;
          if (isSavingInProgress) {
            additionalWait = 3000;
          } else if (timeSinceLastSave < 2000) {
            additionalWait = 2000;
          }

          if (additionalWait > 0) {
            await new Promise((resolve) => setTimeout(resolve, additionalWait));
          }

          const retryDelay = this.getReconnectDelay(sessionId, 4000, 12000);
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: retryDelay,
            errorMsg: "WhatsApp stream disconnected after 2 auto-retry attempts. Please scan Pairing QR or Reconnect.",
          });
          return;
        }

        // 3. Conflict (440 / Stream Errored conflict): preserve creds, retry up to 2 times with backoff
        const isConflict =
          statusCode === 440 ||
          reason === 440 ||
          String(lastDisconnect?.error?.message || "").toLowerCase().includes("conflict") ||
          String(lastDisconnect?.error?.toString() || "").toLowerCase().includes("conflict");

        if (isConflict) {
          const conflictDelay = Math.min(15000, 8000 * Math.pow(1.5, attempts));
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: conflictDelay,
            errorMsg: "WhatsApp connection conflicted with another device after 2 attempts. Please Reconnect or scan Pairing QR.",
          });
          return;
        }

        // 4. Companion logout / 401
        const errorData = lastDisconnect?.error?.data;
        const errorLocation = errorData?.location;
        const isDefinitiveRevoke =
          (statusCode === 401 || reason === 401) &&
          (errorLocation === "lla" || errorLocation === "cco");

        if (isLogout) {
          if (isDefinitiveRevoke) {
            console.warn(
              `[WA AUTH] WhatsApp permanently revoked session ${sessionId} (${errorLocation}). Moving to idle pairing.`
            );
            await this.moveToPairingIdle(sessionId, {
              clearCreds: true,
              emitUnlinked: true,
              errorMsg: "WhatsApp unlinked this device. Please scan QR to re-link.",
            });
            return;
          }

          // Transient 401 without definitive revoke: auto-retry up to 2 times, then clear & move to pairing
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: 5000,
            clearCredsOnExhaust: true,
            errorMsg: "WhatsApp session expired. Please scan QR to re-link.",
          });
          return;
        }

        // 5. Authenticated / valid-creds disconnect: retry up to 2 times automatically, then move to pairing idle
        const hasCreds = isValidCreds || (await this.validateSessionCredentials(sessionId));
        if (hasCreds && isRegistered) {
          const delay = this.getReconnectDelay(sessionId, 3000, 12000);
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: delay,
            errorMsg: "Auto-reconnect failed after 2 attempts. Please scan Pairing QR or Reconnect.",
          });
          return;
        }

        // 6. Unregistered / QR flow closed (e.g. QR timeout 408): NEVER loop QR infinitely in background
        if (!isRegistered) {
          if (hasGeneratedQR || !sock._allowQR) {
            console.log(`[WA AUTH] Pre-auth/QR closed for ${sessionId}, moving to idle pairing without background retries`);
            await this.moveToPairingIdle(sessionId, {
              clearCreds: false,
              errorMsg: hasGeneratedQR
                ? "QR pairing timed out. Click Pairing QR to try again."
                : "Pairing required. Click Pairing QR to link device.",
            });
            return;
          }

          // Closed before first QR during active pairing request -> allow at most 2 retries
          await this.scheduleAutoReconnect(sessionId, {
            delayMs: 3000,
            allowQR: true,
            errorMsg: "Unable to initialize pairing socket after 2 attempts. Click Pairing QR to retry.",
          });
          return;
        }

        // Fallback: creds exist but unregistered
        await this.scheduleAutoReconnect(sessionId, {
          delayMs: 4000,
          errorMsg: "Auto-reconnect failed after 2 attempts. Please scan Pairing QR or Reconnect.",
        });
      }
    });

    // Save incoming/outgoing messages and handle AI Agent responses
    sock.ev.on("messages.upsert", async (m) => {
      if (m.type === "notify" || m.type === "append") {
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        for (const msg of m.messages) {
          if (msg.message) {
            this.setCachedMessage(msg.key.id, msg.message);
            const isFromMe = !!msg.key.fromMe;
            const rawSenderJid = msg.key.remoteJid;
            const senderJid = rawSenderJid ? jidNormalizedUser(rawSenderJid) : "";
            let participantJid = msg.key.participant ? jidNormalizedUser(msg.key.participant) : (isFromMe ? null : senderJid);
            if (participantJid && participantJid.endsWith("@lid")) {
              if (msg.key.participantAlt && !msg.key.participantAlt.endsWith("@lid")) {
                participantJid = jidNormalizedUser(msg.key.participantAlt);
              } else {
                try {
                  const pnParticipant = await sock.signalRepository?.lidMapping?.getPNForLID(participantJid);
                  if (pnParticipant) {
                    participantJid = jidNormalizedUser(pnParticipant);
                  }
                } catch (_) { }
              }
            }
            // Handle incoming / phone-synced Disappearing Messages setting change (protocolMessage type 3)
            if (msg.message?.protocolMessage?.type === 3) {
              const newExpiration = Number(msg.message.protocolMessage.ephemeralExpiration) || 0;
              if (isSessionWriteAllowed(sessionId, sock) && senderJid) {
                const jidList = [...new Set([senderJid, rawRemoteJid].filter(Boolean))];
                await WaChat.updateMany(
                  { sessionId, chatJid: { $in: jidList } },
                  { $set: { ephemeralExpiration: newExpiration } }
                ).catch(() => { });
                if (this.io) {
                  this.io.to(sessionId).emit("chat:disappearing_changed", {
                    sessionId,
                    chatJid: senderJid,
                    ephemeralExpiration: newExpiration,
                  });
                }
              }
              continue;
            }

            // Unwrap message contents (handling ephemeral, view-once, and interactive templates)
            const isProtocolEdit = !!(
              msg.message?.protocolMessage?.editedMessage ||
              msg.message?.protocolMessage?.type === 14 ||
              msg.message?.editedMessage?.message
            );
            const targetEditMessageId = isProtocolEdit
              ? msg.message?.protocolMessage?.key?.id || msg.message?.editedMessage?.key?.id
              : null;
            const editedMsgWrap =
              msg.message?.protocolMessage?.editedMessage ||
              msg.message?.editedMessage?.message;

            const rawMsg =
              editedMsgWrap ||
              msg.message?.ephemeralMessage?.message ||
              msg.message?.viewOnceMessage?.message ||
              msg.message?.viewOnceMessageV2?.message ||
              msg.message?.documentWithCaptionMessage?.message ||
              msg.message;
            const msgContent = rawMsg?.viewOnceMessage?.message || rawMsg;

            let nativeFlowSelectedText = "";
            const nativeFlowJson = msgContent?.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson;
            if (nativeFlowJson) {
              try {
                const parsed = JSON.parse(nativeFlowJson);
                nativeFlowSelectedText = parsed.id || parsed.selected_id || parsed.display_text || "";
              } catch (_) { }
            }

            const text =
              msgContent?.conversation ||
              msgContent?.extendedTextMessage?.text ||
              msgContent?.interactiveResponseMessage?.body?.text ||
              nativeFlowSelectedText ||
              msgContent?.interactiveMessage?.body?.text ||
              msgContent?.imageMessage?.caption ||
              msgContent?.videoMessage?.caption ||
              msgContent?.documentMessage?.caption ||
              msgContent?.buttonsResponseMessage?.selectedButtonId ||
              msgContent?.buttonsResponseMessage?.selectedDisplayText ||
              msgContent?.templateButtonReplyMessage?.selectedId ||
              msgContent?.templateButtonReplyMessage?.selectedDisplayText ||
              msgContent?.listResponseMessage?.title ||
              msgContent?.listResponseMessage?.singleSelectReply?.selectedRowId ||
              "";

            // If this is a progressive streamed edit (e.g. Meta AI generating text), update the existing message in DB and emit
            if (isProtocolEdit && targetEditMessageId) {
              if (!isSessionWriteAllowed(sessionId, sock)) {
                continue;
              }
              if (text) {
                const updatedMsgDoc = await WaChatMessage.findOneAndUpdate(
                  { messageId: targetEditMessageId, sessionId },
                  { $set: { text } },
                  { new: true }
                );
                if (updatedMsgDoc && this.io) {
                  this.io.to(sessionId).emit("chat:message_update", {
                    sessionId,
                    chatJid: updatedMsgDoc.chatJid,
                    messageId: targetEditMessageId,
                    text,
                  });
                  this.io.to(sessionId).emit("chat:message", {
                    sessionId,
                    chatJid: updatedMsgDoc.chatJid,
                    message: updatedMsgDoc,
                  });
                }
              }
              continue;
            }

            // Handle incoming or phone-synced WhatsApp reaction messages cleanly without duplicating pills
            if (msgContent?.reactionMessage?.key?.id) {
              const rxKey = msgContent.reactionMessage.key;
              const rxText = msgContent.reactionMessage.text || "";
              const rxSender = isFromMe
                ? "me"
                : (participantJid || senderJid || "");
              await this.applyReactionUpdate(sessionId, {
                targetMessageId: rxKey.id,
                chatJid: senderJid,
                emoji: rxText,
                fromMe: isFromMe,
                senderJid: rxSender,
              });
              continue;
            }

            const mediaType = msgContent?.imageMessage
              ? "image"
              : msgContent?.videoMessage
                ? "video"
                : msgContent?.documentMessage
                  ? "document"
                  : msgContent?.audioMessage
                    ? "audio"
                    : null;
            const timestamp = msg.messageTimestamp
              ? new Date(Number(msg.messageTimestamp) * 1000)
              : new Date();

            // Extract Quoted / Replied Message
            const contextInfo =
              msgContent?.extendedTextMessage?.contextInfo ||
              msgContent?.imageMessage?.contextInfo ||
              msgContent?.videoMessage?.contextInfo ||
              msgContent?.documentMessage?.contextInfo ||
              msgContent?.audioMessage?.contextInfo;

            let quotedMessage = null;
            if (contextInfo && (contextInfo.stanzaId || contextInfo.quotedMessage)) {
              const qMsg = contextInfo.quotedMessage;
              const qText =
                qMsg?.conversation ||
                qMsg?.extendedTextMessage?.text ||
                qMsg?.imageMessage?.caption ||
                qMsg?.videoMessage?.caption ||
                qMsg?.documentMessage?.caption ||
                (qMsg?.imageMessage ? "Photo" : qMsg?.videoMessage ? "Video" : qMsg?.audioMessage ? "Voice note" : qMsg?.documentMessage ? "Document" : "");

              quotedMessage = {
                messageId: contextInfo.stanzaId || null,
                participant: contextInfo.participant || null,
                text: qText || null,
                mediaType: qMsg?.imageMessage ? "image" : qMsg?.videoMessage ? "video" : qMsg?.documentMessage ? "document" : qMsg?.audioMessage ? "audio" : null,
              };
            }

            // Resolve WhatsApp @lid JID to Phone Number if applicable
            let resolvedSenderJid = senderJid;
            const isMetaAi = isMetaAiJid(rawSenderJid) || isMetaAiJid(senderJid);
            if (isMetaAi) {
              resolvedSenderJid = META_AI_NORMALIZED_JID;
            } else if (senderJid && senderJid.endsWith("@lid")) {
              if (msg.key.remoteJidAlt && !msg.key.remoteJidAlt.endsWith("@lid")) {
                resolvedSenderJid = jidNormalizedUser(msg.key.remoteJidAlt);
              } else {
                try {
                  const pnJid = await sock.signalRepository?.lidMapping?.getPNForLID(senderJid);
                  if (pnJid) {
                    resolvedSenderJid = jidNormalizedUser(pnJid);
                  }
                } catch (lidErr) { }
              }
            } else if (resolvedSenderJid) {
              resolvedSenderJid = jidNormalizedUser(resolvedSenderJid);
            }
            const isGroup = resolvedSenderJid.endsWith("@g.us");
            const isGroupChat = isGroup;
            let resolvedPhoneNumber = isMetaAi
              ? "13135550002"
              : (isGroup || resolvedSenderJid.endsWith("@lid"))
                ? ""
                : (resolvedSenderJid ? resolvedSenderJid.replace(/@.*/, "").replace(/:\d+$/, "").replace(/\D/g, "") : "");

            // Process WhatsApp media according to Admin Storage settings (VPS vs direct WhatsApp URL)
            let mediaUrl = null;
            let mediaName = null;
            let rawMedia = null;
            if (mediaType) {
              const mediaRes = await processIncomingMediaMessage({
                msg,
                msgContent,
                mediaType,
                sock,
              });
              mediaUrl = mediaRes.mediaUrl;
              mediaName = mediaRes.mediaName;
              rawMedia = mediaRes.rawMedia;
            }

            // If the message is completely empty (no text, no media, no poll, no location, no contacts), do not persist as empty chat message
            const hasPersistableContent = Boolean(
              (text && text.trim()) ||
              mediaType ||
              mediaUrl ||
              msgContent?.pollCreationMessage ||
              msgContent?.pollCreationMessageV2 ||
              msgContent?.pollCreationMessageV3 ||
              msgContent?.locationMessage ||
              msgContent?.liveLocationMessage ||
              msgContent?.contactMessage ||
              msgContent?.contactsArrayMessage
            );
            if (!hasPersistableContent) {
              continue;
            }

            // Retrieve session model scoped to this message loop
            if (!isSessionWriteAllowed(sessionId, sock)) {
              continue;
            }

            let session = null;
            try {
              session = await SessionModel.findOne({ sessionId });
              if (session && isSessionWriteAllowed(sessionId, sock)) {
                const isExistingMsg = Boolean(
                  msg.key.id &&
                  (await WaChatMessage.exists({ messageId: msg.key.id, sessionId }))
                );
                const msgEphemeralExp = Number(contextInfo?.expiration || 0);
                const isMsgEphemeral = Boolean(msg.message?.ephemeralMessage || msgEphemeralExp > 0);
                const savedMsg = await WaChatMessage.findOneAndUpdate(
                  { messageId: msg.key.id, sessionId },
                  {
                    $set: {
                      userId: session.userId,
                      sessionId,
                      chatJid: resolvedSenderJid,
                      participantJid,
                      messageId: msg.key.id,
                      text: text || "",
                      direction: isFromMe ? "out" : "in",
                      status: isFromMe ? "sent" : "delivered",
                      mediaType,
                      ...(mediaUrl ? { mediaUrl } : {}),
                      ...(mediaName ? { mediaName } : {}),
                      ...(rawMedia ? { rawMedia } : {}),
                      ...(quotedMessage ? { quotedMessage } : {}),
                      ...(isMsgEphemeral ? { isEphemeral: true } : {}),
                      timestamp,
                    },
                  },
                  { upsert: true, new: true }
                );

                // Update or create WaChat last message (NEVER treat outgoing msg.pushName as recipient name)
                const ownProfileName = (sock?.user?.name || "").trim().toLowerCase();
                const ownPhone = sock?.user?.id
                  ? String(sock.user.id).replace(/:.*$/, "").replace(/@.*/, "").replace(/\D/g, "")
                  : "";
                const isSelfChat = ownPhone && resolvedPhoneNumber && ownPhone === resolvedPhoneNumber;
                const rawPush = !isFromMe ? (msg.pushName || "").trim() : "";
                const safePushName =
                  rawPush && (!ownProfileName || isSelfChat || rawPush.toLowerCase() !== ownProfileName)
                    ? rawPush
                    : "";

                let savedContactName = "";
                let existingChat = null;
                let groupSubject = "";
                let groupParticipantCount = 0;

                if (isGroup) {
                  const gDoc = await WhatsAppGroup.findOne({ sessionId, jid: resolvedSenderJid })
                    .select("subject participantCount size")
                    .lean()
                    .catch(() => null);
                  if (gDoc?.subject) groupSubject = gDoc.subject;
                  groupParticipantCount = gDoc?.participantCount || gDoc?.size || 0;
                } else if (!isMetaAi) {
                  const candidateContactJids = [
                    resolvedSenderJid,
                    resolvedPhoneNumber ? `${resolvedPhoneNumber}@s.whatsapp.net` : null,
                  ].filter(Boolean);
                  const [waContact, foundChat] = await Promise.all([
                    WaContact.findOne({
                      userId: session.userId,
                      sessionId,
                      jid: { $in: candidateContactJids },
                    })
                      .select("name pushName verifiedName")
                      .lean()
                      .catch(() => null),
                    WaChat.findOne({
                      userId: session.userId,
                      sessionId,
                      chatJid: resolvedSenderJid,
                    }).lean(),
                  ]);
                  existingChat = foundChat;
                  const cName = (waContact?.name || "").trim();
                  const cPush = (waContact?.verifiedName || waContact?.pushName || "").trim();
                  const validCPush =
                    cPush && (!ownProfileName || isSelfChat || cPush.toLowerCase() !== ownProfileName)
                      ? cPush
                      : "";
                  savedContactName = cName || validCPush;
                }

                const contactName = isMetaAi ? "Meta AI" : (isGroup ? "" : (savedContactName || safePushName));
                const existingNameClean = (existingChat?.name || "").trim();
                const isExistingCorruptedOrPlaceholder =
                  !existingNameClean ||
                  existingNameClean.includes(":") ||
                  existingNameClean === "WhatsApp Contact" ||
                  /^\+\d+$/.test(existingNameClean) ||
                  (!isSelfChat && ownProfileName && existingNameClean.toLowerCase() === ownProfileName);

                const fallbackPhoneLabel = resolvedPhoneNumber ? `+${resolvedPhoneNumber}` : "WhatsApp Contact";
                const repairedName = contactName || (existingChat && !isSelfChat && ownProfileName && existingNameClean.toLowerCase() === ownProfileName ? fallbackPhoneLabel : "");

                let matchedClient = null;
                let matchedCompany = null;
                if (!isGroup && !isMetaAi && resolvedPhoneNumber) {
                  const crmMatch = await findMatchingCrmRecords(session.userId, resolvedPhoneNumber).catch(() => ({ client: null, company: null }));
                  matchedClient = crmMatch.client;
                  matchedCompany = crmMatch.company;
                }
                const matchedClientName = matchedClient
                  ? `${matchedClient.firstName || ""} ${matchedClient.lastName || ""}`.trim()
                  : "";
                const matchedCompanyName = matchedCompany?.name ? matchedCompany.name.trim() : "";

                const updatedChatDoc = await WaChat.findOneAndUpdate(
                  { userId: session.userId, sessionId, chatJid: resolvedSenderJid },
                  {
                    $set: {
                      lastMessage: text || (mediaType ? `[${mediaType}]` : ""),
                      lastMessageTime: timestamp,
                      isGroup,
                      phoneNumber: isGroup ? "" : resolvedPhoneNumber,
                      ...(isGroup && groupSubject ? { groupSubject, name: groupSubject } : {}),
                      ...(isGroup && groupParticipantCount ? { groupParticipantCount } : {}),
                      ...(!isMetaAi && !isGroup && repairedName && isExistingCorruptedOrPlaceholder
                        ? { name: repairedName }
                        : {}),
                      ...(!isMetaAi && !isGroup && contactName && (!existingChat?.contactName || (!isSelfChat && ownProfileName && existingChat.contactName.trim().toLowerCase() === ownProfileName))
                        ? { contactName }
                        : {}),
                      ...(!isMetaAi && !isGroup && matchedClient
                        ? { clientId: matchedClient._id, clientName: matchedClientName }
                        : {}),
                      ...(!isMetaAi && !isGroup && matchedCompany
                        ? { companyId: matchedCompany._id, companyName: matchedCompanyName }
                        : {}),
                      ...(msgEphemeralExp > 0 ? { ephemeralExpiration: msgEphemeralExp } : {}),
                    },
                    $setOnInsert: {
                      name: isMetaAi
                        ? "Meta AI"
                        : isGroup
                          ? (groupSubject || "WhatsApp Group")
                          : (contactName || fallbackPhoneLabel),
                      contactName: isMetaAi ? "Meta AI" : (isGroup ? (groupSubject || "WhatsApp Group") : contactName),
                    },
                    ...(!isFromMe && !isExistingMsg && m.type === "notify" ? { $inc: { unreadCount: 1 } } : {}),
                  },
                  { upsert: true, new: true }
                );

                // Emit realtime socket event once per socket across session and user rooms
                if (this.io) {
                  const resolvedDisplayName = isMetaAi
                    ? "Meta AI"
                    : isGroup
                      ? (updatedChatDoc?.groupSubject || updatedChatDoc?.name || groupSubject || "WhatsApp Group")
                      : (
                        (updatedChatDoc?.name && !/^\+\d+$/.test(updatedChatDoc.name.trim()) ? updatedChatDoc.name.trim() : "") ||
                        updatedChatDoc?.contactName ||
                        contactName ||
                        matchedClientName ||
                        matchedCompanyName ||
                        fallbackPhoneLabel
                      );
                  const socketPayload = {
                    sessionId,
                    chatJid: resolvedSenderJid,
                    rawJid: senderJid,
                    from: resolvedPhoneNumber,
                    name: resolvedDisplayName,
                    contactName: updatedChatDoc?.contactName || contactName || "",
                    groupSubject: updatedChatDoc?.groupSubject || groupSubject || "",
                    isGroup: Boolean(isGroup),
                    profilePictureUrl: updatedChatDoc?.profilePictureUrl || null,
                    unreadCount: typeof updatedChatDoc?.unreadCount === "number" ? updatedChatDoc.unreadCount : undefined,
                    isClient: Boolean(updatedChatDoc?.clientId || matchedClient),
                    clientId: updatedChatDoc?.clientId ? String(updatedChatDoc.clientId) : (matchedClient?._id ? String(matchedClient._id) : null),
                    clientName: updatedChatDoc?.clientName || matchedClientName,
                    isCompany: Boolean(updatedChatDoc?.companyId || matchedCompany),
                    companyId: updatedChatDoc?.companyId ? String(updatedChatDoc.companyId) : (matchedCompany?._id ? String(matchedCompany._id) : null),
                    companyName: updatedChatDoc?.companyName || matchedCompanyName,
                    ephemeralExpiration: Number(updatedChatDoc?.ephemeralExpiration || existingChat?.ephemeralExpiration || msgEphemeralExp || 0),
                    message: savedMsg,
                  };
                  const targetRoom = session.userId
                    ? this.io.to(sessionId).to(`user:${session.userId.toString()}`)
                    : this.io.to(sessionId);
                  targetRoom.emit("chat:message", socketPayload);
                }

                // If this is an incoming message from the contact, all prior outgoing messages in this chat
                // have now been seen and read by the contact (turning single tick / delivered tick into double blue ticks)!
                if (!isFromMe) {
                  try {
                    const basePhone = resolvedPhoneNumber || resolvedSenderJid.replace(/@.*/, "").replace(/:\d+$/, "");
                    const candidateOutJids = [
                      resolvedSenderJid,
                      senderJid,
                      `${basePhone}@s.whatsapp.net`,
                      `${basePhone}:0@s.whatsapp.net`,
                      `${basePhone}:1@s.whatsapp.net`,
                      `${basePhone}@c.us`,
                    ].filter(Boolean);

                    const prevOutgoing = await WaChatMessage.find({
                      sessionId,
                      chatJid: { $in: candidateOutJids },
                      direction: "out",
                      timestamp: { $lte: timestamp },
                      status: { $ne: "read" },
                    }).select("messageId").lean();

                    if (prevOutgoing.length > 0) {
                      const prevIds = prevOutgoing.map((m) => m.messageId);
                      await WaChatMessage.updateMany(
                        { sessionId, messageId: { $in: prevIds } },
                        { $set: { status: "read" } }
                      );
                      if (this.io) {
                        for (const pId of prevIds) {
                          const statusPayload = {
                            sessionId,
                            messageId: pId,
                            status: "read",
                          };
                          const targetRoom = session?.userId
                            ? this.io.to(sessionId).to(`user:${session.userId.toString()}`)
                            : this.io.to(sessionId);
                          targetRoom.emit("chat:message_status", statusPayload);
                        }
                      }
                    }
                  } catch (outReadErr) {
                    console.warn("[WA OUTGOING READ] Error auto-resolving read ticks:", outReadErr.message);
                  }
                }

                // Auto-sync CRM Contact interaction timestamp & stats
                if (!isGroup && session.userId) {
                  try {
                    const rawDigits = (resolvedPhoneNumber || resolvedSenderJid.replace(/@.*/, "").replace(/:\d+$/, "")).replace(/[^\d]/g, "");
                    const cleanPhone = rawDigits.replace(/^0+/, "");
                    if (cleanPhone) {
                      const snippet = (text || (mediaType ? `[${mediaType}]` : "")).slice(0, 300);
                      CrmContact.findOneAndUpdate(
                        { userId: session.userId, phone: cleanPhone },
                        {
                          $set: {
                            lastInteraction: timestamp || new Date(),
                            lastInteractionText: snippet,
                            chatJid: resolvedSenderJid,
                          },
                          $inc: { totalConversations: 1 },
                        }
                      ).exec().catch(() => { });
                    }
                  } catch (_) { }
                }
              }
            } catch (saveErr) {
              console.error("[WA MESSAGE] Failed to save message:", saveErr.message);
            }

            // Process live incoming notifications for Drip Campaigns, Flows & AI Agent (skip offline/history appends)
            if (!isFromMe && m.type === "notify") {
              const effectiveUserId = session?.userId || null;
              const cleanText = text || (mediaType ? `[${mediaType}]` : "");
              console.log(
                `[WA INCOMING] Msg from ${resolvedSenderJid || senderJid} (${resolvedPhoneNumber}): "${cleanText}" (sessionId: ${sessionId})`
              );

              // Check if incoming text or button click matches an interactive Template Quick Reply with an Auto-Reply configured
              if (effectiveUserId && cleanText && !isGroup && !isMetaAi) {
                try {
                  const queryText = cleanText.trim();

                  // Direct test button reply handling
                  if (queryText === 'btn_yes' || queryText.toLowerCase() === 'yes ✅' || queryText.toLowerCase() === 'yes') {
                    this.sendMessage(sessionId, resolvedSenderJid || senderJid, 'Great, you chose YES! 🎉').catch(() => {});
                  } else if (queryText === 'btn_no' || queryText.toLowerCase() === 'no ❌' || queryText.toLowerCase() === 'no') {
                    this.sendMessage(sessionId, resolvedSenderJid || senderJid, 'Okay, you chose NO.').catch(() => {});
                  }

                  const matchedTemplate = await WhatsAppTemplate.findOne({
                    userId: effectiveUserId,
                    "buttons.type": "QUICK_REPLY",
                    $or: [
                      { "buttons.text": { $regex: `^${queryText}$`, $options: "i" } },
                      { "buttons.value": { $regex: `^${queryText}$`, $options: "i" } },
                    ],
                  }).lean();

                  if (matchedTemplate) {
                    const matchedBtn = matchedTemplate.buttons?.find(
                      (b) =>
                        b.type === "QUICK_REPLY" &&
                        ((b.text && b.text.trim().toLowerCase() === queryText.toLowerCase()) ||
                          (b.value && b.value.trim().toLowerCase() === queryText.toLowerCase()))
                    );

                    if (matchedBtn?.autoReplyText) {
                      console.log(`[QUICK REPLY AUTO] Matched button "${matchedBtn.text}", auto-replying to ${resolvedSenderJid || senderJid}`);
                      setTimeout(async () => {
                        try {
                          await this.sendMessage(sessionId, resolvedSenderJid || senderJid, matchedBtn.autoReplyText);
                        } catch (sendAutoErr) {
                          console.warn("[QUICK REPLY AUTO] Failed to send auto-reply:", sendAutoErr.message);
                        }
                      }, 1200);
                    }
                  }
                } catch (qrAutoErr) {
                  console.warn("[QUICK REPLY AUTO] Notice:", qrAutoErr.message);
                }
              }

              // Check active drip sequences and stop sequence on customer reply
              dripService
                .handleIncomingReply(effectiveUserId, sessionId, resolvedSenderJid || senderJid, cleanText, resolvedPhoneNumber)
                .catch((err) => console.error("[WA MESSAGE] Drip trigger error:", err.message));

              if (effectiveUserId && !isGroup && !isMetaAi && cleanText) {
                executeFlowOnMessage(
                  sessionId,
                  resolvedPhoneNumber || resolvedSenderJid || senderJid,
                  cleanText,
                  effectiveUserId,
                ).catch((err) => console.error("[WA MESSAGE] Flow trigger error:", err.message));
              }

              // Check AI Agent first (Precedence check: "Skipped when a chatbot already answered the message")
              (async () => {
                let chatbotAnswered = false;
                try {
                  chatbotAnswered = await handleIncomingMessage(sessionId, senderJid, text, async (jid, content) => {
                    const liveSock = this.sockets.get(sessionId);
                    if (!liveSock || !this.isSocketOpen(liveSock)) {
                      throw new Error("Session is not connected");
                    }
                    await liveSock.sendPresenceUpdate("composing", jid).catch(() => { });
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                    await this.sendMessage(sessionId, jid, content);
                    await this.sockets.get(sessionId)?.sendPresenceUpdate("paused", jid).catch(() => { });
                  });
                } catch (err) {
                  console.error("[WA MESSAGE] AI Agent error:", err);
                }

                // Automation Rules (Welcome message, Away message, Business hours)
                // WhatsApp Only, strictly skipped when group or when chatbot already answered
                if (effectiveUserId && !isGroup) {
                  try {
                    const targetJid = resolvedSenderJid || senderJid;
                    console.log(`[AUTOMATION] ⚡ Checking inbound automation for ${targetJid} on ${sessionId} (pushName: ${safePushName || msg.pushName || contactName})`);
                    const result = await evaluateInboundMessage({
                      userId: effectiveUserId,
                      sessionId,
                      senderJid: targetJid,
                      pushName: safePushName || msg.pushName || contactName || "",
                      phoneNumber: resolvedPhoneNumber,
                      chatbotAnswered: Boolean(chatbotAnswered),
                    });
                    console.log(`[AUTOMATION] ⚡ Decision for ${targetJid}:`, result);

                    if (result && (result.action === "send_welcome" || result.action === "send_away")) {
                      if (result.text && targetJid) {
                        const liveSock = this.sockets.get(sessionId);
                        if (liveSock && this.isSocketOpen(liveSock)) {
                          await liveSock.sendPresenceUpdate("composing", targetJid).catch(() => {});
                          await new Promise((r) => setTimeout(r, 1200));
                          await this.sendMessage(sessionId, targetJid, result.text);
                          await this.sockets.get(sessionId)?.sendPresenceUpdate("paused", targetJid).catch(() => {});
                          console.log(`[AUTOMATION] ✅ ${result.action} successfully sent to ${targetJid}`);
                        } else {
                          console.warn(`[AUTOMATION] ⚠️ Socket not open for session ${sessionId}, cannot send reply`);
                        }
                      }

                      // If welcome message configured "Then continue in flow"
                      if (result.action === "send_welcome" && result.thenContinueType === "flow") {
                        executeFlowOnMessage(
                          sessionId,
                          resolvedPhoneNumber || targetJid,
                          cleanText || "Welcome",
                          effectiveUserId
                        ).catch((err) => console.error("[AUTOMATION] Flow trigger error:", err.message));
                      }
                    }
                  } catch (autoErr) {
                    console.error("[AUTOMATION] Inbound message evaluation error:", autoErr.message);
                  }
                }
              })().catch((err) => console.error("[WA MESSAGE] Pipeline error:", err.message));
            }
          }
        }
      }
    });

    // Listen to real-time reaction events (Baileys messages.reaction)
    sock.ev.on("messages.reaction", async (reactionEvents) => {
      if (!isSessionWriteAllowed(sessionId, sock)) return;
      for (const item of reactionEvents || []) {
        const rxKey = item?.key;
        const rx = item?.reaction;
        if (!rxKey?.id) continue;
        const fromMe = Boolean(rx?.key?.fromMe);
        const rxSender = fromMe
          ? "me"
          : (rx?.key?.participant || rx?.key?.remoteJid || rxKey.remoteJid || "");
        await this.applyReactionUpdate(sessionId, {
          targetMessageId: rxKey.id,
          chatJid: rxKey.remoteJid || "",
          emoji: rx?.text || "",
          fromMe,
          senderJid: rxSender,
        });
      }
    });

    // Listen to real-time message status updates (sent -> delivered -> read / blue tick)
    sock.ev.on("messages.update", async (updates) => {
      if (!isSessionWriteAllowed(sessionId, sock)) return;
      for (const update of updates || []) {
        if (!update.key?.id) continue;
        const msgId = update.key.id;
        const statusVal = update.update?.status !== undefined ? update.update.status : update.status;

        // Baileys status mapping: 2=sent, 3=delivered, 4=read, 5=played
        let newStatus = null;
        if (statusVal === 2 || statusVal === "2" || statusVal === "SERVER_ACK") newStatus = "sent";
        else if (statusVal === 3 || statusVal === "3" || statusVal === "DELIVERY_ACK") newStatus = "delivered";
        else if (statusVal === 4 || statusVal === "4" || statusVal === 5 || statusVal === "5" || statusVal === "READ" || statusVal === "PLAYED") newStatus = "read";

        if (newStatus) {
          try {
            await WaChatMessage.updateOne(
              { sessionId, messageId: msgId },
              { $set: { status: newStatus } }
            );

            await Message.updateOne(
              { messageId: msgId },
              { $set: { status: newStatus, ...(newStatus === "read" ? { readAt: new Date() } : {}) } }
            ).catch(() => { });

            if (this.io) {
              const statusPayload = {
                sessionId,
                messageId: msgId,
                status: newStatus,
              };
              const sessionObj = await SessionModel.findOne({ sessionId }).lean();
              const targetRoom = sessionObj?.userId
                ? this.io.to(sessionId).to(`user:${sessionObj.userId.toString()}`)
                : this.io.to(sessionId);
              targetRoom.emit("chat:message_status", statusPayload);
            }
          } catch (e) { }
        }
      }
    });

    // Listen to real-time message receipt updates (read / blue ticks & played receipts)
    sock.ev.on("message-receipt.update", async (receipts) => {
      if (!isSessionWriteAllowed(sessionId, sock)) return;
      for (const r of receipts || []) {
        if (!r.key?.id) continue;
        const msgId = r.key.id;
        const receiptData = r.receipt;
        const isRead = !!(receiptData?.readTimestamp || receiptData?.playedTimestamp);
        const isDelivered = !isRead && !!(receiptData?.receiptTimestamp || receiptData?.deliveryTimestamp);
        const newStatus = isRead ? "read" : isDelivered ? "delivered" : null;

        if (newStatus) {
          try {
            await WaChatMessage.updateOne(
              { sessionId, messageId: msgId },
              { $set: { status: newStatus } }
            );

            await Message.updateOne(
              { messageId: msgId },
              { $set: { status: newStatus, ...(isRead ? { readAt: new Date() } : {}) } }
            ).catch(() => { });

            if (this.io) {
              const statusPayload = {
                sessionId,
                messageId: msgId,
                status: newStatus,
                readTimestamp: receiptData?.readTimestamp || receiptData?.playedTimestamp,
              };
              const sessionObj = await SessionModel.findOne({ sessionId }).lean();
              const targetRoom = sessionObj?.userId
                ? this.io.to(sessionId).to(`user:${sessionObj.userId.toString()}`)
                : this.io.to(sessionId);
              targetRoom.emit("chat:message_status", statusPayload);
            }
          } catch (e) { }
        }
      }
    });

    // Listen to real-time contact presence updates (typing, recording, online/available)
    sock.ev.on("presence.update", async (presenceUpdate) => {
      try {
        const { id, presences } = presenceUpdate;
        if (!id) return;

        if (this.io) {
          const presencePayload = {
            sessionId,
            chatJid: id,
            presences: presences || {},
          };
          this.io.to(sessionId).emit("chat:presence", presencePayload);
        }

        // Optionally update WaChat isOnline/isTyping flag in database
        if (presences && isSessionWriteAllowed(sessionId, sock)) {
          const isComposing = Object.values(presences).some(
            (p) => p?.lastKnownPresence === "composing" || p?.lastKnownPresence === "recording"
          );
          const isOnline = Object.values(presences).some(
            (p) => p?.lastKnownPresence === "available" || p?.lastKnownPresence === "composing"
          );

          await WaChat.updateOne(
            { sessionId, chatJid: id },
            { $set: { isTyping: isComposing, isOnline: isOnline } }
          ).catch(() => { });
        }
      } catch (err) {
        console.warn("[WA PRESENCE] presence.update error:", err.message);
      }
    });

    // Handle history sync to populate database via ChatSyncService
    sock.ev.on("messaging-history.set", async (history) => {
      console.log(`[WA HISTORY] Received history set: ${history.chats?.length || 0} chats, ${history.messages?.length || 0} messages`);
      await chatSyncService.handleHistorySync(sessionId, history, sock, this.io);
    });

    // Listen to new chats upsert
    sock.ev.on("chats.upsert", async (newChats) => {
      await chatSyncService.handleChatsUpsert(sessionId, newChats, sock, this.io);
    });

    // Listen to chat deletion
    sock.ev.on("chats.delete", async (chatJids) => {
      await chatSyncService.handleChatsDelete(sessionId, chatJids, sock, this.io);
    });

    // Listen to contacts sync
    sock.ev.on("contacts.upsert", async (contacts) => {
      await chatSyncService.handleContactsUpsert(sessionId, contacts, sock, this.io);
    });

    sock.ev.on("contacts.update", async (contacts) => {
      await chatSyncService.handleContactsUpsert(sessionId, contacts, sock, this.io);
    });

    sock.ev.on("lid-mapping.update", async (mappings) => {
      await chatSyncService.handleLidMappings(sessionId, mappings);
    });

    // Listen to newly discovered or joined groups
    sock.ev.on("groups.upsert", async (newGroups) => {
      try {
        console.log(`[WA GROUPS] groups.upsert received ${newGroups?.length || 0} groups for session ${sessionId}`);
        await groupSyncService.handleGroupsUpsert(sessionId, newGroups, sock, this.io);
      } catch (err) {
        console.warn(`[WA GROUPS] groups.upsert error:`, err.message);
      }
    });

    // Keep group metadata and MongoDB fresh on group updates (subject, desc, announce, restrict)
    sock.ev.on("groups.update", async (groupUpdates) => {
      try {
        await groupSyncService.handleGroupsUpdate(sessionId, groupUpdates, sock, this.io);

        for (const update of groupUpdates || []) {
          if (update?.id) {
            try {
              const freshMeta = await sock.groupMetadata(update.id);
              if (freshMeta) {
                if (freshMeta.participants) {
                  await resolveGroupParticipantsLids(sock, freshMeta.participants);
                }
                this.setGroupMetadataInCache(sessionId, update.id, freshMeta);
              }
            } catch (e) {
              this.invalidateGroupMetadataCache(sessionId, update.id);
            }
          }
        }
      } catch (err) {
        console.warn(`[WA GROUPS] groups.update cache refresh error:`, err.message);
      }
    });

    // Real-time group participant additions, removals, promotions, demotions
    sock.ev.on("group-participants.update", async (event) => {
      try {
        await groupSyncService.handleGroupParticipantsUpdate(sessionId, event, sock, this.io);

        if (event?.id) {
          try {
            const freshMeta = await sock.groupMetadata(event.id);
            if (freshMeta) {
              if (freshMeta.participants) {
                await resolveGroupParticipantsLids(sock, freshMeta.participants);
              }
              this.setGroupMetadataInCache(sessionId, event.id, freshMeta);
            }
          } catch (e) {
            this.invalidateGroupMetadataCache(sessionId, event.id);
          }
        }
      } catch (err) {
        console.warn(`[WA GROUPS] group-participants.update error:`, err.message);
      }
    });

    // Listen to chats update (unread count syncing, pin, archive, mute)
    sock.ev.on("chats.update", async (chatUpdates) => {
      await chatSyncService.handleChatsUpdate(sessionId, chatUpdates, sock, this.io);
    });

    return sock;
  }


  async createSession(userId, name, options = {}) {
    const { enableChatView = false, chatPasscode = "" } = options;
    const sessionId = `wa_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const trimmedPasscode = String(chatPasscode || "").trim();
    const chatPasscodeHash =
      trimmedPasscode.length >= 4 ? await bcrypt.hash(trimmedPasscode, 10) : null;

    const sessionDb = new SessionModel({
      userId: new mongoose.Types.ObjectId(userId),
      name,
      sessionId,
      status: "pending",
      isLinked: false,
      credentials: {},
      chatViewEnabled: !!(enableChatView || chatPasscodeHash),
      chatPasscodeHash,
    });
    await sessionDb.save();

    clearSessionDeactivated(sessionId);
    const authState = await useMongoAuthState(sessionId);
    const sock = await this.createSocket(sessionId, authState, { allowQR: true });
    this.sockets.set(sessionId, sock);

    if (this.io)
      this.io.to(sessionId).emit("session:created", { sessionId, name, isLinked: false });

    return { sessionId, name, status: "pending", isLinked: false };
  }

  /**
   * Checks if a WhatsApp session is currently active, authenticated, and its WebSocket is open.
   * @param {string} sessionId
   * @returns {boolean}
   */
  isSessionWorking(sessionId) {
    if (!sessionId) return false;
    const sock = this.sockets.get(sessionId);
    if (!sock || sock._isDestroyed) return false;
    const hasUser = !!(sock.user?.id || sock.authState?.state?.creds?.me?.id);
    return !!(hasUser && this.isSocketOpen(sock));
  }

  /**
   * Connects a session ONLY IF it is not already connected and working.
   * Guarantees that an already working session is NEVER reconnected or disturbed.
   * @param {string} sessionId
   * @param {object} options
   */
  async connectSession(sessionId, options = {}) {
    if (this.isSessionWorking(sessionId)) {
      console.log(`[WA CONNECT] Session ${sessionId} is already active and working. Skipping reconnect.`);
      return { sessionId, status: "connected", alreadyWorking: true };
    }
    return this.reconnectSession(sessionId, options);
  }

  /**
   * Connects multiple sessions safely one by one with sequential pacing.
   * @param {string[]} sessionIds
   * @param {object} options
   */
  async connectSessions(sessionIds = [], options = {}) {
    const results = [];
    for (let i = 0; i < sessionIds.length; i++) {
      const sId = sessionIds[i];
      if (this.isSessionWorking(sId)) {
        console.log(`[WA CONNECT] Session ${sId} is already active and working. Skipping.`);
        results.push({ sessionId: sId, status: "connected", alreadyWorking: true });
        continue;
      }
      const hasCreds = await this.validateSessionCredentials(sId);
      if (!hasCreds && !options.allowQR) {
        results.push({ sessionId: sId, status: "pending", needsPairing: true });
        continue;
      }
      results.push({ sessionId: sId, status: "connecting" });
      this.reconnectSession(sId, { manual: true, ...options }).catch(() => { });
      if (i < sessionIds.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    return results;
  }

  /**
   * Explicitly connects a session for QR pairing or phone-code pairing on user request.
   * Clears retry exhaustion counters so the user can pair smoothly without background loops.
   */
  async connectForQR(sessionId, { fresh = false } = {}) {
    if (this.isSessionWorking(sessionId)) {
      return { sessionId, status: "connected", alreadyWorking: true };
    }

    this.clearReconnectTimer(sessionId);
    this.reconnectAttempts.delete(sessionId);
    this.reconnectCooldown.delete(sessionId);

    if (fresh) {
      this.pendingQRCodes.delete(sessionId);
      this.removeSocket(sessionId);
      await this.removeSessionFiles(sessionId);
    }

    return this.reconnectSession(sessionId, {
      manual: true,
      bypassCooldown: true,
      allowQR: true,
    });
  }

  async reconnectSession(sessionId, options = {}) {
    const {
      manual = false,
      force = false,
      isRestart = false,
      hardReset = false,
      bypassCooldown = false,
      allowQR = false,
      fromAutoRetry = false,
    } = options;

    // CRITICAL: NEVER reconnect a session that is already working and connected!
    if (!hardReset && this.isSessionWorking(sessionId)) {
      console.log("[WA RECONNECT] Session is already working and connected. Never reconnecting.", { sessionId });
      return { sessionId, status: "connected", alreadyWorking: true };
    }

    // Only clear retry budget on explicit manual action or explicit non-auto force
    if (manual || (force && !fromAutoRetry)) {
      this.clearReconnectTimer(sessionId);
      this.reconnectAttempts.delete(sessionId);
      this.reconnectCooldown.delete(sessionId);
    }

    // Prevent duplicate concurrent reconnects
    if (this.pendingReconnects.has(sessionId)) {
      return { sessionId, status: "connecting" };
    }

    const attempts = this.reconnectAttempts.get(sessionId) || 0;
    const isUnbounded = manual || force;

    // Enforce max 2 auto-retry attempts unless manually initiated by user
    if (!isUnbounded && !fromAutoRetry && attempts >= this.MAX_AUTO_RECONNECT_ATTEMPTS) {
      console.log(
        `[WA RECONNECT] Auto-retry limit (${this.MAX_AUTO_RECONNECT_ATTEMPTS}) already reached for ${sessionId} -> staying in pairing idle`,
      );
      return await this.moveToPairingIdle(sessionId);
    }
    if (!isUnbounded && fromAutoRetry && attempts > this.MAX_AUTO_RECONNECT_ATTEMPTS) {
      return await this.moveToPairingIdle(sessionId);
    }

    // Check cooldown without wiping retry counters
    if (!isUnbounded && !bypassCooldown && !isRestart && !this.canReconnect(sessionId, false)) {
      const lastReconnect = this.reconnectCooldown.get(sessionId) || 0;
      const remainingMs = Math.max(1500, 15000 - (Date.now() - lastReconnect));
      console.log(
        `[WA RECONNECT] session ${sessionId} in cooldown, scheduling single retry in ${remainingMs}ms (attempt ${attempts}/${this.MAX_AUTO_RECONNECT_ATTEMPTS})`,
      );
      if (!this.reconnectTimers.has(sessionId)) {
        await this.scheduleAutoReconnect(sessionId, { delayMs: remainingMs, allowQR });
      }
      return { sessionId, status: "connecting" };
    }

    this.pendingReconnects.add(sessionId);
    this.reconnectCooldown.set(sessionId, Date.now());

    // Direct background callers (watchdog / heartbeat / etc.) consume 1 auto-retry attempt
    if (!isUnbounded && !fromAutoRetry && !isRestart) {
      this.reconnectAttempts.set(sessionId, attempts + 1);
    }

    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) {
        return null;
      }

      if (this.sockets.has(sessionId)) {
        try {
          this.removeSocket(sessionId);
        } catch (e) { }
      }

      console.log("[WA RECONNECT] checking creds", { sessionId, allowQR, attempt: this.reconnectAttempts.get(sessionId) || 0 });
      const hasCreds = await this.validateSessionCredentials(sessionId);

      if (!hasCreds) {
        if (!allowQR) {
          console.log(`[WA RECONNECT] no valid creds for ${sessionId} and QR not requested -> moving to idle pairing (0 background load)`);
          return await this.moveToPairingIdle(sessionId, {
            errorMsg: "No active session credentials. Click Pairing QR to link device.",
          });
        }
        console.log(`[WA RECONNECT] no valid creds found for ${sessionId}, generating on-demand QR for pairing...`);
        await this.handleSessionStateChange(sessionId, "pending");
        clearSessionDeactivated(sessionId);
        const authState = await useMongoAuthState(sessionId);
        const sock = await this.createSocket(sessionId, authState, { allowQR: true });
        this.sockets.set(sessionId, sock);
        return { sessionId, status: "pending", needsPairing: true };
      }

      clearSessionDeactivated(sessionId);
      const authState = await useMongoAuthState(sessionId);
      const isValidCreds = this.isValidAuthState(authState);
      if (!isValidCreds && !isRestart && !manual) {
        console.warn(
          "[WA RECONNECT] incomplete/invalid creds detected — moving to idle pairing without background loop",
          { sessionId },
        );
        return await this.moveToPairingIdle(sessionId, {
          errorMsg: "Session credentials incomplete. Please scan Pairing QR to link.",
        });
      }

      const sock = await this.createSocket(sessionId, authState, { allowQR });
      this.sockets.set(sessionId, sock);
      await this.handleSessionStateChange(sessionId, "connecting", {
        lastError: "",
      });
      return { sessionId, status: "connecting" };
    } finally {
      this.pendingReconnects.delete(sessionId);
    }
  }

  /**
   * Restores previously active sessions sequentially on server startup.
   * Only restores sessions with valid saved credentials (skips idle pending / logged-out sessions).
   */
  async restoreSessions() {
    if (this.isRestoring) {
      console.log("[WA RESTORE] restoreSessions already running, skipping duplicate call.");
      return;
    }
    this.isRestoring = true;

    try {
      const sessions = await SessionModel.find({
        status: { $in: ["connecting", "connected"] },
      }).lean();

      console.log("[WA RESTORE] Boot restore starting...", {
        totalFoundInDb: sessions.length,
        activeSockets: this.sockets.size,
      });

      // Filter only sessions that have valid credentials in MongoDB
      const toRestore = [];
      for (const s of sessions) {
        if (this.isSessionWorking(s.sessionId)) continue;

        const hasCreds = await this.validateSessionCredentials(s.sessionId);
        if (hasCreds) {
          toRestore.push(s);
        } else {
          await this.moveToPairingIdle(s.sessionId, {
            errorMsg: "Device needs QR pairing to connect.",
          });
        }
      }

      console.log(`[WA RESTORE] Found ${toRestore.length} sessions with valid credentials. Restoring sequentially one by one...`);

      // 2.5 second safe spacing between connections for optimal resource and network distribution
      const STAGGER_MS = 2500;

      for (let i = 0; i < toRestore.length; i++) {
        const s = toRestore[i];
        try {
          if (this.isSessionWorking(s.sessionId)) {
            console.log(`[WA RESTORE] (${i + 1}/${toRestore.length}) Session ${s.sessionId} already working. Skipping.`);
            continue;
          }

          console.log(`[WA RESTORE] (${i + 1}/${toRestore.length}) Connecting session ${s.sessionId} (${s.phoneNumber || s.name || 'Account'})...`);

          // Allow clean up-to-2 auto-retry budget during boot restore (without endless loop)
          this.reconnectAttempts.delete(s.sessionId);
          this.reconnectCooldown.delete(s.sessionId);
          await this.reconnectSession(s.sessionId, { bypassCooldown: true, fromAutoRetry: false });

          // Stagger each session initialization sequentially
          if (i < toRestore.length - 1) {
            await new Promise((resolve) => setTimeout(resolve, STAGGER_MS));
          }
        } catch (e) {
          console.error(`[WA RESTORE] Error restoring session ${s.sessionId}:`, e.message);
        }
      }

      console.log(`[WA RESTORE] Boot restore sequence completed. Active sockets: ${this.sockets.size}`);
      await this.cleanupOrphanedSessionData();
    } catch (e) {
      console.error("[WA RESTORE] Global error restoring sessions:", e.message);
    } finally {
      this.isRestoring = false;
    }
  }

  startAutoReconnectWatchdog() {
    if (this._watchdogInterval) clearInterval(this._watchdogInterval);
    this._watchdogInterval = setInterval(async () => {
      // Never interfere with ongoing boot restore sequence
      if (this.isRestoring) {
        return;
      }

      try {
        // Clean up abandoned unlinked onboarding drafts older than 10 minutes with no active socket
        const staleCutoff = new Date(Date.now() - 10 * 60 * 1000);
        const staleDrafts = await SessionModel.find({
          isLinked: { $ne: true },
          phoneNumber: { $in: ["", null] },
          lastConnected: null,
          createdAt: { $lt: staleCutoff },
        }).select("sessionId").lean();

        for (const draft of staleDrafts) {
          const draftSock = this.sockets.get(draft.sessionId);
          const hasQr = this.pendingQRCodes.has(draft.sessionId);
          if (!draftSock && !hasQr) {
            await this.deleteSession(draft.sessionId).catch(() => { });
          }
        }

        const sessions = await SessionModel.find({
          status: { $in: ["connecting", "connected"] },
        }).lean();

        for (const s of sessions) {
          // If session is already connected and working in memory, sync DB if needed and skip
          if (this.isSessionWorking(s.sessionId)) {
            if (s.status !== "connected") {
              const liveSock = this.sockets.get(s.sessionId);
              const phone = (liveSock?.user?.id || "").split("@")[0].split(":")[0];
              await SessionModel.updateOne(
                { sessionId: s.sessionId },
                { status: "connected", ...(phone ? { phoneNumber: phone } : {}) }
              ).catch(() => { });
            }
            continue;
          }

          // Skip if actively connecting, retrying on a timer, or socket handshake in progress
          const liveSock = this.sockets.get(s.sessionId);
          const isConnecting =
            this.pendingReconnects.has(s.sessionId) ||
            this.reconnectTimers.has(s.sessionId) ||
            (liveSock && !liveSock._isDestroyed && (liveSock.ws?.isConnecting || !liveSock.user?.id));
          if (isConnecting) continue;

          const attempts = this.reconnectAttempts.get(s.sessionId) || 0;
          if (attempts >= this.MAX_AUTO_RECONNECT_ATTEMPTS) {
            // Exhausted 2 auto-retries -> ensure DB moves out of connecting/connected into idle pairing ('pending')
            await this.moveToPairingIdle(s.sessionId);
            continue;
          }

          const hasCreds = await this.validateSessionCredentials(s.sessionId);
          if (!hasCreds) {
            await this.moveToPairingIdle(s.sessionId, {
              errorMsg: "No active session credentials. Click Pairing QR to link device.",
            });
            continue;
          }

          const lastAttempt = this.reconnectCooldown.get(s.sessionId) || 0;
          if (Date.now() - lastAttempt > 45000) {
            console.log(`[WA WATCHDOG] Auto-reconnecting dropped session ${s.sessionId} (attempt ${attempts + 1}/${this.MAX_AUTO_RECONNECT_ATTEMPTS})...`);
            await this.reconnectSession(s.sessionId).catch(() => { });
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch (e) { }
    }, 60000);
  }

  getPendingQR(sessionId) {
    return this.pendingQRCodes.get(sessionId) || null;
  }

  /**
   * Pure read-only status snapshot helper (NEVER triggers reconnect storms on GET polling).
   */
  getLiveSessionSnapshot(session) {
    if (!session) return null;

    const sessionId = session.sessionId;
    const sock = this.sockets.get(sessionId);
    const isLiveConnected = this.isSessionWorking(sessionId);
    const isReconnecting =
      this.pendingReconnects.has(sessionId) ||
      this.reconnectTimers.has(sessionId) ||
      !!(sock && !sock._isDestroyed && sock.ws?.isConnecting);
    const hasPendingQR = this.pendingQRCodes.has(sessionId);
    const phoneNumber = isLiveConnected
      ? (sock.user?.id || "").split("@")[0].split(":")[0]
      : session.phoneNumber;

    let status = session.status;
    if (isLiveConnected) {
      status = "connected";
      if (session.status !== "connected" || (!session.phoneNumber && phoneNumber)) {
        SessionModel.updateOne(
          { sessionId },
          { status: "connected", lastError: "", ...(phoneNumber ? { phoneNumber } : {}) }
        ).catch(() => { });
      }
    } else if (hasPendingQR) {
      status = "qr";
    } else if (isReconnecting || this.isRestoring) {
      status = session.status === "connected" || session.status === "connecting" ? "connecting" : session.status;
    } else if (status === "connected" || status === "connecting") {
      // No live socket and no active retry in progress -> report honest pairing/idle status
      const attempts = this.reconnectAttempts.get(sessionId) || 0;
      if (attempts >= this.MAX_AUTO_RECONNECT_ATTEMPTS || !sock) {
        status = "pending";
      }
    }

    return {
      sessionId,
      name: session.name,
      status,
      phoneNumber,
      lastConnected: session.lastConnected,
      lastError: session.lastError || "",
      chatViewEnabled: !!session.chatViewEnabled,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  }

  async getSessionStatus(sessionId) {
    const session = await SessionModel.findOne({ sessionId }).lean();
    if (!session) return null;
    const snapshot = this.getLiveSessionSnapshot(session);
    return {
      sessionId: snapshot.sessionId,
      name: snapshot.name,
      status: snapshot.status,
      phoneNumber: snapshot.phoneNumber,
      lastError: snapshot.lastError,
    };
  }

  async emitSessionUpdate(sessionId, statusInfo) {
    if (!this.io) return false;
    try {
      const session = await SessionModel.findOne({ sessionId });
      if (!session) return false;
      const userId = session.userId.toString();
      const effectiveStatus = statusInfo.status || session.status;
      const effectivePhone = statusInfo.phoneNumber || session.phoneNumber;
      const effectiveLastConnected = statusInfo.lastConnected || session.lastConnected;
      const isLinked = !!(
        session.isLinked ||
        statusInfo.isLinked ||
        effectivePhone ||
        effectiveLastConnected ||
        effectiveStatus === "connected"
      );

      const payload = {
        sessionId,
        name: session.name,
        status: effectiveStatus,
        phone: effectivePhone,
        phoneNumber: effectivePhone,
        isLinked,
        lastConnected: effectiveLastConnected,
        lastError: statusInfo.lastError !== undefined ? statusInfo.lastError : (session.lastError || ""),
      };

      // Only broadcast into the main user workspace once the session has completed pairing
      // (or belongs to an already-linked session), preventing incomplete rows from flashing in the list.
      if (isLinked) {
        this.io.to(`user:${userId}`).emit("session:update", payload);
      }
      this.io.to(sessionId).emit("session:update", payload);
      return true;
    } catch (e) { }

    return false;
  }

  /**
   * Cancels pending reconnects, sends WhatsApp logout/unlink when the WebSocket is open
   * (bounded by timeoutMs), and destroys/removes the socket without re-triggering pairing-idle.
   */
  async logoutAndDestroySocket(sessionId, timeoutMs = 4000) {
    markSessionDeactivated(sessionId);
    this.clearReconnectTimer(sessionId);
    this.pendingReconnects.delete(sessionId);
    this.pendingQRCodes.delete(sessionId);
    this.reconnectAttempts.delete(sessionId);
    this.reconnectCooldown.delete(sessionId);

    const sock = this.sockets.get(sessionId);
    if (!sock) {
      this.clearHeartbeat(sessionId);
      return false;
    }

    sock.authState?.abort?.();

    const wsOpen =
      Boolean(sock.ws?.isOpen) ||
      sock.ws?.readyState === 1 ||
      sock.ws?.socket?.readyState === 1;

    // Mark destroyed before sock.logout() so connection.update("close") won't trigger moveToPairingIdle.
    sock._isDestroyed = true;
    let loggedOut = false;

    if (wsOpen && typeof sock.logout === "function") {
      let timer = null;
      const logoutPromise = Promise.resolve()
        .then(() => sock.logout())
        .then(() => {
          loggedOut = true;
        })
        .catch((e) => {
          console.debug?.(`[logoutAndDestroySocket] ${sessionId} sock.logout error: ${e?.message || e}`);
        });

      try {
        await Promise.race([
          logoutPromise,
          new Promise((resolve) => {
            timer = setTimeout(resolve, timeoutMs);
            if (typeof timer.unref === "function") timer.unref();
          }),
        ]);
      } finally {
        if (timer) clearTimeout(timer);
      }
    }

    this.destroySocket(sessionId);
    this.removeSocket(sessionId);
    this.clearHeartbeat(sessionId);
    return loggedOut;
  }

  async logoutSession(sessionId) {
    const sessionDoc = await SessionModel.findOne({ sessionId }).select("userId").lean().catch(() => null);
    await this.logoutAndDestroySocket(sessionId);

    await this.removeSessionFiles(sessionId);
    const cleanupRes = await this.clearSessionLoadedData(sessionId, {
      resetSyncMeta: true,
      reason: "disconnected",
      userId: sessionDoc?.userId || null,
    });
    await this.handleSessionStateChange(sessionId, "disconnected", {
      isLinked: false,
      phoneNumber: "",
      groupsCount: 0,
      groupSyncStatus: "pending",
      lastGroupSyncAt: null,
      credentials: {},
      lastError: "Disconnected by user.",
    });
    return { success: true, deletedCounts: cleanupRes?.deletedCounts || {} };
  }

  async requestPairingCode(sessionId, phoneNumber) {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error("Socket connection not found. Please reconnect the session.");
    }

    try {
      await waitForSocketOpenWithTimeout(sock);
      // Give a tiny grace period for noise handshake to complete
      await new Promise(resolve => setTimeout(resolve, 1500));

      console.log(`[WA PAIRING] Requesting pairing code for session ${sessionId} and phone ${phoneNumber}`);
      const code = await sock.requestPairingCode(phoneNumber);
      return code;
    } catch (err) {
      console.error("[WA PAIRING] Failed to request pairing code:", err);
      throw new Error("Failed to request pairing code: " + err.message);
    }
  }

  async createGroup(sessionId, subject, participants = [], options = {}) {
    console.log(`[WA GROUPS] createGroup requested for sessionId: "${sessionId}". Active socket keys in memory:`, Array.from(this.sockets.keys()));
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error("Socket connection not found. Please reconnect the session.");
    }
    try {
      await waitForSocketOpenWithTimeout(sock);
      const group = await sock.groupCreate(subject, participants);

      if (group && group.id) {
        // 1. Edit Group Settings (locked = only admins, unlocked = all members)
        if (options.editGroupSettings !== undefined) {
          const restrictMode = options.editGroupSettings === false ? 'locked' : 'unlocked';
          console.log(`[WA GROUPS] Setting restrictMode for group ${group.id} to ${restrictMode}`);
          await sock.groupSettingUpdate(group.id, restrictMode).catch(err => {
            console.error(`Failed to set restrictMode for group ${group.id}:`, err);
          });
        }

        // 2. Send New Messages (announcement = only admins, not_announcement = all members)
        if (options.sendNewMessages !== undefined) {
          const announceMode = options.sendNewMessages === false ? 'announcement' : 'not_announcement';
          console.log(`[WA GROUPS] Setting announceMode for group ${group.id} to ${announceMode}`);
          await sock.groupSettingUpdate(group.id, announceMode).catch(err => {
            console.error(`Failed to set announceMode for group ${group.id}:`, err);
          });
        }

        // 3. Add Other Members (admin_add = only admins, all_member_add = all members)
        if (options.memberAddMode) {
          console.log(`[WA GROUPS] Setting memberAddMode for group ${group.id} to ${options.memberAddMode}`);
          await sock.groupMemberAddMode(group.id, options.memberAddMode).catch(err => {
            console.error(`Failed to set memberAddMode for group ${group.id}:`, err);
          });
        }

        // 4. Approve New Members (on = admin approval required, off = open)
        if (options.joinApprovalMode) {
          console.log(`[WA GROUPS] Setting joinApprovalMode for group ${group.id} to ${options.joinApprovalMode}`);
          await sock.groupJoinApprovalMode(group.id, options.joinApprovalMode).catch(err => {
            console.error(`Failed to set joinApprovalMode for group ${group.id}:`, err);
          });
        }

        // 5. Send Message History (optional custom node query)
        if (options.sendMessageHistory !== undefined) {
          const historyMode = options.sendMessageHistory === false ? 'off' : 'on';
          console.log(`[WA GROUPS] Setting sendMessageHistory for group ${group.id} to ${historyMode}`);
          try {
            await sock.query({
              tag: 'iq',
              attrs: {
                type: 'set',
                xmlns: 'w:g2',
                to: group.id
              },
              content: [
                {
                  tag: 'member_history_sharing',
                  attrs: {},
                  content: [{ tag: 'history_sharing', attrs: { state: historyMode } }]
                }
              ]
            });
          } catch (err) {
            console.warn(`[WA GROUPS] Custom history_sharing query not supported by server:`, err.message);
          }
        }

        // 6. Invite via Link (optional custom node query)
        if (options.inviteViaLink !== undefined) {
          const inviteMode = options.inviteViaLink === false ? 'off' : 'on';
          console.log(`[WA GROUPS] Setting inviteViaLink for group ${group.id} to ${inviteMode}`);
          try {
            await sock.query({
              tag: 'iq',
              attrs: {
                type: 'set',
                xmlns: 'w:g2',
                to: group.id
              },
              content: [
                {
                  tag: 'allow_member_invite_links',
                  attrs: { enabled: inviteMode }
                }
              ]
            });
          } catch (err) {
            // Silently fall back if the server or Baileys doesn't support the raw node
          }
        }
      }

      return group;
    } catch (err) {
      console.error(`[WA GROUPS] Failed to create group "${subject}":`, err);
      throw new Error(`Failed to create group "${subject}": ` + err.message);
    }
  }

  async createMultiAccountGroups(sessionIds = [], subjects = [], rawParticipants = [], maxMembersPerGroup = 100, options = {}) {
    if (!Array.isArray(sessionIds) || sessionIds.length === 0) {
      throw new Error("At least one WhatsApp session must be selected.");
    }

    const activeSessions = [];
    for (const sid of sessionIds) {
      const sock = this.sockets.get(sid);
      if (sock) {
        activeSessions.push({ sessionId: sid, sock });
      }
    }

    if (activeSessions.length === 0) {
      throw new Error("None of the selected WhatsApp sessions are currently active. Please check session connections.");
    }

    const coAdminJidsMap = new Map();
    const allCoAdminJids = [];
    for (const item of activeSessions) {
      const jid = item.sock.user?.id ? (item.sock.user.id.split(":")[0] + "@s.whatsapp.net") : null;
      if (jid) {
        coAdminJidsMap.set(item.sessionId, jid);
        allCoAdminJids.push(jid);
      }
    }

    const cleanNumbers = (Array.isArray(rawParticipants) ? rawParticipants : String(rawParticipants || "").split(/[\r\n,;\t]+/))
      .map(p => String(p).replace(/\D/g, "").trim())
      .filter(p => p.length >= 10 && p.length <= 15);

    const participantJids = Array.from(new Set(cleanNumbers)).map(num => `${num}@s.whatsapp.net`);

    const limit = Math.max(1, Math.min(1024, Number(maxMembersPerGroup) || 100));

    let groupTasks = [];
    const subjectsArray = Array.isArray(subjects) ? subjects.map(s => String(s).trim()).filter(Boolean) : [String(subjects).trim()];

    if (subjectsArray.length === 1 && participantJids.length > limit) {
      const baseSubject = subjectsArray[0];
      const chunks = [];
      for (let i = 0; i < participantJids.length; i += limit) {
        chunks.push(participantJids.slice(i, i + limit));
      }
      groupTasks = chunks.map((chunk, idx) => ({
        subject: `${baseSubject} ${idx + 1}`,
        participants: chunk
      }));
    } else if (subjectsArray.length > 0) {
      if (participantJids.length > 0) {
        const chunkSize = Math.ceil(participantJids.length / subjectsArray.length);
        groupTasks = subjectsArray.map((subj, idx) => {
          const chunk = participantJids.slice(idx * chunkSize, (idx + 1) * chunkSize);
          return { subject: subj, participants: chunk };
        });
      } else {
        groupTasks = subjectsArray.map(subj => ({ subject: subj, participants: [] }));
      }
    } else {
      throw new Error("At least one group subject is required.");
    }

    const createdGroups = [];
    const errors = [];

    let sessionIndex = 0;
    for (const task of groupTasks) {
      const activeSession = activeSessions[sessionIndex % activeSessions.length];
      sessionIndex++;

      const creatorSock = activeSession.sock;
      const creatorSessionId = activeSession.sessionId;

      try {
        await waitForSocketOpenWithTimeout(creatorSock);

        const creatorJid = coAdminJidsMap.get(creatorSessionId);
        const otherCoAdminJids = allCoAdminJids.filter(j => j !== creatorJid);

        const initialParticipants = Array.from(new Set([...task.participants, ...otherCoAdminJids]));

        const group = await creatorSock.groupCreate(task.subject, initialParticipants);

        if (group && group.id) {
          if (otherCoAdminJids.length > 0) {
            try {
              await creatorSock.groupParticipantsUpdate(group.id, otherCoAdminJids, "promote");
            } catch (pErr) {
              console.warn(`[WA GROUPS] Failed to promote co-admins in group ${group.id}:`, pErr.message);
            }
          }

          if (options.editGroupSettings !== undefined) {
            const restrictMode = options.editGroupSettings === false ? 'locked' : 'unlocked';
            await creatorSock.groupSettingUpdate(group.id, restrictMode).catch(() => { });
          }

          if (options.sendNewMessages !== undefined) {
            const announceMode = options.sendNewMessages === false ? 'announcement' : 'not_announcement';
            await creatorSock.groupSettingUpdate(group.id, announceMode).catch(() => { });
          }

          if (options.memberAddMode) {
            await creatorSock.groupMemberAddMode(group.id, options.memberAddMode).catch(() => { });
          }

          if (options.joinApprovalMode) {
            await creatorSock.groupJoinApprovalMode(group.id, options.joinApprovalMode).catch(() => { });
          }
        }

        createdGroups.push({
          subject: task.subject,
          id: group.id,
          creatorSessionId,
          coAdminsAdded: otherCoAdminJids.length,
          participantsCount: task.participants.length,
          totalParticipantsInGroup: group.participants?.length || initialParticipants.length,
        });

      } catch (err) {
        console.error(`[WA GROUPS] Multi-account group creation failed for "${task.subject}":`, err);
        errors.push({
          subject: task.subject,
          sessionId: creatorSessionId,
          error: err.message
        });
      }
    }

    return {
      success: true,
      created: createdGroups,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  async syncSessionGroups(sessionId, options = {}) {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error("Socket connection not found. Please reconnect the session.");
    }
    await waitForSocketOpenWithTimeout(sock);
    return await groupSyncService.syncSessionGroups(sessionId, sock, this.io, options);
  }

  async getGroups(sessionId, options = {}) {
    const { force = false } = options;

    // 1. FAST PATH: Read directly from MongoDB if available & not forced
    if (!force) {
      const cached = await WhatsAppGroup.find({ sessionId }).sort({ participantCount: -1 }).lean();
      if (cached && cached.length > 0) {
        return cached;
      }
    }

    // 2. FALLBACK: Sync from live Baileys socket if DB is empty or force is true
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      return await WhatsAppGroup.find({ sessionId }).sort({ participantCount: -1 }).lean();
    }

    try {
      await this.syncSessionGroups(sessionId, { prune: true });
      return await WhatsAppGroup.find({ sessionId }).sort({ participantCount: -1 }).lean();
    } catch (err) {
      console.warn("[WA GROUPS] Live sync failed, returning cached records:", err.message);
      return await WhatsAppGroup.find({ sessionId }).sort({ participantCount: -1 }).lean();
    }
  }

  async addParticipantsToGroup(sessionId, groupId, rawParticipants = [], options = {}) {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error("Socket connection not found for this WhatsApp account.");
    }
    await waitForSocketOpenWithTimeout(sock);

    const cleanNumbers = (Array.isArray(rawParticipants) ? rawParticipants : String(rawParticipants || "").split(/[\r\n,;\t]+/))
      .map(p => String(p).replace(/\D/g, "").trim())
      .filter(p => p.length >= 10 && p.length <= 15);

    if (cleanNumbers.length === 0) {
      throw new Error("No valid phone numbers (10-15 digits) provided.");
    }

    const participantJids = Array.from(new Set(cleanNumbers)).map(num => `${num}@s.whatsapp.net`);

    console.log(`[WA GROUPS] Safely processing ${participantJids.length} member addition(s) to group ${groupId}`);

    const batchSize = Math.max(1, Math.min(3, Number(options.batchSize) || 2));
    const addedList = [];
    const invitedList = [];
    const failedList = [];

    const sleep = (ms) => new Promise(res => setTimeout(res, ms));

    let inviteCode = null;
    try {
      inviteCode = await sock.groupInviteCode(groupId);
    } catch (e) {
      console.warn(`[WA GROUPS] Could not fetch group invite code for ${groupId}:`, e.message);
    }

    for (let i = 0; i < participantJids.length; i += batchSize) {
      const chunk = participantJids.slice(i, i + batchSize);

      if (i > 0) {
        await sleep(2000);
      }

      try {
        const response = await sock.groupParticipantsUpdate(groupId, chunk, "add");

        if (response && typeof response === "object") {
          for (const jid of chunk) {
            const resData = response[jid] || (Array.isArray(response) ? response.find(r => r.jid === jid || r.id === jid) : null);
            const status = resData ? String(resData.status || resData.code || "") : "200";

            if (status === "200" || status === "207") {
              addedList.push(jid);
            } else if (status === "403" || status === "408") {
              if (inviteCode && options.autoSendInviteLink !== false) {
                const inviteUrl = `https://chat.whatsapp.com/${inviteCode}`;
                try {
                  await sock.sendMessage(jid, {
                    text: `Hello! You have been invited to join our WhatsApp group: ${inviteUrl}`
                  });
                  invitedList.push({ jid, reason: "Privacy settings restrict direct addition. Group invite link sent via direct message." });
                } catch (sendErr) {
                  failedList.push({ jid, status, error: "Privacy settings restrict addition and failed to send invite link." });
                }
              } else {
                failedList.push({ jid, status, error: "User privacy settings prohibit adding to groups." });
              }
            } else if (status === "409") {
              addedList.push(jid);
            } else {
              failedList.push({ jid, status, error: resData?.message || `Status code: ${status}` });
            }
          }
        } else {
          addedList.push(...chunk);
        }

      } catch (batchErr) {
        console.warn(`[WA GROUPS] Batch addition failed for ${chunk.join(", ")}:`, batchErr.message);

        if (batchErr.message?.includes("rate-overlimit") || batchErr.message?.includes("429")) {
          console.log(`[WA GROUPS] Rate limit hit. Waiting 3.5s before sending invite fallback...`);
          await sleep(3500);
        }

        for (const jid of chunk) {
          if (inviteCode && options.autoSendInviteLink !== false) {
            try {
              const inviteUrl = `https://chat.whatsapp.com/${inviteCode}`;
              await sock.sendMessage(jid, {
                text: `Hello! You have been invited to join our WhatsApp group: ${inviteUrl}`
              });
              invitedList.push({ jid, reason: "Rate limit reached. Direct invite link sent via message." });
            } catch (msgErr) {
              failedList.push({ jid, error: batchErr.message });
            }
          } else {
            failedList.push({ jid, error: batchErr.message });
          }
        }
      }
    }

    return {
      success: true,
      groupId,
      totalRequested: participantJids.length,
      addedCount: addedList.length,
      invitedCount: invitedList.length,
      failedCount: failedList.length,
      added: addedList,
      invited: invitedList,
      failed: failedList,
      inviteLink: inviteCode ? `https://chat.whatsapp.com/${inviteCode}` : null
    };
  }

  async getGroupMetadata(sessionId, groupId) {
    if (!groupId) return null;
    const cached = this.getGroupMetadataFromCache(sessionId, groupId);
    if (cached) return cached;

    let sock = sessionId ? this.getSocket(sessionId) : null;
    if (!sock || !this.isSessionWorking(sessionId)) {
      for (const [sId, s] of this.sockets.entries()) {
        if (this.isSessionWorking(sId)) {
          sock = s;
          break;
        }
      }
    }

    if (!sock) {
      throw new Error("Socket connection not found. Please reconnect the session.");
    }
    try {
      await waitForSocketOpenWithTimeout(sock, 5000);
      const metadata = await sock.groupMetadata(groupId);
      if (metadata && metadata.participants) {
        await resolveGroupParticipantsLids(sock, metadata.participants);
      }
      if (metadata) {
        this.setGroupMetadataInCache(sessionId, groupId, metadata);
      }
      return metadata;
    } catch (err) {
      console.error(`[WA GROUPS] Failed to fetch group metadata for ${groupId}:`, err);
      throw new Error("Failed to fetch group metadata: " + err.message);
    }
  }

  async getGroupInviteLink(sessionId, groupId) {
    const sock = this.sockets.get(sessionId);
    if (!sock) {
      throw new Error("Socket connection not found. Please reconnect the session.");
    }
    try {
      await waitForSocketOpenWithTimeout(sock);
      const code = await sock.groupInviteCode(groupId);
      return `https://chat.whatsapp.com/${code}`;
    } catch (err) {
      console.error(`[WA GROUPS] Failed to fetch group invite code for ${groupId}:`, err);
      throw new Error("Failed to fetch group invite code: " + err.message);
    }
  }

  extractGroupInviteCode(inviteUrlOrCode) {
    if (!inviteUrlOrCode) return "";
    const str = String(inviteUrlOrCode).trim();
    const match = str.match(/(?:chat\.whatsapp\.com\/(?:invite\/)?)([a-zA-Z0-9_-]+)/i);
    if (match && match[1]) {
      return match[1];
    }
    const clean = str.replace(/[^a-zA-Z0-9_-]/g, "");
    return clean;
  }

  async getGroupInviteInfo(sessionId, inviteUrlOrCode) {
    const code = this.extractGroupInviteCode(inviteUrlOrCode);
    if (!code) {
      throw new Error("Invalid WhatsApp group invite link or code.");
    }

    let sock = sessionId ? this.getSocket(sessionId) : null;
    if (!sock || !this.isSessionWorking(sessionId)) {
      // Pick any connected active socket if provided session is unavailable
      for (const [sId, s] of this.sockets.entries()) {
        if (this.isSessionWorking(sId)) {
          sock = s;
          break;
        }
      }
    }

    if (!sock) {
      throw new Error("No connected WhatsApp account available to inspect group invite link.");
    }

    await waitForSocketOpenWithTimeout(sock, 5000).catch(() => { });
    try {
      const info = await sock.groupGetInviteInfo(code);
      const jid = info.id ? (info.id.includes("@") ? info.id : `${info.id}@g.us`) : "";
      let participants = Array.isArray(info.participants) ? info.participants : [];
      if (jid) {
        try {
          const fullMeta = await sock.groupMetadata(jid);
          if (fullMeta && Array.isArray(fullMeta.participants) && fullMeta.participants.length > 0) {
            participants = fullMeta.participants;
          }
        } catch (e) { }
      }
      return {
        id: jid,
        subject: info.subject || "WhatsApp Group",
        size: info.size || participants.length || 0,
        creation: info.creation,
        owner: info.owner,
        desc: info.desc,
        inviteCode: code,
        inviteUrl: `https://chat.whatsapp.com/${code}`,
        code,
        participants,
      };
    } catch (err) {
      console.error(`[WA GROUPS] Failed to resolve group invite info for ${code}:`, err.message);
      throw new Error(`Failed to resolve group invite link: ${err.message}`);
    }
  }

  async joinGroupViaInvite(sessionId, inviteUrlOrCode) {
    const code = this.extractGroupInviteCode(inviteUrlOrCode);
    if (!code) {
      throw new Error("Invalid WhatsApp group invite link or code.");
    }

    let sock = sessionId ? this.getSocket(sessionId) : null;
    if (!sock || !this.isSessionWorking(sessionId)) {
      for (const [sId, s] of this.sockets.entries()) {
        if (this.isSessionWorking(sId)) {
          sock = s;
          break;
        }
      }
    }

    if (!sock) {
      throw new Error("WhatsApp account is not connected.");
    }

    await waitForSocketOpenWithTimeout(sock, 5000).catch(() => { });

    try {
      let groupJid = null;
      try {
        const info = await sock.groupGetInviteInfo(code);
        if (info?.id) {
          groupJid = info.id.includes("@") ? info.id : `${info.id}@g.us`;
        }
      } catch (e) { }

      const res = await sock.groupAcceptInvite(code);
      const finalJid = res ? (res.includes("@") ? res : `${res}@g.us`) : groupJid;
      console.log(`[WhatsAppService] Session joined group via invite ${code} -> ${finalJid}`);
      return finalJid;
    } catch (err) {
      const errMsg = String(err?.message || err || "").toLowerCase();
      if (
        errMsg.includes("409") ||
        errMsg.includes("already") ||
        errMsg.includes("participant") ||
        errMsg.includes("joined")
      ) {
        console.log(`[WhatsAppService] Session is already a member of group (${code}). Resolving group JID...`);
        try {
          const info = await sock.groupGetInviteInfo(code);
          if (info?.id) {
            return info.id.includes("@") ? info.id : `${info.id}@g.us`;
          }
        } catch (e) { }
        return null;
      }
      console.error(`[WhatsAppService] joinGroupViaInvite error for code ${code}:`, err);
      throw new Error(err.message || "Failed to join group via invite link.");
    }
  }

  async getProfilePictureUrl(sessionId, jid) {
    const sock = this.sockets.get(sessionId);
    if (!sock) return null;
    try {
      await waitForSocketOpenWithTimeout(sock, 4000);
      try {
        const preview = await sock.profilePictureUrl(jid, "preview");
        if (preview) return preview;
      } catch (e1) {
        const full = await sock.profilePictureUrl(jid, "image");
        if (full) return full;
      }
      return null;
    } catch (err) {
      // 404/401/no-profile-photo or socket busy
      return null;
    }
  }

  async getBatchProfilePictures(sessionId, jids) {
    const sock = this.sockets.get(sessionId);
    if (!sock || !Array.isArray(jids) || jids.length === 0) return {};

    await waitForSocketOpenWithTimeout(sock, 4000).catch(() => { });

    const results = {};
    const chunkSize = 8;
    for (let i = 0; i < jids.length; i += chunkSize) {
      const chunk = jids.slice(i, i + chunkSize);
      await Promise.allSettled(
        chunk.map(async (jid) => {
          try {
            let url = null;
            try {
              url = await sock.profilePictureUrl(jid, "preview");
            } catch (e1) {
              url = await sock.profilePictureUrl(jid, "image").catch(() => null);
            }
            if (url) {
              results[jid] = url;
            }
          } catch (e) { }
        })
      );
      if (i + chunkSize < jids.length) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
    return results;
  }

  getSocket(sessionId) {
    return this.sockets.get(sessionId) || null;
  }

  async syncSessionChats(sessionId) {
    const sock = this.sockets.get(sessionId);
    if (!sock) throw new Error("Session is not connected");
    return chatSyncService.syncSessionChats(sessionId, sock, this.io);
  }

  async loadChatHistory(sessionId, chatJid, limit = 50) {
    return [];
  }

  async deleteSession(sessionId) {
    const sessionDoc = await SessionModel.findOne({ sessionId }).select("userId").lean().catch(() => null);
    await this.logoutAndDestroySocket(sessionId);

    await this.removeSessionFiles(sessionId);
    const cleanupRes = await this.clearSessionLoadedData(sessionId, {
      resetSyncMeta: false,
      reason: "deleted",
      userId: sessionDoc?.userId || null,
    });
    await SessionModel.deleteOne({ sessionId }).catch(() => { });

    if (this.io) {
      const deletedPayload = {
        sessionId,
        deletedCounts: cleanupRes?.deletedCounts || {},
      };
      this.io.to(sessionId).emit("session:deleted", deletedPayload);
      if (sessionDoc?.userId) {
        this.io.to(`user:${sessionDoc.userId.toString()}`).emit("session:deleted", deletedPayload);
      }
    }

    return { success: true, deletedCounts: cleanupRes?.deletedCounts || {} };
  }
}

export default new WhatsAppService();
