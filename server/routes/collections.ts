import { Router } from "express";
import { isAuthenticated } from "../replitAuth";
import { storage } from "../storage";
import { insertCollectionSchema } from "@shared/schema";
import { z } from "zod";

const router = Router();

router.get("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const items = await storage.getUserCollections(userId);
    res.json({ collections: items });
  } catch (error) {
    console.error("Fetch collections error:", error);
    res.status(500).json({ error: "Failed to fetch collections" });
  }
});

router.post("/", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user.claims.sub;
    const validated = insertCollectionSchema.parse({ ...req.body, userId });
    const collection = await storage.addToCollection(validated);
    res.json({ collection });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("Add collection error:", error);
    res.status(500).json({ error: "Failed to add to collection" });
  }
});

router.get("/place/promo", async (req, res) => {
  try {
    const { placeId, placeName, district, city } = req.query;
    
    let merchantLink = null;
    
    if (placeId && typeof placeId === 'string') {
      merchantLink = await storage.getPlaceLinkByGooglePlaceId(placeId);
    }
    
    if (!merchantLink && placeName && district && city) {
      merchantLink = await storage.getPlaceLinkByPlace(
        placeName as string,
        district as string,
        city as string
      );
    }
    
    if (!merchantLink || !merchantLink.isPromoActive) {
      return res.json({ promo: null });
    }
    
    res.json({
      promo: {
        title: merchantLink.promoTitle,
        description: merchantLink.promoDescription,
        imageUrl: merchantLink.promoImageUrl
      }
    });
  } catch (error) {
    console.error("Get place promo error:", error);
    res.status(500).json({ error: "Failed to get place promo" });
  }
});

export default router;
