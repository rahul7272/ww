import prebuiltTemplateService from "../services/prebuiltTemplateService.js";

/**
 * GET /api/templates/library
 * Query params: industry, category, format, language, search, page, limit
 */
export async function getPrebuiltTemplates(req, res) {
  try {
    const { industry, category, format, language, search, page, limit } = req.query;
    const result = await prebuiltTemplateService.getLibraryTemplates({
      industry,
      category,
      format,
      language,
      search,
      page,
      limit,
    });
    res.json(result);
  } catch (err) {
    console.error("[PrebuiltTemplateController] getPrebuiltTemplates error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/templates/library/categories
 * Returns sidebar industries and counts
 */
export async function getPrebuiltCategories(req, res) {
  try {
    const result = await prebuiltTemplateService.getLibraryCategories();
    res.json(result);
  } catch (err) {
    console.error("[PrebuiltTemplateController] getPrebuiltCategories error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * GET /api/templates/library/:id
 * Returns single prebuilt template by ID or slug
 */
export async function getPrebuiltTemplateById(req, res) {
  try {
    const template = await prebuiltTemplateService.getTemplateBySlugOrId(req.params.id);
    if (!template) {
      return res.status(404).json({ success: false, error: "Prebuilt template not found" });
    }
    res.json({ success: true, data: template });
  } catch (err) {
    console.error("[PrebuiltTemplateController] getPrebuiltTemplateById error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/templates/library/:id/clone
 * Clones template into authenticated user's WhatsAppTemplate collection
 * Body: { language: 'en' | 'hi' | 'gu', name?: string }
 */
export async function clonePrebuiltTemplate(req, res) {
  try {
    const { language = "en", name, customVariables } = req.body;
    const cloned = await prebuiltTemplateService.cloneTemplateToUser(
      req.user._id,
      req.params.id,
      language,
      name,
      customVariables
    );
    res.status(201).json({
      success: true,
      message: "Template cloned successfully into your template collection",
      data: cloned,
    });
  } catch (err) {
    console.error("[PrebuiltTemplateController] clonePrebuiltTemplate error:", err.message);
    res.status(400).json({ success: false, error: err.message });
  }
}

/**
 * POST /api/templates/library/seed
 * (Admin or bootstrap endpoint to re-sync catalog)
 */
export async function seedPrebuiltCatalog(req, res) {
  try {
    const result = await prebuiltTemplateService.seedPrebuiltTemplates();
    res.json(result);
  } catch (err) {
    console.error("[PrebuiltTemplateController] seedPrebuiltCatalog error:", err.message);
    res.status(500).json({ success: false, error: err.message });
  }
}
