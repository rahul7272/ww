/**
 * Startup Environment Configuration Validator
 * Validates critical environment variables and enforces fail-fast security policies.
 */

export function validateEnvironment() {
  const isProd = process.env.NODE_ENV === "production";
  const errors = [];
  const warnings = [];

  // 1. Port Validation
  const port = parseInt(process.env.PORT || "3000", 10);
  if (isNaN(port) || port < 1 || port > 65535) {
    errors.push(`Invalid PORT configuration: "${process.env.PORT}". Must be between 1 and 65535.`);
  }

  // 2. Database URI Validation
  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    errors.push("Missing required environment variable: MONGODB_URI");
  } else if (!mongoUri.startsWith("mongodb://") && !mongoUri.startsWith("mongodb+srv://")) {
    errors.push("Invalid MONGODB_URI: Must start with 'mongodb://' or 'mongodb+srv://'");
  }

  // 3. JWT Secret Validation
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    if (isProd) {
      errors.push("Missing required environment variable: JWT_SECRET in production mode.");
    } else {
      warnings.push("JWT_SECRET is not set. Using default development secret.");
    }
  } else if (isProd && (jwtSecret === "dev-secret-key" || jwtSecret === "dev-secret-key-whatsapp-campaign-2024" || jwtSecret.length < 16)) {
    errors.push("Insecure JWT_SECRET detected in production! Please supply a secure random key with at least 16 characters.");
  }

  // 4. Base URL / Public URL Consistency
  const baseUrl = process.env.PUBLIC_BASE_URL || process.env.BASE_URL || process.env.BACKEND_URL || "http://localhost:3000";
  if (!process.env.BASE_URL && !process.env.PUBLIC_BASE_URL && !process.env.BACKEND_URL) {
    warnings.push("Neither PUBLIC_BASE_URL, BASE_URL, nor BACKEND_URL is set. Defaulting to 'http://localhost:3000'.");
  } else if (!/^https?:\/\//i.test(baseUrl)) {
    warnings.push(`Configured BASE_URL "${baseUrl}" does not begin with http:// or https://.`);
  }

  // Canonicalize URL environment variables so all services receive a consistent value
  process.env.BASE_URL = process.env.BASE_URL || baseUrl;
  process.env.BACKEND_URL = process.env.BACKEND_URL || baseUrl;
  process.env.PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || baseUrl;
  process.env.API_ORIGIN = process.env.API_ORIGIN || baseUrl;
  process.env.REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";

  // 5. Campaign & Queue Operational Limits
  const defaultDelay = parseInt(process.env.DEFAULT_MESSAGE_DELAY || "2000", 10);
  const minDelay = parseInt(process.env.MIN_MESSAGE_DELAY || "1000", 10);
  const maxDelay = parseInt(process.env.MAX_MESSAGE_DELAY || "5000", 10);
  const maxCampaignSize = parseInt(process.env.MAX_CAMPAIGN_SIZE || "1000", 10);
  const maxSessionQueueDepth = parseInt(process.env.MAX_SESSION_QUEUE_DEPTH || "200", 10);
  const maxConcurrentCampaigns = parseInt(process.env.MAX_CONCURRENT_CAMPAIGNS || "5", 10);

  // Set normalized integers on process.env if absent
  process.env.DEFAULT_MESSAGE_DELAY = String(defaultDelay);
  process.env.MIN_MESSAGE_DELAY = String(minDelay);
  process.env.MAX_MESSAGE_DELAY = String(maxDelay);
  process.env.MAX_CAMPAIGN_SIZE = String(maxCampaignSize);
  process.env.MAX_SESSION_QUEUE_DEPTH = String(maxSessionQueueDepth);
  process.env.MAX_CONCURRENT_CAMPAIGNS = String(maxConcurrentCampaigns);

  // 6. Firebase Authentication
  const hasFirebaseAdmin = Boolean(process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL && process.env.FIREBASE_PRIVATE_KEY);
  const hasFirebaseWeb = Boolean(process.env.FIREBASE_WEB_API_KEY || process.env.FIREBASE_API_KEY);
  if (!hasFirebaseAdmin && !hasFirebaseWeb) {
    warnings.push("Firebase authentication credentials (Admin SDK or FIREBASE_WEB_API_KEY) are not set. Google login verification will fail.");
  }

  // 7. Meta / WhatsApp / Instagram Integration
  const metaAppId = process.env.META_APP_ID;
  if (metaAppId === "your_meta_app_id") {
    warnings.push("META_APP_ID is using placeholder value 'your_meta_app_id'.");
  }

  // 8. AI & LLM Service Configuration
  const openRouterKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterKey || openRouterKey === "your_openrouter_api_key") {
    warnings.push("OPENROUTER_API_KEY is not configured or using placeholder. AI auto-reply agent features will require configuration in settings.");
  }

  // Output Warnings
  if (warnings.length > 0) {
    console.warn("\n⚠️  [CONFIG WARNINGS]");
    warnings.forEach((w) => console.warn(`   - ${w}`));
  }

  // Fail-Fast on Fatal Errors
  if (errors.length > 0) {
    console.error("\n❌ [FATAL CONFIGURATION ERRORS]");
    errors.forEach((e) => console.error(`   - ${e}`));
    console.error("\nApplication startup aborted due to configuration errors. Please check your .env file.\n");
    process.exit(1);
  }

  console.log("✅ [CONFIG] Environment configuration validated successfully.");
  return {
    port,
    mongoUri,
    isProd,
  };
}

export default validateEnvironment;
