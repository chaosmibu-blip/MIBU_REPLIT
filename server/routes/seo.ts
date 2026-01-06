import { Router, Request, Response } from "express";
import { db } from "../db";
import { places } from "@shared/schema";
import { eq, sql, desc, ilike, and } from "drizzle-orm";

const router = Router();

function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/[^\u4e00-\u9fa5a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

router.get("/cities", async (req: Request, res: Response) => {
  try {
    const { country } = req.query;
    
    const conditions = [eq(places.isActive, true)];
    if (country) {
      conditions.push(eq(places.country, country as string));
    }

    const citiesData = await db
      .select({
        city: places.city,
        country: places.country,
        count: sql<number>`count(*)::int`,
        sampleImage: sql<string>`min(${places.photoReference})`,
      })
      .from(places)
      .where(and(...conditions))
      .groupBy(places.city, places.country)
      .orderBy(desc(sql`count(*)`));

    const cities = citiesData.map((city) => ({
      name: city.city,
      slug: generateSlug(city.city),
      country: city.country,
      placeCount: city.count,
      imageUrl: city.sampleImage || null,
    }));

    res.json({ 
      cities,
      total: cities.length,
      message: cities.length === 0 ? '目前還沒有城市資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching SEO cities:", error);
    res.status(500).json({ error: "Failed to fetch cities" });
  }
});

router.get("/cities/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { page = '1', limit = '20' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    const [matchedCity] = await db
      .select({
        city: places.city,
        country: places.country,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        sql`lower(replace(replace(${places.city}, ' ', '-'), '''', '')) = ${slug}`
      ))
      .groupBy(places.city, places.country)
      .limit(1);

    if (!matchedCity) {
      return res.status(404).json({ 
        error: "City not found",
        message: "找不到該城市",
      });
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city)
      ));

    const cityPlaces = await db
      .select({
        id: places.id,
        name: places.placeName,
        nameI18n: places.placeNameI18n,
        district: places.district,
        address: places.address,
        category: places.category,
        subcategory: places.subcategory,
        rating: places.rating,
        photoReference: places.photoReference,
        description: places.description,
        googlePlaceId: places.googlePlaceId,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city)
      ))
      .orderBy(desc(places.rating))
      .limit(limitNum)
      .offset(offset);

    const placesWithSlug = cityPlaces.map((place) => ({
      ...place,
      slug: generateSlug(place.name),
      imageUrl: place.photoReference || null,
    }));

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      city: {
        name: matchedCity.city,
        slug: slug,
        country: matchedCity.country,
        placeCount: total,
      },
      places: placesWithSlug,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      message: placesWithSlug.length === 0 ? '該城市目前還沒有景點資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching city details:", error);
    res.status(500).json({ error: "Failed to fetch city details" });
  }
});

