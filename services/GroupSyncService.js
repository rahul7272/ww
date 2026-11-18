import WhatsAppGroup from "../models/WhatsAppGroup.js";
import WhatsAppSession from "../models/WhatsAppSession.js";
import WaChat from "../models/WaChat.js";
import { isSessionWriteAllowed } from "../utils/sessionLifecycle.js";

// Helper to resolve LIDs for group participants
async function resolveParticipantsLids(sock, participants) {
  if (!participants || !Array.isArray(participants) || !sock) return;

  const lidsToResolve = [...new Set(
    participants
      .filter((p) => p.id && p.id.endsWith("@lid") && !p.phoneNumber)
      .map((p) => p.id)
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
        } catch (_) {}
      })
    );
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

function emitGroupSyncProgress(io, session, payload) {
  if (!io || !session) return;
  const eventPayload = {
    sessionId: session.sessionId,
    updatedAt: new Date(),
    ...payload,
  };
  io.to(session.sessionId).emit("chats:sync_progress", eventPayload);
  if (session.userId) {
    io.to(`user:${session.userId.toString()}`).emit("chats:sync_progress", eventPayload);
  }
}

/**
 * Build candidate identifiers for the session owner
 * (covers phone number, phone JID, LID, and socket user IDs)
 */
function buildSessionCandidateSet(sock, session, groupsArray = []) {
  const candidates = new Set();

  const addVal = (val) => {
    if (!val || typeof val !== "string") return;
    const cleanDigits = val.replace(/\D/g, "");
    if (cleanDigits.length >= 7) candidates.add(cleanDigits);
    const cleanUser = val.split("@")[0].split(":")[0];
    if (cleanUser && cleanUser.length >= 4) candidates.add(cleanUser);
    const base = val.split(":")[0];
    if (base) candidates.add(base);
    candidates.add(val.trim());
  };

  if (sock?.user?.id) addVal(sock.user.id);
  if (sock?.user?.lid) addVal(sock.user.lid);
  if (session?.phoneNumber) addVal(session.phoneNumber);

  const phoneDigits = session?.phoneNumber ? String(session.phoneNumber).replace(/\D/g, "") : null;

  // Cross-reference resolved participants in groupsArray:
  // In modern WhatsApp, participants in groups are keyed by LID, e.g. 73560223645713@lid.
  // Their phoneNumber is resolved to e.g. 918708604830@s.whatsapp.net.
  // When a participant's phone matches the session phone, their p.id and p.lid ARE the user's LID!
  if (phoneDigits && Array.isArray(groupsArray)) {
    for (const g of groupsArray) {
      for (const p of (g.participants || [])) {
        const pPhoneClean = (p.phoneNumber || "").split("@")[0].split(":")[0].replace(/\D/g, "");
        if (pPhoneClean && (pPhoneClean === phoneDigits || (pPhoneClean.endsWith(phoneDigits) && pPhoneClean.length <= phoneDigits.length + 3))) {
          if (p.id) addVal(p.id);
          if (p.lid) addVal(p.lid);
        }
      }
    }
  }

  return candidates;
}

/**
 * Check if the session user is an admin or creator in a group
 */
function evaluateGroupAdminStatus(g, candidateIds) {
  if (!g || !candidateIds || candidateIds.size === 0) {
    return { isMeAdmin: false, role: "member" };
  }

  // 1. Group Creator / Owner check
  const ownerClean = (g.owner || "").split("@")[0].split(":")[0];
  const subjectOwnerClean = (g.subjectOwner || "").split("@")[0].split(":")[0];
  if (
    (ownerClean && candidateIds.has(ownerClean)) ||
    (g.owner && candidateIds.has(g.owner)) ||
    (subjectOwnerClean && candidateIds.has(subjectOwnerClean)) ||
    (g.subjectOwner && candidateIds.has(g.subjectOwner))
  ) {
    return { isMeAdmin: true, role: "superadmin" };
  }

  // 2. Participants list check
  if (Array.isArray(g.participants)) {
    for (const p of g.participants) {
      const pIdClean = (p.id || "").split("@")[0].split(":")[0];
      const pPhoneClean = (p.phoneNumber || "").split("@")[0].split(":")[0];
      const pLidClean = (p.lid || "").split("@")[0].split(":")[0];

      const isMe =
        (p.id && candidateIds.has(p.id)) ||
        (pIdClean && candidateIds.has(pIdClean)) ||
        (p.phoneNumber && candidateIds.has(p.phoneNumber)) ||
        (pPhoneClean && candidateIds.has(pPhoneClean)) ||
        (p.lid && candidateIds.has(p.lid)) ||
        (pLidClean && candidateIds.has(pLidClean));

      if (isMe) {
        if (p.admin === "admin" || p.admin === "superadmin") {
          return { isMeAdmin: true, role: p.admin };
        }
        return { isMeAdmin: false, role: "member" };
      }
    }
  }

  return { isMeAdmin: false, role: "member" };
}

