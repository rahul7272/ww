import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  listClients,
  createClient,
  getClientById,
  updateClient,
  deleteClient,
  bulkDeleteClients,
  listSalesTeam,
  createSalesTeamMember,
  deleteSalesTeamMember,
} from "../controllers/clientController.js";

const router = express.Router();

// All client routes require authentication
router.use(authMiddleware);

// Sales team / Client owner management routes (Must be before /:id)
router.get("/sales-team", listSalesTeam);
router.post("/sales-team", createSalesTeamMember);
router.delete("/sales-team/:id", deleteSalesTeamMember);

router.get("/", listClients);
router.post("/", createClient);
router.post("/bulk-delete", bulkDeleteClients);
router.get("/:id", getClientById);
router.put("/:id", updateClient);
router.delete("/:id", deleteClient);

export default router;

