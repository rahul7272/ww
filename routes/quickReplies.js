import express from "express";
import multer from "multer";
import { existsSync, mkdirSync } from "fs";
import { join, extname } from "path";
import authMiddleware from "../middleware/auth.js";
import {
  getQuickReplies,
  getQuickReplyById,
  createQuickReply,
  updateQuickReply,
  deleteQuickReply,
  duplicateQuickReply,
  incrementUsage,
  exportQuickReplies,
  importQuickReplies,
} from "../controllers/quickReplyController.js";

const router = express.Router();

import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ensure upload directory exists in backend uploads
const uploadsRoot = existsSync(path.join(__dirname, "../uploads"))
  ? path.join(__dirname, "../uploads")
  : existsSync(path.join(process.cwd(), "backend", "uploads"))
  ? path.join(process.cwd(), "backend", "uploads")
  : path.join(process.cwd(), "uploads");
const uploadDir = path.join(uploadsRoot, "quick_replies");
if (!existsSync(uploadDir)) {
  mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, `qr_${uniqueSuffix}${extname(file.originalname || "")}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});

// All routes require authentication
router.use(authMiddleware);

// Direct media file upload for quick reply attachments
router.post("/upload", upload.single("file"), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: "No file uploaded" });
    }
    const relativeUrl = `/uploads/quick_replies/${req.file.filename}`;
    return res.json({
      success: true,
      url: relativeUrl,
      filename: req.file.originalname,
      size: req.file.size,
      mimetype: req.file.mimetype,
    });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/", getQuickReplies);
router.post("/", createQuickReply);

router.get("/export/all", exportQuickReplies);
router.post("/import/all", importQuickReplies);

router.get("/:id", getQuickReplyById);
router.put("/:id", updateQuickReply);
router.delete("/:id", deleteQuickReply);
router.post("/:id/duplicate", duplicateQuickReply);
router.post("/:id/usage", incrementUsage);

export default router;
