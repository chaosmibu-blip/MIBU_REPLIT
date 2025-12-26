import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, and, isNotNull } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

const db = drizzle(pool, { schema });

async function migrateCacheToPlaces() {
  const city = process.argv[2] || '台北市';
  
  console.log(`🚀 將 ${city} 的審核通過資料從 place_cache 移到 places`);
  console.log('='.repeat(50));
  
  const reviewedCache = await db.select().from(schema.placeCache)
    .where(and(
      eq(schema.placeCache.city, city),
      eq(schema.placeCache.aiReviewed, true)
    ));
  
  if (reviewedCache.length === 0) {
    console.log('❌ 沒有已審核的資料');
    await pool.end();
    return;
  }
  
  console.log(`📦 找到 ${reviewedCache.length} 筆已審核資料`);
  
  const existingPlaces = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(eq(schema.places.city, city));
  
  const existingPlaceIds = new Set(existingPlaces.map(p => p.googlePlaceId).filter(Boolean));
  console.log(`📍 ${city} 已有 ${existingPlaceIds.size} 個正式景點`);
  
  let inserted = 0;
  let skipped = 0;
  let errors = 0;
  
  for (const cache of reviewedCache) {
    if (!cache.placeId) {
      skipped++;
      continue;
    }
    
    if (existingPlaceIds.has(cache.placeId)) {
      await db.delete(schema.placeCache)
        .where(eq(schema.placeCache.id, cache.id));
      skipped++;
      continue;
    }
    
    try {
      await db.insert(schema.places).values({
        placeName: cache.placeName,
        country: cache.country || '台灣',
        city: cache.city,
        district: cache.district,
        address: cache.verifiedAddress || '',
        locationLat: cache.locationLat ? parseFloat(cache.locationLat) : null,
        locationLng: cache.locationLng ? parseFloat(cache.locationLng) : null,
        googlePlaceId: cache.placeId,
        rating: cache.googleRating ? parseFloat(cache.googleRating) : null,
        category: cache.category,
        subcategory: cache.subCategory,
        description: cache.description,
        isActive: true,
      });
      
      await db.delete(schema.placeCache)
        .where(eq(schema.placeCache.id, cache.id));
      
      existingPlaceIds.add(cache.placeId);
      inserted++;
      
      if (inserted % 50 === 0) {
        console.log(`   ✅ 已匯入 ${inserted} 筆...`);
      }
    } catch (e: any) {
      if (e.message.includes('duplicate')) {
        await db.delete(schema.placeCache)
          .where(eq(schema.placeCache.id, cache.id));
        skipped++;
      } else {
        console.error(`❌ 失敗 ${cache.placeName}: ${e.message}`);
        errors++;
      }
    }
  }
  
  const finalCount = await db.select({ googlePlaceId: schema.places.googlePlaceId })
    .from(schema.places)
    .where(eq(schema.places.city, city));
  
  console.log('\n' + '='.repeat(50));
  console.log('📊 匯入完成統計');
  console.log(`   新增: ${inserted} 筆`);
  console.log(`   跳過（重複）: ${skipped} 筆`);
  console.log(`   錯誤: ${errors} 筆`);
  console.log(`   ${city} 正式景點總數: ${finalCount.length} 筆`);
  console.log('='.repeat(50));
  
  await pool.end();
}

migrateCacheToPlaces().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});
