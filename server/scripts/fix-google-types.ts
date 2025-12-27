/**
 * 修復腳本：從 Google Places API 取得 google_types 和 primary_type
 * 
 * 用法：npx tsx server/scripts/fix-google-types.ts [城市名稱] [數量限制]
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, isNull, and, sql } from 'drizzle-orm';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function getPlaceDetails(placeId: string): Promise<{ types: string[]; primaryType: string | null } | null> {
  if (!GOOGLE_MAPS_API_KEY) return null;

  try {
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'types,primaryType'
      }
    });

    if (!response.ok) return null;

    const data = await response.json();
    return {
      types: data.types || [],
      primaryType: data.primaryType || null
    };
  } catch (e) {
    return null;
  }
}

async function main() {
  const cityName = process.argv[2];
  const limit = parseInt(process.argv[3] || '100', 10);
  
  console.log('🔧 Google Types 修復腳本');
  if (cityName) {
    console.log(`📍 目標城市: ${cityName}`);
  } else {
    console.log('📍 目標: 全部城市');
  }
  console.log(`📦 處理數量: ${limit}`);
  console.log('='.repeat(50));
  
  const conditions = [isNull(schema.places.googleTypes)];
  if (cityName) {
    conditions.push(eq(schema.places.city, cityName));
  }

  const placesToFix = await db
    .select({
      id: schema.places.id,
      placeName: schema.places.placeName,
      googlePlaceId: schema.places.googlePlaceId
    })
    .from(schema.places)
    .where(and(...conditions))
    .orderBy(sql`id DESC`)
    .limit(limit);

  if (placesToFix.length === 0) {
    console.log('✅ 沒有需要修復的資料');
    await pool.end();
    return;
  }

  console.log(`📋 找到 ${placesToFix.length} 筆需要修復\n`);

  let updated = 0;
  let failed = 0;
  const BATCH_SIZE = 10;

  for (let i = 0; i < placesToFix.length; i += BATCH_SIZE) {
    const batch = placesToFix.slice(i, i + BATCH_SIZE);
    
    const promises = batch.map(async (place) => {
      if (!place.googlePlaceId) {
        return { id: place.id, success: false };
      }

      const details = await getPlaceDetails(place.googlePlaceId);
      if (!details) {
        return { id: place.id, success: false };
      }

      await db
        .update(schema.places)
        .set({
          googleTypes: details.types.join(','),
          primaryType: details.primaryType
        })
        .where(eq(schema.places.id, place.id));

      return { id: place.id, success: true };
    });

    const results = await Promise.all(promises);
    
    for (const r of results) {
      if (r.success) updated++;
      else failed++;
    }

    console.log(`   進度: ${Math.min(i + BATCH_SIZE, placesToFix.length)}/${placesToFix.length} (成功: ${updated}, 失敗: ${failed})`);
    
    if (i + BATCH_SIZE < placesToFix.length) {
      await sleep(500);
    }
  }

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.places)
    .where(and(...conditions));

  console.log('\n' + '='.repeat(50));
  console.log('📊 修復完成統計');
  console.log(`   成功更新: ${updated} 筆`);
  console.log(`   失敗: ${failed} 筆`);
  console.log(`   剩餘待修復: ${Number(remaining[0]?.count || 0)} 筆`);
  console.log('='.repeat(50));

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});
