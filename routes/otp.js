import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  sendOtp,
  verifyOtp,
  getOtpLogs,
  deleteOtpLog,
  clearOtpLogs,
} from "../controllers/otpController.js";

const router = express.Router();

router.use(authMiddleware);

router.post("/send", sendOtp);
router.post("/verify", verifyOtp);
router.get("/logs", getOtpLogs);
router.delete("/logs/clear", clearOtpLogs);
router.post("/logs/clear", clearOtpLogs);
router.delete("/logs/:id", deleteOtpLog);
router.delete("/logs", clearOtpLogs);

export default router;
