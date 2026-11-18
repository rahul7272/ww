import { Worker } from "bullmq";
import { createNewRedisConnection } from "../queues/redisClient.js";
import { processMetaWhatsAppPayload } from "../meta/controllers/webhookController.js";
import { processInstagramWebhookPayload } from "../controllers/webhookController.js";

let metaWebhookWorker = null;

export function initMetaWebhookWorker() {
  if (metaWebhookWorker) return metaWebhookWorker;

  try {
    const connection = createNewRedisConnection();

    metaWebhookWorker = new Worker(
      "wa_meta_webhooks",
      async (job) => {
        const { body } = job.data;
        const startTime = Date.now();

        if (job.name === "process_meta_whatsapp_webhook") {
          await processMetaWhatsAppPayload(body);
        } else if (job.name === "process_meta_instagram_webhook") {
          await processInstagramWebhookPayload(body);
        } else {
          console.warn(`[MetaWebhookWorker] Unknown webhook job type: ${job.name}`);
        }

        console.log(`✅ [MetaWebhookWorker] Job #${job.id} (${job.name}) processed in ${Date.now() - startTime}ms`);
      },
      {
        connection,
        concurrency: 10, // Controlled concurrency for inbound webhook events
      }
    );

    metaWebhookWorker.on("completed", (job) => {
      // Completed cleanly
    });

    metaWebhookWorker.on("failed", (job, err) => {
      console.error(`❌ [MetaWebhookWorker] Job #${job?.id} failed:`, err?.message);
    });

    console.log("🚀 [MetaWebhookWorker] BullMQ Meta/Instagram Webhook Worker running (concurrency: 10)");
    return metaWebhookWorker;
  } catch (err) {
    console.warn("⚠️ [MetaWebhookWorker] Failed to start Webhook worker, fallback active:", err.message);
    return null;
  }
}

export default initMetaWebhookWorker;
