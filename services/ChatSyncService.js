import { jidNormalizedUser, downloadMediaMessage } from "@whiskeysockets/baileys";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";
import { WaChat, WaChatMessage, WaContact, WaChatNote, WaChatReminder, WhatsAppSession, WhatsAppGroup, WhatsAppAuthState, CrmContact, Client, Company } from "../models/index.js";
import { buildPhoneMatchKeys, findMatchingCrmRecords } from "../utils/crmChatLink.js";
import groupSyncService from "./GroupSyncService.js";
import { handleIncomingMessage } from "./AiAgentService.js";
import { recordIncomingMetaAiMessage, isMetaAiJid, META_AI_NORMALIZED_JID } from "./MetaAiService.js";
import { isSessionWriteAllowed } from "../utils/sessionLifecycle.js";
import { processIncomingMediaMessage } from "../utils/mediaSettingsHelper.js";

/**
 * Normalizes JID to standard WhatsApp format without device identifiers
 */
function normalizeJid(jid) {
  if (!jid || typeof jid !== "string") return "";
  const clean = jidNormalizedUser(jid);
  return clean.replace(/:\d+@/, "@");
}

/**
 * Normalizes phone number from JID or raw string (returns "" for groups or unresolved LIDs)
 */
function extractPhoneNumber(jid) {
  if (!jid) return "";
  const cleaned = normalizeJid(jid);
  if (cleaned.endsWith("@g.us") || cleaned.endsWith("@lid") || cleaned.endsWith("@newsletter") || cleaned.endsWith("@broadcast")) {
    return "";
  }
  return cleaned.replace(/@.*/, "").replace(/:\d+$/, "").replace(/\D/g, "");
}

/**
 * Extracts a finite number from primitive or protobufjs Long objects.
 */
