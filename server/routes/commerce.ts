import { Router } from "express";
import { storage } from "../storage";

const router = Router();

router.get("/places/names", async (req, res) => {
  try {
    const names = await storage.getPlaceNamesWithProducts();
    res.json({ names });
  } catch (error) {
    console.error("Get place names error:", error);
    res.status(500).json({ error: "Failed to get place names" });
  }
});

router.get("/places/search", async (req, res) => {
  try {
    const query = req.query.q as string;
    if (!query || query.length < 2) {
      return res.json([]);
    }
    const places = await storage.searchPlacesByName(query);
    res.json(places);
  } catch (error) {
    console.error("Place search error:", error);
    res.status(500).json({ error: "Failed to search places" });
  }
});

router.get("/products/place/:placeId", async (req, res) => {
  try {
    const placeId = parseInt(req.params.placeId);
    const products = await storage.getProductsByPlaceId(placeId);
    res.json(products);
  } catch (error) {
    console.error("Get products error:", error);
    res.status(500).json({ error: "Failed to get products" });
  }
});

router.get("/products/by-name", async (req, res) => {
  try {
    const placeName = req.query.name as string;
    if (!placeName) {
      return res.json({ products: [] });
    }
    const products = await storage.getProductsByPlaceName(placeName);
    res.json({ products });
  } catch (error) {
    console.error("Get products by name error:", error);
    res.status(500).json({ error: "Failed to get products" });
  }
});

export default router;
