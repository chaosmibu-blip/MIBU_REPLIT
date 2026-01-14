import { Router } from "express";
import { storage } from "../../storage";
import { db } from "../../db";
import { sql } from "drizzle-orm";
import { isAuthenticated } from "../../replitAuth";
import { insertPlaceDraftSchema, type PlaceDraft, type Subcategory } from "@shared/schema";
import { z } from "zod";
import {
  callGemini,
  batchGeneratePlaces,
  classifyAndDescribePlaces,
  reclassifyPlace
} from "../../lib/placeGenerator";
import {
  determineCategory,
  determineSubcategory,
  generateFallbackDescription
} from "../../lib/categoryMapping";
import { ErrorCode, createErrorResponse } from "@shared/errors";

const router = Router();

router.post("/place-drafts", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const validated = insertPlaceDraftSchema.parse({ ...req.body, source: 'ai' });
    const draft = await storage.createPlaceDraft(validated);

    res.json({ draft });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    console.error("Admin create place draft error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '建立景點草稿失敗'));
  }
});

router.get("/place-drafts", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const drafts = await storage.getAllPlaceDrafts();
    res.json({ drafts });
  } catch (error) {
    console.error("Admin get place drafts error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得景點草稿失敗'));
  }
});

router.post("/place-drafts/:id/publish", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const draftId = parseInt(req.params.id);
    const draft = await storage.getPlaceDraftById(draftId);
    if (!draft) return res.status(404).json(createErrorResponse(ErrorCode.DRAFT_NOT_FOUND));

    const districtInfo = await storage.getDistrictWithParents(draft.districtId);
    if (!districtInfo) return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '無效的區域'));

    const categories = await storage.getCategories();
    const category = categories.find(c => c.id === draft.categoryId);
    const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
    const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

    const newPlace = await storage.savePlaceToCache({
      placeName: draft.placeName,
      description: draft.description || '',
      category: category?.code || '',
      subCategory: subcategory?.nameZh || '',
      district: districtInfo.district.nameZh,
      city: districtInfo.region.nameZh,
      country: districtInfo.country.nameZh,
      placeId: draft.googlePlaceId || undefined,
      locationLat: draft.locationLat || undefined,
      locationLng: draft.locationLng || undefined,
      verifiedAddress: draft.address || undefined,
    });

    await storage.deletePlaceDraft(draftId);

    res.json({ placeCache: newPlace, published: true });
  } catch (error) {
    console.error("Admin publish place draft error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '發布景點草稿失敗'));
  }
});

router.delete("/place-drafts/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const draftId = parseInt(req.params.id);
    const draft = await storage.getPlaceDraftById(draftId);
    if (!draft) return res.status(404).json(createErrorResponse(ErrorCode.DRAFT_NOT_FOUND));

    const districtInfo = await storage.getDistrictWithParents(draft.districtId);
    if (districtInfo) {
      await storage.createPlaceFeedback({
        userId: userId,
        placeName: draft.placeName,
        district: districtInfo.district.nameZh,
        city: districtInfo.region.nameZh,
        penaltyScore: 100,
      });
    }

    await storage.deletePlaceDraft(draftId);
    res.json({ success: true, message: "Draft deleted and added to exclusion list" });
  } catch (error: any) {
    console.error("Error deleting draft:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '刪除草稿失敗'));
  }
});

router.patch("/place-drafts/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const draftId = parseInt(req.params.id);
    const draft = await storage.getPlaceDraftById(draftId);
    if (!draft) return res.status(404).json(createErrorResponse(ErrorCode.DRAFT_NOT_FOUND));

    const updateSchema = z.object({
      placeName: z.string().min(1).optional(),
      description: z.string().optional(),
    });

    const validated = updateSchema.parse(req.body);
    const updated = await storage.updatePlaceDraft(draftId, validated);
    res.json({ draft: updated });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    console.error("Admin update place draft error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '更新景點草稿失敗'));
  }
});

router.post("/place-drafts/:id/regenerate-description", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const draftId = parseInt(req.params.id);
    const draft = await storage.getPlaceDraftById(draftId);
    if (!draft) return res.status(404).json(createErrorResponse(ErrorCode.DRAFT_NOT_FOUND));

    const districtInfo = await storage.getDistrictWithParents(draft.districtId);
    const categories = await storage.getCategories();
    const category = categories.find(c => c.id === draft.categoryId);
    const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
    const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

    const prompt = `你是一位專業的旅遊作家。請為以下景點撰寫一段吸引觀光客的介紹文字（繁體中文，50-100字）：

景點名稱：${draft.placeName}
類別：${category?.nameZh || ''} / ${subcategory?.nameZh || ''}
地區：${districtInfo?.country?.nameZh || ''} ${districtInfo?.region?.nameZh || ''} ${districtInfo?.district?.nameZh || ''}
${draft.address ? `地址：${draft.address}` : ''}

請直接輸出介紹文字，不需要標題或其他格式。文字應該生動有趣，突出景點特色，吸引遊客前往。`;

    const newDescription = await callGemini(prompt);
    const cleanDescription = newDescription.trim();

    const updated = await storage.updatePlaceDraft(draftId, { description: cleanDescription });
    res.json({ draft: updated, description: cleanDescription });
  } catch (error) {
    console.error("Admin regenerate description error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '重新生成描述失敗'));
  }
});

