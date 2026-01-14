# MIBU 後端效能優化建議 - DAU 1000

> 分析日期：2026-01-14
> 目標規模：日活躍用戶 1,000 人

---

## 執行摘要

針對 MIBU 後端 API（Node.js + Express + Drizzle ORM + PostgreSQL），分析現有架構後，提出以下優化建議。目前系統已有基礎效能設定（連線池、預熱、重試機制），但在高流量場景下仍有優化空間。

### 預估流量（DAU 1000）
| 指標 | 估算值 |
|------|--------|
| 每日扭蛋請求 | ~3,000 次（每人平均 3 次） |
| 每日 API 總請求 | ~30,000 次 |
| 尖峰時段並發 | ~50-100 req/s |
| AI 呼叫成本 | ~$5-10/day（Gemini API） |

---

## 1. 立即可做（Quick Wins）

> 預估時間：1-2 小時內可完成

### 1.1 新增關鍵索引

**問題描述**
- `collections` 表的 `userId + collectedAt` 組合查詢沒有複合索引
- `getRecentCollectionPlaceIds()` 每次扭蛋都會查詢，影響響應速度

**影響程度**：高

**具體解法**
```typescript
// shared/schema.ts - collections 表新增索引
index("IDX_collections_user_collected").on(table.userId, table.collectedAt),
```

**預期效果**
- 去重查詢從 ~50ms 降至 ~5ms
- 每次扭蛋節省 45ms

---

### 1.2 Gacha 去重結果快取

**問題描述**
- 每次扭蛋都重新查詢用戶最近 36 筆收藏
- 同一用戶短時間內多次抽卡，重複查詢相同資料

**影響程度**：中

**具體解法**
```typescript
// server/lib/utils/gacha.ts
// 新增 LRU 快取，TTL 5 分鐘
const dedupCache = new Map<string, { ids: number[], timestamp: number }>();
const DEDUP_CACHE_TTL = 5 * 60 * 1000; // 5 分鐘

export async function getCachedRecentCollectionIds(
  userId: string,
  storage: any
): Promise<number[]> {
  const now = Date.now();
  const cached = dedupCache.get(userId);

  if (cached && now - cached.timestamp < DEDUP_CACHE_TTL) {
    return cached.ids;
  }

  const ids = await storage.getRecentCollectionPlaceIds(userId, 36);
  dedupCache.set(userId, { ids, timestamp: now });
  return ids;
}

// 抽卡成功後更新快取
export function invalidateDedupCache(userId: string): void {
  dedupCache.delete(userId);
}
```

**預期效果**
- 減少 80% 的去重查詢
- 單次扭蛋響應時間減少 30-50ms

---

### 1.3 優化 Trip Dedup 查詢

**問題描述**
- `checkTripDedup()` 每次都從資料庫取 1000 筆已發布行程
- 在記憶體中逐一比對，效率低下

**影響程度**：中

**具體解法**
```typescript
// server/storage/gachaStorage.ts
// 改用資料庫層級去重，利用 JSONB 比對
async checkTripDedup(orderedPlaceIds?: number[]): Promise<boolean> {
  if (!orderedPlaceIds || orderedPlaceIds.length < 3) {
    return false;
  }

  const sortedIds = [...orderedPlaceIds].sort((a, b) => a - b);

  // 用資料庫查詢取代記憶體比對
  const [existing] = await db
    .select({ id: gachaAiLogs.id })
    .from(gachaAiLogs)
    .where(and(
      eq(gachaAiLogs.isPublished, true),
      // PostgreSQL JSONB 陣列比對
      sql`ARRAY(SELECT jsonb_array_elements_text(${gachaAiLogs.orderedPlaceIds})::int ORDER BY 1) = ${sortedIds}`
    ))
    .limit(1);

  return !existing;
}
```

**預期效果**
- 查詢時間從 ~200ms 降至 ~20ms
- 減少記憶體消耗

---

### 1.4 啟用 Drizzle Query 日誌（開發環境）

