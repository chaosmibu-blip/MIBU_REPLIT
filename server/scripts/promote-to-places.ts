/**
 * 升級腳本：將已通過 AI 審核的 place_cache 資料升級到 places 表
 * 
 * 用法：npx tsx server/scripts/promote-to-places.ts [批次數量]
 * 預設每次處理 50 筆
 */

import { db } from "../db";
import { placeCache, places } from "../../shared/schema";
import { eq, and, isNull, sql } from "drizzle-orm";

const BATCH_SIZE = parseInt(process.argv[2] || "50", 10);

async function promoteToPlaces() {
  console.log("🚀 開始升級已審核通過的景點到 places 表...");
  console.log(`📦 批次大小: ${BATCH_SIZE}`);

  // 1. 找出已通過審核但尚未升級的 place_cache
  // 使用 placeId (Google Place ID) 來判斷是否已存在於 places
  const pendingPromotion = await db
    .select()
    .from(placeCache)
    .where(eq(placeCache.aiReviewed, true))
    .limit(BATCH_SIZE);

  if (pendingPromotion.length === 0) {
    console.log("✅ 沒有待升級的景點");
    return { promoted: 0, skipped: 0, failed: 0 };
  }

  console.log(`📋 找到 ${pendingPromotion.length} 筆待升級景點`);

  let promoted = 0;
  let skipped = 0;
  let failed = 0;

  for (const cache of pendingPromotion) {
    try {
      // 檢查是否已存在（用 googlePlaceId 去重）
      if (cache.placeId) {
        const existing = await db
          .select({ id: places.id })
          .from(places)
          .where(eq(places.googlePlaceId, cache.placeId))
          .limit(1);

        if (existing.length > 0) {
          // 已存在，刪除 cache
          await db.delete(placeCache).where(eq(placeCache.id, cache.id));
          skipped++;
          continue;
        }
      }

      // 欄位對應轉換
      const placeData = {
        placeName: cache.verifiedName || cache.placeName,
        country: cache.country,
        city: cache.city,
        district: cache.district,
        address: cache.verifiedAddress || null,
        locationLat: cache.locationLat ? parseFloat(cache.locationLat) : null,
        locationLng: cache.locationLng ? parseFloat(cache.locationLng) : null,
        googlePlaceId: cache.placeId || null,
        rating: cache.googleRating ? parseFloat(cache.googleRating) : null,
        photoReference: null,
        category: cache.category,
        subcategory: cache.subCategory,
        description: cache.description,
        merchantId: null,
        isPromoActive: false,
        isActive: true,
      };

      // 插入 places 表
      await db.insert(places).values(placeData);

      // 成功後刪除 cache
      await db.delete(placeCache).where(eq(placeCache.id, cache.id));

      promoted++;
    } catch (error: any) {
      // 如果是重複鍵錯誤，跳過並刪除 cache
      if (error.code === "23505") {
        await db.delete(placeCache).where(eq(placeCache.id, cache.id));
        skipped++;
      } else {
        console.error(`❌ 升級失敗 [${cache.placeName}]:`, error.message);
        failed++;
      }
    }
  }

  // 統計剩餘
  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(placeCache)
    .where(eq(placeCache.aiReviewed, true));

  const remainingCount = Number(remaining[0]?.count || 0);

  console.log("\n📊 升級結果:");
  console.log(`  ✅ 成功升級: ${promoted}`);
  console.log(`  ⏭️  已存在跳過: ${skipped}`);
  console.log(`  ❌ 失敗: ${failed}`);
  console.log(`  📦 剩餘待升級: ${remainingCount}`);

  return { promoted, skipped, failed, remaining: remainingCount };
}

// 執行
promoteToPlaces()
  .then((result) => {
    console.log("\n✅ 升級腳本完成");
    process.exit(0);
  })
  .catch((error) => {
    console.error("💥 升級失敗:", error);
    process.exit(1);
  });
