import { proto, generateWAMessageFromContent, prepareWAMessageMedia } from "@whiskeysockets/baileys";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
const cjsRequire = createRequire(import.meta.url);
const { sendInteractiveTemplateButtons } = cjsRequire("../utils/whatsappButtons.cjs");
import WhatsAppService from "./WhatsAppService.js";
import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import { WaChatMessage } from "../models/index.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendUploadsDir = path.join(__dirname, "../uploads");

class TemplateMessageService {
  /**
   * Replaces both numeric placeholders {{1}}, {{2}} and named tags {{otp}}, {{name}}
   */
  replaceVariables(text, variables = {}) {
    if (!text) return "";
    let result = String(text);

    // Support both Map and plain Object
    const varMap = variables instanceof Map ? Object.fromEntries(variables) : variables || {};

    // 1. Replace {{1}}, {{2}}, etc.
    result = result.replace(/\{\{(\d+)\}\}/g, (match, index) => {
      const val = varMap[index] ?? varMap[String(index)];
      return val !== undefined && val !== null ? String(val) : match;
    });

    // 2. Replace {{key}} named variables (e.g. {{otp}}, {{name}}, {{expiry}})
    result = result.replace(/\{\{([a-zA-Z0-9_]+)\}\}/g, (match, key) => {
      const val = varMap[key];
      return val !== undefined && val !== null ? String(val) : match;
    });

    return result;
  }

  /**
   * Formats recipient into standard WhatsApp JID
   */
  formatJid(phone) {
    if (!phone) return "";
    let clean = String(phone).replace(/\D/g, "");
    if (clean.length === 10) {
      clean = `91${clean}`;
    }
    if (!clean.endsWith("@s.whatsapp.net")) {
      clean = `${clean}@s.whatsapp.net`;
    }
    return clean;
  }

  /**
   * Resolves a media URL (local uploads path or remote HTTP/HTTPS URL) into a Buffer or URL object.
   */
  resolveMediaTarget(mediaUrl) {
    if (!mediaUrl || typeof mediaUrl !== "string") return null;

    const trimmed = mediaUrl.trim();
    if (!trimmed) return null;

    // 1. Remote HTTP/HTTPS URL
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
      return { url: trimmed };
    }

    // 2. Local uploads file (e.g. /uploads/filename.ext or filename.ext)
    const filename = path.basename(trimmed.split("?")[0]);
    if (!filename) return null;