**問題描述**
- 目前無法追蹤慢查詢來源
- 難以識別 N+1 問題

**影響程度**：低（但對後續優化很重要）

**具體解法**
```typescript
// server/db.ts
export const db = drizzle(pool, {
  schema,
  logger: process.env.NODE_ENV === 'development' ? {
    logQuery: (query, params) => {
      const start = Date.now();
      console.log(`[SQL] ${query.slice(0, 200)}...`);
    }
  } : undefined
});
```

**預期效果**
- 便於識別效能瓶頸
- 發現潛在的 N+1 查詢

---

## 2. 短期優化

> 預估時間：1-2 天可完成

### 2.1 商家認領資料批次載入（修復 N+1）

**問題描述**
- Gacha V3 迴圈中呼叫 `getClaimByOfficialPlaceId()`
- 7 張卡 = 7 次資料庫查詢
- 典型的 N+1 問題

**影響程度**：高

**具體解法**
```typescript
// server/storage/gachaStorage.ts - 新增批次查詢方法
async getClaimsByOfficialPlaceIds(placeIds: number[]): Promise<Map<number, { claim: MerchantPlaceLink; coupons: Coupon[] }>> {
  const claims = await db
    .select()
    .from(merchantPlaceLinks)
    .where(and(
      inArray(merchantPlaceLinks.officialPlaceId, placeIds),
      eq(merchantPlaceLinks.status, 'approved')
    ));

  if (claims.length === 0) {
    return new Map();
  }

  const claimedPlaceIds = claims.map(c => c.officialPlaceId!);
  const allCoupons = await db
    .select()
    .from(coupons)
    .where(and(
      inArray(coupons.placeId, claimedPlaceIds),
      eq(coupons.isActive, true),
      eq(coupons.archived, false),
      sql`${coupons.remainingQuantity} > 0`
    ));

  const result = new Map<number, { claim: MerchantPlaceLink; coupons: Coupon[] }>();
  for (const claim of claims) {
    const placeId = claim.officialPlaceId!;
    result.set(placeId, {
      claim,
      coupons: allCoupons.filter(c => c.placeId === placeId)
    });
  }
  return result;
}
```

```typescript
// server/routes/gacha/gacha-v3.ts - 使用批次查詢
const placeIds = finalPlaces.map(p => p.id);
const claimsMap = await storage.getClaimsByOfficialPlaceIds(placeIds);

for (const place of finalPlaces) {
  const claimInfo = claimsMap.get(place.id);
  // ... 處理邏輯
}
```

**預期效果**
- 資料庫查詢從 N+1 降至 2 次
- 每次扭蛋節省 100-200ms

---

### 2.2 AI 排序結果快取

**問題描述**
- 相同景點組合可能產生相似的排序結果
- 每次都重新呼叫 Gemini API
- AI 呼叫是最大的效能瓶頸（~500-2000ms）

**影響程度**：高

**具體解法**
```typescript
// server/lib/aiSortCache.ts
import crypto from 'crypto';

const aiSortCache = new Map<string, { order: number[], reason: string, timestamp: number }>();
const AI_CACHE_TTL = 30 * 60 * 1000; // 30 分鐘
const MAX_CACHE_SIZE = 1000;

function generateCacheKey(places: any[]): string {
  // 用景點 ID 排序後產生 hash
  const ids = places.map(p => p.id).sort((a, b) => a - b);
  return crypto.createHash('md5').update(ids.join(',')).digest('hex');
}

export async function getAiSortWithCache(
  places: any[],
  aiSortFn: () => Promise<{ order: number[], reason: string }>
): Promise<{ order: number[], reason: string, fromCache: boolean }> {
  const key = generateCacheKey(places);
  const cached = aiSortCache.get(key);

  if (cached && Date.now() - cached.timestamp < AI_CACHE_TTL) {
    return { ...cached, fromCache: true };
  }

  const result = await aiSortFn();

  // LRU 淘汰
  if (aiSortCache.size >= MAX_CACHE_SIZE) {
    const oldest = [...aiSortCache.entries()].sort((a, b) => a[1].timestamp - b[1].timestamp)[0];
    aiSortCache.delete(oldest[0]);
  }

  aiSortCache.set(key, { ...result, timestamp: Date.now() });
  return { ...result, fromCache: false };
}
```

