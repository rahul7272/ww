let malvin = null;
try {
  malvin = require('malvin-btns');
} catch (_) {}
const baileysHelper = require('baileys_helper');

const sendInteractiveMessage = (malvin && malvin.sendInteractiveMessage) || baileysHelper.sendInteractiveMessage;
const sendButtons = (malvin && malvin.sendButtons) || baileysHelper.sendButtons;

/**
 * Standard implementation matching user reference guide (Step 2)
 * Sends native interactive message WITHOUT viewOnceMessage wrapper
 */
async function sendCopyAndUrlButtons(sock, phoneNumber, customData = {}) {
  if (!sock || typeof sock.relayMessage !== 'function') {
    throw new Error('WhatsApp socket is not connected or invalid');
  }

  const digits = String(phoneNumber).replace(/\D/g, '');
  if (!digits) {
    throw new Error('A valid recipient phone number is required');
  }

  let cleanPhone = digits;
  if (cleanPhone.length === 10) {
    cleanPhone = `91${cleanPhone}`;
  }
  const jid = `${cleanPhone}@s.whatsapp.net`;

  const btnList = customData.buttons || [
    { id: 'btn_yes', text: 'Yes ✅' },
    { id: 'btn_no', text: 'No ❌' },
    {
      name: 'cta_url',
      buttonParamsJson: JSON.stringify({
        display_text: 'Open Website 🌐',
        url: customData.url || 'https://www.meharetech.com/',
        merchant_url: customData.url || 'https://www.meharetech.com/',
      }),
    },
    {
      name: 'cta_copy',
      buttonParamsJson: JSON.stringify({
        display_text: 'Copy Coupon 📋',
        copy_code: customData.couponCode || 'WELCOME2026',
      }),
    },
  ];

  // Primary: Use malvin-btns (guaranteed no viewOnceMessage and clean binary nodes)
  if (malvin && typeof malvin.sendButtons === 'function') {
    try {
      console.log(`📱 Sending interactive buttons via malvin-btns to ${jid}...`);
      const result = await malvin.sendButtons(sock, jid, {
        text: customData.text || 'Please choose an option:',
        footer: customData.footer || 'Powered by Baileys',
        title: customData.title || '',
        buttons: btnList,
      });
      console.log('✅ Interactive message submitted via malvin-btns:', result?.key?.id);
      return result;
    } catch (malvinErr) {
      console.warn('⚠️ malvin-btns error, trying baileys_helper:', malvinErr.message);
    }
  }

  // Fallback: Use baileys_helper
  const payload = {
    text: customData.text || 'Please choose an option:',
    footer: customData.footer || 'Powered by Baileys',
    interactiveButtons: btnList.map((b, i) => {
      if (b.name && b.buttonParamsJson) return b;
      return {
        name: 'quick_reply',
        buttonParamsJson: JSON.stringify({
          display_text: b.text || b.displayText || `Button ${i + 1}`,
          id: b.id || `btn_${i + 1}`,
        }),
      };
    }),
  };

  const result = await baileysHelper.sendInteractiveMessage(sock, jid, payload);
  console.log('Interactive message submitted via baileys_helper:', result?.key?.id);
  return result;
}

/**
 * Full template button sender using baileys_helper
 * Supports: cta_copy, cta_url, quick_reply, cta_call, and optional media header
 */
async function sendInteractiveTemplateButtons(sock, jid, { bodyText, footerText, headerText, mediaHeader, buttons = [] }) {
  if (!sock || typeof sock.relayMessage !== 'function') {
    throw new Error('WhatsApp socket is not connected or invalid');
  }

  const interactiveButtons = (buttons || []).map((btn, idx) => {
    const btnType = btn.type || btn.name;
    const btnText = btn.text || btn.display_text || 'Button';
    const btnValue = btn.value || '';

    if (btnType === 'COPY_CODE' || btnType === 'cta_copy') {
      return {
        name: 'cta_copy',
        buttonParamsJson: JSON.stringify({
          display_text: btnText || 'Copy Code',
          copy_code: btnValue || '123456',
        }),
      };
    }

    if (btnType === 'URL' || btnType === 'cta_url') {
      const url = btnValue.startsWith('http') ? btnValue : `https://${btnValue}`;
      return {
        name: 'cta_url',
        buttonParamsJson: JSON.stringify({
          display_text: btnText || 'Visit Website',
          url: url,
          merchant_url: url,
        }),
      };
    }

    if (btnType === 'PHONE_NUMBER' || btnType === 'cta_call') {
      return {
        name: 'cta_call',
        buttonParamsJson: JSON.stringify({
          display_text: btnText || 'Call Support',
          phone_number: btnValue || '+91 98100 00000',
        }),
      };
    }

    if (btnType === 'FLOW' || btnType === 'flow') {
      return {
        name: 'flow',
        buttonParamsJson: JSON.stringify({
          display_text: btnText || 'Open Flow',
          flow_id: btn.flowId || btnValue || '',
          flow_action: 'navigate',
          flow_action_payload: {
            screen: btn.flowScreen || 'START',
          },
        }),
      };
    }

    // Default: quick_reply
    return {
      name: 'quick_reply',
      buttonParamsJson: JSON.stringify({
        display_text: btnText || 'Quick Reply',
        id: (btnValue || btnText || `qr_${idx + 1}`).trim(),
      }),
    };
  });

  // If there's a prepared media header (IMAGE, VIDEO, DOCUMENT)
  if (mediaHeader && (mediaHeader.imageMessage || mediaHeader.videoMessage || mediaHeader.documentMessage)) {
    const interactiveMessage = {
      header: mediaHeader,
      body: { text: bodyText || '' },
      nativeFlowMessage: {
        buttons: interactiveButtons,
      },
    };
    if (footerText) {
      interactiveMessage.footer = { text: footerText };
    }

    return await sendInteractiveMessage(sock, jid, { interactiveMessage });
  }

  // Text header or no header
  const payload = {
    text: bodyText || '',
    interactiveButtons,
  };
  if (footerText) payload.footer = footerText;
  if (headerText) payload.title = headerText;

  return await sendInteractiveMessage(sock, jid, payload);
}

module.exports = {
  sendCopyAndUrlButtons,
  sendInteractiveTemplateButtons,
  sendInteractiveMessage,
  sendButtons,
};
