/**
 * 重新生成含星級評分的描述
 */

import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from '../../shared/schema';
import { eq, sql } from 'drizzle-orm';
import { generateDescriptionsWithRetry } from '../lib/descriptionGenerator';

const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const db = drizzle(pool, { schema });

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function main() {
  const cityName = process.argv[2] || '宜蘭縣';
  const limit = parseInt(process.argv[3] || '200', 10);
  
  console.log('🔧 重新生成含星級描述');
  console.log(`📍 城市: ${cityName}`);
  console.log(`📦 數量上限: ${limit}`);
  console.log('='.repeat(50));

  const placesWithStars = await db
    .select({
      id: schema.places.id,
      placeName: schema.places.placeName,
      city: schema.places.city,
      category: schema.places.category,
      address: schema.places.address,
    })
    .from(schema.places)
    .where(sql`city = ${cityName} AND description ~ '[0-9\\.]+星'`)
    .limit(limit);

  if (placesWithStars.length === 0) {
    console.log('✅ 沒有需要重新生成的描述');
    await pool.end();
    return;
  }

  console.log(`📋 找到 ${placesWithStars.length} 筆含星級描述\n`);

  const byCategory = new Map<string, typeof placesWithStars>();
  for (const p of placesWithStars) {
    const cat = p.category || '景點';
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  let totalUpdated = 0;
  let totalFailed = 0;

  for (const [category, places] of byCategory) {
    console.log(`📦 [${category}] 處理 ${places.length} 筆`);
    
    const BATCH_SIZE = 10;
    for (let i = 0; i < places.length; i += BATCH_SIZE) {
      const batch = places.slice(i, i + BATCH_SIZE);
      
      const descriptions = await generateDescriptionsWithRetry(
        batch.map(p => ({
          id: p.id,
          placeName: p.placeName,
          address: p.address,
          city: p.city,
        })),
        category
      );

      for (const p of batch) {
        const desc = descriptions.get(p.id);
        if (desc) {
          await db.update(schema.places)
            .set({ description: desc })
            .where(eq(schema.places.id, p.id));
          totalUpdated++;
        } else {
          totalFailed++;
        }
      }

      console.log(`   進度: ${Math.min(i + BATCH_SIZE, places.length)}/${places.length}`);
      
      if (i + BATCH_SIZE < places.length) {
        await sleep(1000);
      }
    }
  }

  const remaining = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.places)
    .where(sql`city = ${cityName} AND description ~ '[0-9\\.]+星'`);

  console.log('\n' + '='.repeat(50));
  console.log('📊 完成統計');
  console.log(`   成功更新: ${totalUpdated} 筆`);
  console.log(`   失敗: ${totalFailed} 筆`);
  console.log(`   剩餘含星級: ${Number(remaining[0]?.count || 0)} 筆`);
  console.log('='.repeat(50));

  await pool.end();
}

main().catch(e => {
  console.error('Error:', e);
  pool.end();
  process.exit(1);
});
