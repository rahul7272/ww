import { Worker } from "bullmq";
import { createNewRedisConnection } from "../queues/redisClient.js";
import TemplateMessageService from "../services/TemplateMessageService.js";
import OtpLog from "../models/OtpLog.js";
import WhatsAppService from "../services/WhatsAppService.js";

let otpWorker = null;

// Telemetry & Dead-Letter Spike Alerting State (Phase 3 - Task 3.2)
const FAILURE_SPIKE_WINDOW_MS = 15 * 60 * 1000; // 15-minute sliding window
const FAILURE_SPIKE_THRESHOLD = 20; // Alert if >= 20 failures in 15 min
const ALERT_COOLDOWN_MS = 5 * 60 * 1000; // 5-minute debouncing cooldown between alerts

const failureHistory = [];
let consecutiveFailures = 0;
let totalProcessedCount = 0;
let totalFailedCount = 0;
let lastFailureTime = null;
let lastAlertSentAt = 0;

/**
 * Evaluates failure rate in sliding 15-minute window and emits debounced alarms
 */
async function checkFailureSpikeAndAlert(job, err) {
  const now = Date.now();
  lastFailureTime = now;
  consecutiveFailures++;
  totalFailedCount++;

  failureHistory.push(now);

  // Prune entries older than sliding window
  const windowStart = now - FAILURE_SPIKE_WINDOW_MS;
  while (failureHistory.length > 0 && failureHistory[0] < windowStart) {
    failureHistory.shift();
  }

  const failuresInWindow = failureHistory.length;

  if (failuresInWindow >= FAILURE_SPIKE_THRESHOLD || consecutiveFailures >= 20) {
    if (now - lastAlertSentAt > ALERT_COOLDOWN_MS) {
      lastAlertSentAt = now;

      const alertPayload = {
        alarm: "OTP_WORKER_FAILURE_SPIKE",
        severity: "CRITICAL",
        queue: "wa_otp_high_priority",
        failuresInLast15m: failuresInWindow,
        consecutiveFailures,
        threshold: FAILURE_SPIKE_THRESHOLD,
        lastJobId: job?.id,
        lastError: err?.message || "Unknown error",
        timestamp: new Date().toISOString(),
      };

      console.error(
        `🚨 [OPERATIONAL ALARM] OTP worker failure spike detected! ${failuresInWindow} failures in last 15 min (${consecutiveFailures} consecutive). Last error: ${err?.message}`
      );

      // 1. Emit real-time alert to admin dashboard via Socket.IO
      try {
        if (WhatsAppService.io) {
          WhatsAppService.io.emit("admin:alert", alertPayload);
        }
      } catch (ioErr) {
        console.warn("[OtpWorker Alert] Socket.IO emission error:", ioErr.message);
      }

      // 2. Dispatch operational webhook if ALERT_WEBHOOK_URL is configured
      const webhookUrl = process.env.ALERT_WEBHOOK_URL || process.env.SLACK_WEBHOOK_URL;
      if (webhookUrl) {
        try {
          await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(alertPayload),
            signal: AbortSignal.timeout(5000),
          });
          console.log(`[OtpWorker Alert] Operational alert dispatched to external webhook.`);
        } catch (webhookErr) {
          console.warn("[OtpWorker Alert] Webhook delivery failed:", webhookErr.message);
        }
      }
    }
  }
}

/**
 * Returns telemetry metrics for the OTP worker and dead-letter detection
 */
export function getOtpWorkerMetrics() {
  const now = Date.now();
  const windowStart = now - FAILURE_SPIKE_WINDOW_MS;
  while (failureHistory.length > 0 && failureHistory[0] < windowStart) {
    failureHistory.shift();
  }

  return {
    consecutiveFailures,
    failuresInLast15m: failureHistory.length,
    threshold: FAILURE_SPIKE_THRESHOLD,
    lastFailureTime: lastFailureTime ? new Date(lastFailureTime).toISOString() : null,
    lastAlertSentAt: lastAlertSentAt ? new Date(lastAlertSentAt).toISOString() : null,
    totalProcessed: totalProcessedCount,
    totalFailed: totalFailedCount,
  };
}

export function initOtpWorker() {
  if (otpWorker) return otpWorker;

  try {
    const connection = createNewRedisConnection();

    otpWorker = new Worker(
      "wa_otp_high_priority",
      async (job) => {
        const { logId, sessionId, phoneNumber, template, variables, enqueuedAt } = job.data;
        const startTime = Date.now();

        // ── Backlog Expiration Guard (5-minute TTL) ───────────────────────────
        // Discard expired OTP codes if held in queue past token validity period
        if (enqueuedAt && Date.now() - enqueuedAt > 5 * 60 * 1000) {
          const waitSecs = Math.round((Date.now() - enqueuedAt) / 1000);
          console.warn(`⚠️ [OtpWorker] Discarding expired OTP job #${job.id} for ${phoneNumber} (waited ${waitSecs}s in queue, exceeded 5m TTL)`);

          if (logId) {
            await OtpLog.findByIdAndUpdate(logId, {
              status: "FAILED",
              errorMessage: `Discarded: Expired in queue before worker pickup (waited ${waitSecs}s, exceeded 5m TTL)`,
              dispatchLatencyMs: Date.now() - startTime,
            }).catch(() => {});
          }

          return { success: false, expired: true, message: "Expired in queue" };
        }

        console.log(`⚡ [OtpWorker] Processing OTP job #${job.id} for ${phoneNumber}`);

        try {
          const result = await TemplateMessageService.dispatch(
            sessionId,
            phoneNumber,
            template,
            variables
          );

          if (logId) {
            await OtpLog.findByIdAndUpdate(logId, {
              status: "DISPATCHED",
              dispatchLatencyMs: result.latencyMs || Date.now() - startTime,
            });
          }

          console.log(`✅ [OtpWorker] Job #${job.id} dispatched in ${result.latencyMs}ms`);
          return result;
        } catch (err) {
          console.error(`❌ [OtpWorker] Job #${job.id} failed:`, err.message);

          if (logId) {
            await OtpLog.findByIdAndUpdate(logId, {
              status: "FAILED",
              errorMessage: err.message,
              dispatchLatencyMs: Date.now() - startTime,
            });
          }

          throw err;
        }
      },
      {
        connection,
        concurrency: 25, // High concurrency for concurrent OTP requests
      }
    );

    otpWorker.on("completed", (job) => {
      consecutiveFailures = 0;
      totalProcessedCount++;
    });

    otpWorker.on("failed", async (job, err) => {
      console.error(`❌ [OtpWorker] BullMQ failed job #${job?.id}:`, err?.message);
      await checkFailureSpikeAndAlert(job, err).catch((alertErr) => {
        console.warn("[OtpWorker] Alert handler notice:", alertErr.message);
      });
    });

    console.log("🚀 [OtpWorker] BullMQ High-Priority OTP Worker running (concurrency: 25)");
    return otpWorker;
  } catch (err) {
    console.warn("⚠️ [OtpWorker] Failed to start OTP worker, fallback active:", err.message);
    return null;
  }
}

export default initOtpWorker;
