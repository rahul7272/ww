import express from "express";
import messagingController from "../controllers/messagingController.js";
import authMiddleware from "../middleware/auth.js";
import { createRateLimiter } from "../middleware/rateLimiter.js";

const router = express.Router();

// Rate limiter: up to 120 message sends per minute per authenticated user/API client
const messageSendLimiter = createRateLimiter({
  windowMs: 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MESSAGES_PER_MIN, 10) || 120,
  message: "Too many message requests. Please wait a moment before sending more.",
  keyGenerator: (req) => String(req.user?._id || req.ip),
});

router.post("/send", authMiddleware, messageSendLimiter, messagingController.sendMessage);
router.get("/session/:id", authMiddleware, messagingController.getSessionMessages);
router.put(
  "/status/:messageId",
  authMiddleware,
  messagingController.updateMessageStatus,
);

export default router;
