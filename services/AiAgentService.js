import AiAgent from "../models/AiAgent.js";
import AiKnowledgeSummary from "../models/AiKnowledgeSummary.js";
import OpenRouterSettings from "../models/OpenRouterSettings.js";
import AiReplyLog from "../models/AiReplyLog.js";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));

// Simple in-memory cooldown: sessionId:jid → last replied timestamp
// Prevents double-reply if messages.upsert fires twice for the same message
const replyCooldown = new Map();

const replyDelay = (type) => {
  if (type === "instant") return 0;
  if (type === "slow") return 4000 + Math.random() * 4000;
  return 1000 + Math.random() * 2000; // natural (default)
};

// ── Ingress Bulkhead: Protects Event Loop & Sockets during High Traffic or LLM Stalls ──
class AsyncBulkhead {
  constructor(maxConcurrent = 10, maxQueue = 50) {
    this.maxConcurrent = maxConcurrent;
    this.maxQueue = maxQueue;
    this.active = 0;
    this.queue = [];
  }

  async run(taskFn) {
    if (this.active >= this.maxConcurrent) {
      if (this.queue.length >= this.maxQueue) {
        const err = new Error("AI Agent capacity saturated (bulkhead queue full)");
        err.code = "BULKHEAD_FULL";
        throw err;
      }
      await new Promise((resolve) => this.queue.push(resolve));
    }

    this.active++;
    try {
      return await taskFn();
    } finally {
      this.active--;
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }
}

const aiBulkhead = new AsyncBulkhead(10, 50);

async function callOpenRouter(message, summaryText, settings) {
  const model = settings.model || "openai/gpt-4o-mini";

  const systemPrompt = summaryText
    ? `You are a customer support AI assistant representing the business described below. You speak on behalf of this business — when someone asks "your name", "who are you", or similar, answer using the name and details from the business info below.\n\nBusiness info:\n${summaryText}\n\nRules:\n- Answer questions using only the business info above.\n- Speak as a representative of this business.\n- If a question cannot be answered from the info above, say: "Please contact support."\n- Be concise and friendly.`
    : "You are a helpful AI customer support agent. Be concise and friendly.";

  // Enforce strict 15-second execution deadline to prevent hanging event loop sockets
  const resp = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${settings.apiKey}`,
    },
    signal: AbortSignal.timeout(15000), // 15s deadline
    body: JSON.stringify({
      model,
      temperature: 0.5,
      max_tokens: 250,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: message },
      ],
    }),
  });

  const data = await resp.json();
  if (!resp.ok) throw new Error(data?.error?.message || "OpenRouter API error");
  const reply = (data?.choices?.[0]?.message?.content || "").trim();
  if (!reply) throw new Error("OpenRouter returned empty reply");
  return reply;
}

// Called for every incoming WhatsApp message on a session
export async function handleIncomingMessage(sessionId, senderJid, text, sendFn) {
  if (!text?.trim()) {
    return false;
  }

  const isGroup = senderJid && (senderJid.endsWith('@g.us') || senderJid.includes('@g.us'));

  // Cooldown: skip if we replied to this jid within last 3 seconds (prevents double-fire)
  const cooldownKey = `${sessionId}:${senderJid}`;
  const lastReply = replyCooldown.get(cooldownKey) || 0;
  if (Date.now() - lastReply < 3000) {
    console.log(`[AI Agent] ${sessionId} — cooldown active for ${senderJid}, skipping`);
    return false;
  }

  try {
    console.log(`[AI Agent] ▶ Incoming on session=${sessionId} from=${senderJid} text="${text.slice(0, 80)}"`);

    // ── Step 1: Find active agent ──────────────────────────────────────────
    const agent = await AiAgent.findOne({ sessionId, isActive: true, autoReplyEnabled: true }).lean();
    if (!agent) {
      console.log(`[AI Agent] ✗ No active agent found for sessionId="${sessionId}"`);
      return false;
    }
    console.log(`[AI Agent] ✔ Agent found: ${agent._id} (${agent.agentName})`);

    // ── Step 2: Check trigger condition ────────────────────────────────────
    const condition = agent.config?.trigger?.condition || "all";
    if (condition === "keywords") {
      const keywords = (agent.config.trigger.keywords || "")
        .split(",")
        .map((k) => k.trim().toLowerCase())
        .filter(Boolean);
      if (keywords.length > 0) {
        const lowerText = text.toLowerCase();
        const matched = keywords.some((k) => lowerText.includes(k));
        if (!matched) {
          console.log(`[AI Agent] ✗ Keyword condition not met for "${text.slice(0, 40)}" — keywords: ${keywords.join(",")}`);
          return false;
        }
      }
    }
    console.log(`[AI Agent] ✔ Trigger condition OK (mode=${condition})`);

    // ── Step 3: Check escalation keyword ──────────────────────────────────
    const escalateWord = (agent.config?.reply?.escalate || "").trim().toLowerCase();
    if (escalateWord && text.toLowerCase().includes(escalateWord)) {
      console.log(`[AI Agent] ✗ Escalation keyword "${escalateWord}" matched — handing off to human`);
      return false;
    }

    // ── Step 4: Get OpenRouter settings ───────────────────────────────────
    let settings = await OpenRouterSettings.findOne({ key: "global" }).lean();
    if (!settings) {
      settings = { key: "global", model: "openai/gpt-4o-mini", apiKey: process.env.OPENROUTER_API_KEY };
    } else if (!settings.apiKey) {
      settings.apiKey = process.env.OPENROUTER_API_KEY;
    }

    if (!settings.apiKey) {
      console.log(`[AI Agent] ✗ No OpenRouter API key configured`);
      return false;
    }
    console.log(`[AI Agent] ✔ OpenRouter settings OK, model=${settings.model}`);

    // ── Step 5: Get knowledge summary ─────────────────────────────────────
    let summaryText = "";
    if (agent.knowledgeSummaryId) {
      const ks = await AiKnowledgeSummary.findById(agent.knowledgeSummaryId).lean();
      if (ks?.summary) {
        summaryText = ks.summary;
        console.log(`[AI Agent] ✔ Knowledge summary loaded (${summaryText.length} chars)`);
      } else {
        console.log(`[AI Agent] ⚠ Knowledge summary not found for id=${agent.knowledgeSummaryId}`);
      }
    } else {
      console.log(`[AI Agent] ⚠ No knowledge summary attached to agent — using generic prompt`);
    }

    // ── Step 6: Apply reply delay ──────────────────────────────────────────
    const waitMs = replyDelay(agent.config?.reply?.delay);
    if (waitMs > 0) {
      console.log(`[AI Agent] ⏱ Waiting ${Math.round(waitMs)}ms (delay=${agent.config?.reply?.delay})`);
      await delay(waitMs);
    }

    // ── Step 7: Call OpenRouter with Bulkhead & Graceful Fallback ──────────
    console.log(`[AI Agent] ⚡ Calling OpenRouter with message: "${text.slice(0, 60)}" (Bulkhead active: ${aiBulkhead.active}/${aiBulkhead.maxConcurrent})`);
    let reply = "";
    try {
      reply = await aiBulkhead.run(() => callOpenRouter(text, summaryText, settings));
      console.log(`[AI Agent] ✔ OpenRouter reply: "${reply.slice(0, 80)}"`);
    } catch (aiErr) {
      console.warn(`[AI Agent] ⚠️ Upstream LLM call failed or timed out: ${aiErr.message}. Employing graceful degradation fallback.`);
      reply = "Our automated assistant is temporarily experiencing high inquiry volume. A team member will assist you shortly.";
    }

    // ── Step 8: Send reply via WhatsApp ────────────────────────────────────
    replyCooldown.set(cooldownKey, Date.now());
    await sendFn(senderJid, reply);
    console.log(`[AI Agent] ✅ Reply sent to ${senderJid}`);

    // ── Step 9: Persist stats + reply log ─────────────────────────────────
    await AiAgent.updateOne(
      { _id: agent._id },
      { $inc: { replyCount: 1 }, $set: { lastRepliedAt: new Date() } },
    );

    await AiReplyLog.create({
      agentId: agent._id,
      userId: agent.userId,
      sessionId,
      senderJid,
      inboundText: text,
      replyText: reply,
    });

    return true; // Successfully answered by chatbot
  } catch (err) {
    console.error(`[AI Agent] ✗ Error on session=${sessionId}:`, err.message);
    return false;
  }
}
