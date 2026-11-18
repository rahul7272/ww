import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import MediaCollection from "../models/Media.js";
import MediaSettings from "../models/MediaSettings.js";
import { formatFilePath } from "../utils/fileUpload.js";
import SubscriptionService from "../services/SubscriptionService.js";
import { sendSubscriptionError } from "../utils/subscription.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const uploadsDir = path.join(__dirname, "../uploads");

// Helper to safely delete physical file from disk
function deletePhysicalFile(fileUrl) {
  if (!fileUrl || typeof fileUrl !== "string") return;
  try {
    const filename = path.basename(fileUrl.split("?")[0]);
    if (!filename) return;
    const fullPath = path.join(uploadsDir, filename);
    if (fs.existsSync(fullPath)) {
      fs.unlinkSync(fullPath);
    }
  } catch (err) {
    console.warn("Failed to delete physical media file:", fileUrl, err.message);
  }
}

// Create new collection
export const createCollection = async (req, res) => {
  try {
    const { name, colorId } = req.body;
    const userId = req.user.id || req.user._id;

    const collection = new MediaCollection({
      userId,
      id: `col${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      colorId: colorId || "orange",
      media: [],
      subcollections: [],
    });

    await collection.save();
    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get all collections for user
export const getCollections = async (req, res) => {
  try {
    const userId = req.user.id || req.user._id;
    const collections = await MediaCollection.find({ userId }).sort({
      createdAt: -1,
    });

    // Calculate analytics
    const allMedia = [];
    collections.forEach((col) => {
      (col.media || []).forEach((m) => allMedia.push(m));
      (col.subcollections || []).forEach((sc) => {
        (sc.media || []).forEach((m) => allMedia.push(m));
      });
    });

    const analytics = {
      totalCollections: collections.length,
      totalSubfolders: collections.reduce(
        (s, c) => s + (c.subcollections?.length || 0),
        0,
      ),
      totalFiles: allMedia.length,
      images: allMedia.filter((m) => m.type === "image").length,
      videos: allMedia.filter((m) => m.type === "video").length,
      pdfs: allMedia.filter((m) => m.type === "pdf").length,
      documents: allMedia.filter((m) => m.type === "document").length,
      audios: allMedia.filter((m) => m.type === "audio").length,
      totalSize: collections.reduce((s, c) => s + (c.totalSize || 0), 0),
    };

    // Calculate live user subscription storage quota
    let storageQuota = null;
    try {
      const summary = await SubscriptionService.getUsageSummary(userId);
      const limitMb = SubscriptionService.getLimitValue(
        summary.plan,
        "storageMb",
        summary.subscription,
      );
      const isUnlim = limitMb === -1;
      const limitBytes = isUnlim ? -1 : limitMb * 1024 * 1024;
      const usedBytes = summary.usage?.storageBytes || 0;
      const remainingBytes = isUnlim ? Infinity : Math.max(0, limitBytes - usedBytes);

      storageQuota = {
        planName: summary.plan?.name || "Active Plan",
        isUnlimited: isUnlim,
        limitMb,
        limitBytes,
        usedBytes,
        remainingBytes,
        percentage: isUnlim
          ? 0
          : Math.min(100, Math.round(((usedBytes / limitBytes) * 100) * 10) / 10),
        formattedUsed: summary.usage?.storageHuman || formatBytes(usedBytes),
        formattedLimit: isUnlim ? "Unlimited" : `${limitMb} MB`,
        formattedRemaining: isUnlim ? "Unlimited" : formatBytes(remainingBytes),
        isOverQuota: !isUnlim && usedBytes >= limitBytes,
        storageBreakdown: summary.usage?.storageBreakdown || null,
      };
    } catch (e) {
      console.warn("Failed fetching subscription storage quota in getCollections:", e.message);
    }

    res.status(200).json({ success: true, data: collections, analytics, storageQuota });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Get single collection
export const getCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Update collection
export const updateCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, colorId } = req.body;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOneAndUpdate(
      { _id: id, userId },
      { name, colorId },
      { new: true },
    );

    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete collection
export const deleteCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    // Safely unlink all physical files on disk
    (collection.media || []).forEach((m) => deletePhysicalFile(m.fileUrl));
    (collection.subcollections || []).forEach((sc) => {
      (sc.media || []).forEach((m) => deletePhysicalFile(m.fileUrl));
    });

    await MediaCollection.deleteOne({ _id: id, userId });

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(200).json({ success: true, message: "Collection deleted" });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Add subcollection
export const addSubcollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const subcollection = {
      id: `sc${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name,
      created: new Date(),
      media: [],
    };

    collection.subcollections.unshift(subcollection);
    await collection.save();

    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Rename subcollection
export const renameSubcollection = async (req, res) => {
  try {
    const { id, scId } = req.params;
    const { name } = req.body;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const sc = collection.subcollections.find((s) => s.id === scId);
    if (!sc) {
      return res
        .status(404)
        .json({ success: false, error: "Subcollection not found" });
    }

    sc.name = name;
    await collection.save();

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete subcollection
export const deleteSubcollection = async (req, res) => {
  try {
    const { id, scId } = req.params;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const sc = collection.subcollections.find((s) => s.id === scId);
    if (!sc) {
      return res
        .status(404)
        .json({ success: false, error: "Subcollection not found" });
    }

    // Safely unlink physical files in subcollection
    (sc.media || []).forEach((m) => deletePhysicalFile(m.fileUrl));

    collection.subcollections = collection.subcollections.filter(
      (s) => s.id !== scId,
    );
    await collection.save();

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Upload media to collection
export const uploadToCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id || req.user._id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "No file provided" });
    }

    try {
      await assertMediaSizeLimit(req.file);
      await SubscriptionService.assertStorageLimit(req.user, req.file.size || 0);
    } catch (limitErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      throw limitErr;
    }

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    // Create media object with file info
    const mediaItem = {
      id: `m${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: req.file.originalname,
      type: getFileType(req.file.mimetype),
      size: formatBytes(req.file.size),
      created: new Date(),
      usedIn: 0,
      fileUrl: formatFilePath(req.file.filename),
      fileSize: req.file.size,
    };

    if (!collection.media) collection.media = [];
    collection.media.unshift(mediaItem);
    await collection.save();

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    if (error.statusCode === 413) {
      return res.status(413).json({ success: false, error: error.message });
    }
    return sendSubscriptionError(res, error, "Failed to upload media");
  }
};

// Upload media to subcollection
export const uploadToSubcollection = async (req, res) => {
  try {
    const { id, scId } = req.params;
    const userId = req.user.id || req.user._id;

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, error: "No file provided" });
    }

    try {
      await assertMediaSizeLimit(req.file);
      await SubscriptionService.assertStorageLimit(req.user, req.file.size || 0);
    } catch (limitErr) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      throw limitErr;
    }

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const sc = collection.subcollections.find((s) => s.id === scId);
    if (!sc) {
      if (req.file?.path && fs.existsSync(req.file.path)) {
        try { fs.unlinkSync(req.file.path); } catch (_) {}
      }
      return res
        .status(404)
        .json({ success: false, error: "Subcollection not found" });
    }

    // Create media object with file info
    const mediaItem = {
      id: `m${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: req.file.originalname,
      type: getFileType(req.file.mimetype),
      size: formatBytes(req.file.size),
      created: new Date(),
      usedIn: 0,
      fileUrl: formatFilePath(req.file.filename),
      fileSize: req.file.size,
    };

    if (!sc.media) sc.media = [];
    sc.media.unshift(mediaItem);
    await collection.save();

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(201).json({ success: true, data: collection });
  } catch (error) {
    if (error.statusCode === 413) {
      return res.status(413).json({ success: false, error: error.message });
    }
    return sendSubscriptionError(res, error, "Failed to upload media");
  }
};

// Helper functions
function getFileType(mimetype) {
  if (mimetype.startsWith("image/")) return "image";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype.includes("pdf")) return "pdf";
  if (mimetype.includes("audio")) return "audio";
  if (mimetype.includes("word") || mimetype.includes("document"))
    return "document";
  return "document";
}

async function assertMediaSizeLimit(file) {
  const settings = await MediaSettings.findOne({ key: "global" });
  const type = getFileType(file.mimetype);
  const limitKey = type === "pdf" ? "document" : type;
  const maxMB = settings?.[limitKey]?.maxSizeMB ?? 25;
  if (file.size > maxMB * 1024 * 1024) {
    if (file.path && fs.existsSync(file.path)) {
      try { fs.unlinkSync(file.path); } catch (_) {}
    }
    throw Object.assign(
      new Error(`${type.charAt(0).toUpperCase() + type.slice(1)} files must be under ${maxMB} MB`),
      { statusCode: 413 },
    );
  }
}

function formatBytes(bytes) {
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${bytes} B`;
}

// Delete media from collection (supports root media and nested subcollection search fallback)
export const deleteMediaFromCollection = async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const deletedFiles = [];

    // Check root collection media
    const rootItem = (collection.media || []).find((m) => m.id === mediaId);
    if (rootItem) {
      deletedFiles.push(rootItem);
      collection.media = (collection.media || []).filter((m) => m.id !== mediaId);
    }

    // Also check subcollections (in case called from global view)
    (collection.subcollections || []).forEach((sc) => {
      const scItem = (sc.media || []).find((m) => m.id === mediaId);
      if (scItem) {
        deletedFiles.push(scItem);
        sc.media = (sc.media || []).filter((m) => m.id !== mediaId);
      }
    });

    if (deletedFiles.length === 0) {
      return res.status(404).json({ success: false, error: "Media item not found" });
    }

    deletedFiles.forEach((f) => deletePhysicalFile(f.fileUrl));
    await collection.save();

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete media from subcollection
export const deleteMediaFromSubcollection = async (req, res) => {
  try {
    const { id, scId, mediaId } = req.params;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    const sc = collection.subcollections.find((s) => s.id === scId);
    if (!sc) {
      return res
        .status(404)
        .json({ success: false, error: "Subcollection not found" });
    }

    const item = (sc.media || []).find((m) => m.id === mediaId);
    if (item) {
      deletePhysicalFile(item.fileUrl);
    }

    sc.media = (sc.media || []).filter((m) => m.id !== mediaId);
    await collection.save();

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Delete multiple media items (supports collection-scoped or cross-collection multi-delete)
export const deleteMultipleMedia = async (req, res) => {
  try {
    const { id, scId, mediaIds } = req.body;
    const userId = req.user.id || req.user._id;

    if (!Array.isArray(mediaIds) || mediaIds.length === 0) {
      return res.status(400).json({ success: false, error: "No media IDs provided" });
    }

    const targetMediaIds = new Set(mediaIds);
    const deletedFiles = [];

    if (id) {
      // Scoped to single collection
      const collection = await MediaCollection.findOne({ _id: id, userId });
      if (!collection) {
        return res
          .status(404)
          .json({ success: false, error: "Collection not found" });
      }

      if (scId) {
        const sc = collection.subcollections.find((s) => s.id === scId);
        if (sc) {
          (sc.media || []).forEach((m) => {
            if (targetMediaIds.has(m.id)) deletedFiles.push(m);
          });
          sc.media = (sc.media || []).filter((m) => !targetMediaIds.has(m.id));
        }
      } else {
        (collection.media || []).forEach((m) => {
          if (targetMediaIds.has(m.id)) deletedFiles.push(m);
        });
        collection.media = (collection.media || []).filter(
          (m) => !targetMediaIds.has(m.id),
        );
      }

      deletedFiles.forEach((f) => deletePhysicalFile(f.fileUrl));
      await collection.save();
    } else {
      // Cross-collection delete across all user's collections
      const collections = await MediaCollection.find({ userId });
      for (const col of collections) {
        let changed = false;
        (col.media || []).forEach((m) => {
          if (targetMediaIds.has(m.id)) {
            deletedFiles.push(m);
            changed = true;
          }
        });
        col.media = (col.media || []).filter((m) => !targetMediaIds.has(m.id));

        (col.subcollections || []).forEach((sc) => {
          (sc.media || []).forEach((m) => {
            if (targetMediaIds.has(m.id)) {
              deletedFiles.push(m);
              changed = true;
            }
          });
          sc.media = (sc.media || []).filter((m) => !targetMediaIds.has(m.id));
        });

        if (changed) {
          await col.save();
        }
      }
      deletedFiles.forEach((f) => deletePhysicalFile(f.fileUrl));
    }

    try {
      await SubscriptionService.recalculateUsage(userId);
    } catch (_) {}

    res.status(200).json({
      success: true,
      message: `${deletedFiles.length} files deleted`,
      deletedCount: deletedFiles.length,
    });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Rename collection
export const renameCollection = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const userId = req.user.id || req.user._id;

    const collection = await MediaCollection.findOneAndUpdate(
      { _id: id, userId },
      { name },
      { new: true },
    );

    if (!collection) {
      return res
        .status(404)
        .json({ success: false, error: "Collection not found" });
    }

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};

// Rename single media file
export const renameMedia = async (req, res) => {
  try {
    const { id, mediaId } = req.params;
    const { scId, name } = req.body;
    const userId = req.user.id || req.user._id;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: "Name is required" });
    }

    const collection = await MediaCollection.findOne({ _id: id, userId });
    if (!collection) {
      return res.status(404).json({ success: false, error: "Collection not found" });
    }

    let item = null;
    if (scId) {
      const sc = collection.subcollections.find((s) => s.id === scId);
      if (sc) item = (sc.media || []).find((m) => m.id === mediaId);
    } else {
      item = (collection.media || []).find((m) => m.id === mediaId);
      if (!item) {
        for (const sc of collection.subcollections || []) {
          item = (sc.media || []).find((m) => m.id === mediaId);
          if (item) break;
        }
      }
    }

    if (!item) {
      return res.status(404).json({ success: false, error: "Media item not found" });
    }

    item.name = name.trim();
    await collection.save();

    res.status(200).json({ success: true, data: collection });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
};