async function syncGroupsIntoWaChat(session, groupsArray, now = new Date()) {
  if (!session?.userId || !session?.sessionId || !Array.isArray(groupsArray) || groupsArray.length === 0) {
    return 0;
  }
  if (!isSessionWriteAllowed(session.sessionId)) {
    return 0;
  }

  const chatBulkOps = groupsArray
    .map((g) => {
      const gJid = g.id || g.jid;
      if (!gJid) return null;
      const subject = g.subject || g.name || "WhatsApp Group";
      const pCount = g.participantCount || g.size || g.participants?.length || 0;
      return {
        updateOne: {
          filter: { userId: session.userId, sessionId: session.sessionId, chatJid: gJid },
          update: {
            $set: {
              name: subject,
              groupSubject: subject,
              groupParticipantCount: pCount,
              isGroup: true,
              phoneNumber: "",
              updatedAt: now,
            },
            $setOnInsert: {
              userId: session.userId,
              sessionId: session.sessionId,
              chatJid: gJid,
              contactName: subject,
              lastMessage: pCount > 0 ? `${pCount} participants` : "Group Chat",
              lastMessageTime: new Date(g.creation ? g.creation * 1000 : Date.now()),
              unreadCount: 0,
              createdAt: now,
            },
          },
          upsert: true,
        },
      };
    })
    .filter(Boolean);

  if (chatBulkOps.length > 0) {
    await WaChat.bulkWrite(chatBulkOps, { ordered: false });
  }
  return chatBulkOps.length;
}

class GroupSyncService {
  /**
   * Expose fast group -> WaChat mirroring for sync coordinators.
   */
  async syncGroupsToWaChat(session, groupsArray, now = new Date()) {
    return syncGroupsIntoWaChat(session, groupsArray, now);
  }