function toNumericValue(val) {
  if (val == null) return 0;
  if (typeof val === "number") return Number.isFinite(val) ? val : 0;
  if (typeof val === "string") {
    const n = Number(val);
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof val?.toNumber === "function") {
    const n = val.toNumber();
    return Number.isFinite(n) ? n : 0;
  }
  if (typeof val?.low === "number") {
    const n = Number(val.low) + Number(val.high || 0) * 4294967296;
    return Number.isFinite(n) ? n : 0;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Converts a Baileys timestamp (seconds, ms, or protobuf Long) into a valid Date or null.
 */
function toUnixDate(val) {
  const raw = toNumericValue(val);
  if (!raw || raw <= 0) return null;
  const ms = raw > 1e12 ? raw : raw * 1000;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Parses Baileys chat pin state (boolean, 0/null, or Unix seconds timestamp / Long).
 */
function parsePinnedState(pinnedVal) {
  if (pinnedVal === true) return { isPinned: true, pinnedAt: new Date() };
  if (pinnedVal === false || pinnedVal === null || pinnedVal === 0) {
    return { isPinned: false, pinnedAt: null };
  }
  const d = toUnixDate(pinnedVal);
  if (d) return { isPinned: true, pinnedAt: d };
  const n = toNumericValue(pinnedVal);
  return { isPinned: n > 0, pinnedAt: n > 0 ? new Date() : null };
}

/**
 * Resolves @lid JIDs to their real @s.whatsapp.net PN JID when available via Baileys alt fields, lidMapping, or auth state
 */
async function resolveLidToPnJid(rawJid, altJid, sock, sessionId = null) {
  if (!rawJid || typeof rawJid !== "string") return "";
  let normalized = normalizeJid(rawJid);
  if (!normalized.endsWith("@lid")) return normalized;

  if (altJid && !altJid.endsWith("@lid")) {
    return normalizeJid(altJid);
  }
  if (sock?.signalRepository?.lidMapping?.getPNForLID) {
    try {
      const pnJid = await sock.signalRepository.lidMapping.getPNForLID(rawJid);
      if (pnJid) return normalizeJid(pnJid);
    } catch (_) {}
  }
  if (sessionId) {
    try {
      const lidUser = normalized.replace(/@.*/, "").replace(/:\d+$/, "");
      if (lidUser) {
        const revDoc = await WhatsAppAuthState.findOne({
          sessionId,
          dataType: "lid-mapping",
          dataId: `${lidUser}_reverse`,
        })
          .select("dataJson")
          .lean();
        if (revDoc?.dataJson) {
          const parsedPn = String(JSON.parse(revDoc.dataJson) || "").replace(/\D/g, "");
          if (parsedPn && parsedPn !== lidUser) {
            return `${parsedPn}@s.whatsapp.net`;
          }
        }
      }
    } catch (_) {}
  }
  return normalized;
}

/**
 * Safely extracts message body and media from Baileys message object
 */
function unwrapMessage(msg) {
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

  const text =
    msgContent?.conversation ||
    msgContent?.extendedTextMessage?.text ||
    msgContent?.interactiveMessage?.body?.text ||
    msgContent?.interactiveResponseMessage?.body?.text ||
    msgContent?.interactiveMessage?.header?.title ||
    msgContent?.buttonsMessage?.contentText ||
    msgContent?.templateMessage?.hydratedTemplate?.hydratedContentText ||
    msgContent?.templateMessage?.hydratedFourRowTemplate?.hydratedContentText ||
    msgContent?.imageMessage?.caption ||
    msgContent?.videoMessage?.caption ||
    msgContent?.documentMessage?.caption ||
    msgContent?.buttonsResponseMessage?.selectedButtonId ||
    msgContent?.buttonsResponseMessage?.selectedDisplayText ||
    msgContent?.templateButtonReplyMessage?.selectedId ||
    msgContent?.templateButtonReplyMessage?.selectedDisplayText ||
    msgContent?.listResponseMessage?.title ||
    msgContent?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    rawMsg?.botResponse?.text ||
    "";

  const mediaType = msgContent?.imageMessage
    ? "image"
    : msgContent?.videoMessage
    ? "video"
    : msgContent?.documentMessage
    ? "document"
    : msgContent?.audioMessage
    ? "audio"
    : null;

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

  const interactiveMsg = msgContent?.interactiveMessage || rawMsg?.interactiveMessage;
  let buttons = null;
  let header = "";
  let footer = "";
  if (interactiveMsg) {
    if (interactiveMsg.header?.title) header = interactiveMsg.header.title;
    if (interactiveMsg.footer?.text) footer = interactiveMsg.footer.text;
    if (interactiveMsg.nativeFlowMessage?.buttons) {
      buttons = interactiveMsg.nativeFlowMessage.buttons.map((b) => {
        try {
          const parsed = JSON.parse(b.buttonParamsJson || "{}");
          return parsed.display_text || b.name;
        } catch {
          return b.name;
        }
      });
    }
  } else if (msgContent?.buttonsMessage) {
    header = msgContent.buttonsMessage.headerText || "";
    footer = msgContent.buttonsMessage.footerText || "";
    buttons = (msgContent.buttonsMessage.buttons || []).map((b) => b.buttonText?.displayText || b.buttonId);
  }

  return { text, mediaType: buttons?.length ? (mediaType || "buttons") : mediaType, quotedMessage, msgContent, isProtocolEdit, targetEditMessageId, buttons, header, footer };
}

class ChatSyncService {
  constructor() {
    this.syncStateMap = new Map();
    this.activeSyncPromises = new Map();
  }

  getSyncStatus(sessionId) {
    if (!sessionId) return null;
    const state = this.syncStateMap.get(sessionId);
    if (!state) return null;
    // Expire stale "syncing" state after 3 minutes so UI never gets stuck if socket restarted
    if (state.status === "syncing" && Date.now() - new Date(state.updatedAt).getTime() > 3 * 60 * 1000) {
      return { ...state, status: "completed", progress: 100 };
    }
    return state;
  }

  emitSyncProgress(io, sessionId, userId, payload) {
    if (!sessionId) return;
    const nextState = {
      sessionId,
      status: payload.status || "syncing",
      stage: payload.stage || "syncing",
      progress: typeof payload.progress === "number" ? payload.progress : 0,
      message: payload.message || "",
      stats: payload.stats || {},
      updatedAt: new Date(),
    };
    this.syncStateMap.set(sessionId, nextState);
    if (io) {
      io.to(sessionId).emit("chats:sync_progress", nextState);
      if (userId) {
        io.to(`user:${userId.toString()}`).emit("chats:sync_progress", nextState);
      }
    }
  }

  /**
   * Handle full or initial history sync from Baileys 'messaging-history.set'
   */
  async handleHistorySync(sessionId, { chats, contacts, messages, isLatest, progress }, sock, io) {
    if (!isSessionWriteAllowed(sessionId, sock)) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session || !isSessionWriteAllowed(sessionId, sock)) return;
      const userId = session.userId;

      console.log(
        `[CHAT SYNC] Processing history set for ${sessionId}: ${chats?.length || 0} chats, ${contacts?.length || 0} contacts, ${messages?.length || 0} messages`
      );

      const historyPct =
        typeof progress === "number" && progress > 0
          ? Math.min(92, Math.max(45, Math.round(progress)))
          : 72;

      this.emitSyncProgress(io, sessionId, userId, {
        status: "syncing",
        stage: "syncing_history",
        progress: historyPct,
        message: `Syncing ${chats?.length || 0} conversations & ${messages?.length || 0} messages...`,
        stats: {
          historyChatsCount: chats?.length || 0,
          contactsCount: contacts?.length || 0,
          messagesCount: messages?.length || 0,
        },
      });

      // 1. Process contacts into WaContact
      const contactMap = {};
      if (Array.isArray(contacts) && contacts.length > 0) {
        const contactBulk = [];
        for (const c of contacts) {
          if (!c.id) continue;
          const normJid = normalizeJid(c.id);
          const name = c.name || c.notify || c.verifiedName || "";
          contactMap[normJid] = name;
          contactMap[c.id] = name;

          contactBulk.push({
            updateOne: {
              filter: { userId, sessionId, jid: normJid },
              update: {
                $set: {
                  userId,
                  sessionId,
                  jid: normJid,
                  phoneNumber: extractPhoneNumber(normJid),
                  name: c.name || "",
                  pushName: c.notify || "",
                  verifiedName: c.verifiedName || "",
                },
              },
              upsert: true,
            },
          });
        }
        if (contactBulk.length > 0 && isSessionWriteAllowed(sessionId, sock)) {
          await WaContact.bulkWrite(contactBulk, { ordered: false }).catch(() => {});
        }
      }

      if (!isSessionWriteAllowed(sessionId, sock)) return;

      // 2. Process chats into WaChat
      if (Array.isArray(chats) && chats.length > 0) {
        const chatBulk = [];
        for (const chat of chats) {
          if (!isSessionWriteAllowed(sessionId, sock)) return;
          if (!chat.id) continue;
          const normJid = await resolveLidToPnJid(chat.id, chat.pnJid, sock, sessionId);
          const isGroup = normJid.endsWith("@g.us");
          const phone = isGroup ? "" : extractPhoneNumber(normJid);
          const chatName =
            chat.name ||
            contactMap[normJid] ||
            contactMap[chat.id] ||
            (isGroup ? "WhatsApp Group" : phone ? `+${phone}` : "WhatsApp Contact");
          const lastTime =
            toUnixDate(chat.conversationTimestamp) ||
            toUnixDate(chat.lastMsgTimestamp);
          const rawPin = chat.pinned !== undefined ? chat.pinned : chat.pin;
          const pinState = rawPin !== undefined ? parsePinnedState(rawPin) : null;

          chatBulk.push({
            updateOne: {
              filter: { userId, sessionId, chatJid: normJid },
              update: {
                $set: {
                  isGroup,
                  ...(isGroup ? { phoneNumber: "" } : phone ? { phoneNumber: phone } : {}),
                  unreadCount: chat.unreadCount || 0,
                  ...(lastTime ? { lastMessageTime: lastTime } : {}),
                  ...(pinState ? { isPinned: pinState.isPinned, pinnedAt: pinState.pinnedAt } : {}),
                  isArchived: !!chat.archived,
                  isMuted: !!(chat.muteEndTime && toNumericValue(chat.muteEndTime) > 0),
                  mutedUntil: toUnixDate(chat.muteEndTime),
                },
                $setOnInsert: {
                  userId,
                  sessionId,
                  chatJid: normJid,
                  ...(isGroup ? {} : { phoneNumber: phone }),
                  name: chatName,
                  contactName: chatName,
                  lastMessage: "",
                  ...(lastTime ? {} : { lastMessageTime: null }),
                  ...(pinState ? {} : { isPinned: false, pinnedAt: null }),
                },
              },
              upsert: true,
            },
          });
        }
        if (chatBulk.length > 0 && isSessionWriteAllowed(sessionId, sock)) {
          await WaChat.bulkWrite(chatBulk, { ordered: false }).catch(() => {});
        }
      }

      if (!isSessionWriteAllowed(sessionId, sock)) return;

      // 3. Process messages into WaChatMessage and backfill latest message preview onto WaChat
      if (Array.isArray(messages) && messages.length > 0) {
        const msgBulk = [];
        const chatLatestMap = new Map();
        for (const msg of messages) {
          if (!isSessionWriteAllowed(sessionId, sock)) return;
          if (!msg.message || !msg.key?.id) continue;
          const isFromMe = !!msg.key.fromMe;
          const rawSender = msg.key.remoteJid;
          if (!rawSender) continue;
          const normJid = await resolveLidToPnJid(rawSender, msg.key.remoteJidAlt, sock, sessionId);
          const participantJid = msg.key.participant
            ? await resolveLidToPnJid(msg.key.participant, msg.key.participantAlt, sock, sessionId)
            : (isFromMe ? null : normJid);

          const { text, mediaType, quotedMessage } = unwrapMessage(msg);
          const timestamp = toUnixDate(msg.messageTimestamp) || new Date();
          const snippet = text || (mediaType ? `[${mediaType}]` : "");

          msgBulk.push({
            updateOne: {
              filter: { messageId: msg.key.id, sessionId },
              update: {
                $set: {
                  userId,
                  sessionId,
                  chatJid: normJid,
                  participantJid,
                  messageId: msg.key.id,
                  text: text || "",
                  direction: isFromMe ? "out" : "in",
                  status: isFromMe ? "sent" : "delivered",
                  mediaType,
                  ...(quotedMessage ? { quotedMessage } : {}),
                  timestamp,
                },
              },
              upsert: true,
            },
          });

          if (normJid && snippet) {
            const ownProfileName = (sock?.user?.name || "").trim().toLowerCase();
            const rawPush = !isFromMe && !normJid.endsWith("@g.us") ? (msg.pushName || "").trim() : "";
            const safePush = rawPush && (!ownProfileName || rawPush.toLowerCase() !== ownProfileName) ? rawPush : "";
            const prev = chatLatestMap.get(normJid);
            if (!prev || timestamp.getTime() >= prev.timestamp.getTime()) {
              chatLatestMap.set(normJid, {
                lastMessage: snippet,
                lastMessageTime: timestamp,
                pushName: safePush || prev?.pushName || "",
              });
            }
          }
        }

        if (msgBulk.length > 0 && isSessionWriteAllowed(sessionId, sock)) {
          await WaChatMessage.bulkWrite(msgBulk, { ordered: false }).catch(() => {});
        }

        if (chatLatestMap.size > 0 && isSessionWriteAllowed(sessionId, sock)) {
          const previewOps = [];
          for (const [chatJid, info] of chatLatestMap.entries()) {
            const isGroup = chatJid.endsWith("@g.us");
            const phone = isGroup ? "" : extractPhoneNumber(chatJid);
            const preferredDirectName = contactMap[chatJid] || info.pushName;
            previewOps.push({
              updateOne: {
                filter: { userId, sessionId, chatJid },
                update: {
                  $set: {
                    lastMessage: info.lastMessage,
                    lastMessageTime: info.lastMessageTime,
                    isGroup,
                    ...(isGroup ? { phoneNumber: "" } : phone ? { phoneNumber: phone } : {}),
                  },
                  $setOnInsert: {
                    userId,
                    sessionId,
                    chatJid,
                    name: isGroup ? "WhatsApp Group" : (preferredDirectName || (phone ? `+${phone}` : "WhatsApp Contact")),
                    contactName: isGroup ? "" : (preferredDirectName || ""),
                  },
                },
                upsert: true,
              },
            });
          }
          if (isSessionWriteAllowed(sessionId, sock)) {
            await WaChat.bulkWrite(previewOps, { ordered: false }).catch(() => {});
          }
        }
      }

      if (!isSessionWriteAllowed(sessionId, sock)) return;

      console.log(`[CHAT SYNC] History sync completed successfully for ${sessionId}`);
      const [totalAfter, groupsAfter] = await Promise.all([
        WaChat.countDocuments({ sessionId, userId }).catch(() => 0),
        WaChat.countDocuments({
          sessionId,
          userId,
          $or: [{ isGroup: true }, { chatJid: /@g\.us$/i }],
        }).catch(() => 0),
      ]);
      const directAfter = Math.max(0, totalAfter - groupsAfter);

      const isFinalChunk = isLatest !== false;
      this.emitSyncProgress(io, sessionId, userId, {
        status: isFinalChunk ? "completed" : "syncing",
        stage: isFinalChunk ? "completed" : "syncing_history",
        progress: isFinalChunk ? 100 : 88,
        message: isFinalChunk
          ? `Synced ${groupsAfter} groups & ${directAfter} direct chats`
          : `Synced ${totalAfter} conversations so far...`,
        stats: {
          totalChats: totalAfter,
          groupsCount: groupsAfter,
          directCount: directAfter,
        },
      });

      if (io) {
        const syncPayload = {
          sessionId,
          lastSyncedAt: new Date(),
          totalChats: totalAfter,
          groupsCount: groupsAfter,
          directCount: directAfter,
        };
        io.to(sessionId).emit("chats:synced", syncPayload);
        io.to(`user:${userId.toString()}`).emit("chats:synced", syncPayload);
      }
    } catch (err) {
      console.error(`[CHAT SYNC] Error in handleHistorySync:`, err.message);
    }
  }

  /**
   * Handle incoming or outgoing live messages from Baileys 'messages.upsert'
   */
  async handleMessagesUpsert(sessionId, messagesData, sock, io) {
    if (!messagesData || !messagesData.messages || !isSessionWriteAllowed(sessionId, sock)) return;
    const session = await WhatsAppSession.findOne({ sessionId }).lean();
    if (!session || !isSessionWriteAllowed(sessionId, sock)) return;
    const userId = session.userId;

    for (const msg of messagesData.messages) {
      if (!isSessionWriteAllowed(sessionId, sock)) return;
      if (!msg.message || !msg.key?.id) continue;

      const isFromMe = !!msg.key.fromMe;
      const rawSenderJid = msg.key.remoteJid;
      if (!rawSenderJid) continue;

      let resolvedSenderJid = normalizeJid(rawSenderJid);
      const isMetaAi = isMetaAiJid(resolvedSenderJid) || isMetaAiJid(rawSenderJid);
      if (isMetaAi) {
        resolvedSenderJid = META_AI_NORMALIZED_JID;
      } else {
        resolvedSenderJid = await resolveLidToPnJid(rawSenderJid, msg.key.remoteJidAlt, sock, sessionId);
      }

      const rawParticipant = msg.key.participant || "";
      const participantJid = rawParticipant
        ? await resolveLidToPnJid(rawParticipant, msg.key.participantAlt, sock, sessionId)
        : (isFromMe ? null : resolvedSenderJid);
      const isGroup = resolvedSenderJid.endsWith("@g.us");
      const resolvedPhoneNumber = isMetaAi
        ? "13135550002"
        : isGroup
        ? ""
        : extractPhoneNumber(resolvedSenderJid);

      const { text, mediaType, quotedMessage, msgContent, isProtocolEdit, targetEditMessageId, buttons, header, footer } = unwrapMessage(msg);

      // Handle streaming edits (e.g. Meta AI progressive streaming text)
      if (isProtocolEdit && targetEditMessageId) {
        if (text) {
          const updatedDoc = await WaChatMessage.findOneAndUpdate(
            { messageId: targetEditMessageId, sessionId },
            { $set: { text } },
            { new: true }
          );
          if (updatedDoc && io) {
            io.to(sessionId).emit("chat:message_update", {
              sessionId,
              chatJid: updatedDoc.chatJid,
              messageId: targetEditMessageId,
              text,
            });
            io.to(sessionId).emit("chat:message", {
              sessionId,
              chatJid: updatedDoc.chatJid,
              message: updatedDoc,
            });
            io.to(`user:${userId.toString()}`).emit("chat:message", {
              sessionId,
              chatJid: updatedDoc.chatJid,
              message: updatedDoc,
            });
          }
        }
        continue;
      }

      const timestamp = msg.messageTimestamp
        ? new Date(Number(msg.messageTimestamp) * 1000)
        : new Date();

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

      if (!isSessionWriteAllowed(sessionId, sock)) return;

      // 1. Save or update WaChatMessage
      const savedMsg = await WaChatMessage.findOneAndUpdate(
        { messageId: msg.key.id, sessionId },
        {
          $set: {
            userId,
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
            ...(buttons?.length ? { buttons } : {}),
            ...(header ? { header } : {}),
            ...(footer ? { footer } : {}),
            timestamp,
          },
        },
        { upsert: true, new: true }
      );

      // 2. Update WaChat preview & unread count
      if (isMetaAi) {
        recordIncomingMetaAiMessage(sessionId);
      }

      const ownProfileName = (sock?.user?.name || "").trim().toLowerCase();
      const ownPhone = sock?.user?.id ? extractPhoneNumber(sock.user.id) : "";
      const isSelfChat = !!(ownPhone && resolvedPhoneNumber && ownPhone === resolvedPhoneNumber);
      const rawPush = !isFromMe ? (msg.pushName || "").trim() : "";
      const safePushName =
        rawPush && (!ownProfileName || isSelfChat || rawPush.toLowerCase() !== ownProfileName)
          ? rawPush
          : "";

      let savedContactName = "";
      let existingChat = null;
      if (!isMetaAi && !isGroup) {
        const candidateContactJids = [
          resolvedSenderJid,
          resolvedPhoneNumber ? `${resolvedPhoneNumber}@s.whatsapp.net` : null,
        ].filter(Boolean);
        const [waContact, foundChat] = await Promise.all([
          WaContact.findOne({ userId, sessionId, jid: { $in: candidateContactJids } })
            .select("name pushName verifiedName")
            .lean()
            .catch(() => null),
          WaChat.findOne({ userId, sessionId, chatJid: resolvedSenderJid }).lean(),
        ]);
        existingChat = foundChat;
        const cName = (waContact?.name || "").trim();
        const cPush = (waContact?.verifiedName || waContact?.pushName || "").trim();
        const validCPush =
          cPush && (!ownProfileName || isSelfChat || cPush.toLowerCase() !== ownProfileName) ? cPush : "";
        savedContactName = cName || validCPush;
      }

      const contactName = isMetaAi ? "Meta AI" : (isGroup ? "" : (savedContactName || safePushName));
      const lastSnippet = text || (mediaType ? `[${mediaType}]` : "");
      let groupSubject = "";
      let groupParticipantCount = 0;
      if (isGroup) {
        const gDoc = await WhatsAppGroup.findOne({ sessionId, jid: resolvedSenderJid })
          .select("subject participantCount size")
          .lean()
          .catch(() => null);
        if (gDoc?.subject) groupSubject = gDoc.subject;
        groupParticipantCount = gDoc?.participantCount || gDoc?.size || 0;
      }
      const chatDisplayName = isMetaAi
        ? "Meta AI"
        : isGroup
        ? (groupSubject || "WhatsApp Group")
        : (contactName || (resolvedPhoneNumber ? `+${resolvedPhoneNumber}` : "WhatsApp Contact"));

      const existingNameClean = (existingChat?.name || "").trim();
      const shouldRepairExistingName =
        !existingNameClean ||
        existingNameClean.includes(":") ||
        existingNameClean === "WhatsApp Contact" ||
        /^\+\d+$/.test(existingNameClean) ||
        (!isSelfChat && ownProfileName && existingNameClean.toLowerCase() === ownProfileName);
      const repairedName =
        contactName ||
        (existingChat && !isSelfChat && ownProfileName && existingNameClean.toLowerCase() === ownProfileName
          ? (resolvedPhoneNumber ? `+${resolvedPhoneNumber}` : "WhatsApp Contact")
          : "");

      if (!isSessionWriteAllowed(sessionId, sock)) return;

      let matchedClient = null;
      let matchedCompany = null;
      if (!isGroup && !isMetaAi && resolvedPhoneNumber) {
        const crmMatch = await findMatchingCrmRecords(userId, resolvedPhoneNumber).catch(() => ({ client: null, company: null }));
        matchedClient = crmMatch.client;
        matchedCompany = crmMatch.company;
      }
      const matchedClientName = matchedClient
        ? `${matchedClient.firstName || ""} ${matchedClient.lastName || ""}`.trim()
        : "";
      const matchedCompanyName = matchedCompany?.name ? matchedCompany.name.trim() : "";

      const chatDoc = await WaChat.findOneAndUpdate(
        { userId, sessionId, chatJid: resolvedSenderJid },
        {
          $set: {
            lastMessage: lastSnippet,
            lastMessageTime: timestamp,
            isGroup,
            phoneNumber: isGroup ? "" : resolvedPhoneNumber,
            ...(isGroup && groupSubject ? { groupSubject, name: groupSubject } : {}),
            ...(isGroup && groupParticipantCount ? { groupParticipantCount } : {}),
            ...(isMetaAi ? { name: "Meta AI", contactName: "Meta AI" } : {}),
            ...(!isMetaAi && !isGroup && repairedName && shouldRepairExistingName
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
          },
          $setOnInsert: {
            unreadCount: 0,
            ...(!isMetaAi ? {
              name: chatDisplayName,
              contactName: isGroup ? chatDisplayName : contactName,
            } : {}),
          },
          ...(isFromMe ? {} : { $inc: { unreadCount: 1 } }),
        },
        { upsert: true, new: true }
      );

      // 3. Emit WebSocket events (both to conversation thread and chat listing)
      if (io) {
        const resolvedDisplayName = isMetaAi
          ? "Meta AI"
          : isGroup
          ? (chatDoc?.groupSubject || chatDoc?.name || groupSubject || "WhatsApp Group")
          : (
              (chatDoc?.name && !/^\+\d+$/.test(chatDoc.name.trim()) ? chatDoc.name.trim() : "") ||
              chatDoc?.contactName ||
              contactName ||
              matchedClientName ||
              matchedCompanyName ||
              chatDisplayName
            );
        const socketPayload = {
          sessionId,
          chatJid: resolvedSenderJid,
          rawJid: rawSenderJid,
          from: resolvedPhoneNumber,
          name: resolvedDisplayName,
          contactName: chatDoc?.contactName || contactName || "",
          groupSubject: chatDoc?.groupSubject || groupSubject || "",
          isGroup: Boolean(isGroup),
          profilePictureUrl: chatDoc?.profilePictureUrl || null,
          unreadCount: typeof chatDoc?.unreadCount === "number" ? chatDoc.unreadCount : undefined,
          isClient: Boolean(chatDoc?.clientId || matchedClient),
          clientId: chatDoc?.clientId ? String(chatDoc.clientId) : (matchedClient?._id ? String(matchedClient._id) : null),
          clientName: chatDoc?.clientName || matchedClientName,
          isCompany: Boolean(chatDoc?.companyId || matchedCompany),
          companyId: chatDoc?.companyId ? String(chatDoc.companyId) : (matchedCompany?._id ? String(matchedCompany._id) : null),
          companyName: chatDoc?.companyName || matchedCompanyName,
          message: savedMsg,
        };
        const targetRoom = userId
          ? io.to(sessionId).to(`user:${userId.toString()}`)
          : io.to(sessionId);
        targetRoom.emit("chat:message", socketPayload);

        const chatUpdatedPayload = {
          sessionId,
          chatJid: resolvedSenderJid,
          chat: chatDoc,
          lastMessage: lastSnippet,
          lastMessageTime: timestamp,
          unreadCount: chatDoc.unreadCount,
        };
        io.to(sessionId).emit("chat:updated", chatUpdatedPayload);
        io.to(`user:${userId.toString()}`).emit("chat:updated", chatUpdatedPayload);
      }

      // 4. Auto-resolve read receipts for prior outgoing messages
      if (!isFromMe) {
        try {
          const prevOutgoing = await WaChatMessage.find({
            sessionId,
            chatJid: resolvedSenderJid,
            direction: "out",
            timestamp: { $lte: timestamp },
            status: { $ne: "read" },
          }).select("messageId").lean();

          if (prevOutgoing.length > 0) {
            const prevIds = prevOutgoing.map((m) => m.messageId);
            await WaChatMessage.updateMany(
              { messageId: { $in: prevIds } },
              { $set: { status: "read" } }
            );
            if (io) {
              for (const pId of prevIds) {
                const statusPayload = { sessionId, messageId: pId, status: "read" };
                io.to(sessionId).emit("chat:message_status", statusPayload);
                io.to(`user:${userId.toString()}`).emit("chat:message_status", statusPayload);
              }
            }
          }
        } catch (_) {}
      }

      // 5. CRM contact interaction sync
      if (!isGroup && userId) {
        const rawDigits = resolvedPhoneNumber.replace(/[^\d]/g, "").replace(/^0+/, "");
        if (rawDigits) {
          CrmContact.findOneAndUpdate(
            { userId, phone: rawDigits },
            {
              $set: {
                lastInteraction: timestamp || new Date(),
                lastInteractionText: lastSnippet.slice(0, 300),
                chatJid: resolvedSenderJid,
              },
              $inc: { totalConversations: 1 },
            }
          ).exec().catch(() => {});
        }
      }

      // 6. Drip campaigns & AI Agent responses for incoming messages
      if (!isFromMe) {
        const cleanText = text || (mediaType ? `[${mediaType}]` : "");
        dripService
          .handleIncomingReply(userId, sessionId, resolvedSenderJid, cleanText, resolvedPhoneNumber)
          .catch((err) => console.error("[CHAT SYNC] Drip trigger error:", err.message));

        handleIncomingMessage(sessionId, rawSenderJid, text, async (jid, content) => {
          if (sock) {
            await sock.sendPresenceUpdate("composing", jid);
            await new Promise((resolve) => setTimeout(resolve, 1800));
            await sock.sendMessage(jid, { text: content });
            await sock.sendPresenceUpdate("paused", jid);
          }
        }).catch((err) => console.error("[CHAT SYNC] AI Agent error:", err));
      }
    }
  }

  /**
   * Handle Baileys 'chats.upsert'
   */
  async handleChatsUpsert(sessionId, newChats, sock, io) {
    if (!Array.isArray(newChats) || newChats.length === 0 || !isSessionWriteAllowed(sessionId, sock)) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session || !isSessionWriteAllowed(sessionId, sock)) return;
      const userId = session.userId;

      for (const chat of newChats) {
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        if (!chat.id) continue;
        const normJid = await resolveLidToPnJid(chat.id, chat.pnJid, sock, sessionId);
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        const isGroup = normJid.endsWith("@g.us");
        const phone = isGroup ? "" : extractPhoneNumber(normJid);
        const lastTime =
          toUnixDate(chat.conversationTimestamp) ||
          toUnixDate(chat.lastMsgTimestamp);
        const rawPin = chat.pinned !== undefined ? chat.pinned : chat.pin;
        const pinState = rawPin !== undefined ? parsePinnedState(rawPin) : null;
        const chatEphemeral =
          chat.ephemeralExpiration !== undefined ? (Number(chat.ephemeralExpiration) || 0) : undefined;

        const updated = await WaChat.findOneAndUpdate(
          { userId, sessionId, chatJid: normJid },
          {
            $set: {
              isGroup,
              ...(isGroup ? { phoneNumber: "" } : phone ? { phoneNumber: phone } : {}),
              ...(isGroup && chat.name ? { groupSubject: chat.name, name: chat.name } : {}),
              ...(lastTime ? { lastMessageTime: lastTime } : {}),
              ...(pinState ? { isPinned: pinState.isPinned, pinnedAt: pinState.pinnedAt } : {}),
              ...(typeof chat.archived === "boolean" ? { isArchived: chat.archived } : {}),
              ...(chatEphemeral !== undefined ? { ephemeralExpiration: chatEphemeral } : {}),
            },
            $setOnInsert: {
              userId,
              sessionId,
              chatJid: normJid,
              phoneNumber: phone,
              name: chat.name || (isGroup ? "WhatsApp Group" : phone ? `+${phone}` : "WhatsApp Contact"),
              contactName: chat.name || "",
              lastMessage: "",
              lastMessageTime: lastTime,
              unreadCount: chat.unreadCount || 0,
              ...(pinState ? {} : { isPinned: false, pinnedAt: null }),
            },
          },
          { upsert: true, new: true }
        );

        if (io) {
          io.to(sessionId).emit("chat:updated", { sessionId, chatJid: normJid, chat: updated });
        }
      }
    } catch (err) {
      console.warn("[CHAT SYNC] chats.upsert error:", err.message);
    }
  }

  /**
   * Handle Baileys 'chats.update'
   */
  async handleChatsUpdate(sessionId, chatUpdates, sock, io) {
    if (!Array.isArray(chatUpdates) || chatUpdates.length === 0 || !isSessionWriteAllowed(sessionId, sock)) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session || !isSessionWriteAllowed(sessionId, sock)) return;
      const userId = session.userId;

      for (const update of chatUpdates) {
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        if (!update.id) continue;
        const normJid = normalizeJid(update.id);
        const patch = {};

        if (typeof update.unreadCount === "number") patch.unreadCount = update.unreadCount;
        const rawPin = update.pinned !== undefined ? update.pinned : update.pin;
        if (rawPin !== undefined) {
          const pinState = parsePinnedState(rawPin);
          patch.isPinned = pinState.isPinned;
          patch.pinnedAt = pinState.pinnedAt;
        }
        const updateLastTime =
          toUnixDate(update.conversationTimestamp) ||
          toUnixDate(update.lastMsgTimestamp);
        if (updateLastTime) patch.lastMessageTime = updateLastTime;
        if (typeof update.archived === "boolean") patch.isArchived = update.archived;
        if (update.muteEndTime !== undefined) {
          patch.isMuted = toNumericValue(update.muteEndTime) > 0;
          patch.mutedUntil = toUnixDate(update.muteEndTime);
        }
        if (update.ephemeralExpiration !== undefined) {
          patch.ephemeralExpiration = Number(update.ephemeralExpiration) || 0;
        }

        if (Object.keys(patch).length > 0) {
          const updated = await WaChat.findOneAndUpdate(
            { userId, sessionId, chatJid: normJid },
            { $set: patch },
            { new: true }
          );

          if (io && updated) {
            io.to(sessionId).emit("chat:updated", { sessionId, chatJid: normJid, chat: updated });
            if (patch.isArchived !== undefined) {
              io.to(sessionId).emit("chat:archived", {
                sessionId,
                chatJid: normJid,
                isArchived: patch.isArchived,
              });
            }
            if (patch.ephemeralExpiration !== undefined) {
              io.to(sessionId).emit("chat:disappearing_changed", {
                sessionId,
                chatJid: normJid,
                ephemeralExpiration: patch.ephemeralExpiration,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn("[CHAT SYNC] chats.update error:", err.message);
    }
  }

  /**
   * Handle Baileys 'chats.delete'
   */
  async handleChatsDelete(sessionId, chatJids, sock, io) {
    if (!Array.isArray(chatJids) || chatJids.length === 0) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session) return;
      const userId = session.userId;

      const normJids = [...new Set(chatJids.map((j) => normalizeJid(j)).filter(Boolean))];
      if (normJids.length === 0) return;

      const matchedChats = await WaChat.find({ userId, sessionId, chatJid: { $in: normJids } })
        .select("chatJid phoneNumber isGroup")
        .lean()
        .catch(() => []);
      const contactJids = [...new Set([
        ...normJids,
        ...matchedChats
          .filter((c) => !c.isGroup && c.phoneNumber && String(c.phoneNumber).replace(/\D/g, "").length >= 5)
          .map((c) => `${String(c.phoneNumber).replace(/\D/g, "")}@s.whatsapp.net`),
      ])];

      await Promise.all([
        WaChat.deleteMany({ userId, sessionId, chatJid: { $in: normJids } }),
        WaChatMessage.deleteMany({ userId, sessionId, chatJid: { $in: normJids } }),
        WaContact.deleteMany({ userId, sessionId, jid: { $in: contactJids } }),
        WaChatNote.deleteMany({ userId, sessionId, chatJid: { $in: normJids } }),
        WaChatReminder.deleteMany({ userId, sessionId, chatJid: { $in: normJids } }),
      ]);

      if (io) {
        for (const jid of normJids) {
          io.to(sessionId).emit("chat:deleted", { sessionId, chatJid: jid });
        }
      }
    } catch (err) {
      console.warn("[CHAT SYNC] chats.delete error:", err.message);
    }
  }

  /**
   * Handle Baileys 'contacts.upsert' and 'contacts.update'
   */
  async handleContactsUpsert(sessionId, contacts, sock, io) {
    if (!Array.isArray(contacts) || contacts.length === 0 || !isSessionWriteAllowed(sessionId, sock)) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session || !isSessionWriteAllowed(sessionId, sock)) return;
      const userId = session.userId;

      const ownProfileName = (sock?.user?.name || "").trim().toLowerCase();
      const ownPhone = sock?.user?.id ? extractPhoneNumber(sock.user.id) : "";

      for (const contact of contacts) {
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        if (!contact.id) continue;
        const normJid = await resolveLidToPnJid(contact.id, contact.pnJid || contact.phoneNumber, sock, sessionId);
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        const savedBookName = (contact.name || "").trim();
        const pushOrVerified = (contact.verifiedName || contact.notify || "").trim();
        const phone = extractPhoneNumber(normJid);
        const isSelfChat = !!(ownPhone && phone && ownPhone === phone);
        const safeNotify =
          pushOrVerified && (!ownProfileName || isSelfChat || pushOrVerified.toLowerCase() !== ownProfileName)
            ? pushOrVerified
            : "";
        const name = savedBookName || safeNotify;

        if (name) {
          await WaContact.findOneAndUpdate(
            { userId, sessionId, jid: normJid },
            {
              $set: {
                phoneNumber: phone,
                ...(savedBookName ? { name: savedBookName } : {}),
                ...(contact.notify && (!ownProfileName || isSelfChat || contact.notify.trim().toLowerCase() !== ownProfileName)
                  ? { pushName: contact.notify }
                  : {}),
                ...(contact.verifiedName ? { verifiedName: contact.verifiedName } : {}),
              },
            },
            { upsert: true }
          );

          // Update WaChat.contactName AND update/heal WaChat.name when savedBookName exists or name was placeholder/self
          const existingChat = await WaChat.findOne({ userId, sessionId, chatJid: normJid })
            .select("name contactName isGroup")
            .lean();
          if (existingChat && !existingChat.isGroup && !normJid.endsWith("@g.us")) {
            const curName = (existingChat.name || "").trim();
            const isCurPlaceholderOrSelf =
              !curName ||
              curName === "WhatsApp Contact" ||
              /^\+\d+$/.test(curName) ||
              (!isSelfChat && ownProfileName && curName.toLowerCase() === ownProfileName);
            await WaChat.updateOne(
              { userId, sessionId, chatJid: normJid },
              {
                $set: {
                  contactName: name,
                  ...(savedBookName || isCurPlaceholderOrSelf ? { name } : {}),
                  ...(phone ? { phoneNumber: phone } : {}),
                },
              }
            );
          } else {
            await WaChat.updateOne(
              { userId, sessionId, chatJid: normJid },
              { $set: { contactName: name } }
            );
          }

          if (io) {
            io.to(sessionId).emit("contact:updated", { sessionId, jid: normJid, name });
          }
        }
      }
    } catch (err) {
      console.warn("[CHAT SYNC] contacts.upsert error:", err.message);
    }
  }

  /**
   * Handle Baileys v7 'lid-mapping.update' events to backfill real phone numbers onto @lid chats
   */
  async handleLidMappings(sessionId, mappings) {
    if (!sessionId || !Array.isArray(mappings) || mappings.length === 0 || !isSessionWriteAllowed(sessionId)) return;
    try {
      const session = await WhatsAppSession.findOne({ sessionId }).lean();
      if (!session || !isSessionWriteAllowed(sessionId)) return;
      const userId = session.userId;

      for (const m of mappings) {
        if (!isSessionWriteAllowed(sessionId)) return;
        const lidJid = m?.lid ? normalizeJid(m.lid) : "";
        const pnDigits = m?.pn ? extractPhoneNumber(m.pn) : "";
        if (!lidJid || !pnDigits) continue;

        await WaChat.updateMany(
          { userId, sessionId, chatJid: lidJid },
          { $set: { phoneNumber: pnDigits } }
        ).catch(() => {});
        await WaContact.updateMany(
          { userId, sessionId, jid: lidJid },
          { $set: { phoneNumber: pnDigits } }
        ).catch(() => {});
      }
    } catch (err) {
      console.warn("[CHAT SYNC] lid-mapping.update error:", err.message);
    }
  }

  /**
   * Fast indexed read directly from MongoDB for /api/chats/:sessionId/list.
   * Zero WhatsApp socket latency!
   */
  async getChats(sessionId, userId, options = {}) {
    const { search, tab = "all", page = 1, limit = 50 } = options;

    const andConditions = [{ userId }, { sessionId }];

    // Exclude empty @lid ghost stubs (zero messages and zero unread) from flooding the inbox
    const msgChatJids = await WaChatMessage.distinct("chatJid", { userId, sessionId });
    if (!search && tab !== "groups") {
      andConditions.push({
        $or: [
          { chatJid: { $not: /@lid$/ } },
          ...(msgChatJids.length > 0 ? [{ chatJid: { $in: msgChatJids } }] : []),
          { lastMessage: { $nin: ["", null] } },
          { unreadCount: { $gt: 0 } },
        ],
      });
    }

    // Preload CRM Clients, Companies & Queries so tab filtering + WaChat linking work dynamically and persist to DB
    const [crmClients, crmCompanies, crmQueries] = await Promise.all([
      Client.find({ userId }).select("_id firstName lastName mobile").lean().catch(() => []),
      Company.find({ userId }).select("_id name phone").lean().catch(() => []),
      CrmContact.find({ userId }).select("_id name phone leadStatus queryId queryTitle budget requirement").lean().catch(() => []),
    ]);

    const clientById = new Map();
    const clientByPhoneKey = new Map();
    const clientLastKeys = new Set();
    for (const cl of crmClients) {
      clientById.set(String(cl._id), cl);
      for (const k of buildPhoneMatchKeys(cl.mobile)) {
        if (!clientByPhoneKey.has(k)) clientByPhoneKey.set(k, cl);
        if (k.length >= 7 && k.length <= 12) clientLastKeys.add(k);
      }
    }

    const companyById = new Map();
    const companyByPhoneKey = new Map();
    const companyLastKeys = new Set();
    for (const co of crmCompanies) {
      companyById.set(String(co._id), co);
      for (const k of buildPhoneMatchKeys(co.phone)) {
        if (!companyByPhoneKey.has(k)) companyByPhoneKey.set(k, co);
        if (k.length >= 7 && k.length <= 12) companyLastKeys.add(k);
      }
    }

    const queryById = new Map();
    const queryByPhoneKey = new Map();
    for (const qu of crmQueries) {
      queryById.set(String(qu._id), qu);
      for (const k of buildPhoneMatchKeys(qu.phone)) {
        if (!queryByPhoneKey.has(k)) queryByPhoneKey.set(k, qu);
      }
    }

    // Tab filter
    if (tab === "direct") {
      andConditions.push({ isGroup: { $ne: true } });
      andConditions.push({ chatJid: { $not: /@(g\.us|newsletter|broadcast)$/ } });
    } else if (tab === "groups") {
      andConditions.push({ $or: [{ isGroup: true }, { chatJid: /@g\.us$/ }] });
      andConditions.push({ chatJid: { $not: /@(newsletter|broadcast)$/ } });
    } else if (tab === "unread") {
      andConditions.push({ unreadCount: { $gt: 0 } });
      andConditions.push({ chatJid: { $not: /@(newsletter|broadcast)$/ } });
    } else if (tab === "clients") {
      andConditions.push({ isGroup: { $ne: true } });
      andConditions.push({ chatJid: { $not: /@(g\.us|newsletter|broadcast)$/ } });
      const clientOr = [{ clientId: { $ne: null } }];
      if (clientLastKeys.size > 0) {
        const keyPattern = Array.from(clientLastKeys).join("|");
        const suffixRegex = new RegExp(`(?:${keyPattern})(?:@|$)`);
        clientOr.push({ phoneNumber: suffixRegex }, { chatJid: suffixRegex });
      }
      andConditions.push({ $or: clientOr });
    } else if (tab === "companies") {
      andConditions.push({ isGroup: { $ne: true } });
      andConditions.push({ chatJid: { $not: /@(g\.us|newsletter|broadcast)$/ } });
      const companyOr = [{ companyId: { $ne: null } }];
      if (companyLastKeys.size > 0) {
        const keyPattern = Array.from(companyLastKeys).join("|");
        const suffixRegex = new RegExp(`(?:${keyPattern})(?:@|$)`);
        companyOr.push({ phoneNumber: suffixRegex }, { chatJid: suffixRegex });
      }
      andConditions.push({ $or: companyOr });
    } else {
      // "all" - exclude system newsletters / broadcasts
      andConditions.push({ chatJid: { $not: /@(newsletter|broadcast)$/ } });
    }

    // Search query on subject, name, contactName, phone, or chatJid
    if (search && search.trim()) {
      const cleanQ = search.trim();
      const escaped = cleanQ.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const regex = new RegExp(escaped, "i");
      andConditions.push({
        $or: [
          { name: regex },
          { groupSubject: regex },
          { contactName: regex },
          { phoneNumber: regex },
          { chatJid: regex },
          { lastMessage: regex },
        ],
      });
    }

    const query = andConditions.length === 1 ? andConditions[0] : { $and: andConditions };
    const sort = { isPinned: -1, lastMessageTime: -1, pinnedAt: -1, updatedAt: -1 };

    let mongoQuery = WaChat.find(query).sort(sort).lean();
    if (limit && Number(limit) > 0) {
      const skip = (Math.max(1, Number(page)) - 1) * Number(limit);
      mongoQuery = mongoQuery.skip(skip).limit(Number(limit));
    }

    const [docs, total] = await Promise.all([
      mongoQuery.exec(),
      WaChat.countDocuments(query),
    ]);

    // Resolve any @lid chats via WhatsAppAuthState (lid-mapping), WaContact names, and latest WaChatMessage snippets
    const docJids = docs.map((d) => d.chatJid).filter(Boolean);
    const lidUsers = docs
      .filter((d) => d.chatJid?.endsWith("@lid"))
      .map((d) => d.chatJid.replace(/@.*/, "").replace(/:\d+$/, ""))
      .filter(Boolean);

    const lidToPnMap = new Map();
    if (lidUsers.length > 0) {
      const reverseDocs = await WhatsAppAuthState.find({
        sessionId,
        dataType: "lid-mapping",
        dataId: { $in: lidUsers.map((u) => `${u}_reverse`) },
      })
        .select("dataId dataJson")
        .lean()
        .catch(() => []);
      for (const rDoc of reverseDocs) {
        try {
          const u = rDoc.dataId.replace(/_reverse$/, "");
          const parsedPn = String(JSON.parse(rDoc.dataJson) || "").replace(/\D/g, "");
          if (parsedPn && parsedPn !== u) {
            lidToPnMap.set(u, parsedPn);
          }
        } catch (_) {}
      }
    }

    const contactLookupJids = new Set(docJids);
    for (const pn of lidToPnMap.values()) {
      contactLookupJids.add(`${pn}@s.whatsapp.net`);
    }

    const [contactDocs, latestMsgAgg, credsDoc] = await Promise.all([
      contactLookupJids.size > 0
        ? WaContact.find({ userId, sessionId, jid: { $in: Array.from(contactLookupJids) } })
            .select("jid name pushName verifiedName phoneNumber")
            .lean()
            .catch(() => [])
        : [],
      docJids.length > 0
        ? WaChatMessage.aggregate([
            { $match: { userId, sessionId, chatJid: { $in: docJids } } },
            { $sort: { timestamp: -1 } },
            {
              $group: {
                _id: "$chatJid",
                text: { $first: "$text" },
                mediaType: { $first: "$mediaType" },
                timestamp: { $first: "$timestamp" },
              },
            },
          ]).catch(() => [])
        : [],
      WhatsAppAuthState.findOne({ sessionId, dataType: "creds", dataId: "creds" })
        .select("dataJson")
        .lean()
        .catch(() => null),
    ]);

    let ownProfileName = "";
    let ownPhone = "";
    if (credsDoc?.dataJson) {
      try {
        const parsedCreds = JSON.parse(credsDoc.dataJson);
        ownProfileName = (parsedCreds?.me?.name || "").trim().toLowerCase();
        ownPhone = parsedCreds?.me?.id ? extractPhoneNumber(parsedCreds.me.id) : "";
      } catch (_) {}
    }

    const contactByJid = new Map();
    for (const ct of contactDocs) {
      contactByJid.set(ct.jid, ct);
    }
    const latestMsgByJid = new Map();
    for (const m of latestMsgAgg) {
      latestMsgByJid.set(m._id, m);
    }

    const repairOps = [];
    const formattedChats = docs.map((c) => {
      const isGroup = !!(c.isGroup || c.chatJid.endsWith("@g.us"));
      const isLidJid = c.chatJid.endsWith("@lid");
      const lidUser = isLidJid ? c.chatJid.replace(/@.*/, "").replace(/:\d+$/, "") : "";
      const mappedPn = isLidJid ? (lidToPnMap.get(lidUser) || "") : "";

      const rawStoredPhone = (c.phoneNumber || "").replace(/:\d+$/, "").replace(/\D/g, "");
      const validStoredPhone = isLidJid && rawStoredPhone === lidUser ? "" : rawStoredPhone;
      const contactDoc =
        contactByJid.get(c.chatJid) ||
        (mappedPn ? contactByJid.get(`${mappedPn}@s.whatsapp.net`) : null);
      const contactStoredPhone =
        contactDoc?.phoneNumber && (!isLidJid || contactDoc.phoneNumber !== lidUser)
          ? contactDoc.phoneNumber.replace(/\D/g, "")
          : "";

      let cleanPhone = isGroup
        ? ""
        : (
            mappedPn ||
            validStoredPhone ||
            contactStoredPhone ||
            (!isLidJid ? c.chatJid.replace(/@.*/, "") : "")
          )
            .replace(/:\d+$/, "")
            .replace(/\D/g, "");

      const isSelfChat = !!(ownPhone && cleanPhone && ownPhone === cleanPhone);

      const isInvalidCandidateName = (val) => {
        if (!val || typeof val !== "string") return true;
        const trimmed = val.trim();
        if (!trimmed) return true;
        if (trimmed.includes(":0") || trimmed.includes(":1")) return true;
        if (lidUser && trimmed.replace(/\D/g, "") === lidUser) return true;
        if (!isSelfChat && ownProfileName && trimmed.toLowerCase() === ownProfileName) return true;
        return false;
      };

      const cleanCandidate = (val) => (!isInvalidCandidateName(val) ? val.trim() : "");
      const bookName = cleanCandidate(contactDoc?.name);
      const contactPushOrVerified = cleanCandidate(contactDoc?.verifiedName || contactDoc?.pushName);
      const chatSavedContactName = cleanCandidate(c.contactName);
      const chatStoredName = cleanCandidate(c.name);
      const resolvedContactName = bookName || contactPushOrVerified;

      // Prefer saved phonebook name / contactName over possibly stale chat.name
      let displayName =
        (isGroup && c.groupSubject)
          ? c.groupSubject
          : (bookName || chatSavedContactName || contactPushOrVerified || chatStoredName);

      if (!displayName || displayName.trim() === "") {
        if (isGroup) {
          displayName = "WhatsApp Group";
        } else if (cleanPhone) {
          displayName = cleanPhone.length === 12 && cleanPhone.startsWith("91")
            ? `+91 ${cleanPhone.slice(2, 7)} ${cleanPhone.slice(7)}`
            : `+${cleanPhone}`;
        } else {
          displayName = isLidJid ? "WhatsApp Contact (Private ID)" : "WhatsApp Contact";
        }
      }

      // Match against CRM Clients, Companies & Queries saved in MongoDB and persist any missing/updated links onto WaChat
      let matchedClient = null;
      let matchedCompany = null;
      let matchedQuery = null;
      if (!isGroup) {
        const phoneKeys = cleanPhone ? buildPhoneMatchKeys(cleanPhone) : [];
        for (const k of phoneKeys) {
          if (!matchedClient && clientByPhoneKey.has(k)) matchedClient = clientByPhoneKey.get(k);
          if (!matchedCompany && companyByPhoneKey.has(k)) matchedCompany = companyByPhoneKey.get(k);
          if (!matchedQuery && queryByPhoneKey.has(k)) matchedQuery = queryByPhoneKey.get(k);
        }
        if (!matchedClient && !cleanPhone && c.clientId) {
          matchedClient = clientById.get(String(c.clientId)) || null;
        }
        if (!matchedCompany && !cleanPhone && c.companyId) {
          matchedCompany = companyById.get(String(c.companyId)) || null;
        }
        if (!matchedQuery && !cleanPhone && c.crmContactId) {
          matchedQuery = queryById.get(String(c.crmContactId)) || null;
        }
      }

      const expectedClientId = matchedClient?._id || null;
      const expectedClientName = matchedClient
        ? `${matchedClient.firstName || ""} ${matchedClient.lastName || ""}`.trim()
        : "";
      const expectedCompanyId = matchedCompany?._id || null;
      const expectedCompanyName = matchedCompany?.name ? matchedCompany.name.trim() : "";
      const expectedQueryId = matchedQuery?._id || null;
      const expectedQueryCode = matchedQuery?.queryId || c.queryId || "";
      const expectedQueryTitle = matchedQuery?.queryTitle || c.queryTitle || "";
      const expectedLeadStatus = matchedQuery?.leadStatus || c.leadStatus || "";

      const storedClientIdStr = c.clientId ? String(c.clientId) : null;
      const expectedClientIdStr = expectedClientId ? String(expectedClientId) : null;
      const storedCompanyIdStr = c.companyId ? String(c.companyId) : null;
      const expectedCompanyIdStr = expectedCompanyId ? String(expectedCompanyId) : null;
      const storedQueryIdStr = c.crmContactId ? String(c.crmContactId) : null;
      const expectedQueryIdStr = expectedQueryId ? String(expectedQueryId) : null;

      // Heal corrupted WaChat.name or stale CRM links in background
      if (!isGroup) {
        const storedLower = (c.name || "").trim().toLowerCase();
        const storedIsSelf = !isSelfChat && ownProfileName && storedLower === ownProfileName;
        const bookDiffers = bookName && c.name !== bookName;
        const contactNameDiffers = chatSavedContactName && (!c.name || storedIsSelf || /^\+\d+$/.test(c.name.trim()));
        const nameNeedsRepair = (storedIsSelf || bookDiffers || contactNameDiffers) && displayName && displayName !== c.name;
        const crmNeedsRepair =
          storedClientIdStr !== expectedClientIdStr ||
          (c.clientName || "") !== expectedClientName ||
          storedCompanyIdStr !== expectedCompanyIdStr ||
          (c.companyName || "") !== expectedCompanyName ||
          storedQueryIdStr !== expectedQueryIdStr ||
          (c.leadStatus || "") !== expectedLeadStatus;

        if (nameNeedsRepair || crmNeedsRepair) {
          repairOps.push({
            updateOne: {
              filter: { _id: c._id },
              update: {
                $set: {
                  ...(nameNeedsRepair
                    ? {
                        name: displayName,
                        ...(bookName || chatSavedContactName ? { contactName: bookName || chatSavedContactName } : {}),
                      }
                    : {}),
                  ...(crmNeedsRepair
                    ? {
                        clientId: expectedClientId,
                        clientName: expectedClientName,
                        companyId: expectedCompanyId,
                        companyName: expectedCompanyName,
                        crmContactId: expectedQueryId,
                        queryId: expectedQueryCode,
                        queryTitle: expectedQueryTitle,
                        leadStatus: expectedLeadStatus,
                      }
                    : {}),
                },
              },
            },
          });
        }
      }

      const latestFromMsgs = latestMsgByJid.get(c.chatJid);
      const fallbackSnippet = latestFromMsgs
        ? (latestFromMsgs.text || (latestFromMsgs.mediaType ? `[${latestFromMsgs.mediaType}]` : ""))
        : "";
      const finalLastMessage = c.lastMessage || fallbackSnippet || (isGroup ? "Group Chat" : "");
      const msgTimeMs = latestFromMsgs?.timestamp ? new Date(latestFromMsgs.timestamp).getTime() : 0;
      const storedTimeMs = c.lastMessageTime ? new Date(c.lastMessageTime).getTime() : 0;
      const finalLastTime =
        msgTimeMs > 0 && (!c.lastMessageTime || !c.lastMessage || msgTimeMs > storedTimeMs)
          ? latestFromMsgs.timestamp
          : (c.lastMessageTime || c.createdAt || null);

      return {
        _id: c._id,
        chatJid: c.chatJid,
        name: displayName,
        phoneNumber: cleanPhone,
        contactName: bookName || chatSavedContactName || resolvedContactName || "",
        groupSubject: c.groupSubject || (isGroup ? displayName : null),
        groupParticipantCount: c.groupParticipantCount || 0,
        lastMessage: finalLastMessage,
        lastMessageTime: finalLastTime,
        unreadCount: c.unreadCount || 0,
        isGroup,
        isPinned: !!c.isPinned,
        pinnedAt: c.pinnedAt || null,
        isMuted: !!c.isMuted,
        mutedUntil: c.mutedUntil || null,
        isArchived: !!c.isArchived,
        profilePictureUrl: c.profilePictureUrl || null,
        clientId: expectedClientIdStr,
        clientName: expectedClientName,
        isClient: Boolean(expectedClientIdStr),
        companyId: expectedCompanyIdStr,
        companyName: expectedCompanyName,
        isCompany: Boolean(expectedCompanyIdStr),
        crmContactId: expectedQueryIdStr,
        queryId: expectedQueryCode || (expectedQueryIdStr ? `TB${cleanPhone.slice(-10)}` : ""),
        queryTitle: expectedQueryTitle,
        leadStatus: expectedLeadStatus,
        isQuery: Boolean(expectedQueryIdStr || expectedQueryCode),
      };
    });

    if (repairOps.length > 0) {
      WaChat.bulkWrite(repairOps, { ordered: false }).catch(() => {});
    }

    formattedChats.sort((a, b) => {
      if (a.isPinned && !b.isPinned) return -1;
      if (!a.isPinned && b.isPinned) return 1;
      const tA = a.lastMessageTime ? new Date(a.lastMessageTime).getTime() : 0;
      const tB = b.lastMessageTime ? new Date(b.lastMessageTime).getTime() : 0;
      if (tB !== tA) return tB - tA;
      const pA = a.pinnedAt ? new Date(a.pinnedAt).getTime() : 0;
      const pB = b.pinnedAt ? new Date(b.pinnedAt).getTime() : 0;
      return pB - pA;
    });

    return {
      chats: formattedChats,
      total,
      page: Number(page) || 1,
      limit: limit ? Number(limit) : total,
      hasMore: limit ? (Number(page) * Number(limit) < total) : false,
    };
  }

  /**
   * Manual or automatic full chat, group & contact sync pipeline
   */
  async syncSessionChats(sessionId, sock, io) {
    if (!sessionId || !sock) {
      throw new Error("Session is not connected");
    }

    if (this.activeSyncPromises.has(sessionId)) {
      return this.activeSyncPromises.get(sessionId);
    }

    const syncPromise = (async () => {
      try {
        console.log(`[CHAT SYNC] Starting staged sync for session ${sessionId}`);
        const session = await WhatsAppSession.findOne({ sessionId }).lean();
        if (!session) throw new Error("Session not found in DB");

        this.emitSyncProgress(io, sessionId, session.userId, {
          status: "syncing",
          stage: "initializing",
          progress: 12,
          message: "Connecting to WhatsApp session & preparing sync...",
        });

        // 1. Fetch & sync all participating groups (writes WaChat immediately, then resolves participant LIDs for WhatsAppGroup)
        let syncedGroupsCount = 0;
        try {
          const gResult = await groupSyncService.syncSessionGroups(sessionId, sock, io, {
            prune: true,
            emitProgress: true,
            deferFinalProgress: true,
          });
          syncedGroupsCount = gResult?.count || 0;

          // Ensure latest WaChat mirrors stay consistent if WhatsAppGroup had any prior records
          if (Array.isArray(gResult?.groups) && gResult.groups.length > 0) {
            await groupSyncService.syncGroupsToWaChat(session, gResult.groups, new Date()).catch(() => {});
          }
        } catch (gErr) {
          console.warn("[CHAT SYNC] Group sync warning during syncSessionChats:", gErr.message);
        }

        // 2. Finalize direct chats & count statistics
        this.emitSyncProgress(io, sessionId, session.userId, {
          status: "syncing",
          stage: "syncing_chats",
          progress: 85,
          message: `Finalizing ${syncedGroupsCount} groups & direct conversations...`,
          stats: { groupsCount: syncedGroupsCount },
        });

        // Mirror any groups already in WhatsAppGroup into WaChat (belt-and-suspenders if groupFetchAllParticipating was partial)
        try {
          const existingGroups = await WhatsAppGroup.find({ userId: session.userId, sessionId })
            .select("jid subject participantCount size creation")
            .lean();
          if (existingGroups.length > 0) {
            await groupSyncService.syncGroupsToWaChat(session, existingGroups, new Date());
          }
        } catch (_) {}

        const [count, groupsCount] = await Promise.all([
          WaChat.countDocuments({ sessionId, userId: session.userId }),
          WaChat.countDocuments({
            sessionId,
            userId: session.userId,
            $or: [{ isGroup: true }, { chatJid: /@g\.us$/i }],
          }),
        ]);
        const directCount = Math.max(0, count - groupsCount);
        const lastSyncedAt = new Date();

        this.emitSyncProgress(io, sessionId, session.userId, {
          status: "completed",
          stage: "completed",
          progress: 100,
          message: `Sync complete: ${groupsCount} groups & ${directCount} direct chats loaded`,
          stats: {
            totalChats: count,
            groupsCount,
            directCount,
          },
        });

        if (io) {
          const payload = { sessionId, count, totalChats: count, groupsCount, directCount, lastSyncedAt };
          io.to(sessionId).emit("chats:synced", payload);
          if (session.userId) {
            io.to(`user:${session.userId.toString()}`).emit("chats:synced", payload);
          }
        }

        return { success: true, count, groupsCount, directCount, lastSyncedAt };
      } catch (err) {
        const session = await WhatsAppSession.findOne({ sessionId }).select("userId").lean().catch(() => null);
        this.emitSyncProgress(io, sessionId, session?.userId, {
          status: "error",
          stage: "error",
          progress: 0,
          message: err.message || "WhatsApp sync failed",
        });
        throw err;
      } finally {
        this.activeSyncPromises.delete(sessionId);
      }
    })();

    this.activeSyncPromises.set(sessionId, syncPromise);
    return syncPromise;
  }
}

export const chatSyncService = new ChatSyncService();
export default chatSyncService;
