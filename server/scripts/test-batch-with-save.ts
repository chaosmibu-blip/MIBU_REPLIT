import { batchGeneratePlaces } from '../lib/placeGenerator';
import { storage } from '../storage';

async function main() {
  console.log('=== 批次生成測試：頭城鎮在地景點 ===\n');
  console.log('目標：存入 place_cache 資料表\n');
  
  const keyword = '在地景點';
  const district = '頭城鎮';
  const city = '宜蘭縣';
  const country = '台灣';
  
  // Step 1: 執行批次生成
  const result = await batchGeneratePlaces(
    keyword,
    district,
    city,
    {
      maxKeywords: 5,
      maxPagesPerKeyword: 2,
      enableAIExpansion: true
    }
  );
  
  console.log('\n=== 採集統計 ===');
  console.log(`AI 擴散關鍵字: ${result.stats.keywords.join(', ')}`);
  console.log(`每關鍵字頁數: ${result.stats.pagesPerKeyword.join(', ')}`);
  console.log(`原始筆數 (Raw): ${result.stats.totalFetched}`);
  console.log(`過濾後筆數: ${result.stats.afterTypeFilter}`);
  console.log(`去重後筆數: ${result.stats.afterDedup}`);
  
  // Step 2: 檢查已存在的 place_id
  console.log('\n=== 檢查重複 ===');
  const existingCache = await storage.getCachedPlaces(district, city, country);
  const existingCachePlaceIds = new Set(existingCache.map(c => c.placeId).filter(Boolean));
  console.log(`Cache 中已有: ${existingCachePlaceIds.size} 筆`);
  
  // Step 3: 儲存到 place_cache
  console.log('\n=== 儲存到 place_cache ===');
  let savedCount = 0;
  let skippedCount = 0;
  
  for (const place of result.places) {
    if (existingCachePlaceIds.has(place.placeId)) {
      skippedCount++;
      continue;
    }
    
    try {
      await storage.savePlaceToCache({
        subCategory: 'attraction',
        district,
        city,
        country,
        placeName: place.name,
        description: `探索${district}的特色景點`,
        category: 'attraction',
        suggestedTime: null,
        duration: null,
        searchQuery: keyword,
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
      savedCount++;
      console.log(`✓ ${place.name} (${place.primaryType || 'N/A'})`);
    } catch (e: any) {
      console.error(`✗ ${place.name}: ${e.message}`);
    }
  }
  
  console.log('\n=== 最終結果 ===');
  console.log(`成功存入: ${savedCount} 筆`);
  console.log(`跳過重複: ${skippedCount} 筆`);
  console.log(`總採集: ${result.places.length} 筆`);
  
  // 驗證
  const finalCache = await storage.getCachedPlaces(district, city, country);
  console.log(`\nCache 中現有: ${finalCache.length} 筆 (${district})`);
}

main().catch(console.error);