**預期效果**
- 熱門區域重複抽卡可直接使用快取
- 減少 30-50% AI 呼叫
- 每次快取命中節省 500-2000ms

---

### 2.3 景點池預載入與快取

**問題描述**
- 每次扭蛋都查詢 `getOfficialPlacesByCity` 或 `getOfficialPlacesByDistrict`
- 景點資料變更頻率低，適合快取

**影響程度**：中

**具體解法**
```typescript
// server/lib/placePoolCache.ts
interface PlacePoolCache {
  places: Place[];
  timestamp: number;
}

const poolCache = new Map<string, PlacePoolCache>();
const POOL_CACHE_TTL = 10 * 60 * 1000; // 10 分鐘

export async function getCachedPlacePool(
  city: string,
  district: string | undefined,
  storage: any
): Promise<Place[]> {
  const key = district ? `${city}:${district}` : `${city}:*`;
  const cached = poolCache.get(key);

  if (cached && Date.now() - cached.timestamp < POOL_CACHE_TTL) {
    return cached.places;
  }

  const places = district
    ? await storage.getOfficialPlacesByDistrict(city, district, 200)
    : await storage.getOfficialPlacesByCity(city, 200);

  poolCache.set(key, { places, timestamp: Date.now() });
  return places;
}

// 景點更新時清除快取
export function invalidatePlacePoolCache(city?: string): void {
  if (city) {
    for (const key of poolCache.keys()) {
      if (key.startsWith(`${city}:`)) {
        poolCache.delete(key);
      }
    }
  } else {
    poolCache.clear();
  }
}
```

**預期效果**
- 熱門城市/區域抽卡響應更快
- 減少資料庫負載
- 每次快取命中節省 50-100ms

---

### 2.4 回應壓縮

**問題描述**
- 扭蛋 API 回傳大量景點資料
- 7 張卡約 15-20KB JSON
- 行動網路傳輸較慢

**影響程度**：中

**具體解法**
```typescript
// server/index.ts
import compression from 'compression';

// 在 express.json() 之後加入
app.use(compression({
  filter: (req, res) => {
    // 只壓縮 API 回應
    if (req.path.startsWith('/api')) {
      return compression.filter(req, res);
    }
    return false;
  },
  threshold: 1024, // 超過 1KB 才壓縮
}));
```

**預期效果**
- 回應大小減少 60-70%
- 行動端感知速度提升

---

### 2.5 資料庫連線池監控

**問題描述**
- 目前連線池設定為 max: 25
- 無法觀察實際使用情況

**影響程度**：低（但對營運重要）

**具體解法**
```typescript
// server/routes/admin/health.ts
router.get('/api/admin/health/db', async (req, res) => {
  const stats = getPoolStats();
  res.json({
    pool: {
      total: stats.totalCount,
      idle: stats.idleCount,
      waiting: stats.waitingCount,
      utilizationPercent: ((stats.totalCount - stats.idleCount) / 25 * 100).toFixed(1),
    },
    recommendation: stats.waitingCount > 0
      ? '考慮增加 max 連線數'
      : '連線池狀態正常',
  });
});
```

**預期效果**
- 即時監控連線池健康狀態
- 提前發現連線耗盡問題

---

## 3. 中期規劃

> 預估時間：需要較大改動，1-2 週

### 3.1 引入 Redis 快取層

**問題描述**
- 目前所有快取都在記憶體中
- 伺服器重啟後快取失效
- 多實例部署時快取不共享

**影響程度**：高（架構升級）

