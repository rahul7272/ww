import express from "express";
import authMiddleware from "../middleware/auth.js";
import {
  listCompanies,
  createCompany,
  getCompany,
  updateCompany,
  deleteCompany,
  bulkDeleteCompanies,
} from "../controllers/companyController.js";

const router = express.Router();

// All company routes are authenticated
router.use(authMiddleware);

router.get("/", listCompanies);
router.post("/", createCompany);
router.post("/bulk-delete", bulkDeleteCompanies);
router.get("/:id", getCompany);
router.put("/:id", updateCompany);
router.delete("/:id", deleteCompany);

export default router;