router.get("/place-drafts/filter", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const minRating = req.query.minRating ? parseFloat(req.query.minRating) : undefined;
    const minReviewCount = req.query.minReviewCount ? parseInt(req.query.minReviewCount) : undefined;
    const status = req.query.status || 'pending';

    const drafts = await storage.getFilteredPlaceDrafts({ minRating, minReviewCount, status });

    res.json({
      drafts,
      filters: { minRating, minReviewCount, status },
      count: drafts.length
    });
  } catch (error) {
    console.error("Admin filter place drafts error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '篩選景點草稿失敗'));
  }
});

router.post("/place-drafts/batch-publish", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const batchPublishSchema = z.object({
      minRating: z.number().min(0).max(5).optional(),
      minReviewCount: z.number().min(0).optional(),
      ids: z.array(z.number()).optional(),
    });

    const validated = batchPublishSchema.parse(req.body);
    
    let draftsToPublish;
    if (validated.ids && validated.ids.length > 0) {
      const allDrafts = await storage.getFilteredPlaceDrafts({ status: 'pending' });
      draftsToPublish = allDrafts.filter(d => validated.ids!.includes(d.id));
    } else {
      draftsToPublish = await storage.getFilteredPlaceDrafts({
        minRating: validated.minRating,
        minReviewCount: validated.minReviewCount,
        status: 'pending'
      });
    }

    if (draftsToPublish.length === 0) {
      return res.json({ success: true, published: 0, message: "No drafts match the criteria" });
    }

    const categories = await storage.getCategories();
    const publishedIds: number[] = [];
    const errors: Array<{ id: number; placeName: string; error: string }> = [];

    for (const draft of draftsToPublish) {
      try {
        const districtInfo = await storage.getDistrictWithParents(draft.districtId);
        if (!districtInfo) {
          errors.push({ id: draft.id, placeName: draft.placeName, error: "Invalid district" });
          continue;
        }

        const category = categories.find(c => c.id === draft.categoryId);
        const subcategories = await storage.getSubcategoriesByCategory(draft.categoryId);
        const subcategory = subcategories.find(s => s.id === draft.subcategoryId);

        await storage.savePlaceToCache({
          placeName: draft.placeName,
          description: draft.description || '',
          category: category?.code || '',
          subCategory: subcategory?.nameZh || '',
          district: districtInfo.district.nameZh,
          city: districtInfo.region.nameZh,
          country: districtInfo.country.nameZh,
          placeId: draft.googlePlaceId || undefined,
          locationLat: draft.locationLat || undefined,
          locationLng: draft.locationLng || undefined,
          verifiedAddress: draft.address || undefined,
        });

        publishedIds.push(draft.id);
      } catch (e: any) {
        errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
      }
    }

    if (publishedIds.length > 0) {
      await storage.batchDeletePlaceDrafts(publishedIds);
    }

    res.json({
      success: true,
      published: publishedIds.length,
      failed: errors.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `Successfully published ${publishedIds.length} places`
    });
  } catch (error) {
    if (error instanceof z.ZodError) return res.status(400).json(createErrorResponse(ErrorCode.VALIDATION_ERROR, '輸入資料格式錯誤', error.errors));
    console.error("Admin batch publish error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '批次發布失敗'));
  }
});

