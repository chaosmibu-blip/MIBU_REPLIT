import { storage } from "../storage";
import { reviewPlaceWithAI } from "../lib/placeGenerator";

async function batchReviewAllCache() {
  console.log("🚀 開始批次審核 place_cache 資料...\n");

  const categories = await storage.getCategories();
  const allSubcategories = await storage.getAllSubcategoriesWithCategory();
  
  let totalProcessed = 0;
  let totalPassed = 0;
  let totalMovedToDraft = 0;
  let totalErrors = 0;
  
  const batchSize = 100;
  let hasMore = true;
  
  while (hasMore) {
    const unreviewed = await storage.getUnreviewedPlaceCache(batchSize);
    
    if (unreviewed.length === 0) {
      hasMore = false;
      break;
    }
    
    console.log(`📦 處理批次: ${unreviewed.length} 筆 (已處理: ${totalProcessed})`);
    
    for (const place of unreviewed) {
      try {
        const reviewResult = await reviewPlaceWithAI(
          place.placeName,
          place.description,
          place.category,
          place.subCategory,
          place.district,
          place.city
        );
        
        if (reviewResult.passed && reviewResult.confidence >= 0.6) {
          await storage.markPlaceCacheReviewed(place.id, true);
          totalPassed++;
          console.log(`✅ ${place.placeName}: PASS (${(reviewResult.confidence * 100).toFixed(0)}%)`);
        } else {
          const category = categories.find(c => c.code === place.category);
          const subcategory = allSubcategories.find(s => s.nameZh === place.subCategory);
          const districtInfo = await storage.getDistrictByNames(place.district, place.city, place.country);
          
          if (districtInfo) {
            const rejectionNote = `[AI審核不通過] ${reviewResult.reason} (信心度: ${(reviewResult.confidence * 100).toFixed(0)}%)`;
            
            await storage.createPlaceDraft({
              source: 'ai',
              placeName: place.placeName,
              description: `${rejectionNote}\n\n原描述：${place.description}`,
              categoryId: category?.id || 1,
              subcategoryId: subcategory?.id || 1,
              districtId: districtInfo.district.id,
              regionId: districtInfo.region.id,
              countryId: districtInfo.country.id,
              address: place.verifiedAddress || undefined,
              googlePlaceId: place.placeId || undefined,
              googleRating: place.googleRating ? parseFloat(place.googleRating) : undefined,
              locationLat: place.locationLat || undefined,
              locationLng: place.locationLng || undefined,
              status: 'pending',
            });
            
            await storage.deletePlaceCache(place.id);
            totalMovedToDraft++;
            console.log(`❌ ${place.placeName}: FAIL → 移至草稿 (${reviewResult.reason})`);
          } else {
            await storage.markPlaceCacheReviewed(place.id, true);
            totalErrors++;
            console.log(`⚠️ ${place.placeName}: 找不到地區資訊`);
          }
        }
        
        totalProcessed++;
        
        await new Promise(resolve => setTimeout(resolve, 150));
      } catch (e: any) {
        console.error(`❌ ${place.placeName}: ERROR - ${e.message}`);
        totalErrors++;
        totalProcessed++;
      }
    }
    
    console.log(`\n📊 進度: ${totalProcessed} 筆已處理\n`);
  }
  
  console.log("\n" + "=".repeat(50));
  console.log("🎉 place_cache 批次審核完成！");
  console.log("=".repeat(50));
  console.log(`總處理: ${totalProcessed} 筆`);
  console.log(`✅ 通過: ${totalPassed} 筆`);
  console.log(`❌ 移至草稿: ${totalMovedToDraft} 筆`);
  console.log(`⚠️ 錯誤: ${totalErrors} 筆`);
  console.log("=".repeat(50));
}

batchReviewAllCache().catch(console.error);
