import { Router } from "express";
import { db } from "../../db";
import { systemConfigs, countries, regions, districts, announcements, type SystemConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { configService } from "../../services/configService";
import { hasAdminAccess } from "./shared";

const MIGRATION_KEY = process.env.ADMIN_MIGRATION_KEY || "mibu2024migrate";

const router = Router();

router.get("/configs", async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const configs = await configService.getAll();
    
    const grouped: Record<string, SystemConfig[]> = {};
    for (const config of configs) {
      if (!grouped[config.category]) {
        grouped[config.category] = [];
      }
      grouped[config.category].push(config);
    }
    
    res.json({ configs: grouped });
  } catch (error) {
    console.error("Error fetching configs:", error);
    res.status(500).json({ error: "Failed to fetch configs" });
  }
});

router.get("/configs/:category", async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { category } = req.params;
    const configs = await configService.getByCategory(category);
    res.json({ configs });
  } catch (error) {
    console.error("Error fetching configs by category:", error);
    res.status(500).json({ error: "Failed to fetch configs" });
  }
});

router.patch("/configs/:category/:key", async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { category, key } = req.params;
    const { value } = req.body;
    const userId = req.user?.id;

    const config = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });

    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }

    if (config.isReadOnly) {
      return res.status(403).json({ error: "This config is read-only" });
    }

    if (config.validation) {
      const validation = config.validation as { min?: number; max?: number };
      if (typeof value === 'number') {
        if (validation.min !== undefined && value < validation.min) {
          return res.status(400).json({ error: `Value must be at least ${validation.min}` });
        }
        if (validation.max !== undefined && value > validation.max) {
          return res.status(400).json({ error: `Value must be at most ${validation.max}` });
        }
      }
    }

    await configService.set(category, key, value, userId);
    
    const updated = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });

    res.json({ config: updated });
  } catch (error) {
    console.error("Error updating config:", error);
    res.status(500).json({ error: "Failed to update config" });
  }
});

router.post("/configs/:category/:key/reset", async (req: any, res) => {
  try {
    if (!(await hasAdminAccess(req))) {
      return res.status(403).json({ error: "Admin access required" });
    }
    
    const { category, key } = req.params;
    const userId = req.user?.id;

    const config = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });

    if (!config) {
      return res.status(404).json({ error: "Config not found" });
    }

    if (config.defaultValue === null) {
      return res.status(400).json({ error: "No default value available" });
    }

    await configService.set(category, key, config.defaultValue, userId);

    const updated = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });

    res.json({ config: updated });
  } catch (error) {
    console.error("Error resetting config:", error);
    res.status(500).json({ error: "Failed to reset config" });
  }
});

// 匯出配置資料 (countries, districts, system_configs, announcements)
router.get("/export-config-data", async (req: any, res) => {
  try {
    const { key } = req.query;
    
    if (key !== MIGRATION_KEY) {
      return res.status(403).json({ error: "Invalid migration key" });
    }
    
    const [countriesData, regionsData, districtsData, configsData, announcementsData] = await Promise.all([
      db.select().from(countries),
      db.select().from(regions),
      db.select().from(districts),
      db.select().from(systemConfigs),
      db.select().from(announcements),
    ]);
    
    console.log(`[Export] countries: ${countriesData.length}, regions: ${regionsData.length}, districts: ${districtsData.length}, configs: ${configsData.length}, announcements: ${announcementsData.length}`);
    
    res.json({
      exportedAt: new Date().toISOString(),
      data: {
        countries: countriesData,
        regions: regionsData,
        districts: districtsData,
        systemConfigs: configsData,
        announcements: announcementsData,
      },
      counts: {
        countries: countriesData.length,
        regions: regionsData.length,
        districts: districtsData.length,
        systemConfigs: configsData.length,
        announcements: announcementsData.length,
      }
    });
  } catch (error) {
    console.error("Error exporting config data:", error);
    res.status(500).json({ error: "Failed to export config data" });
  }
});