router.post("/place-drafts/batch-regenerate", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const { ids, filter } = req.body as {
      ids?: number[];
      filter?: { minRating?: number; minReviewCount?: number };
    };

    let draftsToRegenerate: PlaceDraft[] = [];

    if (ids && ids.length > 0) {
      const allDrafts = await storage.getAllPlaceDrafts();
      draftsToRegenerate = allDrafts.filter(d => ids.includes(d.id) && d.status === 'pending');
    } else if (filter) {
      draftsToRegenerate = await storage.getFilteredPlaceDrafts({
        ...filter,
        status: 'pending'
      });
    } else {
      return res.status(400).json(createErrorResponse(ErrorCode.INVALID_PARAMS, '必須提供 ids 或 filter 參數'));
    }

    if (draftsToRegenerate.length === 0) {
      return res.json({ success: true, regenerated: 0, failed: 0, message: "沒有符合條件的草稿" });
    }

    const categories = await storage.getCategories();
    const allSubcategories: Map<number, Subcategory[]> = new Map();

    const regeneratedIds: number[] = [];
    const errors: { id: number; placeName: string; error: string }[] = [];

    for (const draft of draftsToRegenerate) {
      try {
        const districtInfo = await storage.getDistrictWithParents(draft.districtId);
        const category = categories.find(c => c.id === draft.categoryId);
        
        if (!allSubcategories.has(draft.categoryId)) {
          const subs = await storage.getSubcategoriesByCategory(draft.categoryId);
          allSubcategories.set(draft.categoryId, subs);
        }
        const subcategory = allSubcategories.get(draft.categoryId)?.find(s => s.id === draft.subcategoryId);

        const prompt = `你是一位資深的旅遊作家和行銷專家。請為以下景點撰寫一段精彩、生動、吸引人的介紹文字。

景點名稱：${draft.placeName}
類別：${category?.nameZh || ''} / ${subcategory?.nameZh || ''}
地區：${districtInfo?.country?.nameZh || ''} ${districtInfo?.region?.nameZh || ''} ${districtInfo?.district?.nameZh || ''}
${draft.address ? `地址：${draft.address}` : ''}
${draft.googleRating ? `Google評分：${draft.googleRating}星` : ''}

撰寫要求：
1. 字數：80-120字（繁體中文）
2. 風格：生動活潑，富有感染力
3. 內容：突出景點特色、獨特體驗、推薦理由
4. 語氣：像是當地人熱情推薦給好友的口吻
5. 避免：空洞的形容詞堆砌，要有具體的描述

請直接輸出介紹文字，不需要標題或其他格式。`;

        const newDescription = await callGemini(prompt);
        const cleanDescription = newDescription.trim();

        await storage.updatePlaceDraft(draft.id, { description: cleanDescription });
        regeneratedIds.push(draft.id);
        
        console.log(`[BatchRegenerate] Regenerated description for: ${draft.placeName}`);
      } catch (e: any) {
        console.error(`[BatchRegenerate] Failed for ${draft.placeName}:`, e.message);
        errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
      }
    }

    res.json({
      success: true,
      regenerated: regeneratedIds.length,
      failed: errors.length,
      regeneratedIds,
      errors: errors.length > 0 ? errors : undefined,
      message: `成功重新生成 ${regeneratedIds.length} 筆描述`
    });
  } catch (error) {
    console.error("Admin batch regenerate error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '批次重新生成失敗'));
  }
});

