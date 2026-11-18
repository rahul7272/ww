import mongoose from "mongoose";
import PrebuiltTemplate from "../models/PrebuiltTemplate.js";
import WhatsAppTemplate from "../models/WhatsAppTemplate.js";
import TemplateLog from "../models/TemplateLog.js";
import { PREBUILT_TEMPLATES } from "../data/prebuiltTemplates.js";

// Canonical ordered list of industries with UI icons
const ORDERED_INDUSTRIES = [
  { id: "Ecommerce", label: "Ecommerce", icon: "ShoppingBag" },
  { id: "Salon & spa", label: "Salon & spa", icon: "Scissors" },
  { id: "Clinic & healthcare", label: "Clinic & healthcare", icon: "Heart" },
  { id: "Education", label: "Education", icon: "GraduationCap" },
  { id: "Real estate", label: "Real estate", icon: "Home" },
  { id: "Restaurant", label: "Restaurant", icon: "Utensils" },
  { id: "Travel", label: "Travel", icon: "Plane" },
  { id: "Finance", label: "Finance", icon: "Landmark" },
  { id: "Events", label: "Events", icon: "Calendar" },
  { id: "Services", label: "Services", icon: "Briefcase" },
  { id: "General", label: "General", icon: "Layers" },
];

class PrebuiltTemplateService {
  /**
   * Seed / synchronize prebuilt templates catalog into MongoDB
   * Safe, idempotent bulk upsert by unique slug
   */
  async seedPrebuiltTemplates() {
    try {
      if (!PREBUILT_TEMPLATES || !PREBUILT_TEMPLATES.length) {
        console.warn("[PrebuiltTemplateService] No prebuilt templates found in data file.");
        return { success: false, count: 0 };
      }

      const operations = PREBUILT_TEMPLATES.map((tpl) => ({
        updateOne: {
          filter: { slug: tpl.slug },
          update: { $set: tpl },
          upsert: true,
        },
      }));

      const result = await PrebuiltTemplate.bulkWrite(operations, { ordered: false });
      const totalInDb = await PrebuiltTemplate.countDocuments();

      console.log(
        `[PrebuiltTemplateService] Seeded catalog: ${result.upsertedCount} inserted, ${result.modifiedCount} updated. Total in DB: ${totalInDb}`
      );

      return {
        success: true,
        upserted: result.upsertedCount,
        modified: result.modifiedCount,
        total: totalInDb,
      };
    } catch (err) {
      console.error("[PrebuiltTemplateService] Seeding failed:", err.message);
      return { success: false, error: err.message };
    }
  }

  /**
   * Get category / industry sidebar breakdown with real template counts
   */
  async getLibraryCategories() {
    try {
      const counts = await PrebuiltTemplate.aggregate([
        { $group: { _id: "$industry", count: { $sum: 1 } } },
      ]);

      const countMap = {};
      let totalAll = 0;
      counts.forEach((c) => {
        countMap[c._id] = c.count;
        totalAll += c.count;
      });

      const categories = [
        {
          id: "All",
          label: "All templates",
          count: totalAll,
          icon: "BookOpen",
        },
        ...ORDERED_INDUSTRIES.map((ind) => ({
          id: ind.id,
          label: ind.label,
          count: countMap[ind.id] || 0,
          icon: ind.icon,
        })),
      ];

      return {
        success: true,
        totalAll,
        categories,
      };
    } catch (err) {
      console.error("[PrebuiltTemplateService] getLibraryCategories error:", err.message);
      throw err;
    }
  }

