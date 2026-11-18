import MetaMessage from "../models/MetaMessage.js";
import MetaSystemSettings from "../models/MetaSystemSettings.js";
import WABAccount from "../models/WABAccount.js";
import InstagramDMMessage from "../../instagram/models/InstagramDMMessage.js";
import { addWebhookJob } from "../../queues/templateQueue.js";

// GET /api/meta/webhook  (Meta verification)
export async function verifyWebhook(req, res) {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const settings = await MetaSystemSettings.getSingleton().catch(() => null);
  const verifyToken =
    settings?.webhookVerifyToken ||
    process.env.META_WEBHOOK_VERIFY_TOKEN ||
    "whatsapp_saas_verify_token_2024";

  if (mode === "subscribe" && token === verifyToken) {
    console.log("[Webhook] Verified");
    return res.status(200).send(challenge);
  }
  console.warn("[Webhook] Verification failed. token:", token);
  res.status(403).send("Forbidden");
}

// Internal asynchronous processor for Meta WhatsApp events
export async function processMetaWhatsAppPayload(body) {
  if (!body) return;

  // handle WhatsApp
  if (body.object === "whatsapp_business_account") {
    for (const entry of body.entry || []) {
      for (const change of entry.changes || []) {
        if (change.field !== "messages") continue;

        const value = change.value;

        // Status updates
        for (const status of value.statuses || []) {
          await handleStatusUpdate(status);
        }

        // Incoming messages
        for (const message of value.messages || []) {
          await handleIncomingMessage(message, value.metadata);
        }
      }
    }
  }

  // handle Instagram (fallback via webhook). Meta may deliver IG events under 'page' or 'instagram' objects.
  if (body.entry && Array.isArray(body.entry)) {
    for (const entry of body.entry) {
      for (const change of entry.changes || []) {
        const val = change.value || {};
        const messages =
          val.messages ||
          val.messaging ||
          val.direct_messages ||
          val.direct_message ||
          [];
        if (!messages || (Array.isArray(messages) && messages.length === 0))
          continue;

        for (const msg of messages) {
          try {
            await handleInstagramIncoming(msg, val);
          } catch (e) {
            console.error(
              "[Webhook] Instagram message save failed",
              e?.message || e,
            );
          }
        }
      }
    }
  }
}

// POST /api/meta/webhook  (Meta events)
export async function receiveWebhook(req, res) {
  try {
    // 1. Fast HTTP 200 response to Meta within ~5ms to prevent delivery timeouts
    res.sendStatus(200);

    // 2. Buffer into BullMQ queue to protect Node.js event loop & DB connection pool
    const enqueued = await addWebhookJob("process_meta_whatsapp_webhook", { body: req.body });
    if (!enqueued) {
      // Graceful fallback: If Redis is unreachable, process asynchronously via microtask queue
      setImmediate(() => {
        processMetaWhatsAppPayload(req.body).catch((err) => {
          console.error("[Webhook Fallback] Processing error:", err.message);
        });
      });
    }
  } catch (err) {
    console.error("[Webhook] Ingress error:", err.message);
  }
}

async function handleStatusUpdate(status) {
  const { id: messageId, status: newStatus, timestamp } = status;

  const update = { status: newStatus };
  if (newStatus === "delivered")
    update.deliveredAt = new Date(Number(timestamp) * 1000);
  if (newStatus === "read") update.readAt = new Date(Number(timestamp) * 1000);

  await MetaMessage.findOneAndUpdate({ messageId }, update);
}

async function handleIncomingMessage(message, metadata) {
  const waba = await WABAccount.findOne({
    wabaId: metadata.phone_number_id,
  }).lean();

  await MetaMessage.create({
    userId: waba?.userId || null,
    wabaId: waba?._id || null,
    phoneNumberId: metadata.phone_number_id,
    from: message.from,
    to: metadata.display_phone_number || "",
    messageId: message.id,
    type: "incoming",
    body: message.text?.body || message.type || "",
    status: "delivered",
    deliveredAt: new Date(Number(message.timestamp) * 1000),
  });
}

async function handleInstagramIncoming(message, metadata) {
  // Normalize common fields; webhook formats vary.
  const conversationId =
    message.thread_id ||
    message.conversation_id ||
    message.id ||
    message.message_id ||
    null;
  const from =
    message.from || message.sender || message.user || message.from_id || "";
  const to = message.to || message.recipient || message.target || "";
  const mid =
    message.id || message.message_id || message.client_messaging_id || null;
  const text =
    (message.text && (message.text.body || message.text)) ||
    message.message ||
    message.caption ||
    "";

  await InstagramDMMessage.create({
    userId: null,
    conversationId,
    fromId: String(from || ""),
    toId: String(to || ""),
    messageId: mid || undefined,
    text: String(text || ""),
    isRequest: Boolean(message.is_request || message.request),
    raw: { metadata, message },
    receivedAt: new Date(),
  });
}
