import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  getRules,
  saveRules,
  getSessions,
  getTeams,
  createTeam,
  updateTeam,
  deleteTeam,
  getAgents,
  getFlows,
  getDrips,
} from "../controllers/automationController.js";

const router = express.Router();

// Apply auth middleware to all automation endpoints
router.use(authMiddleware);

// ── Rules & Hours ──
router.get("/rules", getRules);
router.put("/rules", saveRules);

// ── Connected WhatsApp Numbers/Sessions ──
router.get("/sessions", getSessions);

// ── Agent Teams ──
router.get("/teams", getTeams);
router.post("/teams", createTeam);
router.put("/teams/:id", updateTeam);
router.delete("/teams/:id", deleteTeam);

// ── Dropdown Data Sources ──
router.get("/agents", getAgents);
router.get("/flows", getFlows);
router.get("/drips", getDrips);

export default router;
