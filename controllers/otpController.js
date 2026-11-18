import OtpService from "../services/OtpService.js";
import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import OtpLog from "../models/OtpLog.js";
import { addOtpJob } from "../queues/templateQueue.js";
import TemplateMessageService from "../services/TemplateMessageService.js";
import { WhatsAppSession, TemplateLog } from "../models/index.js";

// POST /api/v1/otp/send
export async function sendOtp(req, res) {
  try {
    const {
      phoneNumber,
      otp, // If passed, Mode = CALLER_PROVIDED
      digits = 6,
      expirySeconds = 300,
      templateId,
      templateName,
      variables = {},
      sessionId,
    } = req.body;

    if (!phoneNumber) {
      return res.status(400).json({
        success: false,
        error: "Recipient phoneNumber is required (e.g. '918708604830').",
      });
    }

    const cleanPhone = OtpService.cleanPhone(phoneNumber);
    if (cleanPhone.length < 8) {
      return res.status(400).json({
        success: false,
        error: "Invalid phone number format.",
      });
    }

    // 1. Rate limiting check (max 3 OTP requests / 60s)
    const rateCheck = await OtpService.checkRateLimit(cleanPhone);
    if (!rateCheck.allowed) {
      return res.status(429).json({
        success: false,
        error: rateCheck.reason,
        retryAfter: rateCheck.retryAfter,
      });
    }

    // 2. Resolve Active WhatsApp Session
    let targetSessionId = sessionId;
    if (!targetSessionId) {
      let activeSession = await WhatsAppSession.findOne({
        userId: req.user._id,
        status: "connected",
      });
      if (!activeSession) {
        activeSession = await WhatsAppSession.findOne({
          status: "connected",
        });
      }
      if (!activeSession) {
        activeSession = await WhatsAppSession.findOne({
          userId: req.user._id,
        });
      }
      if (!activeSession) {
        return res.status(400).json({
          success: false,
          error: "No connected WhatsApp account found for this user. Please connect a number first.",
        });
      }
      targetSessionId = activeSession.sessionId;
    }

    // 3. Determine Mode & OTP Value
    let finalOtp = "";
    let mode = "CALLER_PROVIDED";
    let expiresAt = new Date(Date.now() + expirySeconds * 1000);

    if (otp) {
      finalOtp = String(otp).trim();
      mode = "CALLER_PROVIDED";
    } else {
      mode = "SYSTEM_GENERATED";
      finalOtp = OtpService.generateOtp(digits);
      // Store in Redis with TTL for automated verification
      await OtpService.storeOtp(cleanPhone, finalOtp, expirySeconds);
    }

    // 4. Resolve Template
    let template = null;
    if (templateId) {
      template = await WhatsAppTemplate.findOne({ _id: templateId, userId: req.user._id });
    } else if (templateName) {
      template = await WhatsAppTemplate.findOne({
        name: String(templateName).toLowerCase().trim(),
        userId: req.user._id,
      });
    }

    // Default Fallback OTP Template if none created yet
    if (!template) {
      template = {
        name: "default_otp_auth",
        displayName: "Default OTP Authentication",
        header: { format: "NONE" },
        body: "Your verification code is *{{otp}}*. Valid for {{expiry}} minutes. Do not share this code with anyone.",
        footer: "Meharetech Secure Auth",
        buttons: [
          {
            type: "COPY_CODE",
            text: "Copy Code",
            value: "{{otp}}",
          },
        ],
      };
    }

    // 5. Merge Variables
    const expiryMinutes = Math.ceil(expirySeconds / 60);
    const mergedVars = {
      otp: finalOtp,
      "1": finalOtp,
      expiry: String(expiryMinutes),
      "2": String(expiryMinutes),
      phone: cleanPhone,
      ...variables,
    };

    // 6. Create Audit Log in MongoDB
    const otpLog = await OtpLog.create({
      userId: req.user._id,
      sessionId: targetSessionId,
      phoneNumber: cleanPhone,
      mode,
      otpDisplay: OtpService.maskOtp(finalOtp),
      templateId: template._id || null,
      templateName: template.name,
      status: "QUEUED",
      verificationStatus: "PENDING",
      ipAddress: req.ip || req.headers["x-forwarded-for"] || "",
      expiresAt: mode === "SYSTEM_GENERATED" ? expiresAt : null,
    });

    // 7. High-Traffic BullMQ Priority 1 Queue Dispatch
    let jobDispatched = false;
    try {
      const job = await addOtpJob({
        logId: otpLog._id,
        sessionId: targetSessionId,
        phoneNumber: cleanPhone,
        template,
        variables: mergedVars,
      });
      if (job) {
        jobDispatched = true;
      }
    } catch (qErr) {
      console.warn("⚠️ [OtpController] BullMQ queuing failed, running immediate dispatch:", qErr.message);
    }

    // If BullMQ is offline or fallback, dispatch synchronously in background
    if (!jobDispatched) {
      setImmediate(async () => {
        const startTime = Date.now();
        try {
          const result = await TemplateMessageService.dispatch(
            targetSessionId,
            cleanPhone,
            template,
            mergedVars
          );
          await OtpLog.findByIdAndUpdate(otpLog._id, {
            status: "DISPATCHED",
            dispatchLatencyMs: result.latencyMs || Date.now() - startTime,
          });
        } catch (err) {
          console.error("❌ [OtpController] Direct dispatch error:", err.message);
          await OtpLog.findByIdAndUpdate(otpLog._id, {
            status: "FAILED",
            errorMessage: err.message,
            dispatchLatencyMs: Date.now() - startTime,
          });
        }
      });
    }

    res.status(200).json({
      success: true,
      message: "OTP queued for high-priority delivery",
      logId: otpLog._id,
      mode,
      phoneNumber: cleanPhone,
      expiresInSeconds: expirySeconds,
      priority: "HIGH_PRIORITY_P1",
    });
  } catch (err) {
    console.error("[OtpController] sendOtp error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// POST /api/v1/otp/verify
export async function verifyOtp(req, res) {
  try {
    const { phoneNumber, otp } = req.body;

    if (!phoneNumber || !otp) {
      return res.status(400).json({
        success: false,
        error: "Both phoneNumber and otp are required.",
      });
    }

    const result = await OtpService.verifyOtp(phoneNumber, otp);

    if (!result.success) {
      return res.status(400).json(result);
    }

    res.status(200).json({
      success: true,
      message: "OTP verification successful!",
      verifiedAt: new Date(),
    });
  } catch (err) {
    console.error("[OtpController] verifyOtp error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

// GET /api/v1/otp/logs
export async function getOtpLogs(req, res) {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const limit = parseInt(req.query.limit || "20", 10);
    const skip = (page - 1) * limit;

    const filter = { userId: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.verificationStatus) filter.verificationStatus = req.query.verificationStatus;
    if (req.query.phone) filter.phoneNumber = { $regex: req.query.phone, $options: "i" };

    const [total, logs] = await Promise.all([
      OtpLog.countDocuments(filter),
      OtpLog.find(filter).sort("-createdAt").skip(skip).limit(limit).lean(),
    ]);

    res.json({
      success: true,
      total,
      page,
      pages: Math.ceil(total / limit),
      data: logs,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/v1/otp/logs/:id
export async function deleteOtpLog(req, res) {
  try {
    const { id } = req.params;
    await Promise.all([
      OtpLog.findOneAndDelete({ _id: id, userId: req.user._id }),
      TemplateLog.findOneAndDelete({ _id: id, userId: req.user._id }),
    ]);
    res.json({ success: true, message: "OTP log deleted successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}

// DELETE /api/v1/otp/logs/clear or DELETE /api/v1/otp/logs
export async function clearOtpLogs(req, res) {
  try {
    await Promise.all([
      OtpLog.deleteMany({ userId: req.user._id }),
      TemplateLog.deleteMany({ userId: req.user._id, category: "AUTHENTICATION" }),
    ]);
    res.json({ success: true, message: "All OTP logs cleared successfully" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
}
