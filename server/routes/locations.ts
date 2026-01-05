import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/countries", async (req, res) => {
  try {
    const countriesList = await storage.getCountries();
    res.json({ countries: countriesList });
  } catch (error) {
    console.error("Error fetching countries:", error);
    res.status(500).json({ error: "Failed to fetch countries" });
  }
});

router.get("/regions/:countryId", async (req, res) => {
  try {
    const countryId = parseInt(req.params.countryId);
    const regionsList = await storage.getRegionsByCountry(countryId);
    res.json({ regions: regionsList });
  } catch (error) {
    console.error("Error fetching regions:", error);
    res.status(500).json({ error: "Failed to fetch regions" });
  }
});

router.get("/districts/:regionId", async (req, res) => {
  try {
    const regionId = parseInt(req.params.regionId);
    const districtsList = await storage.getDistrictsByRegion(regionId);
    res.json({ districts: districtsList });
  } catch (error) {
    console.error("Error fetching districts:", error);
    res.status(500).json({ error: "Failed to fetch districts" });
  }
});

router.get("/districts/country/:countryId", async (req, res) => {
  try {
    const countryId = parseInt(req.params.countryId);
    const districtsList = await storage.getDistrictsByCountry(countryId);
    res.json({ districts: districtsList, count: districtsList.length });
  } catch (error) {
    console.error("Error fetching districts by country:", error);
    res.status(500).json({ error: "Failed to fetch districts" });
  }
});

router.get("/categories", async (req, res) => {
  try {
    const categoriesList = await storage.getCategories();
    res.json({ categories: categoriesList });
  } catch (error) {
    console.error("Error fetching categories:", error);
    res.status(500).json({ error: "Failed to fetch categories" });
  }
});

router.get("/categories/:categoryId/subcategories", async (req, res) => {
  try {
    const categoryId = parseInt(req.params.categoryId);
    const subcategoriesList = await storage.getSubcategoriesByCategory(categoryId);
    res.json({ subcategories: subcategoriesList });
  } catch (error) {
    console.error("Error fetching subcategories:", error);
    res.status(500).json({ error: "Failed to fetch subcategories" });
  }
});

export default router;