**具體解法**
```typescript
// server/lib/redis.ts
import Redis from 'ioredis';

const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
  },

  async set(key: string, value: any, ttlSeconds: number): Promise<void> {
    await redis.setex(key, ttlSeconds, JSON.stringify(value));
  },

  async del(pattern: string): Promise<void> {
    const keys = await redis.keys(pattern);
    if (keys.length > 0) {
      await redis.del(...keys);
    }
  },
};
```

**快取策略**
| 資料類型 | Key 格式 | TTL | 說明 |
|---------|---------|-----|------|
| 去重列表 | `dedup:${userId}` | 5 分鐘 | 用戶最近收藏 |
| 景點池 | `pool:${city}:${district}` | 10 分鐘 | 區域景點 |
| AI 排序 | `ai:${hash}` | 30 分鐘 | 排序結果 |
| 區域資料 | `region:${regionId}` | 1 小時 | 不常變更 |

**預期效果**
- 快取持久化，重啟不丟失
- 支援多實例部署
- 整體響應時間減少 40-60%

---

### 3.2 非同步 AI 排序（背景處理）

**問題描述**
- AI 排序是最大瓶頸（500-2000ms）
- 用戶必須等待 AI 完成才能看到結果

**影響程度**：高（用戶體驗提升）

**具體解法**

**方案 A：先返回、後優化**
```typescript
// server/routes/gacha/gacha-v3.ts
// 1. 先用座標排序快速返回
const quickSortedPlaces = sortByCoordinates(selectedPlaces);

// 2. 背景執行 AI 排序
const sessionId = crypto.randomUUID();
res.json({
  success: true,
  sessionId,
  itinerary: formatItinerary(quickSortedPlaces),
  meta: { sortingMethod: 'coordinate', aiPending: true }
});

// 3. 非同步 AI 排序（不阻塞回應）
setImmediate(async () => {
  try {
    const aiSorted = await aiReorderPlaces(selectedPlaces);
    // 更新資料庫中的排序結果
    await storage.updateGachaAiLog(sessionId, {
      orderedPlaceIds: aiSorted.map(p => p.id),
      aiReason: aiSorted.reason
    });
    // 透過 WebSocket 通知前端更新
    io.to(`user:${userId}`).emit('itinerary:optimized', { sessionId, itinerary: aiSorted });
  } catch (err) {
    console.error('[AI Background] Sort failed:', err);
  }
});
```

**方案 B：預計算熱門路線**
```typescript
// server/scripts/precompute-popular-routes.ts
// 每日凌晨預計算熱門區域的 AI 排序
for (const district of popularDistricts) {
  const places = await storage.getOfficialPlacesByDistrict(city, district, 200);
  const combinations = generateTopCombinations(places, 10); // 前 10 種組合

  for (const combo of combinations) {
    const sorted = await aiReorderPlaces(combo);
    await cache.set(`precomputed:${hash(combo)}`, sorted, 24 * 60 * 60);
  }
}
```

**預期效果**
- 方案 A：用戶感知響應時間從 2-3 秒降至 500ms
- 方案 B：熱門路線直接命中預計算，接近即時響應

---

### 3.3 資料庫讀寫分離

**問題描述**
- 單一資料庫處理所有讀寫
- 扭蛋讀取操作佔 90% 以上
- 寫入（collections）可能影響讀取效能

**影響程度**：中（基礎架構升級）

**具體解法**
```typescript
// server/db.ts
// Neon 支援 read replica
const writePool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
});

const readPool = new Pool({
  connectionString: process.env.DATABASE_URL_READ || process.env.DATABASE_URL,
  max: 25,
});

export const writeDb = drizzle(writePool, { schema });
export const readDb = drizzle(readPool, { schema });

// 使用範例
// 讀取操作用 readDb
const places = await readDb.select().from(places).where(...);

// 寫入操作用 writeDb
await writeDb.insert(collections).values(...);
```

**預期效果**
- 讀寫分離，互不影響
- 讀取效能提升 30-50%
- 支援更高並發

---

### 3.4 Gacha API 回應結構優化

**問題描述**
- 目前回傳完整景點資料（含所有欄位）
- 行動端只需要部分欄位
- 回傳 `place` 物件包含重複資料

