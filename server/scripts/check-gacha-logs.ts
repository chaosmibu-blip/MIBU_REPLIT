/**
 * 查詢今天的 Gacha 請求 Log
 * 找出回傳空結果或錯誤的請求
 *
 * 執行方式: npx tsx server/scripts/check-gacha-logs.ts
 */

import { db } from "../db";
import { gachaAiLogs } from "@shared/schema";
import { sql, desc, or, isNull } from "drizzle-orm";

async function checkTodayGachaLogs() {
  console.log("=".repeat(60));
  console.log("📊 今日 Gacha 請求 Log 分析");
  console.log("=".repeat(60));

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // 查詢今天所有的 gacha logs
  const allLogs = await db
    .select()
    .from(gachaAiLogs)
    .where(sql`${gachaAiLogs.createdAt} >= ${today}`)
    .orderBy(desc(gachaAiLogs.createdAt));

  console.log(`\n📈 今日總請求數: ${allLogs.length}`);

  // 找出問題請求：空結果或 shortfall
  const problemLogs = allLogs.filter(log => {
    const hasEmptyResult = !log.orderedPlaceIds || log.orderedPlaceIds.length === 0;
    const isShortfall = log.isShortfall === true;
    return hasEmptyResult || isShortfall;
  });

  console.log(`\n⚠️  問題請求數: ${problemLogs.length}`);

  if (problemLogs.length === 0) {
    console.log("\n✅ 今日沒有空結果或錯誤的請求！");
  } else {
    console.log("\n" + "-".repeat(60));
    console.log("問題請求列表：");
    console.log("-".repeat(60));

    for (const log of problemLogs) {
      console.log(`\n🔴 Session: ${log.sessionId}`);
      console.log(`   User ID: ${log.userId}`);
      console.log(`   參數: ${log.city} / ${log.district || '(全市)'} / 請求 ${log.requestedCount} 個`);
      console.log(`   結果: ${log.orderedPlaceIds?.length || 0} 個景點`);
      console.log(`   Shortfall: ${log.isShortfall ? '是' : '否'}`);
      console.log(`   AI Model: ${log.aiModel || 'N/A'}`);
      console.log(`   耗時: ${log.durationMs ? log.durationMs + 'ms' : 'N/A'}`);
      console.log(`   時間: ${log.createdAt}`);
      if (log.aiReason) {
        console.log(`   AI 理由: ${log.aiReason.substring(0, 200)}...`);
      }
    }
  }

  // 統計摘要
  console.log("\n" + "=".repeat(60));
  console.log("📊 統計摘要");
  console.log("=".repeat(60));

  const successLogs = allLogs.filter(log =>
    log.orderedPlaceIds && log.orderedPlaceIds.length > 0 && !log.isShortfall
  );

  const shortfallLogs = allLogs.filter(log => log.isShortfall);
  const emptyLogs = allLogs.filter(log =>
    !log.orderedPlaceIds || log.orderedPlaceIds.length === 0
  );

  console.log(`✅ 成功: ${successLogs.length}`);
  console.log(`⚠️  Shortfall (景點不足): ${shortfallLogs.length}`);
  console.log(`❌ 空結果: ${emptyLogs.length}`);

  // 按城市/區域統計問題
  if (problemLogs.length > 0) {
    console.log("\n📍 問題請求按地區分佈：");
    const locationMap = new Map<string, number>();
    for (const log of problemLogs) {
      const key = `${log.city} / ${log.district || '全市'}`;
      locationMap.set(key, (locationMap.get(key) || 0) + 1);
    }
    for (const [location, count] of locationMap.entries()) {
      console.log(`   ${location}: ${count} 次`);
    }
  }

  process.exit(0);
}

checkTodayGachaLogs().catch(err => {
  console.error("❌ 查詢失敗:", err);
  process.exit(1);
});