  /**
   * Sync all participating groups from WhatsApp into MongoDB.
   * Runs once on session connect or on user-demanded manual refresh.
   */
  async syncSessionGroups(sessionId, sock, io, options = {}) {
    if (!sessionId || !sock) {
      throw new Error("Missing sessionId or socket for group sync");
    }

    const session = await WhatsAppSession.findOne({ sessionId });
    if (!session) {
      throw new Error(`Session ${sessionId} not found in database`);
    }

    try {
      // Mark session as syncing in background
      await WhatsAppSession.updateOne(
        { sessionId },
        { $set: { groupSyncStatus: "syncing" } }
      );

      if (options.emitProgress !== false) {
        emitGroupSyncProgress(io, session, {
          status: "syncing",
          stage: "fetching_groups",
          progress: 25,
          message: "Fetching participating WhatsApp groups...",
        });
      }

      console.log(`[GROUP SYNC] Starting full group sync for session ${sessionId}...`);

      // 1. Fetch participating groups from live Baileys socket (or reuse pre-fetched map)
      const rawGroups = options.rawGroups || (await sock.groupFetchAllParticipating());
      const groupsArray = Object.values(rawGroups || {});
      const now = new Date();

      console.log(`[GROUP SYNC] Discovered ${groupsArray.length} groups on WhatsApp for session ${sessionId}`);

      // 2. Mirror participating groups into WaChat IMMEDIATELY so /dashboard/chats shows all groups
      // without waiting for slower per-participant LID resolution.
      if (!isSessionWriteAllowed(sessionId, sock)) {
        return { success: false, aborted: true, count: 0, groups: [] };
      }
      await syncGroupsIntoWaChat(session, groupsArray, now).catch((err) => {
        console.warn(`[GROUP SYNC] WaChat quick-mirror warning for ${sessionId}:`, err.message);
      });

      if (io && groupsArray.length > 0) {
        const earlySyncPayload = { sessionId, lastSyncedAt: now, groupsCount: groupsArray.length };
        io.to(sessionId).emit("chats:synced", earlySyncPayload);
        if (session.userId) {
          io.to(`user:${session.userId.toString()}`).emit("chats:synced", earlySyncPayload);
        }
      }

      if (options.emitProgress !== false) {
        emitGroupSyncProgress(io, session, {
          status: "syncing",
          stage: "groups_loaded",
          progress: 55,
          message: groupsArray.length > 0
            ? `Loaded ${groupsArray.length} groups into inbox, syncing member metadata...`
            : "No participating groups found, checking chat history...",
          stats: { groupsCount: groupsArray.length },
        });
      }

      // 3. Resolve LIDs across all participants
      const allParticipants = groupsArray.flatMap((g) => g.participants || []);
      await resolveParticipantsLids(sock, allParticipants);

      const candidateIds = buildSessionCandidateSet(sock, session, groupsArray);

      // 4. Prepare bulk operations for MongoDB
      const activeJids = [];

      const bulkOps = groupsArray.map((g) => {
        activeJids.push(g.id);
        const isAdminOnly = g.announce === true || g.announce === "true";
        const { isMeAdmin } = evaluateGroupAdminStatus(g, candidateIds);
        const canSend = !isAdminOnly || isMeAdmin;

        const formattedParticipants = (g.participants || []).map((p) => {
          let pNum = p.phoneNumber || "";
          if (!pNum && p.id?.endsWith("@s.whatsapp.net")) {
            pNum = p.id.split("@")[0].split(":")[0];
          }
          return {
            id: p.id,
            admin: p.admin || null,
            phoneNumber: pNum,
            lid: p.id?.endsWith("@lid") ? p.id : null,
          };
        });

        return {
          updateOne: {
            filter: { sessionId, jid: g.id },
            update: {
              $set: {
                userId: session.userId,
                sessionId,
                jid: g.id,
                subject: g.subject || "WhatsApp Group",
                description: typeof g.desc === "string" ? g.desc : "",
                owner: g.owner || null,
                creation: g.creation || null,
                participants: formattedParticipants,
                participantCount: formattedParticipants.length,
                announce: isAdminOnly,
                restrict: g.restrict === true || g.restrict === "true",
                size: g.size || formattedParticipants.length,
                canSend,
                isMeAdmin,
                lastSyncedAt: now,
              },
            },
            upsert: true,
          },
        };
      });

      // 5. Bulk write to MongoDB in 1 fast operation
      if (!isSessionWriteAllowed(sessionId, sock)) {
        return { success: false, aborted: true, count: 0, groups: [] };
      }
      if (bulkOps.length > 0) {
        await WhatsAppGroup.bulkWrite(bulkOps, { ordered: false });
      }

      // 6. If prune option is set or during full sync, remove groups user is no longer in
      if (options.prune !== false && activeJids.length > 0 && isSessionWriteAllowed(sessionId, sock)) {
        await WhatsAppGroup.deleteMany({
          sessionId,
          jid: { $nin: activeJids },
        });
      }

      if (!isSessionWriteAllowed(sessionId, sock)) {
        return { success: false, aborted: true, count: 0, groups: [] };
      }

      // 7. Update session metadata
      await WhatsAppSession.updateOne(
        { sessionId },
        {
          $set: {
            groupSyncStatus: "completed",
            groupsCount: groupsArray.length,
            lastGroupSyncAt: now,
          },
        }
      );

      console.log(`[GROUP SYNC] Successfully synchronized ${groupsArray.length} groups to MongoDB for session ${sessionId}`);

      // 8. Emit WebSocket events to client
      const totalMembers = groupsArray.reduce((acc, g) => acc + (g.participants?.length || 0), 0);
      if (io) {
        const payload = {
          sessionId,
          count: groupsArray.length,
          total: groupsArray.length,
          totalMembers,
          lastSyncedAt: now,
        };
        io.to(sessionId).emit("groups:synced", payload);
        io.to(sessionId).emit("chats:synced", payload);
        if (session.userId) {
          io.to(`user:${session.userId.toString()}`).emit("groups:synced", payload);
          io.to(`user:${session.userId.toString()}`).emit("chats:synced", payload);
        }
        if (options.emitProgress !== false && !options.deferFinalProgress) {
          emitGroupSyncProgress(io, session, {
            status: "completed",
            stage: "completed",
            progress: 100,
            message: `Synchronized ${groupsArray.length} WhatsApp groups (${totalMembers.toLocaleString()} total members)`,
            stats: { groupsCount: groupsArray.length, totalMembers },
          });
        }
      }

      return { success: true, count: groupsArray.length, totalMembers, groups: groupsArray };
    } catch (err) {
      console.error(`[GROUP SYNC] Error syncing groups for session ${sessionId}:`, err.message);
      await WhatsAppSession.updateOne(
        { sessionId },
        { $set: { groupSyncStatus: "failed" } }
      ).catch(() => {});
      if (options.emitProgress !== false) {
        emitGroupSyncProgress(io, session, {
          status: "error",
          stage: "error",
          progress: 0,
          message: err.message || "Failed to sync WhatsApp groups",
        });
      }
      throw err;
    }
  }

