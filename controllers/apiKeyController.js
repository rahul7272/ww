import crypto from "crypto";
import ApiKey from "../models/ApiKey.js";

const sha256 = (str) => crypto.createHash("sha256").update(str).digest("hex");

const generateRawKey = (env) => {
  const prefix = env === "test" ? "wac_test_" : "wac_live_";
  const random = crypto.randomBytes(24).toString("hex"); // 48 hex chars
  return prefix + random;
};

// POST /api/api-keys
export const createApiKey = async (req, res) => {
  try {
    const { name, environment = "live", permissions } = req.body;
    const userId = req.user.id;

    if (!name?.trim()) {
      return res.status(400).json({ success: false, error: "Key name is required" });
    }

    const cap = await ApiKey.countDocuments({ userId, status: "active" });
    if (cap >= 10) {
      return res.status(400).json({ success: false, error: "Maximum of 10 active API keys allowed" });
    }

    const rawKey = generateRawKey(environment);
    const keyHash = sha256(rawKey);
    const keyPrefix = rawKey.slice(0, 16); // "wac_live_a1b2c3d4"

    const defaultPerms = ["send_messages", "manage_sessions", "read_analytics", "manage_webhooks"];
    const apiKey = await ApiKey.create({
      userId,
      name: name.trim(),
      keyHash,
      keyPrefix,
      environment,
      permissions: Array.isArray(permissions) ? permissions : defaultPerms,
    });

    // Return the raw key ONCE — it will never be retrievable again
    res.status(201).json({
      success: true,
      data: {
        id: apiKey._id,
        name: apiKey.name,
        environment: apiKey.environment,
        permissions: apiKey.permissions,
        status: apiKey.status,
        createdAt: apiKey.createdAt,
        // Only returned on creation:
        rawKey,
      },
    });
  } catch (err) {
    console.error("createApiKey:", err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/api-keys
export const listApiKeys = async (req, res) => {
  try {
    const keys = await ApiKey.find({ userId: req.user.id }).sort({ createdAt: -1 }).lean();

    const safe = keys.map((k) => ({
      id: k._id,
      name: k.name,
      keyPrefix: k.keyPrefix,
      environment: k.environment,
      permissions: k.permissions,
      status: k.status,
      lastUsed: k.lastUsed,
      callCount: k.callCount,
      createdAt: k.createdAt,
    }));

    res.json({ success: true, data: safe });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/api-keys/:id  (revoke)
export const revokeApiKey = async (req, res) => {
  try {
    const key = await ApiKey.findOneAndUpdate(
      { _id: req.params.id, userId: req.user.id },
      { status: "revoked" },
      { new: true }
    );
    if (!key) return res.status(404).json({ success: false, error: "API key not found" });
    res.json({ success: true, message: "API key revoked" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// DELETE /api/api-keys/:id/permanent  (hard delete)
export const deleteApiKey = async (req, res) => {
  try {
    const key = await ApiKey.findOneAndDelete({ _id: req.params.id, userId: req.user.id });
    if (!key) return res.status(404).json({ success: false, error: "API key not found" });
    res.json({ success: true, message: "API key deleted" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Internal helper used by auth middleware
export const findUserByApiKey = async (rawKey) => {
  try {
    if (!rawKey) return null;
    const keyHash = sha256(rawKey);

    const apiKey = await ApiKey.findOne({ keyHash, status: "active" }).populate("userId");
    if (!apiKey) return null;

    // Update usage stats (fire-and-forget)
    ApiKey.updateOne({ _id: apiKey._id }, { lastUsed: new Date(), $inc: { callCount: 1 } }).catch(() => {});

    return apiKey.userId;
  } catch (err) {
    console.error("🗝️  [API-KEY] Exception in findUserByApiKey:", err.message);
    return null;
  }
};
