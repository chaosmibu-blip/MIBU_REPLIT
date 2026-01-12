import { Router, Request, Response } from "express";
import { db } from "../db";
import { places, gachaAiLogs } from "@shared/schema";
import { eq, sql, desc, ilike, and } from "drizzle-orm";
import { ErrorCode, createErrorResponse } from "@shared/errors";

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

    // 取得每個城市的行程數量
    const tripCounts = await db
      .select({
        city: gachaAiLogs.city,
        count: sql<number>`count(*)::int`,
      })
      .from(gachaAiLogs)
      .where(eq(gachaAiLogs.isPublished, true))
      .groupBy(gachaAiLogs.city);

    const tripCountMap = new Map(tripCounts.map(t => [t.city, t.count]));

    const cities = citiesData.map((city) => ({
      name: city.city,
      slug: generateSlug(city.city),
      country: city.country,
      placeCount: city.count,
      tripCount: tripCountMap.get(city.city) || 0,
      imageUrl: city.sampleImage || null,
    }));

    res.json({
      cities,
      total: cities.length,
      message: cities.length === 0 ? '目前還沒有城市資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching SEO cities:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得城市列表'));
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
      return res.status(404).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '找不到該城市'));
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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得城市詳情'));
  }
});

// 相關城市 API（同國家的其他城市）
router.get("/cities/:slug/related", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { limit = '6' } = req.query;
    const limitNum = Math.min(12, Math.max(1, parseInt(limit as string) || 6));

    // 先找到目標城市
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
      return res.status(404).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '找不到該城市'));
    }

    // 找同國家的其他城市
    const relatedCitiesData = await db
      .select({
        city: places.city,
        country: places.country,
        count: sql<number>`count(*)::int`,
        sampleImage: sql<string>`min(${places.photoReference})`,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.country, matchedCity.country),
        sql`${places.city} != ${matchedCity.city}`
      ))
      .groupBy(places.city, places.country)
      .orderBy(desc(sql`count(*)`))
      .limit(limitNum);

    const relatedCities = relatedCitiesData.map((city) => ({
      name: city.city,
      slug: generateSlug(city.city),
      country: city.country,
      placeCount: city.count,
      imageUrl: city.sampleImage || null,
    }));

    res.json({
      city: {
        name: matchedCity.city,
        slug: slug,
        country: matchedCity.country,
      },
      relatedCities,
      total: relatedCities.length,
    });
  } catch (error) {
    console.error("Error fetching related cities:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得相關城市'));
  }
});

router.get("/cities/:slug/districts", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;

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
      return res.status(404).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '找不到該城市'));
    }

    const districtsData = await db
      .select({
        district: places.district,
        count: sql<number>`count(*)::int`,
        sampleImage: sql<string>`min(${places.photoReference})`,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city),
        sql`${places.district} IS NOT NULL AND ${places.district} != ''`
      ))
      .groupBy(places.district)
      .orderBy(desc(sql`count(*)`));

    const districts = districtsData
      .filter((d) => d.district && d.district.trim() !== '')
      .map((d) => ({
        name: d.district,
        slug: generateSlug(d.district),
        placeCount: d.count,
        imageUrl: d.sampleImage || null,
      }));

    res.json({
      city: {
        name: matchedCity.city,
        slug: slug,
        country: matchedCity.country,
      },
      districts,
      total: districts.length,
      message: districts.length === 0 ? '該城市目前還沒有行政區資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching city districts:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得行政區列表'));
  }
});

router.get("/districts/:citySlug/:districtSlug", async (req: Request, res: Response) => {
  try {
    const { citySlug, districtSlug } = req.params;
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
        sql`lower(replace(replace(${places.city}, ' ', '-'), '''', '')) = ${citySlug}`
      ))
      .groupBy(places.city, places.country)
      .limit(1);

    if (!matchedCity) {
      return res.status(404).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '找不到該城市'));
    }

    const [matchedDistrict] = await db
      .select({
        district: places.district,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city),
        sql`${places.district} IS NOT NULL AND ${places.district} != ''`,
        sql`lower(replace(replace(${places.district}, ' ', '-'), '''', '')) = ${districtSlug}`
      ))
      .groupBy(places.district)
      .limit(1);

    if (!matchedDistrict) {
      return res.status(404).json(createErrorResponse(ErrorCode.NO_DISTRICT_FOUND, '找不到該行政區'));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city),
        eq(places.district, matchedDistrict.district)
      ));

    const districtPlaces = await db
      .select({
        id: places.id,
        name: places.placeName,
        category: places.category,
        subcategory: places.subcategory,
        rating: places.rating,
        photoReference: places.photoReference,
        description: places.description,
      })
      .from(places)
      .where(and(
        eq(places.isActive, true),
        eq(places.city, matchedCity.city),
        eq(places.district, matchedDistrict.district)
      ))
      .orderBy(desc(places.rating))
      .limit(limitNum)
      .offset(offset);

    const placesWithSlug = districtPlaces.map((place) => ({
      ...place,
      slug: generateSlug(place.name),
      imageUrl: place.photoReference || null,
    }));

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      city: {
        name: matchedCity.city,
        slug: citySlug,
        country: matchedCity.country,
      },
      district: {
        name: matchedDistrict.district,
        slug: districtSlug,
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
      message: placesWithSlug.length === 0 ? '該行政區目前還沒有景點資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching district details:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得行政區詳情'));
  }
});

