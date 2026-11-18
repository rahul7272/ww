import express from "express";
import authMiddleware from "../middleware/auth.js";
import upload from "../utils/fileUpload.js";
import {
  getTemplates,
  getTemplateById,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  testSendTemplate,
  uploadTemplateMedia,
  sendTemplateUnified,
  getTemplateLogs,
  deleteTemplateLog,
  clearTemplateLogs,
} from "../controllers/templateController.js";
import {
  getPrebuiltTemplates,
  getPrebuiltCategories,
  getPrebuiltTemplateById,
  clonePrebuiltTemplate,
  seedPrebuiltCatalog,
} from "../controllers/prebuiltTemplateController.js";

const router = express.Router();

router.use(authMiddleware);

router.get("/", getTemplates);
router.post("/upload-media", upload.single("file"), uploadTemplateMedia);
router.post("/send", sendTemplateUnified);

// Prebuilt Template Library (Declared before /:id)
router.get("/library", getPrebuiltTemplates);
router.get("/library/categories", getPrebuiltCategories);
router.post("/library/seed", seedPrebuiltCatalog);
router.get("/library/:id", getPrebuiltTemplateById);
router.post("/library/:id/clone", clonePrebuiltTemplate);

// Template Activity & Dispatch Logs (Declared before /:id)
router.get("/logs", getTemplateLogs);
router.delete("/logs/clear", clearTemplateLogs);
router.post("/logs/clear", clearTemplateLogs);
router.delete("/logs/:id", deleteTemplateLog);
router.delete("/logs", clearTemplateLogs);

router.get("/:id", getTemplateById);
router.post("/", createTemplate);
router.put("/:id", updateTemplate);
router.delete("/:id", deleteTemplate);
router.post("/:id/test-send", testSendTemplate);
router.post("/:id/send", sendTemplateUnified);

export default router;