  /**
   * Handle Baileys 'groups.upsert' event (e.g. account joins or discovers new groups).
   * Updates only those specific groups in MongoDB without full fetch.
   */
  async handleGroupsUpsert(sessionId, groups, sock, io) {
    if (!Array.isArray(groups) || groups.length === 0 || !isSessionWriteAllowed(sessionId, sock)) return;

    try {
      const session = await WhatsAppSession.findOne({ sessionId });
      if (!session || !isSessionWriteAllowed(sessionId, sock)) return;

      const allParticipants = groups.flatMap((g) => g.participants || []);
      if (sock) {
        await resolveParticipantsLids(sock, allParticipants);
      }
      const candidateIds = buildSessionCandidateSet(sock, session, groups);

      const bulkOps = groups.map((g) => {
        const isAdminOnly = g.announce === true || g.announce === "true";
        const { isMeAdmin } = evaluateGroupAdminStatus(g, candidateIds);
        const canSend = !isAdminOnly || isMeAdmin;

        const formattedParticipants = (g.participants || []).map((p) => {
          let pNum = p.phoneNumber || "";
          if (!pNum && p.id?.endsWith("@s.whatsapp.net")) {
            pNum = p.id.split("@")[0].split(":")[0];
          }
          return {
            id: p.id,
            admin: p.admin || null,
            phoneNumber: pNum,
            lid: p.id?.endsWith("@lid") ? p.id : null,
          };
        });

        return {
          updateOne: {
            filter: { sessionId, jid: g.id },
            update: {
              $set: {
                userId: session.userId,
                sessionId,
                jid: g.id,
                subject: g.subject || "WhatsApp Group",
                description: typeof g.desc === "string" ? g.desc : "",
                owner: g.owner || null,
                creation: g.creation || null,
                participants: formattedParticipants,
                participantCount: formattedParticipants.length,
                announce: isAdminOnly,
                restrict: g.restrict === true || g.restrict === "true",
                size: g.size || formattedParticipants.length,
                canSend,
                isMeAdmin,
                lastSyncedAt: new Date(),
              },
            },
            upsert: true,
          },
        };
      });

      if (!isSessionWriteAllowed(sessionId, sock)) return;
      await WhatsAppGroup.bulkWrite(bulkOps, { ordered: false });
      await syncGroupsIntoWaChat(session, groups, new Date()).catch(() => {});

      // Update total groups count on session
      const totalCount = await WhatsAppGroup.countDocuments({ sessionId });
      await WhatsAppSession.updateOne(
        { sessionId },
        { $set: { groupsCount: totalCount } }
      );

      if (io) {
        io.to(sessionId).emit("groups:upsert", { sessionId, count: groups.length });
        io.to(sessionId).emit("chats:synced", { sessionId, lastSyncedAt: new Date(), groupsCount: totalCount });
        if (session.userId) {
          io.to(`user:${session.userId.toString()}`).emit("chats:synced", { sessionId, lastSyncedAt: new Date(), groupsCount: totalCount });
        }
        for (const g of groups) {
          io.to(sessionId).emit("group:updated", { sessionId, jid: g.id });
        }
      }
    } catch (err) {
      console.warn(`[GROUP SYNC] Error handling groups.upsert:`, err.message);
    }
  }