router.post("/place-drafts/backfill-review-count", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const { limit = 50 } = req.body as { limit?: number };

    const allDrafts = await storage.getAllPlaceDrafts();
    const draftsToUpdate = allDrafts.filter(d => 
      d.status === 'pending' && 
      d.googleReviewCount === null && 
      d.googlePlaceId
    ).slice(0, limit);

    if (draftsToUpdate.length === 0) {
      return res.json({ success: true, updated: 0, failed: 0, message: "沒有需要回填的草稿" });
    }

    const updatedIds: number[] = [];
    const errors: { id: number; placeName: string; error: string }[] = [];

    for (const draft of draftsToUpdate) {
      try {
        const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;
        if (!GOOGLE_MAPS_API_KEY) {
          throw new Error("GOOGLE_MAPS_API_KEY not configured");
        }

        const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${draft.googlePlaceId}&fields=user_ratings_total,rating&key=${GOOGLE_MAPS_API_KEY}&language=zh-TW`;
        const response = await fetch(url);
        const data = await response.json();

        if (data.status === 'OK' && data.result) {
          const updateData: any = {};
          if (data.result.user_ratings_total !== undefined) {
            updateData.googleReviewCount = data.result.user_ratings_total;
          }
          if (data.result.rating !== undefined && draft.googleRating === null) {
            updateData.googleRating = data.result.rating;
          }

          if (Object.keys(updateData).length > 0) {
            await storage.updatePlaceDraft(draft.id, updateData);
            updatedIds.push(draft.id);
            console.log(`[BackfillReviewCount] Updated ${draft.placeName}: reviewCount=${updateData.googleReviewCount}`);
          }
        } else {
          console.log(`[BackfillReviewCount] No data for ${draft.placeName}: ${data.status}`);
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (e: any) {
        console.error(`[BackfillReviewCount] Failed for ${draft.placeName}:`, e.message);
        errors.push({ id: draft.id, placeName: draft.placeName, error: e.message });
      }
    }

    res.json({
      success: true,
      updated: updatedIds.length,
      failed: errors.length,
      remaining: allDrafts.filter(d => d.status === 'pending' && d.googleReviewCount === null && d.googlePlaceId).length - updatedIds.length,
      errors: errors.length > 0 ? errors : undefined,
      message: `成功回填 ${updatedIds.length} 筆評論數`
    });
  } catch (error) {
    console.error("Admin backfill review count error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '回填評論數失敗'));
  }
});

router.post("/places/batch-generate", isAuthenticated, async (req: any, res) => {
  const userId = req.user?.claims?.sub;
  if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

  const user = await storage.getUser(userId);
  if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

  const { 
    keyword = '', 
    regionId,
    districtId = null, 
    categoryId = null,
    maxKeywords: rawMaxKeywords = 8,
    maxPagesPerKeyword: rawMaxPages = 3,
    enableAIExpansion = true,
    saveToDrafts = true,
    useSSE = false
  } = req.body;

  const maxKeywords = Math.min(Math.max(1, rawMaxKeywords), 10);
  const maxPagesPerKeyword = Math.min(Math.max(1, rawMaxPages), 3);

  if (!regionId) {
    return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'regionId 為必填'));
  }

  const regionData = await storage.getRegionById(regionId);
  if (!regionData) {
    return res.status(400).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '無效的 regionId'));
  }

  const countryData = await storage.getCountryById(regionData.countryId);
  if (!countryData) {
    return res.status(400).json(createErrorResponse(ErrorCode.COUNTRY_NOT_FOUND, '無效的國家'));
  }

  let districtName = '';
  if (districtId) {
    const districtInfo = await storage.getDistrictWithParents(districtId);
    if (districtInfo) {
      districtName = districtInfo.district.nameZh;
    }
  }

  const allCategories = await storage.getCategories();
  
  let selectedCategory = categoryId 
    ? allCategories.find(c => c.id === categoryId) 
    : allCategories[Math.floor(Math.random() * allCategories.length)];
  
  let searchKeyword = keyword.trim();
  if (!searchKeyword && selectedCategory) {
    searchKeyword = selectedCategory.nameZh;
  } else if (searchKeyword && selectedCategory) {
    searchKeyword = `${selectedCategory.nameZh}-${searchKeyword}`;
  }

  const cityName = regionData.nameZh;
  const countryName = countryData.nameZh;

  if (useSSE) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const sendProgress = (stage: string, current: number, total: number, message: string) => {
      res.write(`data: ${JSON.stringify({ stage, current, total, message })}\n\n`);
    };

    try {
      sendProgress('expanding_keywords', 0, 1, `正在擴散關鍵字... (種類: ${selectedCategory?.nameZh || '隨機'})`);
      
      const result = await batchGeneratePlaces(
        searchKeyword,
        districtName || cityName,
        cityName,
        { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
      );

      sendProgress('searching_google', result.stats.keywords.length, result.stats.keywords.length, 
        `搜尋完成，找到 ${result.places.length} 個地點`);

      sendProgress('filtering_results', 0, 1, '正在過濾與去重...');

      let savedCount = 0;
      let skippedCount = 0;
      const savedPlaces: any[] = [];

      if (saveToDrafts && result.places.length > 0) {
        const existingCache = await storage.getCachedPlaces(districtName || cityName, cityName, countryName);
        const existingCachePlaceIds = new Set(existingCache.map(c => c.placeId).filter(Boolean));
        const existingPlaces = await storage.getOfficialPlacesByCity(cityName, 1000);
        const existingPlacePlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));

        const placesToProcess = result.places.filter(place => 
          !existingCachePlaceIds.has(place.placeId) && !existingPlacePlaceIds.has(place.placeId)
        );
        skippedCount = result.places.length - placesToProcess.length;

        sendProgress('filtering_results', 1, 1, `需處理 ${placesToProcess.length} 筆，跳過 ${skippedCount} 筆重複`);

        const CHUNK_SIZE = 15;
        const DELAY_BETWEEN_CHUNKS = 2000;
        const totalChunks = Math.ceil(placesToProcess.length / CHUNK_SIZE);
        
        for (let i = 0; i < placesToProcess.length; i += CHUNK_SIZE) {
          const chunk = placesToProcess.slice(i, i + CHUNK_SIZE);
          const chunkNum = Math.floor(i / CHUNK_SIZE) + 1;
          
          sendProgress('generating_descriptions', chunkNum, totalChunks, 
            `規則映射分類 + AI 生成描述 (批次 ${chunkNum}/${totalChunks})...`);
          
          const classificationMap = await classifyAndDescribePlaces(chunk, cityName);
          
          sendProgress('saving_places', savedCount, placesToProcess.length, 
            `正在儲存地點 (${savedCount}/${placesToProcess.length})...`);

          for (const place of chunk) {
            try {
              const classification = classificationMap.get(place.name);
              const classResult = classification || {
                name: place.name,
                category: determineCategory(place.primaryType, place.types),
                subcategory: determineSubcategory(place.primaryType, place.types),
                description: generateFallbackDescription(place.name, determineCategory(place.primaryType, place.types), determineSubcategory(place.primaryType, place.types), cityName),
                descriptionSource: 'fallback' as const
              };

              const matchedCategory = allCategories.find(c => c.nameZh === classResult.category) || selectedCategory;
              
              let subcategoryName = classResult.subcategory;
              if (matchedCategory) {
                const existingSubcategories = await storage.getSubcategoriesByCategory(matchedCategory.id);
                const existingSubcategory = existingSubcategories.find(s => s.nameZh === classResult.subcategory);
                
                if (!existingSubcategory && classResult.subcategory) {
                  console.log(`[BatchGenerate] 子分類不存在: ${classResult.subcategory} (${matchedCategory.nameZh})`);
                }
              }

              const cached = await storage.savePlaceToCache({
                subCategory: subcategoryName,
                district: districtName || cityName,
                city: cityName,
                country: countryName,
                placeName: place.name,
                description: classResult.description,
                category: classResult.category,
                suggestedTime: null,
                duration: null,
                searchQuery: searchKeyword,
                rarity: null,
                colorHex: null,
                placeId: place.placeId,
                verifiedName: place.name,
                verifiedAddress: place.address,
                googleRating: place.rating?.toString() || null,
                googleTypes: place.types?.join(',') || null,
                primaryType: place.primaryType || null,
                locationLat: place.location?.lat?.toString() || null,
                locationLng: place.location?.lng?.toString() || null,
                isLocationVerified: true,
                businessStatus: place.businessStatus || null,
                lastVerifiedAt: new Date(),
                aiReviewed: false,
                aiReviewedAt: null
              });

              existingCachePlaceIds.add(place.placeId);
              savedPlaces.push({ id: cached.id, placeName: cached.placeName, placeId: cached.placeId });
              savedCount++;
            } catch (e: any) {
              console.error(`[BatchGenerate] Failed to save ${place.name}:`, e.message);
            }
          }
          
          if (i + CHUNK_SIZE < placesToProcess.length) {
            await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
          }
        }
      }

      sendProgress('complete', savedCount, savedCount, `完成！儲存 ${savedCount} 筆`);
      res.write(`data: ${JSON.stringify({ 
        stage: 'done', 
        success: true,
        saved: savedCount, 
        skipped: skippedCount, 
        total: result.places.length 
      })}\n\n`);
      res.end();
    } catch (error: any) {
      res.write(`data: ${JSON.stringify({ stage: 'error', error: error.message })}\n\n`);
      res.end();
    }
    return;
  }

  try {
    console.log(`[BatchGenerate] Admin ${userId} generating for: ${cityName}${districtName}, keyword: ${searchKeyword}`);

    const result = await batchGeneratePlaces(
      searchKeyword,
      districtName || cityName,
      cityName,
      { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
    );

    let savedCount = 0;
    let skippedCount = 0;
    const savedPlaces: any[] = [];

    if (saveToDrafts && result.places.length > 0) {
      const existingCache = await storage.getCachedPlaces(districtName || cityName, cityName, countryName);
      const existingCachePlaceIds = new Set(existingCache.map(c => c.placeId).filter(Boolean));
      const existingPlaces = await storage.getOfficialPlacesByCity(cityName, 1000);
      const existingPlacePlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));

      const placesToProcess = result.places.filter(place => 
        !existingCachePlaceIds.has(place.placeId) && !existingPlacePlaceIds.has(place.placeId)
      );
      skippedCount = result.places.length - placesToProcess.length;

      const CHUNK_SIZE = 15;
      const DELAY_BETWEEN_CHUNKS = 2000;
      
      for (let i = 0; i < placesToProcess.length; i += CHUNK_SIZE) {
        const chunk = placesToProcess.slice(i, i + CHUNK_SIZE);
        
        const classificationMap = await classifyAndDescribePlaces(chunk, cityName);
        
        for (const place of chunk) {
          try {
            const classification = classificationMap.get(place.name);
            const classResult = classification || {
              name: place.name,
              category: determineCategory(place.primaryType, place.types),
              subcategory: determineSubcategory(place.primaryType, place.types),
              description: generateFallbackDescription(place.name, determineCategory(place.primaryType, place.types), determineSubcategory(place.primaryType, place.types), cityName),
              descriptionSource: 'fallback' as const
            };

            const matchedCategory = allCategories.find(c => c.nameZh === classResult.category) || selectedCategory;
            
            if (matchedCategory) {
              const existingSubcategories = await storage.getSubcategoriesByCategory(matchedCategory.id);
              const existingSubcategory = existingSubcategories.find(s => s.nameZh === classResult.subcategory);
              
              if (!existingSubcategory && classResult.subcategory) {
                console.log(`[BatchCollect] 子分類不存在: ${classResult.subcategory}`);
              }
            }

            const cached = await storage.savePlaceToCache({
              subCategory: classResult.subcategory,
              district: districtName || cityName,
              city: cityName,
              country: countryName,
              placeName: place.name,
              placeNameI18n: null,
              description: classResult.description,
              descriptionI18n: classResult.descriptionI18n || null,
              category: classResult.category,
              suggestedTime: null,
              duration: null,
              searchQuery: searchKeyword,
              rarity: null,
              colorHex: null,
              placeId: place.placeId,
              verifiedName: place.name,
              verifiedAddress: place.address,
              googleRating: place.rating?.toString() || null,
              googleTypes: place.types?.join(',') || null,
              primaryType: place.primaryType || null,
              locationLat: place.location?.lat?.toString() || null,
              locationLng: place.location?.lng?.toString() || null,
              isLocationVerified: true,
              businessStatus: place.businessStatus || null,
              lastVerifiedAt: new Date(),
              aiReviewed: false,
              aiReviewedAt: null
            });

            existingCachePlaceIds.add(place.placeId);
            savedPlaces.push({ id: cached.id, placeName: cached.placeName, placeId: cached.placeId });
            savedCount++;
          } catch (e: any) {
            console.error(`[BatchGenerate] Failed to save ${place.name}:`, e.message);
          }
        }
        
        if (i + CHUNK_SIZE < placesToProcess.length) {
          await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_CHUNKS));
        }
      }
    }

    res.json({
      success: true,
      stats: result.stats,
      saved: savedCount,
      skipped: skippedCount,
      total: result.places.length,
      savedPlaces: savedPlaces.slice(0, 20),
      message: `成功採集 ${result.places.length} 個地點，儲存 ${savedCount} 筆，跳過 ${skippedCount} 筆重複`
    });
  } catch (error: any) {
    console.error("Admin batch generate error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '批次生成失敗', error.message));
  }
});

router.post("/places/batch-preview", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const {
      keyword,
      regionId,
      districtId,
      maxKeywords: rawMaxKeywords = 5,
      maxPagesPerKeyword: rawMaxPages = 1,
      enableAIExpansion = true
    } = req.body;

    const maxKeywords = Math.min(Math.max(1, rawMaxKeywords), 5);
    const maxPagesPerKeyword = Math.min(Math.max(1, rawMaxPages), 2);

    if (!regionId) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, 'regionId 為必填'));
    }

    const regionData = await storage.getRegionById(regionId);
    if (!regionData) {
      return res.status(400).json(createErrorResponse(ErrorCode.REGION_NOT_FOUND, '無效的 regionId'));
    }

    let districtName = '';
    if (districtId) {
      const districtInfo = await storage.getDistrictWithParents(districtId);
      if (districtInfo) {
        districtName = districtInfo.district.nameZh;
      }
    }

    const cityName = regionData.nameZh;
    const searchLocation = districtName || cityName;

    const result = await batchGeneratePlaces(
      keyword || '',
      searchLocation,
      cityName,
      { maxKeywords, maxPagesPerKeyword, enableAIExpansion }
    );

    res.json({
      success: true,
      stats: result.stats,
      places: result.places.slice(0, 50),
      total: result.places.length,
      message: `預覽找到 ${result.places.length} 個地點`
    });
  } catch (error: any) {
    console.error("Admin batch preview error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '預覽失敗', error.message));
  }
});

router.post("/places/reclassify", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    const userEmail = req.user?.claims?.email;

    let user = userId ? await storage.getUser(userId) : null;
    if (!user && userEmail) {
      user = await storage.getUserByEmail(userEmail);
    }

    if (!user) {
      console.log('[Reclassify] User not found - userId:', userId, 'email:', userEmail);
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));
    }

    if (user.role !== 'admin') {
      console.log('[Reclassify] Not admin - user:', user.email, 'role:', user.role);
      return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));
    }

    const { target = 'cache', limit = 100 } = req.body;
    const results = { updated: 0, skipped: 0, errors: 0, details: [] as any[] };

    if (target === 'cache' || target === 'all') {
      const cacheItems = await db.execute(sql`
        SELECT id, place_name, city, primary_type, google_types, description, category, sub_category
        FROM place_cache
        WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
           OR description LIKE '%探索%的特色景點%'
        LIMIT ${limit}
      `);
      
      for (const item of cacheItems.rows as any[]) {
        try {
          const googleTypes = item.google_types ? item.google_types.split(',') : [];
          const reclassified = reclassifyPlace(
            item.place_name,
            item.city,
            item.primary_type,
            googleTypes,
            item.description || ''
          );
          
          await db.execute(sql`
            UPDATE place_cache
            SET category = ${reclassified.category},
                sub_category = ${reclassified.subcategory},
                description = ${reclassified.description}
            WHERE id = ${item.id}
          `);
          
          results.updated++;
          results.details.push({
            id: item.id,
            name: item.place_name,
            oldCategory: item.category,
            newCategory: reclassified.category,
            oldSubcategory: item.sub_category,
            newSubcategory: reclassified.subcategory
          });
        } catch (e: any) {
          results.errors++;
        }
      }
    }

    if (target === 'drafts' || target === 'all') {
      const draftItems = await db.execute(sql`
        SELECT id, place_name, city, primary_type, google_types, description, category, sub_category
        FROM place_drafts
        WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
           OR description LIKE '%探索%的特色景點%'
        LIMIT ${limit}
      `);
      
      for (const item of draftItems.rows as any[]) {
        try {
          const googleTypes = item.google_types ? item.google_types.split(',') : [];
          const reclassified = reclassifyPlace(
            item.place_name,
            item.city,
            item.primary_type,
            googleTypes,
            item.description || ''
          );
          
          await db.execute(sql`
            UPDATE place_drafts
            SET category = ${reclassified.category},
                sub_category = ${reclassified.subcategory},
                description = ${reclassified.description}
            WHERE id = ${item.id}
          `);
          
          results.updated++;
        } catch (e: any) {
          results.errors++;
        }
      }
    }

    if (target === 'places' || target === 'all') {
      const placeItems = await db.execute(sql`
        SELECT id, name, city, google_place_id, description, category, sub_category
        FROM places
        WHERE (category = '景點' AND sub_category IN ('attraction', '景點'))
           OR description LIKE '%探索%的特色景點%'
        LIMIT ${limit}
      `);
      
      for (const item of placeItems.rows as any[]) {
        try {
          const reclassified = reclassifyPlace(
            item.name,
            item.city,
            null,
            [],
            item.description || ''
          );
          
          await db.execute(sql`
            UPDATE places
            SET category = ${reclassified.category},
                sub_category = ${reclassified.subcategory},
                description = ${reclassified.description}
            WHERE id = ${item.id}
          `);
          
          results.updated++;
        } catch (e: any) {
          results.errors++;
        }
      }
    }

    res.json({
      success: true,
      message: `重新分類完成：更新 ${results.updated} 筆，錯誤 ${results.errors} 筆`,
      ...results
    });
  } catch (error: any) {
    console.error("Reclassify error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '重新分類失敗', error.message));
  }
});

router.get("/export-places", async (req, res) => {
  try {
    const key = req.query.key as string;
    const expectedKey = process.env.ADMIN_MIGRATION_KEY;

    if (!key || key !== expectedKey) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_TOKEN_INVALID, '無效的遷移金鑰'));
    }
    
    const result = await db.execute(sql`
      SELECT 
        id, place_name, country, city, district, address,
        location_lat, location_lng, google_place_id, rating,
        opening_hours, category, subcategory, description,
        photo_reference, is_promo_active, is_active, claim_status, place_card_tier,
        google_types, primary_type
      FROM places
      WHERE is_active = true
      ORDER BY id
    `);
    
    res.json({
      success: true,
      count: result.rows.length,
      exportedAt: new Date().toISOString(),
      data: result.rows
    });
  } catch (error: any) {
    console.error("Export places error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '匯出失敗', error.message));
  }
});

router.post("/seed-places", async (req, res) => {
  try {
    const { key, data } = req.body;
    const expectedKey = process.env.ADMIN_MIGRATION_KEY;

    if (!key || key !== expectedKey) {
      return res.status(401).json(createErrorResponse(ErrorCode.AUTH_TOKEN_INVALID, '無效的遷移金鑰'));
    }

    if (!Array.isArray(data) || data.length === 0) {
      return res.status(400).json(createErrorResponse(ErrorCode.MISSING_REQUIRED_FIELD, '未提供資料'));
    }
    
    let inserted = 0;
    let updated = 0;
    let errors = 0;
    
    for (const place of data) {
      try {
        const existing = await db.execute(sql`
          SELECT id FROM places WHERE google_place_id = ${place.google_place_id}
        `);
        
        if (existing.rows.length > 0) {
          await db.execute(sql`
            UPDATE places SET
              place_name = ${place.place_name},
              country = ${place.country},
              city = ${place.city},
              district = ${place.district},
              address = ${place.address},
              location_lat = ${place.location_lat},
              location_lng = ${place.location_lng},
              rating = ${place.rating},
              opening_hours = ${place.opening_hours},
              category = ${place.category},
              subcategory = ${place.subcategory},
              description = ${place.description},
              photo_reference = ${place.photo_reference},
              is_promo_active = ${place.is_promo_active || false},
              is_active = ${place.is_active !== false},
              claim_status = ${place.claim_status || 'unclaimed'},
              place_card_tier = ${place.place_card_tier || 'free'},
              google_types = ${place.google_types},
              primary_type = ${place.primary_type}
            WHERE google_place_id = ${place.google_place_id}
          `);
          updated++;
        } else {
          await db.execute(sql`
            INSERT INTO places (
              place_name, country, city, district, address,
              location_lat, location_lng, google_place_id, rating,
              opening_hours, category, subcategory, description,
              photo_reference, is_promo_active, is_active, claim_status, place_card_tier,
              google_types, primary_type
            ) VALUES (
              ${place.place_name}, ${place.country}, ${place.city}, ${place.district}, ${place.address},
              ${place.location_lat}, ${place.location_lng}, ${place.google_place_id}, ${place.rating},
              ${place.opening_hours}, ${place.category}, ${place.subcategory}, ${place.description},
              ${place.photo_reference}, ${place.is_promo_active || false}, ${place.is_active !== false},
              ${place.claim_status || 'unclaimed'}, ${place.place_card_tier || 'free'},
              ${place.google_types}, ${place.primary_type}
            )
          `);
          inserted++;
        }
      } catch (e: any) {
        console.error(`Error processing place ${place.place_name}:`, e.message);
        errors++;
      }
    }
    
    res.json({
      success: true,
      message: `匯入完成：新增 ${inserted} 筆，更新 ${updated} 筆，錯誤 ${errors} 筆`,
      inserted,
      updated,
      errors
    });
  } catch (error: any) {
    console.error("Seed places error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '匯入失敗', error.message));
  }
});

// ============ 景點管理 API ============

/**
 * GET /api/admin/places
 * 取得所有景點列表（分頁、搜尋、篩選）
 */
router.get("/places", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const page = parseInt(req.query.page as string) || 1;
    const limit = Math.min(parseInt(req.query.limit as string) || 50, 100);
    const search = (req.query.search as string) || '';
    const category = (req.query.category as string) || '';
    const city = (req.query.city as string) || '';
    const status = (req.query.status as string) || '';
    const claimStatus = (req.query.claimStatus as string) || '';

    const offset = (page - 1) * limit;

    // 使用 Drizzle SQL 模板建立查詢
    const countResult = await db.execute(sql`
      SELECT COUNT(*) as total FROM places
      WHERE 1=1
        ${search ? sql`AND (place_name ILIKE ${'%' + search + '%'} OR address ILIKE ${'%' + search + '%'})` : sql``}
        ${category ? sql`AND category = ${category}` : sql``}
        ${city ? sql`AND city = ${city}` : sql``}
        ${status === 'active' ? sql`AND is_active = true` : sql``}
        ${status === 'inactive' ? sql`AND is_active = false` : sql``}
        ${claimStatus ? sql`AND claim_status = ${claimStatus}` : sql``}
    `);
    const total = parseInt(countResult.rows[0]?.total as string) || 0;

    const dataResult = await db.execute(sql`
      SELECT
        id, place_name, country, city, district, address,
        location_lat, location_lng, category, subcategory,
        description, rating, is_active, claim_status, place_card_tier,
        merchant_id, created_at
      FROM places
      WHERE 1=1
        ${search ? sql`AND (place_name ILIKE ${'%' + search + '%'} OR address ILIKE ${'%' + search + '%'})` : sql``}
        ${category ? sql`AND category = ${category}` : sql``}
        ${city ? sql`AND city = ${city}` : sql``}
        ${status === 'active' ? sql`AND is_active = true` : sql``}
        ${status === 'inactive' ? sql`AND is_active = false` : sql``}
        ${claimStatus ? sql`AND claim_status = ${claimStatus}` : sql``}
      ORDER BY created_at DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `);

    const citiesResult = await db.execute(sql`
      SELECT DISTINCT city FROM places WHERE city IS NOT NULL ORDER BY city
    `);
    const categoriesResult = await db.execute(sql`
      SELECT DISTINCT category FROM places WHERE category IS NOT NULL ORDER BY category
    `);

    res.json({
      places: dataResult.rows,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit)
      },
      filters: {
        cities: citiesResult.rows.map((r: any) => r.city).filter(Boolean),
        categories: categoriesResult.rows.map((r: any) => r.category).filter(Boolean)
      }
    });
  } catch (error: any) {
    console.error("Admin get places error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '取得景點列表失敗'));
  }
});

/**
 * PATCH /api/admin/places/:id
 * 更新景點資訊
 */
router.patch("/places/:id", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const placeId = parseInt(req.params.id);
    const { placeName, category, subcategory, description, isActive, placeCardTier } = req.body;

    // 使用 Drizzle SQL 進行更新
    const result = await db.execute(sql`
      UPDATE places
      SET
        place_name = COALESCE(${placeName}, place_name),
        category = COALESCE(${category}, category),
        subcategory = COALESCE(${subcategory}, subcategory),
        description = COALESCE(${description}, description),
        is_active = COALESCE(${isActive}, is_active),
        place_card_tier = COALESCE(${placeCardTier}, place_card_tier)
      WHERE id = ${placeId}
      RETURNING *
    `);

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.PLACE_NOT_FOUND));
    }

    res.json({ place: result.rows[0], success: true });
  } catch (error: any) {
    console.error("Admin update place error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '更新景點失敗'));
  }
});

/**
 * PATCH /api/admin/places/:id/toggle-status
 * 切換景點啟用狀態
 */
router.patch("/places/:id/toggle-status", isAuthenticated, async (req: any, res) => {
  try {
    const userId = req.user?.claims?.sub;
    if (!userId) return res.status(401).json(createErrorResponse(ErrorCode.AUTH_REQUIRED));

    const user = await storage.getUser(userId);
    if (user?.role !== 'admin') return res.status(403).json(createErrorResponse(ErrorCode.ADMIN_REQUIRED));

    const placeId = parseInt(req.params.id);

    const result = await db.execute(sql`
      UPDATE places
      SET is_active = NOT is_active
      WHERE id = ${placeId}
      RETURNING id, place_name, is_active
    `);

    if (result.rows.length === 0) {
      return res.status(404).json(createErrorResponse(ErrorCode.PLACE_NOT_FOUND));
    }

    const place = result.rows[0];
    res.json({
      success: true,
      place,
      message: `景點「${place.place_name}」已${place.is_active ? '啟用' : '停用'}`
    });
  } catch (error: any) {
    console.error("Admin toggle place status error:", error);
    res.status(500).json(createErrorResponse(ErrorCode.SERVER_ERROR, '切換狀態失敗'));
  }
});

export default router;