router.get("/places/by-id/:id", async (req: Request, res: Response) => {
  try {
    const placeId = parseInt(req.params.id);
    
    if (isNaN(placeId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的景點 ID'));
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
      return res.status(404).json(createErrorResponse(ErrorCode.PLACE_NOT_FOUND, '找不到該景點'));
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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得景點詳情'));
  }
});

router.get("/places/:slug", async (req: Request, res: Response) => {
  try {
    const { slug } = req.params;
    const { city } = req.query;

    if (!city) {
      return res.status(400).json(createErrorResponse(ErrorCode.CITY_REQUIRED, '請提供城市參數'));
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
      return res.status(404).json(createErrorResponse(ErrorCode.PLACE_NOT_FOUND, '找不到該景點'));
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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得景點詳情'));
  }
});

router.get("/trips", async (req: Request, res: Response) => {
  try {
    const { city, district, page = '1', limit = '20' } = req.query;
    
    const pageNum = Math.max(1, parseInt(page as string) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string) || 20));
    const offset = (pageNum - 1) * limitNum;

    let conditions = [eq(gachaAiLogs.isPublished, true)];
    
    if (city) {
      conditions.push(eq(gachaAiLogs.city, city as string));
    }
    if (district) {
      conditions.push(eq(gachaAiLogs.district, district as string));
    }

    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gachaAiLogs)
      .where(and(...conditions));

    const tripsList = await db
      .select({
        id: gachaAiLogs.id,
        sessionId: gachaAiLogs.sessionId,
        city: gachaAiLogs.city,
        district: gachaAiLogs.district,
        aiReason: gachaAiLogs.aiReason,
        tripImageUrl: gachaAiLogs.tripImageUrl,
        orderedPlaceIds: gachaAiLogs.orderedPlaceIds,
        categoryDistribution: gachaAiLogs.categoryDistribution,
        publishedAt: gachaAiLogs.publishedAt,
      })
      .from(gachaAiLogs)
      .where(and(...conditions))
      .orderBy(desc(gachaAiLogs.publishedAt))
      .limit(limitNum)
      .offset(offset);

    const tripsWithSequence = await Promise.all(tripsList.map(async (trip) => {
      const placeCount = Math.min(5, trip.orderedPlaceIds?.length || 0);
      
      const seqConditions = [
        eq(gachaAiLogs.isPublished, true),
        eq(gachaAiLogs.city, trip.city),
        sql`${gachaAiLogs.id} <= ${trip.id}`,
      ];
      if (trip.district) {
        seqConditions.push(eq(gachaAiLogs.district, trip.district));
      }
      const [seqResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(gachaAiLogs)
        .where(and(...seqConditions));
      const sequenceNum = seqResult?.count || 1;
      
      return {
        id: trip.id,
        sessionId: trip.sessionId,
        title: `${trip.city}${trip.district ? trip.district : ''} 一日遊 #${sequenceNum}`,
        city: trip.city,
        district: trip.district,
        description: trip.aiReason,
        imageUrl: trip.tripImageUrl,
        placeCount,
        categoryDistribution: trip.categoryDistribution,
        publishedAt: trip.publishedAt,
      };
    }));

    const trips = tripsWithSequence;

    const total = totalResult?.count || 0;
    const totalPages = Math.ceil(total / limitNum);

    res.json({
      trips,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      message: trips.length === 0 ? '目前還沒有行程資料' : undefined,
    });
  } catch (error) {
    console.error("Error fetching trips:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得行程列表'));
  }
});

router.get("/trips/:id", async (req: Request, res: Response) => {
  try {
    const tripId = parseInt(req.params.id);
    
    if (isNaN(tripId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的行程 ID'));
    }

    const [trip] = await db
      .select()
      .from(gachaAiLogs)
      .where(and(
        eq(gachaAiLogs.id, tripId),
        eq(gachaAiLogs.isPublished, true)
      ))
      .limit(1);
    
    if (!trip) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '找不到該行程'));
    }

    const sequenceConditions = [
      eq(gachaAiLogs.isPublished, true),
      eq(gachaAiLogs.city, trip.city),
      sql`${gachaAiLogs.id} <= ${tripId}`,
    ];
    if (trip.district) {
      sequenceConditions.push(eq(gachaAiLogs.district, trip.district));
    }
    const [seqResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(gachaAiLogs)
      .where(and(...sequenceConditions));
    const sequenceNum = seqResult?.count || 1;

    const first5PlaceIds = trip.orderedPlaceIds?.slice(0, 5) || [];
    
    const tripPlaces = first5PlaceIds.length > 0
      ? await db
          .select({
            id: places.id,
            name: places.placeName,
            district: places.district,
            category: places.category,
            subcategory: places.subcategory,
            address: places.address,
            description: places.description,
            rating: places.rating,
            photoReference: places.photoReference,
            locationLat: places.locationLat,
            locationLng: places.locationLng,
          })
          .from(places)
          .where(sql`${places.id} = ANY(${first5PlaceIds})`)
      : [];

    const orderedPlaces = first5PlaceIds
      .map(id => tripPlaces.find(p => p.id === id))
      .filter(Boolean)
      .map(p => ({
        id: p!.id,
        name: p!.name,
        slug: generateSlug(p!.name),
        district: p!.district,
        category: p!.category,
        subcategory: p!.subcategory,
        address: p!.address,
        description: p!.description,
        rating: p!.rating,
        imageUrl: p!.photoReference || null,
        location: p!.locationLat && p!.locationLng ? {
          lat: p!.locationLat,
          lng: p!.locationLng,
        } : null,
      }));

    res.json({
      trip: {
        id: trip.id,
        sessionId: trip.sessionId,
        title: `${trip.city}${trip.district ? trip.district : ''} 一日遊 #${sequenceNum}`,
        city: trip.city,
        district: trip.district,
        description: trip.aiReason,
        imageUrl: trip.tripImageUrl,
        placeCount: orderedPlaces.length,
        categoryDistribution: trip.categoryDistribution,
        publishedAt: trip.publishedAt,
      },
      places: orderedPlaces,
    });
  } catch (error) {
    console.error("Error fetching trip details:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得行程詳情'));
  }
});

// 相關行程 API（同城市/區域的其他行程）
router.get("/trips/:id/related", async (req: Request, res: Response) => {
  try {
    const tripId = parseInt(req.params.id);
    const { limit = '6' } = req.query;
    const limitNum = Math.min(12, Math.max(1, parseInt(limit as string) || 6));

    if (isNaN(tripId)) {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的行程 ID'));
    }

    // 取得目標行程
    const [trip] = await db
      .select({
        id: gachaAiLogs.id,
        city: gachaAiLogs.city,
        district: gachaAiLogs.district,
      })
      .from(gachaAiLogs)
      .where(and(
        eq(gachaAiLogs.id, tripId),
        eq(gachaAiLogs.isPublished, true)
      ))
      .limit(1);

    if (!trip) {
      return res.status(404).json(createErrorResponse(ErrorCode.RESOURCE_NOT_FOUND, '找不到該行程'));
    }

    // 找同城市（優先同區域）的其他行程
    const relatedTripsData = await db
      .select({
        id: gachaAiLogs.id,
        sessionId: gachaAiLogs.sessionId,
        city: gachaAiLogs.city,
        district: gachaAiLogs.district,
        aiReason: gachaAiLogs.aiReason,
        tripImageUrl: gachaAiLogs.tripImageUrl,
        orderedPlaceIds: gachaAiLogs.orderedPlaceIds,
        publishedAt: gachaAiLogs.publishedAt,
      })
      .from(gachaAiLogs)
      .where(and(
        eq(gachaAiLogs.isPublished, true),
        eq(gachaAiLogs.city, trip.city),
        sql`${gachaAiLogs.id} != ${tripId}`
      ))
      .orderBy(
        // 優先同區域
        sql`CASE WHEN ${gachaAiLogs.district} = ${trip.district} THEN 0 ELSE 1 END`,
        desc(gachaAiLogs.publishedAt)
      )
      .limit(limitNum);

    const relatedTrips = relatedTripsData.map((t) => ({
      id: t.id,
      title: `${t.city}${t.district ? t.district : ''} 一日遊`,
      city: t.city,
      district: t.district,
      description: t.aiReason,
      imageUrl: t.tripImageUrl,
      placeCount: t.orderedPlaceIds?.slice(0, 5).length || 0,
      publishedAt: t.publishedAt,
    }));

    res.json({
      trip: {
        id: trip.id,
        city: trip.city,
        district: trip.district,
      },
      relatedTrips,
      total: relatedTrips.length,
    });
  } catch (error) {
    console.error("Error fetching related trips:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得相關行程'));
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
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '無法取得景點列表'));
  }
});

export default router;
