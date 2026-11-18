import { Client, Company, CrmContact, WaChat } from "../models/index.js";

/**
 * Normalizes a phone/JID string into digits and returns lookup keys for matching
 * WhatsApp numbers (e.g. 919876543210) against CRM phone fields (e.g. +91 98765-43210 or 9876543210).
 */
export function buildPhoneMatchKeys(rawValue) {
  if (!rawValue || typeof rawValue !== "string") return [];
  if (rawValue.endsWith("@g.us") || rawValue.endsWith("@newsletter") || rawValue.endsWith("@broadcast") || rawValue.endsWith("@lid")) {
    return [];
  }
  const cleanPart = rawValue.replace(/@.*/, "").replace(/:\d+$/, "");
  const digits = cleanPart.replace(/\D/g, "");
  if (digits.length < 7) return [];

  const keys = new Set([digits]);
  const noLeadingZero = digits.replace(/^0+/, "");
  if (noLeadingZero.length >= 7) keys.add(noLeadingZero);

  if (noLeadingZero.length >= 10) {
    const last10 = noLeadingZero.slice(-10);
    keys.add(last10);
    if (noLeadingZero.length === 10) {
      keys.add(`91${last10}`);
    }
  }
  return Array.from(keys);
}

// In-memory LRU cache for high-frequency WhatsApp message CRM resolution
const crmMatchCache = new Map();
const CRM_CACHE_TTL_MS = 60 * 1000; // 60 seconds
const CRM_CACHE_MAX_ENTRIES = 1000;

export function invalidateCrmMatchCache() {
  crmMatchCache.clear();
}

/**
 * Finds matching Client, Company, and CrmContact/Query records for a raw phone number / JID owned by userId.
 * Optimized with in-memory caching and targeted indexed queries to eliminate full-collection table scans.
 */
export async function findMatchingCrmRecords(userId, rawPhone) {
  const targetKeys = new Set(buildPhoneMatchKeys(rawPhone));
  if (!userId || targetKeys.size === 0) {
    return { client: null, company: null, query: null };
  }

  // 1. Check in-memory cache
  const cacheKey = `${userId}:${Array.from(targetKeys).sort().join(',')}`;
  const cachedEntry = crmMatchCache.get(cacheKey);
  if (cachedEntry && Date.now() - cachedEntry.timestamp < CRM_CACHE_TTL_MS) {
    return cachedEntry.data;
  }

  // 2. Targeted indexed query
  const keyArr = Array.from(targetKeys);
  const primary10 = keyArr.find((k) => k.length === 10) || keyArr[0];
  const phoneRegex = primary10 ? new RegExp(primary10) : null;

  const clientFilter = { userId };
  const companyFilter = { userId };
  const queryFilter = { userId };

  if (phoneRegex) {
    clientFilter.mobile = phoneRegex;
    companyFilter.phone = phoneRegex;
    queryFilter.phone = phoneRegex;
  }

  const [clients, companies, queries] = await Promise.all([
    Client.find(clientFilter).select("_id firstName lastName mobile").lean().catch(() => []),
    Company.find(companyFilter).select("_id name phone").lean().catch(() => []),
    CrmContact.find(queryFilter).select("_id name phone leadStatus queryId queryTitle budget requirement").lean().catch(() => []),
  ]);

  let matchedClient = null;
  for (const cl of clients) {
    const clKeys = buildPhoneMatchKeys(cl.mobile);
    if (clKeys.some((k) => targetKeys.has(k))) {
      matchedClient = cl;
      break;
    }
  }

  let matchedCompany = null;
  for (const co of companies) {
    const coKeys = buildPhoneMatchKeys(co.phone);
    if (coKeys.some((k) => targetKeys.has(k))) {
      matchedCompany = co;
      break;
    }
  }

  let matchedQuery = null;
  for (const qu of queries) {
    const quKeys = buildPhoneMatchKeys(qu.phone);
    if (quKeys.some((k) => targetKeys.has(k))) {
      matchedQuery = qu;
      break;
    }
  }

  const result = { client: matchedClient, company: matchedCompany, query: matchedQuery };

  // 3. Cache result with LRU bounds
  if (crmMatchCache.size >= CRM_CACHE_MAX_ENTRIES) {
    const firstKey = crmMatchCache.keys().next().value;
    if (firstKey) crmMatchCache.delete(firstKey);
  }
  crmMatchCache.set(cacheKey, { data: result, timestamp: Date.now() });

  return result;
}

/**
 * Re-links WaChat rows owned by userId to matching Client records in MongoDB.
 */
