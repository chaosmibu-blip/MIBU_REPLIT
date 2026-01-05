import { Router } from "express";
import { db } from "../../db";
import { systemConfigs, type SystemConfig } from "@shared/schema";
import { eq, and } from "drizzle-orm";
import { configService } from "../../services/configService";
import { hasAdminAccess } from "./shared";

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

export default router;
