import {
  getOrCreateRules,
  updateRules,
  isBusinessOpen,
  listAgentTeams,
  createAgentTeam,
  updateAgentTeam,
  deleteAgentTeam,
} from "../services/whatsappAutomationService.js";
import {
  WhatsAppSession,
  SalesTeamMember,
  DripCampaign,
} from "../models/index.js";
import Flow from "../models/Flow.js";

/**
 * GET /api/automation/rules?sessionId=...
 * Fetch automation rules (Welcome message, Away message, Business hours) and current open/closed status.
 */
export async function getRules(req, res) {
  try {
    const userId = req.user._id;
    const sessionId = (req.query.sessionId || "default").trim();

    const rule = await getOrCreateRules(userId, sessionId);
    const currentStatus = isBusinessOpen(rule.businessHours);

    res.json({
      success: true,
      rule,
      currentStatus,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getRules error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/automation/rules
 * Update automation rules for a given session/number.
 */
export async function saveRules(req, res) {
  try {
    const userId = req.user._id;
    const { sessionId = "default", welcomeMessage, awayMessage, businessHours } = req.body;

    const rule = await updateRules(userId, (sessionId || "default").trim(), {
      welcomeMessage,
      awayMessage,
      businessHours,
    });

    const currentStatus = isBusinessOpen(rule.businessHours);

    res.json({
      success: true,
      message: "Automation rules saved successfully",
      rule,
      currentStatus,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] saveRules error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/automation/sessions
 * List all WhatsApp sessions/numbers connected by this user.
 */
export async function getSessions(req, res) {
  try {
    const userId = req.user._id;
    const sessions = await WhatsAppSession.find({ userId })
      .select("sessionId name phoneNumber status isLinked lastConnected")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      sessions,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getSessions error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/automation/teams
 * List all agent teams for the current user.
 */
export async function getTeams(req, res) {
  try {
    const userId = req.user._id;
    const teams = await listAgentTeams(userId);
    res.json({
      success: true,
      teams,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getTeams error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * POST /api/automation/teams
 * Create a new agent team.
 */
export async function createTeam(req, res) {
  try {
    const userId = req.user._id;
    const team = await createAgentTeam(userId, req.body);
    res.status(201).json({
      success: true,
      message: "Agent team created successfully",
      team,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] createTeam error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * PUT /api/automation/teams/:id
 * Update an existing agent team.
 */
export async function updateTeam(req, res) {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    const team = await updateAgentTeam(userId, id, req.body);
    res.json({
      success: true,
      message: "Agent team updated successfully",
      team,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] updateTeam error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * DELETE /api/automation/teams/:id
 * Delete an agent team.
 */
export async function deleteTeam(req, res) {
  try {
    const userId = req.user._id;
    const { id } = req.params;
    await deleteAgentTeam(userId, id);
    res.json({
      success: true,
      message: "Agent team deleted successfully",
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] deleteTeam error:", error);
    res.status(400).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/automation/agents
 * List available sales team members / agents for team assignment.
 */
export async function getAgents(req, res) {
  try {
    const userId = req.user._id;
    const agents = await SalesTeamMember.find({ userId })
      .select("name role email phone")
      .sort({ name: 1 })
      .lean();

    res.json({
      success: true,
      agents,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getAgents error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/automation/flows
 * List available interactive flows for the "Then continue in (optional)" dropdown.
 */
export async function getFlows(req, res) {
  try {
    const userId = req.user._id;
    const flows = await Flow.find({ userId, status: { $ne: "Archived" } })
      .select("name description status")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      flows,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getFlows error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}

/**
 * GET /api/automation/drips
 * List drip sequence summaries for the bottom card.
 */
export async function getDrips(req, res) {
  try {
    const userId = req.user._id;
    const drips = await DripCampaign.find({ userId })
      .select("name status triggerType description recipientCount messages")
      .sort({ createdAt: -1 })
      .lean();

    res.json({
      success: true,
      drips,
    });
  } catch (error) {
    console.error("[AUTOMATION CTRL] getDrips error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
}
