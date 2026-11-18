import { Queue } from "bullmq";
import { createNewRedisConnection } from "./redisClient.js";

let otpQueue = null;
let templateQueue = null;
let webhookQueue = null;

try {
  const connection = createNewRedisConnection();

  otpQueue = new Queue("wa_otp_high_priority", {
    connection,
    defaultJobOptions: {
      priority: 1, // Highest priority in BullMQ
      removeOnComplete: { count: 2000, age: 24 * 3600 },
      removeOnFail: { count: 5000, age: 7 * 24 * 3600 },
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 1000,
      },
    },
  });

  templateQueue = new Queue("wa_template_standard", {
    connection,
    defaultJobOptions: {
      priority: 5,
      removeOnComplete: { count: 1000, age: 24 * 3600 },
      removeOnFail: { count: 2000, age: 7 * 24 * 3600 },
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 2000,
      },
    },
  });

  webhookQueue = new Queue("wa_meta_webhooks", {
    connection,
    defaultJobOptions: {
      removeOnComplete: { count: 2000, age: 24 * 3600 },
      removeOnFail: { count: 2000, age: 7 * 24 * 3600 },
      attempts: 2,
      backoff: {
        type: "exponential",
        delay: 1500,
      },
    },
  });

  console.log("🚀 [Queues] BullMQ High-Traffic OTP, Template, and Webhook queues initialized");
} catch (err) {
  console.warn("⚠️ [Queues] Failed to initialize BullMQ queues, fallback active:", err.message);
}

export async function addOtpJob(data, opts = {}) {
  if (otpQueue) {
    try {
      // Admission control: check pending backlog size to protect Redis & downstream capacity
      const waiting = await otpQueue.getWaitingCount();
      if (waiting >= 5000) {
        const err = new Error("OTP delivery engine is saturated (> 5000 pending). Please retry shortly.");
        err.status = 429;
        err.code = "QUEUE_SATURATED";
        err.retryAfter = 60;
        throw err;
      }
    } catch (qErr) {
      if (qErr.code === "QUEUE_SATURATED") throw qErr;
      // Proceed if Redis count query fails non-critically
    }

    return await otpQueue.add("send_otp", {
      ...data,
      enqueuedAt: Date.now(),
    }, {
      priority: 1,
      ...opts,
    });
  }
  return null;
}

export async function addTemplateJob(data, opts = {}) {
  if (templateQueue) {
    return await templateQueue.add("send_template", {
      ...data,
      enqueuedAt: Date.now(),
    }, {
      priority: 5,
      ...opts,
    });
  }
  return null;
}

export async function addWebhookJob(name, data, opts = {}) {
  if (webhookQueue) {
    return await webhookQueue.add(name, {
      ...data,
      enqueuedAt: Date.now(),
    }, opts);
  }
  return null;
}

/**
 * Exposes live BullMQ queue telemetry and job distributions for system observability (Phase 3 - Task 3.1)
 */
export async function getBullMQTelemetry() {
  const result = {
    connected: false,
    otp: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    template: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
    webhook: { active: 0, waiting: 0, completed: 0, failed: 0, delayed: 0, paused: 0 },
  };

  try {
    if (otpQueue) {
      result.otp = await otpQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused");
      result.connected = true;
    }
    if (templateQueue) {
      result.template = await templateQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused");
      result.connected = true;
    }
    if (webhookQueue) {
      result.webhook = await webhookQueue.getJobCounts("active", "waiting", "completed", "failed", "delayed", "paused");
      result.connected = true;
    }
  } catch (err) {
    result.error = err.message;
  }

  return result;
}

export { otpQueue, templateQueue, webhookQueue };
