import crypto from "crypto";
import { getRedisClient } from "../queues/redisClient.js";
import OtpLog from "../models/OtpLog.js";

class OtpService {
  /**
   * Generates a cryptographically secure random numeric OTP
   * @param {number} length - Number of digits (default: 6)
   * @returns {string} OTP code
   */
  generateOtp(length = 6) {
    const min = Math.pow(10, length - 1);
    const max = Math.pow(10, length) - 1;
    return String(crypto.randomInt(min, max + 1));
  }

  /**
   * Sanitizes phone number to pure digits
   */
  cleanPhone(phone) {
    if (!phone) return "";
    return String(phone).replace(/\D/g, "");
  }

  /**
   * Rate limiting: max N OTP requests per windowSeconds per phone
   */
  async checkRateLimit(phone, maxRequests = 3, windowSeconds = 60) {
    const clean = this.cleanPhone(phone);
    if (!clean) return { allowed: false, reason: "Invalid phone number" };

    const redis = getRedisClient();
    const key = `otp_rl:${clean}`;

    try {
      const current = await redis.incr(key);
      if (current === 1) {
        await redis.expire(key, windowSeconds);
      }
      if (current > maxRequests) {
        const ttl = await redis.ttl(key);
        return {
          allowed: false,
          retryAfter: ttl > 0 ? ttl : windowSeconds,
          reason: `Too many OTP requests. Please wait ${ttl > 0 ? ttl : windowSeconds}s before retrying.`,
        };
      }
      return { allowed: true };
    } catch (err) {
      console.warn("⚠️ [OtpService] Redis rate limit check failed:", err.message);
      return { allowed: true }; // Fail-open to avoid service outage
    }
  }

  /**
   * Stores OTP in Redis with TTL and initializes attempt counter
   */
  async storeOtp(phone, otp, ttlSeconds = 300) {
    const clean = this.cleanPhone(phone);
    const redis = getRedisClient();

    const otpKey = `otp:${clean}`;
    const attemptsKey = `otp_attempts:${clean}`;

    try {
      await redis.setex(otpKey, ttlSeconds, String(otp));
      await redis.setex(attemptsKey, ttlSeconds, "0");
      return true;
    } catch (err) {
      console.error("❌ [OtpService] Failed to cache OTP in Redis:", err.message);
      return false;
    }
  }

  /**
   * Verifies an OTP against Redis cache
   * @param {string} phone
   * @param {string} inputOtp
   */
  async verifyOtp(phone, inputOtp) {
    const clean = this.cleanPhone(phone);
    if (!clean || !inputOtp) {
      return { success: false, error: "Phone number and OTP code are required", code: "INVALID_INPUT" };
    }

    const redis = getRedisClient();
    const otpKey = `otp:${clean}`;
    const attemptsKey = `otp_attempts:${clean}`;

    try {
      const [storedOtp, rawAttempts] = await Promise.all([
        redis.get(otpKey),
        redis.get(attemptsKey),
      ]);

      const attempts = parseInt(rawAttempts || "0", 10);
      const MAX_ATTEMPTS = 5;

      if (attempts >= MAX_ATTEMPTS) {
        // Update OtpLog to FAILED_MAX_ATTEMPTS
        await OtpLog.findOneAndUpdate(
          { phoneNumber: clean, verificationStatus: "PENDING" },
          { verificationStatus: "FAILED_MAX_ATTEMPTS", attempts },
          { sort: { createdAt: -1 } }
        );
        return {
          success: false,
          error: "Maximum verification attempts exceeded. Please request a new code.",
          code: "MAX_ATTEMPTS_EXCEEDED",
        };
      }

      if (!storedOtp) {
        return {
          success: false,
          error: "OTP code has expired or was not requested.",
          code: "EXPIRED_OR_NOT_FOUND",
        };
      }

      // Timing-safe comparison to prevent timing attacks
      const cleanInput = String(inputOtp).trim();
      const isMatch =
        cleanInput.length === storedOtp.length &&
        crypto.timingSafeEqual(Buffer.from(cleanInput), Buffer.from(storedOtp));

      if (isMatch) {
        // Success: Clean up keys and mark verified
        await redis.del(otpKey, attemptsKey);

        const updatedLog = await OtpLog.findOneAndUpdate(
          { phoneNumber: clean, verificationStatus: "PENDING" },
          {
            verificationStatus: "VERIFIED",
            verifiedAt: new Date(),
            attempts: attempts + 1,
          },
          { sort: { createdAt: -1 }, new: true }
        );

        return {
          success: true,
          message: "OTP verified successfully",
          logId: updatedLog?._id,
        };
      } else {
        // Mismatch: Increment attempts
        const newAttempts = await redis.incr(attemptsKey);
        const remaining = Math.max(0, MAX_ATTEMPTS - newAttempts);

        await OtpLog.findOneAndUpdate(
          { phoneNumber: clean, verificationStatus: "PENDING" },
          { attempts: newAttempts },
          { sort: { createdAt: -1 } }
        );

        return {
          success: false,
          error: `Invalid OTP code. ${remaining} attempt(s) remaining.`,
          remainingAttempts: remaining,
          code: "MISMATCH",
        };
      }
    } catch (err) {
      console.error("❌ [OtpService] verifyOtp error:", err.message);
      return { success: false, error: err.message, code: "SERVER_ERROR" };
    }
  }

  /**
   * Masks OTP for secure audit logging (e.g. "48****" or "**19")
   */
  maskOtp(otp) {
    if (!otp) return "";
    const str = String(otp);
    if (str.length <= 3) return "***";
    return str.slice(0, 2) + "*".repeat(str.length - 2);
  }
}

export default new OtpService();