**影響程度**：中

**具體解法**
```typescript
// 移除重複欄位，精簡回應結構
interface OptimizedItineraryItem {
  id: number;
  placeName: string;
  category: string;
  categoryCode: string;
  subCategory?: string | null;
  description?: string | null; // 可考慮只傳前 100 字
  address?: string | null;
  location?: { lat: number; lng: number } | null;
  googlePlaceId?: string | null;
  timeSlot: string;
  colorHex: string;
  coupon?: { id: number; title: string; code: string } | null;
  // 移除 place 完整物件（與上層重複）
  // 移除 couponWon（與 coupon 重複）
  // 移除 rarity（可由前端計算）
}
```

**預期效果**
- 回應大小減少 40-50%
- 減少行動端解析時間

---

### 3.5 實施請求排隊機制

**問題描述**
- 尖峰時段可能大量請求同時打到 AI
- Gemini API 有 rate limit
- 可能導致部分請求失敗

**影響程度**：中

**具體解法**
```typescript
// server/lib/aiQueue.ts
import PQueue from 'p-queue';

// 限制同時進行的 AI 請求
const aiQueue = new PQueue({
  concurrency: 5,        // 最多 5 個同時請求
  interval: 1000,        // 每秒
  intervalCap: 10,       // 每秒最多 10 個
});

export async function queuedAiRequest<T>(
  fn: () => Promise<T>,
  priority: number = 0
): Promise<T> {
  return aiQueue.add(fn, { priority });
}

// 使用
const result = await queuedAiRequest(() => callGeminiApi(prompt));
```

**預期效果**
- 避免 AI API rate limit
- 請求有序處理，避免競爭
- 可設定優先級（VIP 用戶優先）

---

## 4. 效能監控建議

### 4.1 關鍵指標追蹤

| 指標 | 目標值 | 警報閾值 |
|------|--------|---------|
| Gacha API P95 響應時間 | < 2s | > 5s |
| DB 連線池使用率 | < 70% | > 90% |
| AI 呼叫成功率 | > 99% | < 95% |
| 每日錯誤數 | < 10 | > 50 |

### 4.2 建議監控工具

- **APM**: New Relic / Datadog（追蹤請求鏈路）
- **日誌**: 結構化 JSON 日誌 + 集中收集
- **告警**: Slack / Discord webhook

---

## 5. 實施優先級總覽

| 優先級 | 項目 | 預估收益 | 難度 |
|--------|------|---------|------|
| P0 | 1.1 新增關鍵索引 | 高 | 低 |
| P0 | 2.1 商家認領批次載入 | 高 | 中 |
| P1 | 1.2 去重結果快取 | 中 | 低 |
| P1 | 2.2 AI 排序結果快取 | 高 | 中 |
| P1 | 2.3 景點池預載入 | 中 | 中 |
| P2 | 1.3 Trip Dedup 優化 | 中 | 中 |
| P2 | 2.4 回應壓縮 | 中 | 低 |
| P3 | 3.1 Redis 快取層 | 高 | 高 |
| P3 | 3.2 非同步 AI 排序 | 高 | 高 |
| P3 | 3.3 讀寫分離 | 中 | 高 |

---

## 6. 預估效能提升

| 場景 | 優化前 | 優化後（Quick Wins） | 優化後（短期） | 優化後（中期） |
|------|--------|-------------------|--------------|--------------|
| 單次扭蛋 P50 | ~1.5s | ~1.2s | ~0.8s | ~0.3s |
| 單次扭蛋 P95 | ~3s | ~2.5s | ~1.5s | ~0.8s |
| DB 查詢次數 | ~15 次 | ~10 次 | ~5 次 | ~3 次 |
| 支援並發 | ~50 | ~80 | ~150 | ~300 |

---

## Changelog

### 2026-01-14 - 初版
- 完成系統架構分析
- 提出 15 項優化建議
- 分類為立即可做、短期、中期三個階段
