/**
 * Gacha API 壓力測試腳本
 * 模擬 50 個虛擬用戶同時呼叫扭蛋 API，持續 30 秒
 */

const BASE_URL = process.env.REPLIT_DEV_DOMAIN 
  ? `https://${process.env.REPLIT_DEV_DOMAIN}`
  : 'http://localhost:5000';

const CONFIG = {
  virtualUsers: 50,        // 虛擬用戶數
  durationSeconds: 30,     // 測試持續時間
  targetEndpoint: '/api/gacha/itinerary/v3',
  payload: {
    city: '宜蘭縣',
    district: '宜蘭市',
    itemCount: 5
  }
};

interface RequestResult {
  success: boolean;
  statusCode: number;
  responseTime: number;
  error?: string;
}

const results: RequestResult[] = [];
let activeUsers = 0;
let totalRequests = 0;
let successfulRequests = 0;
let failedRequests = 0;

async function makeRequest(): Promise<RequestResult> {
  const startTime = Date.now();
  
  try {
    const response = await fetch(`${BASE_URL}${CONFIG.targetEndpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(CONFIG.payload)
    });
    
    const responseTime = Date.now() - startTime;
    const success = response.status === 200;
    
    // 讀取回應內容以確保完整接收
    await response.json().catch(() => ({}));
    
    return {
      success,
      statusCode: response.status,
      responseTime
    };
  } catch (error: any) {
    return {
      success: false,
      statusCode: 0,
      responseTime: Date.now() - startTime,
      error: error.message
    };
  }
}

async function virtualUser(userId: number, endTime: number): Promise<void> {
  activeUsers++;
  
  while (Date.now() < endTime) {
    const result = await makeRequest();
    results.push(result);
    totalRequests++;
    
    if (result.success) {
      successfulRequests++;
    } else {
      failedRequests++;
    }
    
    // 隨機延遲 100-500ms 模擬真實用戶行為
    await new Promise(resolve => setTimeout(resolve, 100 + Math.random() * 400));
  }
  
  activeUsers--;
}

function calculatePercentile(times: number[], percentile: number): number {
  const sorted = [...times].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runLoadTest() {
  console.log('🚀 Gacha API 壓力測試');
  console.log('='.repeat(50));
  console.log(`📍 目標: ${BASE_URL}${CONFIG.targetEndpoint}`);
  console.log(`👥 虛擬用戶: ${CONFIG.virtualUsers} 人`);
  console.log(`⏱️  持續時間: ${CONFIG.durationSeconds} 秒`);
  console.log(`📦 Payload: ${JSON.stringify(CONFIG.payload)}`);
  console.log('='.repeat(50));
  console.log('');
  
  const startTime = Date.now();
  const endTime = startTime + (CONFIG.durationSeconds * 1000);
  
  // 啟動所有虛擬用戶
  console.log(`🏃 啟動 ${CONFIG.virtualUsers} 個虛擬用戶...`);
  const userPromises: Promise<void>[] = [];
  
  for (let i = 0; i < CONFIG.virtualUsers; i++) {
    // 漸進式啟動，避免瞬間衝擊
    await new Promise(resolve => setTimeout(resolve, 50));
    userPromises.push(virtualUser(i + 1, endTime));
  }
  
  // 顯示進度
  const progressInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const successRate = totalRequests > 0 ? ((successfulRequests / totalRequests) * 100).toFixed(1) : '0';
    console.log(`   [${elapsed}s] 請求: ${totalRequests} | 成功率: ${successRate}% | 活躍用戶: ${activeUsers}`);
  }, 5000);
  
  // 等待所有用戶完成
  await Promise.all(userPromises);
  clearInterval(progressInterval);
  
  const totalTime = (Date.now() - startTime) / 1000;
  
  // 計算統計
  const responseTimes = results.map(r => r.responseTime);
  const successRate = (successfulRequests / totalRequests) * 100;
  const rps = totalRequests / totalTime;
  
  const p50 = calculatePercentile(responseTimes, 50);
  const p90 = calculatePercentile(responseTimes, 90);
  const p95 = calculatePercentile(responseTimes, 95);
  const p99 = calculatePercentile(responseTimes, 99);
  const avgResponseTime = responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length;
  const minResponseTime = Math.min(...responseTimes);
  const maxResponseTime = Math.max(...responseTimes);
  
  // 錯誤統計
  const errorCounts: Record<string, number> = {};
  results.filter(r => !r.success).forEach(r => {
    const key = r.error || `HTTP ${r.statusCode}`;
    errorCounts[key] = (errorCounts[key] || 0) + 1;
  });
  
  console.log('');
  console.log('='.repeat(50));
  console.log('📊 測試結果');
  console.log('='.repeat(50));
  console.log('');
  console.log('【請求統計】');
  console.log(`   總請求數: ${totalRequests}`);
  console.log(`   成功: ${successfulRequests}`);
  console.log(`   失敗: ${failedRequests}`);
  console.log(`   成功率: ${successRate.toFixed(2)}%`);
  console.log(`   RPS (每秒請求): ${rps.toFixed(2)}`);
  console.log('');
  console.log('【回應時間】');
  console.log(`   最小: ${minResponseTime}ms`);
  console.log(`   最大: ${maxResponseTime}ms`);
  console.log(`   平均: ${avgResponseTime.toFixed(0)}ms`);
  console.log(`   P50 (中位數): ${p50}ms`);
  console.log(`   P90: ${p90}ms`);
  console.log(`   P95: ${p95}ms`);
  console.log(`   P99: ${p99}ms`);
  console.log('');
  
  if (Object.keys(errorCounts).length > 0) {
    console.log('【錯誤分布】');
    for (const [error, count] of Object.entries(errorCounts)) {
      console.log(`   ${error}: ${count} 次`);
    }
    console.log('');
  }
  
  console.log('【驗證結果】');
  const passSuccessRate = successRate >= 95;
  const passP95 = p95 <= 2000;
  console.log(`   ✅ 成功率 > 95%: ${passSuccessRate ? '通過' : '❌ 未通過'} (${successRate.toFixed(2)}%)`);
  console.log(`   ✅ P95 < 2000ms: ${passP95 ? '通過' : '❌ 未通過'} (${p95}ms)`);
  console.log('');
  console.log('='.repeat(50));
  
  if (passSuccessRate && passP95) {
    console.log('🎉 壓力測試通過！系統能承受目標負載。');
  } else {
    console.log('⚠️ 壓力測試未完全通過，需要優化。');
  }
}

runLoadTest().catch(console.error);