  /**
   * Get filtered library templates
   * Supports: industry, category (UTILITY, MARKETING, AUTHENTICATION), format, language, search, pagination
   */
  async getLibraryTemplates({
    industry,
    category,
    format,
    language = "en",
    search,
    page = 1,
    limit = 50,
  } = {}) {
    try {
      const filter = {};

      // Industry filter
      if (industry && industry !== "All" && industry !== "All templates") {
        filter.industry = industry;
      }

      // Meta Category filter: UTILITY, MARKETING, AUTHENTICATION
      if (category && category !== "All" && category !== "ALL") {
        filter.category = category.toUpperCase();
      }

      // Format filter: TEXT, BUTTONS_TEXT, MEDIA_BUTTONS, CAROUSEL
      if (format && format !== "Any format" && format !== "ALL") {
        const normalizedFormat = format.toUpperCase().replace(/\s+/g, "_").replace(/·/g, "_");
        if (["TEXT", "BUTTONS_TEXT", "MEDIA_BUTTONS", "CAROUSEL"].includes(normalizedFormat)) {
          filter.format = normalizedFormat;
        } else if (normalizedFormat.includes("BUTTON") && normalizedFormat.includes("TEXT")) {
          filter.format = "BUTTONS_TEXT";
        } else if (normalizedFormat.includes("MEDIA")) {
          filter.format = "MEDIA_BUTTONS";
        } else if (normalizedFormat.includes("CAROUSEL")) {
          filter.format = "CAROUSEL";
        } else if (normalizedFormat === "TEXT") {
          filter.format = "TEXT";
        }
      }

      // Search across title, description, and body text
      if (search && search.trim()) {
        const searchRegex = new RegExp(search.trim(), "i");
        filter.$or = [
          { title: searchRegex },
          { description: searchRegex },
          { slug: searchRegex },
          { "localizations.body": searchRegex },
        ];
      }

      const pageNum = Math.max(1, parseInt(page, 10) || 1);
      const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
      const skip = (pageNum - 1) * limitNum;

      const [templates, total] = await Promise.all([
        PrebuiltTemplate.find(filter)
          .sort({ order: 1, _id: 1 })
          .skip(skip)
          .limit(limitNum)
          .lean(),
        PrebuiltTemplate.countDocuments(filter),
      ]);

      // Category breakdown for UI sidebar
      const categoriesSummary = await this.getLibraryCategories();

      return {
        success: true,
        data: templates,
        pagination: {
          total,
          page: pageNum,
          limit: limitNum,
          totalPages: Math.ceil(total / limitNum),
          hasMore: skip + templates.length < total,
        },
        categories: categoriesSummary.categories,
      };
    } catch (err) {
      console.error("[PrebuiltTemplateService] getLibraryTemplates error:", err.message);
      throw err;
    }
  }

  /**
   * Find template by ID or slug
   */
  async getTemplateBySlugOrId(idOrSlug) {
    try {
      let template = null;
      if (mongoose.Types.ObjectId.isValid(idOrSlug)) {
        template = await PrebuiltTemplate.findById(idOrSlug).lean();
      }
      if (!template) {
        template = await PrebuiltTemplate.findOne({ slug: idOrSlug.toLowerCase() }).lean();
      }
      return template;
    } catch (err) {
      console.error("[PrebuiltTemplateService] getTemplateBySlugOrId error:", err.message);
      throw err;
    }
  }

  /**
   * Clone a prebuilt library template into the user's personal WhatsAppTemplate collection
   */
  async cloneTemplateToUser(userId, idOrSlug, targetLang = "en", customName = null, customVariables = null) {
    try {
      const prebuilt = await this.getTemplateBySlugOrId(idOrSlug);
      if (!prebuilt) {
        throw new Error("Prebuilt template not found");
      }

      // Pick chosen localized version, fallback to default or first localization
      let localized = prebuilt.localizations.find((l) => l.language === targetLang);
      if (!localized) {
        localized =
          prebuilt.localizations.find((l) => l.language === prebuilt.defaultLanguage) ||
          prebuilt.localizations[0];
      }

      if (!localized) {
        throw new Error("No localization available for this template");
      }

      // Format clean template slug/name for Meta WhatsApp API compliance
      const baseSlug = (customName || prebuilt.slug)
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, "_")
        .slice(0, 40);
      let finalName = `${baseSlug}_${Math.floor(1000 + Math.random() * 9000)}`;

      // Ensure unique name for user
      let collision = await WhatsAppTemplate.findOne({ userId, name: finalName });
      let counter = 1;
      while (collision) {
        finalName = `${baseSlug}_${counter}_${Math.floor(100 + Math.random() * 900)}`;
        collision = await WhatsAppTemplate.findOne({ userId, name: finalName });
        counter++;
      }

      // Map language code
      const langMapping = {
        en: "en_US",
        hi: "hi",
        gu: "gu",
      };
      const waLanguage = langMapping[localized.language] || localized.language || "en_US";

      // Create user's personal template
      const newTemplate = await WhatsAppTemplate.create({
        userId,
        name: finalName,
        displayName: prebuilt.title,
        category: prebuilt.category,
        language: waLanguage,
        messageType: prebuilt.format === "CAROUSEL" ? "CAROUSEL" : "STANDARD",
        header: localized.header || { format: "NONE" },
        body: localized.body,
        exampleValues: customVariables && Object.keys(customVariables).length > 0 ? customVariables : (localized.sampleValues || {}),
        footer: localized.footer || "",
        buttons: localized.buttons || [],
        status: "ACTIVE",
        clonedFrom: prebuilt.slug,
      });

      // Log the clone action
      try {
        await TemplateLog.create({
          userId,
          templateId: newTemplate._id,
          templateName: newTemplate.name,
          displayName: newTemplate.displayName,
          category: newTemplate.category,
          action: "CREATED",
          status: "SUCCESS",
          variables: newTemplate.exampleValues || {},
        });
      } catch (logErr) {
        console.warn("[cloneTemplateToUser] Log note:", logErr.message);
      }

      return newTemplate;
    } catch (err) {
      console.error("[PrebuiltTemplateService] cloneTemplateToUser error:", err.message);
      throw err;
    }
  }
}

export default new PrebuiltTemplateService();