    const candidatePaths = [
      path.join(backendUploadsDir, filename),
      path.join(process.cwd(), "backend", "uploads", filename),
      path.join(process.cwd(), "uploads", filename),
      path.join(backendUploadsDir, "chat_media", filename),
      path.join(backendUploadsDir, "quick_replies", filename),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        try {
          return fs.readFileSync(p);
        } catch (err) {
          console.warn("[TemplateMessageService] resolveMediaTarget read error:", err.message);
        }
      }
    }

    // 3. Absolute path on disk
    if (fs.existsSync(trimmed)) {
      try {
        return fs.readFileSync(trimmed);
      } catch (_) {}
    }

    return null;
  }

  /**
   * Builds clean formatted text message (used as fallback or for buttonless messages)
   */
  buildFormattedText(template, variables = {}) {
    const safeTemplate = template || {};
    const bodyText = this.replaceVariables(safeTemplate.body || "", variables);
    const footerText = safeTemplate.footer ? this.replaceVariables(safeTemplate.footer, variables) : "";
    const headerText =
      safeTemplate.header?.format === "TEXT" && safeTemplate.header?.text
        ? this.replaceVariables(safeTemplate.header.text, variables)
        : "";

    const parts = [];

    if (headerText) parts.push(`*${headerText}*`);
    if (bodyText) parts.push(bodyText);

    if (Array.isArray(safeTemplate.buttons) && safeTemplate.buttons.length > 0) {
      const buttonLines = [];
      for (const btn of safeTemplate.buttons) {
        const btnText = this.replaceVariables(btn.text, variables);
        const btnValue = this.replaceVariables(btn.value, variables);

        if (btn.type === "COPY_CODE") {
          const codeVal = btnValue || variables["otp"] || variables["1"] || "";
          buttonLines.push(`📋 *${btnText || "Copy Code"}:* \`${codeVal}\``);
        } else if (btn.type === "URL") {
          const url = btnValue.startsWith("http") ? btnValue : `https://${btnValue}`;
          buttonLines.push(`🔗 *${btnText || "Visit"}:* ${url}`);
        } else if (btn.type === "PHONE_NUMBER") {
          buttonLines.push(`📞 *${btnText || "Call Support"}:* ${btnValue}`);
        } else if (btn.type === "QUICK_REPLY") {
          buttonLines.push(`🔘 *[ ${btnText} ]*`);
        } else if (btn.type === "FLOW") {
          buttonLines.push(`⚡ *${btnText || "Open Flow"}*`);
        }
      }
      if (buttonLines.length > 0) parts.push(buttonLines.join("\n"));
    }

    if (footerText) parts.push(`_${footerText}_`);

    return parts.join("\n\n");
  }

  /**
   * Builds native flow buttons array for proto.Message.InteractiveMessage
   */
  buildNativeFlowButtons(template, variables = {}) {
    if (!Array.isArray(template?.buttons) || template.buttons.length === 0) {
      return [];
    }

    const nativeButtons = [];

    for (const btn of template.buttons) {
      const btnText = this.replaceVariables(btn.text, variables);
      const btnValue = this.replaceVariables(btn.value, variables);

      if (btn.type === "COPY_CODE") {
        const code = btnValue || variables["otp"] || variables["1"] || "";
        nativeButtons.push({
          name: "cta_copy",
          buttonParamsJson: JSON.stringify({
            display_text: btnText || "Copy Code",
            id: `copy_${nativeButtons.length + 1}`,
            copy_code: code,
          }),
        });
      } else if (btn.type === "URL") {
        const url = btnValue.startsWith("http") ? btnValue : `https://${btnValue}`;
        nativeButtons.push({
          name: "cta_url",
          buttonParamsJson: JSON.stringify({
            display_text: btnText || "View Catalog",
            url,
            merchant_url: url,
          }),
        });
      } else if (btn.type === "PHONE_NUMBER") {
        nativeButtons.push({
          name: "cta_call",
          buttonParamsJson: JSON.stringify({
            display_text: btnText || "Call Support",
            phone_number: btnValue,
          }),
        });
      } else if (btn.type === "QUICK_REPLY") {
        const displayText = btnText || "Quick Reply";
        const buttonId = (btnValue || btnText || `qr_${nativeButtons.length + 1}`).trim();
        nativeButtons.push({
          name: "quick_reply",
          buttonParamsJson: JSON.stringify({
            display_text: displayText,
            id: buttonId,
          }),
        });
      } else if (btn.type === "FLOW") {
        nativeButtons.push({
          name: "flow",
          buttonParamsJson: JSON.stringify({
            display_text: btnText || "Open Flow",
            flow_id: btn.flowId || "",
            flow_action: "navigate",
            flow_action_payload: {
              screen: btn.flowScreen || "START",
            },
          }),
        });
      }
    }

    return nativeButtons;
  }

  /**
   * Dispatches template message through active WhatsApp session socket.
   * Sends real interactive native flow buttons (Quick Reply, View Catalog, Claim Offer, Copy Code)
   * with full support for Image, Video, and Document media headers.
   */
  async dispatch(sessionId, recipientPhone, template, variables = {}) {
    const startTime = Date.now();
    let cleanPhone = String(recipientPhone).replace(/\D/g, "");

    if (!cleanPhone) {
      throw new Error("Recipient phone number is invalid.");
    }
    if (cleanPhone.length === 10) {
      cleanPhone = `91${cleanPhone}`;
    }

    const jid = this.formatJid(cleanPhone);
    let effectiveSessionId = sessionId;
    let sock = effectiveSessionId ? WhatsAppService.getSocket(effectiveSessionId) : null;

    if (!sock) {
      // Auto-fallback: Find any active connected socket in WhatsAppService
      const activeKeys = Array.from(WhatsAppService.sockets.keys());
      if (activeKeys.length > 0) {
        effectiveSessionId = activeKeys[0];
        sock = WhatsAppService.getSocket(effectiveSessionId);
        console.log(`📱 [TemplateService] Requested session [${sessionId}] inactive, auto-connected to active socket [${effectiveSessionId}]`);
      }
    }

    if (!sock) {
      throw new Error(`WhatsApp session [${sessionId || "none"}] is not connected or active. Please link a device under Devices.`);
    }

    const safeTemplate = template || {};
    const bodyText = this.replaceVariables(safeTemplate.body || "", variables);
    const footerText = safeTemplate.footer ? this.replaceVariables(safeTemplate.footer, variables) : "";
    const headerText =
      safeTemplate.header?.format === "TEXT" && safeTemplate.header?.text
        ? this.replaceVariables(safeTemplate.header.text, variables)
        : "";

    const mediaFormat = safeTemplate.header?.format;
    const rawMediaUrl = safeTemplate.header?.mediaUrl;
    const mediaTarget = this.resolveMediaTarget(rawMediaUrl);
    const mediaFilename = rawMediaUrl ? path.basename(rawMediaUrl.split("?")[0]) : "document.pdf";

    const nativeButtons = this.buildNativeFlowButtons(safeTemplate, variables);
    let sentMessageId = null;

    // SCENARIO 1: Template Has Interactive / Quick Reply Buttons
    if (nativeButtons.length > 0) {
      try {
        console.log(`📱 [TemplateService] Sending Native Interactive Buttons via baileys_helper to ${jid} (Buttons: ${nativeButtons.length}, Header: ${mediaFormat || 'NONE'})`);

        let mediaHeaderObj = null;
        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(mediaFormat) && mediaTarget) {
          try {
            console.log(`📎 [TemplateService] Preparing ${mediaFormat} header attachment...`);
            let preparedMedia = null;
            if (mediaFormat === 'IMAGE') {
              preparedMedia = await prepareWAMessageMedia(
                { image: mediaTarget },
                { upload: sock.waUploadToServer }
              );
              mediaHeaderObj = {
                hasMediaAttachment: true,
                imageMessage: preparedMedia.imageMessage,
              };
            } else if (mediaFormat === 'VIDEO') {
              preparedMedia = await prepareWAMessageMedia(
                { video: mediaTarget },
                { upload: sock.waUploadToServer }
              );
              mediaHeaderObj = {
                hasMediaAttachment: true,
                videoMessage: preparedMedia.videoMessage,
              };
            } else if (mediaFormat === 'DOCUMENT') {
              let detectedMime = 'application/pdf';
              const lowerName = (mediaFilename || '').toLowerCase();
              if (lowerName.endsWith('.xlsx')) detectedMime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
              else if (lowerName.endsWith('.docx')) detectedMime = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
              else if (lowerName.endsWith('.zip')) detectedMime = 'application/zip';
              else if (lowerName.endsWith('.csv')) detectedMime = 'text/csv';

              preparedMedia = await prepareWAMessageMedia(
                {
                  document: mediaTarget,
                  fileName: mediaFilename,
                  mimetype: detectedMime,
                },
                { upload: sock.waUploadToServer }
              );
              mediaHeaderObj = {
                hasMediaAttachment: true,
                documentMessage: preparedMedia.documentMessage,
              };
            }
            console.log(`✅ [TemplateService] ${mediaFormat} header prepared successfully!`);
          } catch (mediaPrepErr) {
            console.warn(`⚠️ [TemplateService] Failed to prepare ${mediaFormat} header for interactive message:`, mediaPrepErr.message);
          }
        }

        const helperResult = await sendInteractiveTemplateButtons(sock, jid, {
          bodyText,
          footerText,
          headerText,
          mediaHeader: mediaHeaderObj,
          buttons: safeTemplate.buttons,
        });

        sentMessageId = helperResult?.key?.id;
        console.log(`✅ [TemplateService] Native interactive buttons dispatched successfully via baileys_helper! (ID: ${sentMessageId})`);
      } catch (nativeErr) {
        console.warn(`⚠️ [TemplateService] Native buttons relay notice (${nativeErr.message}), falling back to direct message:`);
        const fallbackText = this.buildFormattedText(safeTemplate, variables);

        if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(mediaFormat) && mediaTarget) {
          let mediaPayload = null;
          if (mediaFormat === 'IMAGE') {
            mediaPayload = { image: mediaTarget, caption: fallbackText, mimetype: 'image/jpeg' };
          } else if (mediaFormat === 'VIDEO') {
            mediaPayload = { video: mediaTarget, caption: fallbackText, mimetype: 'video/mp4' };
          } else if (mediaFormat === 'DOCUMENT') {
            mediaPayload = { document: mediaTarget, caption: fallbackText, fileName: mediaFilename, mimetype: 'application/pdf' };
          }
          const fbRes = await sock.sendMessage(jid, mediaPayload);
          sentMessageId = fbRes?.key?.id;
        } else {
          const fbRes = await sock.sendMessage(jid, { text: fallbackText });
          sentMessageId = fbRes?.key?.id;
        }
      }
    } else {
      // SCENARIO 2: Buttonless Template (Media Header or Text Only)
      const standardText = this.buildFormattedText(safeTemplate, variables);

      if (['IMAGE', 'VIDEO', 'DOCUMENT'].includes(mediaFormat) && mediaTarget) {
        console.log(`📱 [TemplateService] Sending buttonless ${mediaFormat} message to ${jid}`);
        let mediaPayload = null;
        if (mediaFormat === 'IMAGE') {
          mediaPayload = { image: mediaTarget, caption: standardText, mimetype: 'image/jpeg' };
        } else if (mediaFormat === 'VIDEO') {
          mediaPayload = { video: mediaTarget, caption: standardText, mimetype: 'video/mp4' };
        } else if (mediaFormat === 'DOCUMENT') {
          mediaPayload = { document: mediaTarget, caption: standardText, fileName: mediaFilename, mimetype: 'application/pdf' };
        }
        const res = await sock.sendMessage(jid, mediaPayload);
        sentMessageId = res?.key?.id;
      } else {
        console.log(`📱 [TemplateService] Sending standard text message to ${jid}`);
        const res = await sock.sendMessage(jid, { text: standardText });
        sentMessageId = res?.key?.id;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Increment template stats
    if (template._id) {
      WhatsAppTemplate.findByIdAndUpdate(template._id, {
        $inc: { "stats.sentCount": 1 },
      }).catch(() => {});
    }

    return {
      success: true,
      messageId: sentMessageId,
      latencyMs,
      phoneNumber: cleanPhone,
    };
  }
}

export default new TemplateMessageService();
