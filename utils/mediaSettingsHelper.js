import { writeFileSync, existsSync, mkdirSync } from "fs";
import { writeFile } from "fs/promises";
import { join } from "path";
import { downloadMediaMessage } from "@whiskeysockets/baileys";
import MediaSettings from "../models/MediaSettings.js";

let cachedMediaSettings = null;
let lastMediaSettingsFetch = 0;
const MEDIA_SETTINGS_TTL = 30000; // 30 seconds cache

/**
 * Retrieve active global MediaSettings with a 30s in-memory cache
 */
export async function getActiveMediaSettings() {
  const now = Date.now();
  if (cachedMediaSettings && now - lastMediaSettingsFetch < MEDIA_SETTINGS_TTL) {
    return cachedMediaSettings;
  }
  try {
    let settings = await MediaSettings.findOne({ key: "global" }).lean();
    if (!settings) {
      settings = await MediaSettings.create({ key: "global" });
      settings = settings.toObject ? settings.toObject() : settings;
    }
    cachedMediaSettings = settings;
    lastMediaSettingsFetch = now;
    return settings;
  } catch (err) {
    if (cachedMediaSettings) return cachedMediaSettings;
    return {
      storageService: "vps",
      publicBaseUrl: "",
      autoDownload: { image: true, video: true, audio: true, document: true },
      image: { maxSizeMB: 16 },
      video: { maxSizeMB: 64 },
      audio: { maxSizeMB: 32 },
      document: { maxSizeMB: 50 },
    };
  }
}

/**
 * Invalidate in-memory cache when settings are saved in Admin panel
 */
export function invalidateMediaSettingsCache() {
  cachedMediaSettings = null;
  lastMediaSettingsFetch = 0;
}

/**
 * Process and resolve media message URL according to Admin MediaSettings
 * - If storageService === 'vps' (and autoDownload enabled): downloads buffer to VPS disk
 * - If storageService === 'whatsapp_url': stores direct WhatsApp URL to save VPS disk space
 *
 * @param {Object} params
 * @param {Object} params.msg - Baileys message stanza
 * @param {Object} params.msgContent - Unwrapped message payload
 * @param {string} params.mediaType - 'image' | 'video' | 'audio' | 'document' | 'sticker'
 * @param {Object} [params.sock] - Baileys socket instance (optional for reuploadRequest)
 * @returns {Promise<{ mediaUrl: string|null, mediaName: string|null }>}
 */
export async function processIncomingMediaMessage({ msg, msgContent, mediaType, sock }) {
  if (!mediaType) return { mediaUrl: null, mediaName: null };

  const settings = await getActiveMediaSettings();

  // Extract direct WhatsApp URL and filename fallback
  const directUrl =
    msgContent?.imageMessage?.url ||
    msgContent?.videoMessage?.url ||
    msgContent?.documentMessage?.url ||
    msgContent?.audioMessage?.url ||
    msgContent?.stickerMessage?.url ||
    msgContent?.imageMessage?.directPath ||
    msgContent?.videoMessage?.directPath ||
    null;

  const originalDocName = msgContent?.documentMessage?.fileName || null;

  const mime =
    msgContent?.imageMessage?.mimetype ||
    msgContent?.videoMessage?.mimetype ||
    msgContent?.documentMessage?.mimetype ||
    msgContent?.audioMessage?.mimetype ||
    msgContent?.stickerMessage?.mimetype ||
    "";

  let ext = "bin";
  if (mediaType === "image") {
    ext = mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : "jpg";
  } else if (mediaType === "video") {
    ext = "mp4";
  } else if (mediaType === "audio") {
    ext = mime.includes("ogg") ? "ogg" : "mp3";
  } else if (mediaType === "document") {
    if (originalDocName && originalDocName.includes(".")) {
      ext = originalDocName.split(".").pop();
    } else {
      ext = mime.includes("pdf") ? "pdf" : "bin";
    }
  } else if (mediaType === "sticker") {
    ext = "webp";
  }

  let mediaName = originalDocName || `${mediaType}_${Date.now()}.${ext}`;

  // Extract raw media keys for on-demand stream decryption proxy
  const subMsg =
    msgContent?.imageMessage ||
    msgContent?.videoMessage ||
    msgContent?.documentMessage ||
    msgContent?.audioMessage ||
    msgContent?.stickerMessage ||
    null;

  let rawMedia = null;
  if (subMsg) {
    let keyBase64 = null;
    if (subMsg.mediaKey) {
      keyBase64 = Buffer.isBuffer(subMsg.mediaKey)
        ? subMsg.mediaKey.toString("base64")
        : Buffer.from(subMsg.mediaKey).toString("base64");
    }
    rawMedia = {
      mediaKey: keyBase64,
      directPath: subMsg.directPath || null,
      url: subMsg.url || null,
      mimetype: subMsg.mimetype || mime || null,
      fileLength: subMsg.fileLength ? Number(subMsg.fileLength) : 0,
    };
  }

  // Check if VPS download is enabled for this type
  const isVpsMode = (settings.storageService || "vps") === "vps";
  const isTypeEnabled = settings.autoDownload?.[mediaType] !== false;

  const base = (settings.publicBaseUrl || "").trim().replace(/\/$/, "");
  const streamFallback = `/api/chats/media-stream/${msg.key.id}`;
  const streamUrl = base ? `${base}${streamFallback}` : streamFallback;

  if (!isVpsMode || !isTypeEnabled) {
    // Mode is "whatsapp_url" or auto-download is disabled for this type.
    // Instead of raw .enc URL which the browser cannot decode, route through streaming decryption proxy
    return {
      mediaUrl: streamUrl,
      mediaName,
      rawMedia,
    };
  }

  // Download buffer to VPS disk
  try {
    const buffer = await downloadMediaMessage(
      msg,
      "buffer",
      {},
      sock?.updateMediaMessage ? { reuploadRequest: sock.updateMediaMessage } : {}
    );

    if (buffer && buffer.length > 0) {
      // Validate file size limit if configured
      const maxMb = settings[mediaType]?.maxSizeMB || 100;
      if (buffer.length > maxMb * 1024 * 1024) {
        console.warn(`[WA MEDIA] File size (${(buffer.length / 1024 / 1024).toFixed(2)} MB) exceeds max limit of ${maxMb} MB. Falling back to on-demand streaming proxy.`);
        return {
          mediaUrl: streamUrl,
          mediaName,
          rawMedia,
        };
      }

      const uploadsDir = join(process.cwd(), "uploads", "chat_media");
      if (!existsSync(uploadsDir)) {
        mkdirSync(uploadsDir, { recursive: true });
      }

      const filename = `media_${Date.now()}_${Math.random().toString(36).substring(2, 8)}.${ext}`;
      const filePath = join(uploadsDir, filename);
      await writeFile(filePath, buffer);

      if (!originalDocName) {
        mediaName = filename;
      }

      // If a publicBaseUrl is configured in admin settings (e.g. https://yourdomain.com), prepend it
      const mediaUrl = base ? `${base}/uploads/chat_media/${filename}` : `/uploads/chat_media/${filename}`;

      return {
        mediaUrl,
        mediaName,
        rawMedia,
      };
    }
  } catch (dlErr) {
    console.warn(`[WA MEDIA] Could not auto-download ${mediaType} on receipt (${dlErr.message}). Falling back to stream proxy.`);
  }

  // Fallback to on-demand stream proxy if buffer download failed
  return {
    mediaUrl: streamUrl,
    mediaName,
    rawMedia,
  };
}

