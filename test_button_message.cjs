/**
 * Standalone Test Script: Send WhatsApp Message with Native Buttons
 * Usage:
 *   node test_button_message.cjs [phoneNumber] [mode]
 * Modes:
 *   quick -> Quick Reply buttons only (Yes ✅ / No ❌)
 *   all   -> All button types (Yes ✅ / No ❌ / Open Website 🌐 / Copy Code 📋)
 * Examples:
 *   node test_button_message.cjs 919466727218 quick
 *   node test_button_message.cjs 919466727218 all
 */

const http = require('http');

const recipientPhone = process.argv[2] || '919466727218';
const mode = (process.argv[3] || 'all').toLowerCase();
const cleanPhone = recipientPhone.replace(/\D/g, '');

const quickButtons = [
  {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: 'Yes ✅',
      id: 'btn_yes',
    }),
  },
  {
    name: 'quick_reply',
    buttonParamsJson: JSON.stringify({
      display_text: 'No ❌',
      id: 'btn_no',
    }),
  },
];

const allButtons = [
  ...quickButtons,
  {
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: 'Open Website 🌐',
      url: 'https://www.meharetech.com/',
      merchant_url: 'https://www.meharetech.com/',
    }),
  },
  {
    name: 'cta_copy',
    buttonParamsJson: JSON.stringify({
      display_text: 'Copy Code 📋',
      copy_code: 'WELCOME2026',
    }),
  },
];

const selectedButtons = mode === 'quick' ? quickButtons : allButtons;

const payload = JSON.stringify({
  phoneNumber: cleanPhone,
  text: 'Please choose an option:',
  footer: 'Powered by Baileys',
  buttons: selectedButtons,
});

console.log('----------------------------------------------------');
console.log('🚀 Dispatched WhatsApp Interactive Button Message');
console.log(`📱 Recipient: ${cleanPhone}`);
console.log(`🔘 Mode: ${mode.toUpperCase()} (${selectedButtons.length} buttons)`);
console.log('----------------------------------------------------');

const req = http.request(
  {
    hostname: 'localhost',
    port: 3000,
    path: '/api/whatsapp/send-buttons',
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  },
  (res) => {
    let data = '';
    res.on('data', (chunk) => {
      data += chunk;
    });
    res.on('end', () => {
      console.log(`HTTP Status: ${res.statusCode}`);
      try {
        const json = JSON.parse(data);
        console.log('Server Response:', JSON.stringify(json, null, 2));
        if (json.success) {
          console.log('\n✅ Interactive Message Sent Successfully to WhatsApp (No viewOnceMessage wrapper)!');
          console.log(`📌 Message ID: ${json.messageId}`);
        } else {
          console.log('\n❌ Failed to send:', json.message || json.error);
        }
      } catch (_) {
        console.log('Raw Response:', data);
      }
    });
  }
);

req.on('error', (err) => {
  console.error('❌ Request error:', err.message);
});

req.write(payload);
req.end();
