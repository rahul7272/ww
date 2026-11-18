import { promises as fsPromises, existsSync } from "fs";
import { join, extname } from "path";
import MediaSettings from "../models/MediaSettings.js";
import WaChatMessage from "../models/WaChatMessage.js";
import StorageCleanupLog from "../models/StorageCleanupLog.js";

// File type extension categories covering all standard and custom user attachments
const EXTENSION_CATEGORIES = {
  video: [".mp4", ".mov", ".avi", ".mkv", ".webm", ".3gp", ".m4v", ".flv", ".wmv"],
  image: [".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".ico", ".tiff", ".heic"],
  audio: [".ogg", ".opus", ".mp3", ".m4a", ".wav", ".aac", ".flac", ".wma", ".amr"],
  document: [".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx", ".txt", ".csv", ".rtf"],
  // "other" captures all custom formats: .vcf (contacts), .zip, .rar, .7z, .tar, .gz, .bin, .dat, .apk, etc.
};

export function formatBytes(bytes, decimals = 2) {
  if (!bytes || bytes === 0) return "0 B";
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(dm))} ${sizes[i]}`;
}

export function categorizeFile(filename) {
  const ext = extname(filename).toLowerCase();
  for (const [category, extList] of Object.entries(EXTENSION_CATEGORIES)) {
    if (extList.includes(ext)) {
      return category;
    }
  }
  return "other";
}

/**
 * Returns real VPS filesystem capacity & free space via native Node.js statfs
 */
export async function getVpsDiskStats() {
  try {
    if (typeof fsPromises.statfs === "function") {
      const stats = await fsPromises.statfs(process.cwd());
      const bsize = stats.bsize || 4096;
      const totalBytes = Number(stats.blocks) * bsize;
      const freeBytes = Number(stats.bavail || stats.bfree) * bsize;
      const usedBytes = Math.max(0, totalBytes - freeBytes);
      const freePercentage = totalBytes > 0 ? parseFloat(((freeBytes / totalBytes) * 100).toFixed(1)) : 0;

      return {
        totalBytes,
        freeBytes,
        usedBytes,
        freePercentage,
        totalFormatted: formatBytes(totalBytes),
        freeFormatted: formatBytes(freeBytes),
        usedFormatted: formatBytes(usedBytes),
        available: true,
      };
    }
  } catch (err) {
    console.warn("[STORAGE] statfs query failed:", err.message);
  }

  // Graceful fallback
  return {
    totalBytes: 0,
    freeBytes: 0,
    usedBytes: 0,
    freePercentage: 0,
    totalFormatted: "Unknown",
    freeFormatted: "Unknown",
    usedFormatted: "Unknown",
    available: false,
  };
}

/**
 * Scans backend/uploads/chat_media/ and returns granular file count & size per type (including other)
 */
export async function getChatMediaBreakdown() {
  const uploadsDir = join(process.cwd(), "uploads", "chat_media");

  const breakdown = {
    video: { fileCount: 0, sizeBytes: 0, sizeFormatted: "0 B", label: "Videos" },
    image: { fileCount: 0, sizeBytes: 0, sizeFormatted: "0 B", label: "Images & Stickers" },
    audio: { fileCount: 0, sizeBytes: 0, sizeFormatted: "0 B", label: "Audio & Voice Notes" },
    document: { fileCount: 0, sizeBytes: 0, sizeFormatted: "0 B", label: "Documents & PDFs" },
    other: { fileCount: 0, sizeBytes: 0, sizeFormatted: "0 B", label: "Other & Custom Files" },
  };

  let totalFiles = 0;
  let totalBytes = 0;

  if (!existsSync(uploadsDir)) {
    return {
      breakdown,
      totalFiles: 0,
      totalBytes: 0,
      totalFormatted: "0 B",
    };
  }

  try {
    const files = await fsPromises.readdir(uploadsDir);

    for (const filename of files) {
      const filePath = join(uploadsDir, filename);
      try {
        const stat = await fsPromises.stat(filePath);
        if (stat.isFile()) {
          const category = categorizeFile(filename);
          const size = stat.size || 0;

          if (breakdown[category]) {
            breakdown[category].fileCount += 1;
            breakdown[category].sizeBytes += size;
          } else {
            breakdown.other.fileCount += 1;
            breakdown.other.sizeBytes += size;
          }

          totalFiles += 1;
          totalBytes += size;
        }
      } catch (_) {
        // Skip unreadable or deleted files
      }
    }

    // Format results
    for (const cat of Object.keys(breakdown)) {
      breakdown[cat].sizeFormatted = formatBytes(breakdown[cat].sizeBytes);
    }
  } catch (err) {
    console.error("[STORAGE] Error reading chat_media directory:", err.message);
  }

  return {
    breakdown,
    totalFiles,
    totalBytes,
    totalFormatted: formatBytes(totalBytes),
  };
}

/**
 * Combined storage statistics for the Admin Dashboard
 */
export async function getFullStorageStats() {
  const [vpsDisk, mediaStats, settingsDoc, recentLogs] = await Promise.all([
    getVpsDiskStats(),
    getChatMediaBreakdown(),
    MediaSettings.findOne({ key: "global" }).lean(),
    StorageCleanupLog.find().sort({ executedAt: -1 }).limit(10).lean().catch(() => []),
  ]);

  const defaultCategoryRetention = {
    video: { enabled: true, days: 15 },
    image: { enabled: true, days: 30 },
    audio: { enabled: true, days: 30 },
    document: { enabled: true, days: 60 },
    other: { enabled: true, days: 20 },
  };

  const settings = settingsDoc || {
    retentionDays: 30,
    autoCleanupEnabled: true,
    categoryRetention: defaultCategoryRetention,
    lastCleanup: null,
  };

  return {
    vpsDisk,
    chatMedia: mediaStats,
    retention: {
      retentionDays: settings.retentionDays ?? 30,
      autoCleanupEnabled: settings.autoCleanupEnabled !== false,
      categoryRetention: settings.categoryRetention || defaultCategoryRetention,
    },
    lastCleanup: settings.lastCleanup || {
      executedAt: null,
      targetCategory: "all",
      filesDeleted: 0,
      bytesFreed: 0,
      sizeFreed: "0 B",
      status: "idle",
    },
    recentLogs: recentLogs || [],
  };
}

/**
 * Execute targeted or full chat media cleanup and record in StorageCleanupLog
 */
export async function executeMediaCleanup({
  targetType = "all",
  daysOlderThan = null,
  allTime = false,
  triggerType = "manual_admin",
  adminEmail = null,
} = {}) {
  const uploadsDir = join(process.cwd(), "uploads", "chat_media");
  if (!existsSync(uploadsDir)) {
    return { filesDeleted: 0, bytesFreed: 0, sizeFreed: "0 B" };
  }

  const now = Date.now();
  const cutoffTime = allTime ? Infinity : now - (Number(daysOlderThan || 30) * 24 * 60 * 60 * 1000);

  let filesDeleted = 0;
  let bytesFreed = 0;
  const deletedRelativeUrls = [];

  try {
    const files = await fsPromises.readdir(uploadsDir);

    for (const filename of files) {
      const category = categorizeFile(filename);

      // Check category match
      if (targetType !== "all" && category !== targetType) {
        continue;
      }

      const filePath = join(uploadsDir, filename);
      try {
        const stat = await fsPromises.stat(filePath);
        if (stat.isFile()) {
          const fileTime = stat.mtimeMs || stat.ctimeMs || now;

          // Check age match
          if (allTime || fileTime < cutoffTime) {
            bytesFreed += stat.size || 0;
            await fsPromises.unlink(filePath);
            filesDeleted += 1;
            deletedRelativeUrls.push(`/uploads/chat_media/${filename}`);
          }
        }
      } catch (fileErr) {
        // Skip file if already unlinked or locked
      }
    }

    const sizeFreed = formatBytes(bytesFreed);

    // Record last cleanup in MediaSettings
    await MediaSettings.findOneAndUpdate(
      { key: "global" },
      {
        $set: {
          lastCleanup: {
            executedAt: new Date(),
            targetCategory: targetType,
            filesDeleted,
            bytesFreed,
            sizeFreed,
            status: "success",
          },
        },
      },
      { upsert: true }
    );

    // Create permanent audit log record
    await StorageCleanupLog.create({
      executedAt: new Date(),
      triggerType,
      targetCategory: targetType,
      daysOlderThan: allTime ? null : (daysOlderThan ? Number(daysOlderThan) : null),
      allTime: Boolean(allTime),
      filesDeleted,
      bytesFreed,
      sizeFreed,
      status: "success",
      adminEmail: adminEmail || (triggerType === "automated_cron" ? "system_cron" : null),
    }).catch((logErr) => console.warn("[STORAGE LOG] Save error:", logErr.message));

    // Update MongoDB WaChatMessage documents so UI shows mediaExpired without broken icons
    if (deletedRelativeUrls.length > 0) {
      WaChatMessage.updateMany(
        { mediaUrl: { $in: deletedRelativeUrls } },
        { $set: { mediaExpired: true } }
      ).catch((err) => console.warn("[STORAGE] Media flag update notice:", err.message));
    }

    return {
      success: true,
      filesDeleted,
      bytesFreed,
      sizeFreed,
      targetType,
      triggerType,
    };
  } catch (err) {
    console.error("[STORAGE] Cleanup execution failed:", err.message);
    throw err;
  }
}

/**
 * Multi-Category Automated Cron Runner: Evaluates each category independently
 */
export async function executePerCategoryAutoCleanup() {
  const settings = await MediaSettings.findOne({ key: "global" }).lean();
  if (!settings || settings.autoCleanupEnabled === false) {
    return { success: false, reason: "Auto cleanup is disabled" };
  }

  const rules = settings.categoryRetention || {
    video: { enabled: true, days: 15 },
    image: { enabled: true, days: 30 },
    audio: { enabled: true, days: 30 },
    document: { enabled: true, days: 60 },
    other: { enabled: true, days: 20 },
  };

  const results = [];
  let totalFreedBytes = 0;
  let totalDeletedFiles = 0;

  for (const [category, config] of Object.entries(rules)) {
    if (config && config.enabled !== false && Number(config.days) > 0) {
      try {
        const res = await executeMediaCleanup({
          targetType: category,
          daysOlderThan: config.days,
          allTime: false,
          triggerType: "automated_cron",
          adminEmail: "system_cron",
        });
        if (res.filesDeleted > 0) {
          results.push(res);
          totalFreedBytes += res.bytesFreed;
          totalDeletedFiles += res.filesDeleted;
        }
      } catch (catErr) {
        console.error(`[STORAGE CRON] Error cleaning category ${category}:`, catErr.message);
      }
    }
  }

  return {
    success: true,
    totalDeletedFiles,
    totalFreedBytes,
    totalFreedFormatted: formatBytes(totalFreedBytes),
    categoryResults: results,
  };
}

export default {
  formatBytes,
  categorizeFile,
  getVpsDiskStats,
  getChatMediaBreakdown,
  getFullStorageStats,
  executeMediaCleanup,
  executePerCategoryAutoCleanup,
};
