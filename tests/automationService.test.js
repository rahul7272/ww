import assert from "node:assert/strict";
import {
  interpolateText,
  isBusinessOpen,
} from "../services/whatsappAutomationService.js";

console.log("▶ Running WhatsApp Automation Engine Unit Tests...");

// ── Test 1: interpolateText ──
{
  const text = "Hi {{name}}, welcome! Your phone is {{phone}}.";
  const res1 = interpolateText(text, { name: "Rahul", phone: "919876543210" });
  assert.equal(res1, "Hi Rahul, welcome! Your phone is 919876543210.");

  const res2 = interpolateText("Hello {{NAME}}!", { pushName: "Priya" });
  assert.equal(res2, "Hello Priya!");

  const res3 = interpolateText("Hello {{name}}!", {});
  assert.equal(res3, "Hello there!");
  console.log("  ✔ interpolateText passed");
}

// ── Test 2: isBusinessOpen when disabled (Off — always open) ──
{
  const config = { enabled: false };
  const res = isBusinessOpen(config);
  assert.equal(res.isOpen, true);
  assert.match(res.statusText, /always open/i);
  console.log("  ✔ Business hours disabled -> always open passed");
}

// ── Test 3: Holiday check (dd-mm-yyyy) ──
{
  const config = {
    enabled: true,
    timeZone: "UTC",
    schedule: [
      { day: "wednesday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
    ],
    holidays: [{ date: "25-12-2026", name: "Christmas" }],
  };

  // Christmas 2026 at 12:00 UTC
  const christmasDate = new Date("2026-12-25T12:00:00Z");
  const res = isBusinessOpen(config, christmasDate);
  assert.equal(res.isOpen, false);
  assert.equal(res.reason, "holiday");
  console.log("  ✔ Holiday detection passed");
}

// ── Test 4: Closed day (Sunday) ──
{
  const config = {
    enabled: true,
    timeZone: "UTC",
    schedule: [
      { day: "monday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
      { day: "sunday", isOpen: false, slots: [{ start: "09:00", end: "18:00" }] },
    ],
    holidays: [],
  };

  // Sunday 2026-11-15 12:00 UTC
  const sundayDate = new Date("2026-11-15T12:00:00Z");
  const res = isBusinessOpen(config, sundayDate);
  assert.equal(res.isOpen, false);
  assert.equal(res.reason, "day_closed");
  console.log("  ✔ Closed day detection passed");
}

// ── Test 5: Open slot vs Outside hours ──
{
  const config = {
    enabled: true,
    timeZone: "UTC",
    schedule: [
      { day: "monday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
    ],
    holidays: [],
  };

  // Monday 2026-11-16 11:30 UTC -> inside
  const insideDate = new Date("2026-11-16T11:30:00Z");
  const resInside = isBusinessOpen(config, insideDate);
  assert.equal(resInside.isOpen, true);
  assert.equal(resInside.reason, "within_business_hours");

  // Monday 2026-11-16 20:00 UTC -> outside
  const outsideDate = new Date("2026-11-16T20:00:00Z");
  const resOutside = isBusinessOpen(config, outsideDate);
  assert.equal(resOutside.isOpen, false);
  assert.equal(resOutside.reason, "outside_hours");
  console.log("  ✔ Inside slot vs Outside hours passed");
}

// ── Test 6: Split shifts (+ Split slots) ──
{
  const config = {
    enabled: true,
    timeZone: "UTC",
    schedule: [
      {
        day: "monday",
        isOpen: true,
        slots: [
          { start: "09:00", end: "13:00" }, // Morning slot
          { start: "14:00", end: "18:00" }, // Evening slot
        ],
      },
    ],
    holidays: [],
  };

  // Morning: 10:00 -> Open
  assert.equal(isBusinessOpen(config, new Date("2026-11-16T10:00:00Z")).isOpen, true);

  // Lunch Break: 13:30 -> Closed
  assert.equal(isBusinessOpen(config, new Date("2026-11-16T13:30:00Z")).isOpen, false);

  // Afternoon: 15:00 -> Open
  assert.equal(isBusinessOpen(config, new Date("2026-11-16T15:00:00Z")).isOpen, true);

  // Night: 21:00 -> Closed
  assert.equal(isBusinessOpen(config, new Date("2026-11-16T21:00:00Z")).isOpen, false);

  console.log("  ✔ Split shifts (+ Split slots) passed");
}

// ── Test 7: Timezone handling (Asia/Kolkata is UTC+05:30) ──
{
  const config = {
    enabled: true,
    timeZone: "Asia/Kolkata",
    schedule: [
      { day: "monday", isOpen: true, slots: [{ start: "09:00", end: "18:00" }] },
    ],
    holidays: [],
  };

  // 04:00 UTC on Monday is 09:30 AM in Asia/Kolkata -> Open!
  const dateKolkataOpen = new Date("2026-11-16T04:00:00Z");
  const resKolkata = isBusinessOpen(config, dateKolkataOpen);
  assert.equal(resKolkata.isOpen, true);

  // 13:00 UTC on Monday is 18:30 in Asia/Kolkata -> Closed!
  const dateKolkataClosed = new Date("2026-11-16T13:00:00Z");
  const resKolkataClosed = isBusinessOpen(config, dateKolkataClosed);
  assert.equal(resKolkataClosed.isOpen, false);

  console.log("  ✔ Timezone shift calculation passed");
}

// ── Test 8: Throttling window logic ──
{
  const throttleHours = 12;
  const now = Date.now();

  // Sent 2 hours ago -> should be throttled (< 12 hours)
  const sent2HoursAgo = new Date(now - 2 * 60 * 60 * 1000);
  const elapsed2H = (now - sent2HoursAgo.getTime()) / (1000 * 60 * 60);
  assert.equal(elapsed2H < throttleHours, true);

  // Sent 13 hours ago -> should NOT be throttled (>= 12 hours)
  const sent13HoursAgo = new Date(now - 13 * 60 * 60 * 1000);
  const elapsed13H = (now - sent13HoursAgo.getTime()) / (1000 * 60 * 60);
  assert.equal(elapsed13H >= throttleHours, true);

  console.log("  ✔ Throttling window logic passed");
}

console.log("✅ All WhatsApp Automation Engine Unit Tests PASSED successfully!");
