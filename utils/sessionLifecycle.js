import { existsSync, rmSync } from "fs";
import { join } from "path";

// In-memory registry of sessions currently tearing down / disconnected / deleted so
// in-flight async Baileys sync handlers and auth saves abort before re-inserting data.
const deactivatedSessions = new Set();

export function markSessionDeactivated(sessionId) {
  if (sessionId) {
    deactivatedSessions.add(String(sessionId));
  }
}

export function clearSessionDeactivated(sessionId) {
  if (sessionId) {
    deactivatedSessions.delete(String(sessionId));
  }
}

export function isSessionDeactivated(sessionId) {
  if (!sessionId) return true;
  return deactivatedSessions.has(String(sessionId));
}

export function isSessionWriteAllowed(sessionId, sock = null) {
  if (!sessionId) return false;
  if (deactivatedSessions.has(String(sessionId))) return false;
  if (sock && sock._isDestroyed) return false;
  return true;
}

/**
 * Removes downloaded `/uploads/chat_media/` files that are no longer referenced
 * by any remaining WaChatMessage document. Call after WaChatMessage deletion.
 */
export async function cleanupUnusedChatMediaUrls(WaChatMessageModel, candidateUrls) {
  if (!WaChatMessageModel || !Array.isArray(candidateUrls) || candidateUrls.length === 0) {
    return;
  }
  const uniqueUrls = [
    ...new Set(
      candidateUrls.filter(
        (u) => typeof u === "string" && u.startsWith("/uploads/chat_media/")
      )
    ),
  ];
  for (const relUrl of uniqueUrls) {
    try {
      const stillUsed = await WaChatMessageModel.exists({ mediaUrl: relUrl });
      if (!stillUsed) {
        const safeRel = relUrl.replace(/^\/+/, "");
        const absPath = join(process.cwd(), safeRel);
        if (existsSync(absPath)) {
          rmSync(absPath, { force: true });
        }
      }
    } catch (_) {}
  }
}