router.get("/places/by-id/:id", async (req: Request, res: Response) => {
  try {
    const placeId = parseInt(req.params.id);
    
    if (isNaN(placeId)) {
      return res.status(400).json({ 
        error: "Invalid place ID",
        message: "無效的景點 ID",
      });
    }

    const [matchedPlace] = await db
      .select()
      .from(places)
      .where(and(
        eq(places.id, placeId),
        eq(places.isActive, true)
      ))
      .limit(1);
    
    if (!matchedPlace) {
      return res.status(404).json({ 
        error: "Place not found",
        message: "找不到該景點",
      });
    }

    const relatedPlaces = await db
      .select({
        id: places.id,
        name: places.placeName,
        district: places.district,
        category: places.category,
        rating: places.rating,
        photoReference: places.photoReference,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedPlace.city),
        eq(places.category, matchedPlace.category)
      ))
      .limit(6);

    const relatedWithSlug = relatedPlaces
      .filter(p => p.id !== matchedPlace.id)
      .slice(0, 5)
      .map(p => ({
        ...p,
        slug: generateSlug(p.name),
        imageUrl: p.photoReference || null,
      }));

    res.json({
      place: {
        id: matchedPlace.id,
        name: matchedPlace.placeName,
        nameI18n: matchedPlace.placeNameI18n,
        slug: generateSlug(matchedPlace.placeName),
        country: matchedPlace.country,
        city: matchedPlace.city,
        district: matchedPlace.district,
        address: matchedPlace.address,
        addressI18n: matchedPlace.addressI18n,
        category: matchedPlace.category,
        subcategory: matchedPlace.subcategory,
        description: matchedPlace.description,
        descriptionI18n: matchedPlace.descriptionI18n,
        rating: matchedPlace.rating,
        imageUrl: matchedPlace.photoReference || null,
        openingHours: matchedPlace.openingHours,
        location: matchedPlace.locationLat && matchedPlace.locationLng ? {
          lat: matchedPlace.locationLat,
          lng: matchedPlace.locationLng,
        } : null,
        googlePlaceId: matchedPlace.googlePlaceId,
        googleMapUrl: matchedPlace.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${matchedPlace.googlePlaceId}` : null,
      },
      relatedPlaces: relatedWithSlug,
    });
  } catch (error) {
    console.error("Error fetching place by ID:", error);
    res.status(500).json({ error: "Failed to fetch place details" });
  }
});

router.get("/places/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { city } = req.query;

    if (!city) {
      return res.status(400).json({ 
        error: "City parameter required",
        message: "請提供城市參數",
      });
    }

    const matchedPlaces = await db
      .select()
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, city as string)
      ))
      .limit(500);

    const matchedPlace = matchedPlaces.find(p => generateSlug(p.placeName) === slug);
    
    if (!matchedPlace) {
      return res.status(404).json({ 
        error: "Place not found",
        message: "找不到該景點",
      });
    }

    const relatedPlaces = await db
      .select({
        id: places.id,
        name: places.placeName,
        district: places.district,
        category: places.category,
        rating: places.rating,
        photoReference: places.photoReference,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedPlace.city),
        eq(places.category, matchedPlace.category)
      ))
      .limit(6);

    const relatedWithSlug = relatedPlaces
      .filter(p => p.id !== matchedPlace.id)
      .slice(0, 5)
      .map(p => ({
        ...p,
        slug: generateSlug(p.name),
        imageUrl: p.photoReference || null,
      }));

    res.json({
      place: {
        id: matchedPlace.id,
        name: matchedPlace.placeName,
        nameI18n: matchedPlace.placeNameI18n,
        slug: slug,
        country: matchedPlace.country,
        city: matchedPlace.city,
        district: matchedPlace.district,
        address: matchedPlace.address,
        addressI18n: matchedPlace.addressI18n,
        category: matchedPlace.category,
        subcategory: matchedPlace.subcategory,
        description: matchedPlace.description,
        descriptionI18n: matchedPlace.descriptionI18n,
        rating: matchedPlace.rating,
        imageUrl: matchedPlace.photoReference || null,
        openingHours: matchedPlace.openingHours,
        location: matchedPlace.locationLat && matchedPlace.locationLng ? {
          lat: matchedPlace.locationLat,
          lng: matchedPlace.locationLng,
        } : null,
        googlePlaceId: matchedPlace.googlePlaceId,
        googleMapUrl: matchedPlace.googlePlaceId ? `https://www.google.com/maps/place/?q=place_id:${matchedPlace.googlePlaceId}` : null,
      },
      relatedPlaces: relatedWithSlug,
    });
  } catch (error) {
    console.error("Error fetching place details:", error);
    res.status(500).json({ error: "Failed to fetch place details" });
  }
});

router.get("/places", async (req: Request, res: Response) => {
  try {
    const { city, category, q, page = '1', limit = '20' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    let conditions = [eq(places.isActive, true)];
    
    if (city) {
      conditions.push(eq(places.city, city as string));
    }
    if (category) {
      conditions.push(eq(places.category, category as string));
    }
    if (q) {
      conditions.push(ilike(places.placeName, `%${q}%`));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(places)
      .where(and(...conditions));

    const placesList = await db
      .select({
        id: places.id,
        name: places.placeName,
        nameI18n: places.placeNameI18n,
        country: places.country,
        city: places.city,
        district: places.district,
        category: places.category,
        subcategory: places.subcategory,
        rating: places.rating,
        photoReference: places.photoReference,
        description: places.description,
      })
      .from(places)
      .where(and(...conditions))
      .orderBy(desc(places.rating))
      .limit(limitNum)
      .offset(offset);

    const placesWithSlug = placesList.map((place) => ({
      ...place,
      slug: generateSlug(place.name),
      imageUrl: place.photoReference || null,
    }));

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      places: placesWithSlug,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      message: placesWithSlug.length === 0 ? '目前還沒有景點資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching places:", error);
    res.status(500).json({ error: "Failed to fetch places" });
  }
});

export default router;