  /**
   * Handle Baileys 'groups.update' event (subject, description, settings changed).
   */
  async handleGroupsUpdate(sessionId, updates, sock, io) {
    if (!Array.isArray(updates) || updates.length === 0 || !isSessionWriteAllowed(sessionId, sock)) return;

    try {
      const myJidClean = sock?.user?.id?.split(":")[0]?.split("@")[0];

      for (const update of updates) {
        if (!isSessionWriteAllowed(sessionId, sock)) return;
        if (!update.id) continue;

        const updateFields = {
          lastSyncedAt: new Date(),
        };

        if (update.subject !== undefined) updateFields.subject = update.subject;
        if (update.desc !== undefined) updateFields.description = update.desc;
        if (update.announce !== undefined) {
          updateFields.announce = update.announce === true || update.announce === "true";
        }
        if (update.restrict !== undefined) {
          updateFields.restrict = update.restrict === true || update.restrict === "true";
        }

        const existing = await WhatsAppGroup.findOne({ sessionId, jid: update.id });
        if (existing) {
          if (updateFields.announce !== undefined) {
            updateFields.canSend = !updateFields.announce || existing.isMeAdmin;
          }

          await WhatsAppGroup.updateOne(
            { sessionId, jid: update.id },
            { $set: updateFields }
          );

          if (updateFields.subject) {
            await WaChat.updateOne(
              { sessionId, chatJid: update.id },
              {
                $set: {
                  name: updateFields.subject,
                  groupSubject: updateFields.subject,
                  isGroup: true,
                  phoneNumber: "",
                },
              }
            ).catch(() => {});
          }

          if (io) {
            io.to(sessionId).emit("group:updated", {
              sessionId,
              jid: update.id,
              updates: updateFields,
            });
            if (updateFields.subject) {
              io.to(sessionId).emit("chat:updated", {
                sessionId,
                chatJid: update.id,
                name: updateFields.subject,
              });
            }
          }
        }
      }
    } catch (err) {
      console.warn(`[GROUP SYNC] Error handling groups.update:`, err.message);
    }
  }

  /**
   * Handle Baileys 'group-participants.update' event (member added, removed, promoted, demoted).
   * Updates participant array and counts in MongoDB without full fetch.
   */
  async handleGroupParticipantsUpdate(sessionId, event, sock, io) {
    const { id: groupId, participants, action } = event || {};
    if (!groupId || !Array.isArray(participants) || !action || !isSessionWriteAllowed(sessionId, sock)) return;

    try {
      const group = await WhatsAppGroup.findOne({ sessionId, jid: groupId });
      if (!group) {
        // If not in DB yet, fetch fresh from socket and save
        if (sock) {
          try {
            const meta = await sock.groupMetadata(groupId);
            if (meta) {
              await this.handleGroupsUpsert(sessionId, [meta], sock, io);
            }
          } catch (_) {}
        }
        return;
      }

      const myJidClean = sock?.user?.id?.split(":")[0]?.split("@")[0];
      let currentParticipants = [...(group.participants || [])];

      if (action === "add") {
        const newParticipants = participants.map((pId) => ({
          id: pId,
          admin: null,
          phoneNumber: pId.endsWith("@s.whatsapp.net") ? pId.split("@")[0].split(":")[0] : "",
          lid: pId.endsWith("@lid") ? pId : null,
        }));

        // Resolve LIDs for newly added members if needed
        if (sock) {
          await resolveParticipantsLids(sock, newParticipants);
        }

        // Avoid duplicates
        for (const np of newParticipants) {
          if (!currentParticipants.some((p) => p.id === np.id)) {
            currentParticipants.push(np);
          }
        }
      } else if (action === "remove") {
        currentParticipants = currentParticipants.filter(
          (p) => !participants.includes(p.id)
        );
      } else if (action === "promote") {
        currentParticipants = currentParticipants.map((p) => {
          if (participants.includes(p.id)) {
            return { ...p, admin: "admin" };
          }
          return p;
        });
      } else if (action === "demote") {
        currentParticipants = currentParticipants.map((p) => {
          if (participants.includes(p.id)) {
            return { ...p, admin: null };
          }
          return p;
        });
      }

      // Re-evaluate admin & canSend status
      const session = await WhatsAppSession.findOne({ sessionId });
      const candidateIds = buildSessionCandidateSet(sock, session, [{ ...group.toObject(), participants: currentParticipants }]);
      const { isMeAdmin } = evaluateGroupAdminStatus({ ...group.toObject(), participants: currentParticipants }, candidateIds);
      const canSend = !group.announce || isMeAdmin;

      group.participants = currentParticipants;
      group.participantCount = currentParticipants.length;
      group.size = currentParticipants.length;
      group.isMeAdmin = isMeAdmin;
      group.canSend = canSend;
      group.lastSyncedAt = new Date();

      if (!isSessionWriteAllowed(sessionId, sock)) return;
      await group.save();

      if (io) {
        const payload = {
          sessionId,
          jid: groupId,
          action,
          participants,
          participantCount: currentParticipants.length,
          canSend,
          isMeAdmin,
        };
        io.to(sessionId).emit("group:participants_updated", payload);
        io.to(sessionId).emit("group:updated", { sessionId, jid: groupId });
      }
    } catch (err) {
      console.warn(`[GROUP SYNC] Error handling group-participants.update:`, err.message);
    }
  }