// 匯入配置資料
router.post("/import-config-data", async (req: any, res) => {
  try {
    const { key, data } = req.body;
    
    if (key !== MIGRATION_KEY) {
      return res.status(403).json({ error: "Invalid migration key" });
    }
    
    if (!data) {
      return res.status(400).json({ error: "Missing data" });
    }
    
    const results = {
      countries: { inserted: 0, skipped: 0 },
      regions: { inserted: 0, skipped: 0 },
      districts: { inserted: 0, skipped: 0 },
      systemConfigs: { inserted: 0, skipped: 0 },
      announcements: { inserted: 0, skipped: 0 },
    };
    
    // Import countries
    if (data.countries?.length > 0) {
      for (const country of data.countries) {
        try {
          await db.insert(countries).values({
            code: country.code,
            nameEn: country.nameEn,
            nameZh: country.nameZh,
            nameJa: country.nameJa,
            nameKo: country.nameKo,
            isActive: country.isActive ?? true,
          }).onConflictDoNothing();
          results.countries.inserted++;
        } catch (e) {
          results.countries.skipped++;
        }
      }
    }
    
    // Import regions (must be before districts due to foreign key)
    if (data.regions?.length > 0) {
      for (const region of data.regions) {
        try {
          await db.insert(regions).values({
            countryId: region.countryId,
            code: region.code,
            nameEn: region.nameEn,
            nameZh: region.nameZh,
            nameJa: region.nameJa,
            nameKo: region.nameKo,
            isActive: region.isActive ?? true,
          }).onConflictDoNothing();
          results.regions.inserted++;
        } catch (e) {
          results.regions.skipped++;
        }
      }
    }
    
    // Import districts
    if (data.districts?.length > 0) {
      for (const district of data.districts) {
        try {
          await db.insert(districts).values({
            regionId: district.regionId,
            code: district.code,
            nameEn: district.nameEn,
            nameZh: district.nameZh,
            nameJa: district.nameJa,
            nameKo: district.nameKo,
            isActive: district.isActive ?? true,
          }).onConflictDoNothing();
          results.districts.inserted++;
        } catch (e) {
          results.districts.skipped++;
        }
      }
    }
    
    // Import system configs
    if (data.systemConfigs?.length > 0) {
      for (const config of data.systemConfigs) {
        try {
          await db.insert(systemConfigs).values({
            category: config.category,
            key: config.key,
            value: config.value,
            valueType: config.valueType,
            defaultValue: config.defaultValue,
            label: config.label,
            description: config.description,
            uiType: config.uiType,
            uiOptions: config.uiOptions,
            validation: config.validation,
            editableBy: config.editableBy,
            isReadOnly: config.isReadOnly ?? false,
          }).onConflictDoNothing();
          results.systemConfigs.inserted++;
        } catch (e) {
          results.systemConfigs.skipped++;
        }
      }
    }
    
    // Import announcements
    if (data.announcements?.length > 0) {
      for (const announcement of data.announcements) {
        try {
          await db.insert(announcements).values({
            type: announcement.type ?? 'announcement',
            title: announcement.title,
            content: announcement.content,
            imageUrl: announcement.imageUrl,
            linkUrl: announcement.linkUrl,
            startDate: announcement.startDate ? new Date(announcement.startDate) : new Date(),
            endDate: announcement.endDate ? new Date(announcement.endDate) : null,
            isActive: announcement.isActive ?? true,
            priority: announcement.priority ?? 0,
            createdBy: announcement.createdBy,
          }).onConflictDoNothing();
          results.announcements.inserted++;
        } catch (e) {
          results.announcements.skipped++;
        }
      }
    }
    
    console.log(`[Import] Results:`, results);
    
    res.json({
      success: true,
      results,
    });
  } catch (error) {
    console.error("Error importing config data:", error);
    res.status(500).json({ error: "Failed to import config data" });
  }
});

export default router;
