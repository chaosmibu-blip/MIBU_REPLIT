import { batchGeneratePlaces } from '../lib/placeGenerator';

async function main() {
  console.log('=== 批次生成測試：羅東鎮在地美食 ===\n');
  
  const result = await batchGeneratePlaces(
    '在地美食',
    '羅東鎮',
    '宜蘭縣',
    {
      maxKeywords: 5,
      maxPagesPerKeyword: 2,
      enableAIExpansion: true
    }
  );
  
  console.log('\n=== 統計結果 ===');
  console.log(`AI 擴散關鍵字: ${result.stats.keywords.join(', ')}`);
  console.log(`每關鍵字頁數: ${result.stats.pagesPerKeyword.join(', ')}`);
  console.log(`原始筆數 (Raw): ${result.stats.totalFetched}`);
  console.log(`過濾後筆數: ${result.stats.afterTypeFilter}`);
  console.log(`去重後筆數: ${result.stats.afterDedup}`);
  
  console.log('\n=== 前 10 筆地點 ===');
  result.places.slice(0, 10).forEach((p, i) => {
    console.log(`${i+1}. ${p.name} (${p.primaryType || p.types[0] || 'N/A'}) - ${p.rating || 'N/A'}⭐`);
  });
  
  console.log('\n=== 完成 ===');
}

main().catch(console.error);