  /**
   * Fast MongoDB read with search, pagination, and sorting.
   */
  async getGroups(sessionId, userId, queryParams = {}) {
    const { search = "", page, limit, sort = "participants", light = false, adminOnly, filter: filterType } = queryParams;

    const filter = { sessionId, userId };

    if (search && search.trim()) {
      filter.subject = { $regex: search.trim(), $options: "i" };
    }

    if (adminOnly === "true" || adminOnly === true || filterType === "admin") {
      filter.isMeAdmin = true;
    }

    let sortOptions = { participantCount: -1, subject: 1 };
    if (sort === "name") sortOptions = { subject: 1 };
    else if (sort === "recent") sortOptions = { updatedAt: -1 };

    let query = WhatsAppGroup.find(filter).sort(sortOptions);

    // Light projection omits heavy participants array for ultra-fast list rendering
    if (light === true || light === "true") {
      query = query.select({
        sessionId: 1,
        jid: 1,
        subject: 1,
        description: 1,
        participantCount: 1,
        announce: 1,
        restrict: 1,
        canSend: 1,
        isMeAdmin: 1,
        owner: 1,
        profilePic: 1,
        lastSyncedAt: 1,
        updatedAt: 1,
      });
    }

    // Optional pagination
    if (page && limit) {
      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(200, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [groups, total, statsAgg] = await Promise.all([
        query.skip(skip).limit(limitNum).lean(),
        WhatsAppGroup.countDocuments(filter),
        WhatsAppGroup.aggregate([
          { $match: filter },
          {
            $group: {
              _id: null,
              totalMembers: { $sum: "$participantCount" },
              adminCount: { $sum: { $cond: ["$isMeAdmin", 1, 0] } },
            },
          },
        ]),
      ]);

      const mappedGroups = groups.map((g) => ({ ...g, id: g.jid }));
      return {
        groups: mappedGroups,
        total,
        totalMembers: statsAgg[0]?.totalMembers || 0,
        adminCount: statsAgg[0]?.adminCount || 0,
        page: pageNum,
        limit: limitNum,
        hasMore: skip + groups.length < total,
      };
    }

    // If no pagination requested, return all records (backward-compatible)
    const [groups, statsAgg] = await Promise.all([
      query.lean(),
      WhatsAppGroup.aggregate([
        { $match: filter },
        {
          $group: {
            _id: null,
            totalMembers: { $sum: "$participantCount" },
            adminCount: { $sum: { $cond: ["$isMeAdmin", 1, 0] } },
          },
        },
      ]),
    ]);
    const mappedGroups = groups.map((g) => ({ ...g, id: g.jid }));
    return {
      groups: mappedGroups,
      total: groups.length,
      totalMembers: statsAgg[0]?.totalMembers || 0,
      adminCount: statsAgg[0]?.adminCount || 0,
      page: 1,
      limit: groups.length,
      hasMore: false,
    };
  }

  /**
   * Get single group details from MongoDB. Fallback to Baileys if missing.
   */
  async getGroupMetadata(sessionId, userId, groupId, sock) {
    let group = await WhatsAppGroup.findOne({ sessionId, userId, jid: groupId }).lean();

    // If not in DB, fetch from socket and save
    if (!group && sock) {
      try {
        const meta = await sock.groupMetadata(groupId);
        if (meta) {
          const session = await WhatsAppSession.findOne({ sessionId, userId });
          if (session) {
            await this.handleGroupsUpsert(sessionId, [meta], sock, null);
            group = await WhatsAppGroup.findOne({ sessionId, userId, jid: groupId }).lean();
          }
        }
      } catch (e) {
        console.warn(`[GROUP SYNC] Fallback metadata fetch error for ${groupId}:`, e.message);
      }
    }

    if (group) {
      return { ...group, id: group.jid };
    }
    return null;
  }

  /**
   * Get common group members across all groups for a session, ranked from highest to lowest.
   */
  async getCommonMembers(sessionId, userId, queryParams = {}) {
    const filter = { sessionId };
    if (userId) {
      filter.userId = userId;
    }

    const groups = await WhatsAppGroup.find(filter)
      .select("jid subject description participantCount participants isMeAdmin inviteCode profilePic")
      .lean();

    if (!groups || groups.length === 0) {
      return {
        success: true,
        summary: {
          totalUniqueMembers: 0,
          commonMembersCount: 0,
          highestGroupCount: 0,
          totalGroupsCount: 0,
          totalMemberships: 0,
          overlapRate: "0.0%",
        },
        members: [],
        total: 0,
        page: 1,
        limit: 50,
      };
    }

    const memberMap = new Map();
    let totalMemberships = 0;

    for (const g of groups) {
      const gInviteLink = g.inviteCode ? `https://chat.whatsapp.com/${g.inviteCode}` : null;
      for (const p of g.participants || []) {
        totalMemberships++;
        const rawId = p.id || p.jid || p.phoneNumber;
        if (!rawId) continue;
        const cleanPhone = (p.phoneNumber || rawId).split(":")[0].split("@")[0].replace(/[^\d]/g, "");
        if (!cleanPhone) continue;

        if (!memberMap.has(cleanPhone)) {
          memberMap.set(cleanPhone, {
            phoneNumber: cleanPhone,
            formattedPhone: `+${cleanPhone}`,
            jid: p.id || `${cleanPhone}@s.whatsapp.net`,
            lid: p.lid || null,
            groups: [],
            adminCount: 0,
          });
        }

        const entry = memberMap.get(cleanPhone);
        const isAdmin = p.admin === "admin" || p.admin === "superadmin";
        entry.groups.push({
          jid: g.jid,
          subject: g.subject || "WhatsApp Group",
          participantCount: g.participantCount || 0,
          inviteCode: g.inviteCode || null,
          inviteLink: gInviteLink,
          isMemberAdmin: isAdmin,
          isMeAdmin: !!g.isMeAdmin,
          profilePic: g.profilePic || null,
        });

        if (isAdmin) {
          entry.adminCount++;
        }
      }
    }

    const allMembers = Array.from(memberMap.values()).map((m) => ({
      ...m,
      commonCount: m.groups.length,
    }));

    // Sort strictly from HIGHEST common count to LOWEST
    allMembers.sort((a, b) => b.commonCount - a.commonCount);

    const totalUniqueMembers = allMembers.length;
    const commonMembersCount = allMembers.filter((m) => m.commonCount > 1).length;
    const highestGroupCount = allMembers[0]?.commonCount || 0;
    const overlapRate = totalUniqueMembers > 0
      ? ((commonMembersCount / totalUniqueMembers) * 100).toFixed(1) + "%"
      : "0.0%";

    let filtered = allMembers;
    const { search = "", minGroups = 1, page = 1, limit = 50 } = queryParams;

    if (parseInt(minGroups) > 1) {
      filtered = filtered.filter((m) => m.commonCount >= parseInt(minGroups));
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase();
      filtered = filtered.filter(
        (m) =>
          m.phoneNumber.includes(q) ||
          m.groups.some((g) => g.subject.toLowerCase().includes(q))
      );
    }

    const p = Math.max(1, parseInt(page) || 1);
    const l = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const startIndex = (p - 1) * l;
    const paginated = filtered.slice(startIndex, startIndex + l);

    return {
      success: true,
      summary: {
        totalUniqueMembers,
        commonMembersCount,
        highestGroupCount,
        totalGroupsCount: groups.length,
        totalMemberships,
        overlapRate,
      },
      total: filtered.length,
      page: p,
      limit: l,
      hasMore: startIndex + l < filtered.length,
      members: paginated,
    };
  }
}

export default new GroupSyncService();
