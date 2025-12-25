import { db } from "../db";
import { sql } from "drizzle-orm";
import { reclassifyPlace } from "../lib/placeGenerator";

async function reclassifyAllData() {
  console.log("🔄 開始重新分類舊資料...\n");
  
  const results = { updated: 0, skipped: 0, errors: 0 };
  
  // 1. 修復 place_cache
  console.log("📦 處理 place_cache...");
  const cacheItems = await db.execute(sql`
    SELECT id, place_name, city, primary_type, google_types, description, category, sub_category
    FROM place_cache
    WHERE (category = 'attraction' AND sub_category IN ('attraction', '景點'))
       OR description LIKE '%探索%的特色景點%'
    LIMIT 500
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
      
      console.log(`  ✅ ${item.place_name}: ${item.category}/${item.sub_category} → ${reclassified.category}/${reclassified.subcategory}`);
      results.updated++;
    } catch (e: any) {
      console.log(`  ❌ ${item.place_name}: ${e.message}`);
      results.errors++;
    }
  }
  
  // 2. 修復 place_drafts (需要用 category_id 和 subcategory_id)
  console.log("\n📝 處理 place_drafts...");
  const draftItems = await db.execute(sql`
    SELECT pd.id, pd.place_name, pd.description,
           c.name_zh as category_name, s.name_zh as subcategory_name,
           r.name_zh as region_name
    FROM place_drafts pd
    LEFT JOIN categories c ON pd.category_id = c.id
    LEFT JOIN subcategories s ON pd.subcategory_id = s.id
    LEFT JOIN regions r ON pd.region_id = r.id
    WHERE pd.description LIKE '%探索%的特色景點%'
    LIMIT 100
  `);
  
  for (const item of draftItems.rows as any[]) {
    try {
      const reclassified = reclassifyPlace(
        item.place_name,
        item.region_name || '',
        null,
        [],
        item.description || ''
      );
      
      // 只更新 description，因為 draft 使用 category_id
      if (reclassified.description !== item.description) {
        await db.execute(sql`
          UPDATE place_drafts
          SET description = ${reclassified.description}
          WHERE id = ${item.id}
        `);
        
        console.log(`  ✅ ${item.place_name}: 描述已更新`);
        results.updated++;
      } else {
        results.skipped++;
      }
    } catch (e: any) {
      console.log(`  ❌ ${item.place_name}: ${e.message}`);
      results.errors++;
    }
  }
  
  // 3. 修復 places
  console.log("\n🏠 處理 places...");
  const placeItems = await db.execute(sql`
    SELECT id, name, description, category, subcategory
    FROM places
    WHERE description LIKE '%探索%的特色景點%'
    LIMIT 100
  `);
  
  for (const item of placeItems.rows as any[]) {
    try {
      const reclassified = reclassifyPlace(
        item.name,
        '',
        null,
        [],
        item.description || ''
      );
      
      await db.execute(sql`
        UPDATE places
        SET category = ${reclassified.category},
            subcategory = ${reclassified.subcategory},
            description = ${reclassified.description}
        WHERE id = ${item.id}
      `);
      
      console.log(`  ✅ ${item.name}: 已更新`);
      results.updated++;
    } catch (e: any) {
      console.log(`  ❌ ${item.name}: ${e.message}`);
      results.errors++;
    }
  }
  
  console.log("\n" + "=".repeat(50));
  console.log(`📊 修復完成！`);
  console.log(`   ✅ 已更新: ${results.updated}`);
  console.log(`   ⏭️ 跳過: ${results.skipped}`);
  console.log(`   ❌ 錯誤: ${results.errors}`);
  console.log("=".repeat(50));
  
  process.exit(0);
}

reclassifyAllData().catch(err => {
  console.error("執行失敗:", err);
  process.exit(1);
});
