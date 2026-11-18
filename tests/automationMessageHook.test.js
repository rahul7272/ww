import assert from "node:assert/strict";
import { evaluateInboundMessage } from "../services/whatsappAutomationService.js";

console.log("▶ Running WhatsApp Incoming Message Pipeline Hook Tests...");

// Test: Precedence check (Chatbot already answered)
{
  const result = await evaluateInboundMessage({
    userId: "507f1f77bcf86cd799439011",
    sessionId: "wa_test_1",
    senderJid: "919876543210@s.whatsapp.net",
    pushName: "Rahul",
    phoneNumber: "919876543210",
    chatbotAnswered: true, // Chatbot replied!
  });

  assert.equal(result.action, "skip");
  assert.equal(result.reason, "chatbot_precedence");
  console.log("  ✔ Chatbot precedence test passed: Rules skipped when bot replied");
}

// Test: Group JID filter check
{
  const result = await evaluateInboundMessage({
    userId: "507f1f77bcf86cd799439011",
    sessionId: "wa_test_1",
    senderJid: "123456789-987654@g.us", // Group chat!
    pushName: "Rahul",
    phoneNumber: "919876543210",
    chatbotAnswered: false,
  });

  assert.equal(result.action, "none");
  assert.equal(result.reason, "group_or_broadcast");
  console.log("  ✔ Group & Broadcast filter passed: Non-personal chats ignored");
}

console.log("✅ All Pipeline Hook Tests PASSED successfully!");