export async function syncWaChatsForClient(userId, clientDoc) {
  if (!userId || !clientDoc?._id) return;
  const fullName = `${clientDoc.firstName || ""} ${clientDoc.lastName || ""}`.trim();
  const keys = new Set(buildPhoneMatchKeys(clientDoc.mobile));

  // Clear previous links to this clientId first so number edits don't leave stale chat links
  await WaChat.updateMany(
    { userId, clientId: clientDoc._id },
    { $set: { clientId: null, clientName: "" } }
  );

  if (keys.size === 0) return;

  const chats = await WaChat.find({ userId, isGroup: { $ne: true } })
    .select("_id phoneNumber chatJid")
    .lean();

  const matchingIds = chats
    .filter((c) => {
      const cKeys = [
        ...buildPhoneMatchKeys(c.phoneNumber),
        ...buildPhoneMatchKeys(c.chatJid),
      ];
      return cKeys.some((k) => keys.has(k));
    })
    .map((c) => c._id);

  if (matchingIds.length > 0) {
    await WaChat.updateMany(
      { _id: { $in: matchingIds } },
      { $set: { clientId: clientDoc._id, clientName: fullName } }
    );
  }
}

/**
 * Clears Client links from WaChat docs when Client records are deleted.
 */
export async function clearWaChatClientLinks(userId, clientIds) {
  if (!userId || !Array.isArray(clientIds) || clientIds.length === 0) return;
  await WaChat.updateMany(
    { userId, clientId: { $in: clientIds } },
    { $set: { clientId: null, clientName: "" } }
  );
}

/**
 * Re-links WaChat rows owned by userId to matching Company records in MongoDB.
 */
export async function syncWaChatsForCompany(userId, companyDoc) {
  if (!userId || !companyDoc?._id) return;
  const compName = (companyDoc.name || "").trim();
  const keys = new Set(buildPhoneMatchKeys(companyDoc.phone));

  await WaChat.updateMany(
    { userId, companyId: companyDoc._id },
    { $set: { companyId: null, companyName: "" } }
  );

  if (keys.size === 0) return;

  const chats = await WaChat.find({ userId, isGroup: { $ne: true } })
    .select("_id phoneNumber chatJid")
    .lean();

  const matchingIds = chats
    .filter((c) => {
      const cKeys = [
        ...buildPhoneMatchKeys(c.phoneNumber),
        ...buildPhoneMatchKeys(c.chatJid),
      ];
      return cKeys.some((k) => keys.has(k));
    })
    .map((c) => c._id);

  if (matchingIds.length > 0) {
    await WaChat.updateMany(
      { _id: { $in: matchingIds } },
      { $set: { companyId: companyDoc._id, companyName: compName } }
    );
  }
}

/**
 * Clears Company links from WaChat docs when Company records are deleted.
 */
export async function clearWaChatCompanyLinks(userId, companyIds) {
  if (!userId || !Array.isArray(companyIds) || companyIds.length === 0) return;
  await WaChat.updateMany(
    { userId, companyId: { $in: companyIds } },
    { $set: { companyId: null, companyName: "" } }
  );
}

/**
 * Re-links WaChat rows owned by userId to matching CrmContact/Query records in MongoDB.
 */
export async function syncWaChatsForCrmContact(userId, crmDoc) {
  if (!userId || !crmDoc?._id) return;
  const keys = new Set(buildPhoneMatchKeys(crmDoc.phone));
  if (keys.size === 0) return;

  const chats = await WaChat.find({ userId, isGroup: { $ne: true } })
    .select("_id phoneNumber chatJid")
    .lean();

  const matchingIds = chats
    .filter((c) => {
      const cKeys = [
        ...buildPhoneMatchKeys(c.phoneNumber),
        ...buildPhoneMatchKeys(c.chatJid),
      ];
      return cKeys.some((k) => keys.has(k));
    })
    .map((c) => c._id);

  if (matchingIds.length > 0) {
    await WaChat.updateMany(
      { _id: { $in: matchingIds } },
      {
        $set: {
          crmContactId: crmDoc._id,
          queryId: crmDoc.queryId || "",
          queryTitle: crmDoc.queryTitle || "",
          leadStatus: crmDoc.leadStatus || "New",
        },
      }
    );
  }
}

/**
 * Clears CrmContact/Query links from WaChat docs when CrmContact records are deleted.
 */
export async function clearWaChatCrmContactLinks(userId, contactIds) {
  if (!userId || !Array.isArray(contactIds) || contactIds.length === 0) return;
  await WaChat.updateMany(
    { userId, crmContactId: { $in: contactIds } },
    {
      $set: {
        crmContactId: null,
        queryId: "",
        queryTitle: "",
        leadStatus: "",
      },
    }
  );
}

