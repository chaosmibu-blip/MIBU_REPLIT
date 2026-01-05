# 架構優化藍圖
> **版本**: 1.0 | **建立日期**: 2026-01-05 | **狀態**: 待實作

---

## 📋 設計原則

| 原則 | 說明 | 具體做法 |
|------|------|---------|
| **擴充性** | 新功能不需重寫舊代碼 | 模組化拆分、依賴注入 |
| **穩定性** | Agent 容易理解與維護 | 檔案 < 500 行、職責單一 |
| **靈活度** | 非技術者可調整參數 | 系統設定表、管理後台 |

---

## 📊 現況分析

### 問題檔案

| 檔案 | 行數 | 問題 | 優先級 |
|------|-----|------|--------|
| `server/routes.ts` | 10,173 | 過大，混合多個領域邏輯 | 高 |
| `server/storage.ts` | 2,788 | 偏大，可按領域拆分 | 中 |
| 硬編碼參數 | 分散各處 | 無法動態調整 | 中 |

### 做得好的部分

| 項目 | 說明 |
|------|------|
| `server/lib/` | 已模組化（placeGenerator、categoryMapping 等） |
| `docs/` | 15 個記憶庫，文件系統完善 |
| `shared/schema.ts` | 型別定義集中 |

---

## ✅ 完成後效果

### 對開發者
- 每個檔案 < 500 行，Agent 更容易理解
- 職責明確，修改一處不影響其他
- 新增 API 只需在對應的路由檔案添加

### 對管理者
- 可在後台調整參數（扭蛋次數、商家上限等）
- 不需要工程師介入修改代碼
- 即時生效，無需重新部署

### 對系統
- 例行檢查確保架構健康
- 問題早期發現，避免技術債累積

---

## 🎯 優化目標

### 一、模組化拆分（擴充性）

#### 目標結構
```
server/
├── routes/
│   ├── index.ts          # 路由註冊中心
│   ├── auth.ts           # 認證：登入、登出、JWT
│   ├── user.ts           # 用戶：個人資料、設定
│   ├── gacha.ts          # 扭蛋：抽取、歷史、AI 排序
│   ├── places.ts         # 景點：CRUD、搜尋、收藏
│   ├── merchant.ts       # 商家：認領、商品、優惠券
│   ├── specialist.ts     # 策劃師：服務、訂單
│   ├── trip.ts           # 行程：規劃、分享
│   ├── admin.ts          # 管理：審核、公告、設定
│   ├── webhooks.ts       # Webhook：Stripe、Recur
│   └── seo.ts            # SEO：行程頁面 API
│
├── services/
│   ├── gachaService.ts   # 扭蛋業務邏輯
│   ├── placeService.ts   # 景點業務邏輯
│   └── subscriptionService.ts  # 訂閱業務邏輯
│
├── lib/                  # 工具函式（現有）
├── middleware/           # 中間件（現有）
└── index.ts              # 入口（現有）
```

#### 拆分規則
- 每個路由檔案 **< 500 行**
- 業務邏輯抽到 `services/`
- 資料操作保留在 `storage.ts`（Phase 1b 處理）

#### 跨領域關注點（共用邏輯）

拆分後需統一管理的共用邏輯：

| 類型 | 檔案位置 | 內容 |
|------|---------|------|
| 認證中間件 | `server/middleware/auth.ts` | JWT 驗證、角色檢查 |
| 錯誤處理 | `server/middleware/errorHandler.ts` | 統一錯誤格式 |
| 請求驗證 | `server/middleware/validate.ts` | Zod schema 驗證 |
| 共用型別 | `shared/types/` | DTOs、API 回應型別 |
| Rate Limit | `server/middleware/rateLimit.ts` | API 限流 |

---

### 一-b、Storage 層拆分（Phase 1b）

> **目標**：將 2,788 行的 `storage.ts` 按領域拆分

#### 目標結構
```
server/storage/
├── index.ts           # 統一匯出
├── userStorage.ts     # 用戶相關
├── placeStorage.ts    # 景點相關
├── gachaStorage.ts    # 扭蛋相關
├── merchantStorage.ts # 商家相關
├── tripStorage.ts     # 行程相關
└── adminStorage.ts    # 管理相關
```

#### 介面定義原則
```typescript
// 每個 storage 模組匯出明確介面
export interface IPlaceStorage {
  getById(id: number): Promise<Place | null>;
  search(query: PlaceSearchQuery): Promise<Place[]>;
  create(data: InsertPlace): Promise<Place>;
  update(id: number, data: Partial<Place>): Promise<Place>;
}
```

---

### 二、系統設定表（靈活度）

#### 新增 `system_configs` 資料表

```typescript
export const systemConfigs = pgTable("system_configs", {
  id: serial("id").primaryKey(),
  
  // 設定識別
  category: varchar("category", { length: 50 }).notNull(),  // 'gacha' | 'merchant' | 'places'
  key: varchar("key", { length: 100 }).notNull(),
  
  // 設定值
  value: jsonb("value").notNull(),
  valueType: varchar("value_type", { length: 20 }).notNull(), // 'number' | 'string' | 'boolean' | 'array' | 'object'
  defaultValue: jsonb("default_value"),      // 預設值（用於重置）
  
  // 後台顯示
  label: text("label").notNull(),           // 中文標籤
  description: text("description"),          // 說明文字
  uiType: varchar("ui_type", { length: 20 }), // 'input' | 'select' | 'switch' | 'slider'
  uiOptions: jsonb("ui_options"),            // 下拉選項、slider 範圍等
  
  // 驗證規則
  validation: jsonb("validation"),           // { min: 1, max: 10 } 等
  
  // 權限與保護
  editableBy: varchar("editable_by", { length: 20 }).default('admin'), // 'admin' | 'super_admin'
  isReadOnly: boolean("is_read_only").default(false),  // 唯讀保護，防止關鍵參數被誤改
  
  // 時間戳
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by"),
});

// 唯一約束
CREATE UNIQUE INDEX idx_system_configs_key ON system_configs(category, key);
```

#### Zod 驗證規範

寫入前必須驗證 JSONB 欄位：

```typescript
// shared/validators/configValidators.ts
import { z } from 'zod';

const ConfigValueSchemas = {
  'gacha:daily_free_quota': z.number().min(1).max(10),
  'gacha:places_per_gacha': z.number().min(3).max(10),
  'merchant:grace_period_days': z.number().min(1).max(14),
  // ...
};

export function validateConfigValue(category: string, key: string, value: any): boolean {
  const schema = ConfigValueSchemas[`${category}:${key}`];
  if (!schema) return true; // 無定義 schema 則放行
  return schema.safeParse(value).success;
}
```

#### 快取失效策略

| 部署模式 | 策略 |
|---------|------|
| 單機 | 進程內 Map 快取（現有方案） |
| 水平擴展 | 改用 Redis 快取，設定 TTL 5 分鐘 |

```typescript
// 未來水平擴展版本
class ConfigService {
  private redis: Redis;
  
  async get(category: string, key: string): Promise<any> {
    const cacheKey = `config:${category}:${key}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) return JSON.parse(cached);
    
    const config = await db.query.systemConfigs.findFirst({...});
    if (config) {
      await this.redis.setex(cacheKey, 300, JSON.stringify(config.value)); // TTL 5 分鐘
    }
    return config?.value ?? null;
  }
}
```

#### Seed 腳本規格

```typescript
// server/seed/configSeed.ts
const defaultConfigs = [
  { category: 'gacha', key: 'daily_free_quota', value: 3, label: '每日免費扭蛋次數', isReadOnly: false },
  { category: 'gacha', key: 'places_per_gacha', value: 5, label: '每次扭蛋景點數', isReadOnly: true },
  { category: 'merchant', key: 'grace_period_days', value: 3, label: '付款寬限天數', isReadOnly: false },
  // ...
];

export async function seedConfigs() {
  for (const config of defaultConfigs) {
    await db.insert(systemConfigs)
      .values({ ...config, defaultValue: config.value })
      .onConflictDoNothing();
  }
}
```

#### 可調整的參數範例

| 類別 | 參數 | 預設值 | 說明 | UI 類型 |
|------|------|--------|------|---------|
| gacha | `daily_free_quota` | 3 | 每日免費扭蛋次數 | slider |
| gacha | `places_per_gacha` | 5 | 每次扭蛋景點數 | slider |
| gacha | `duplicate_threshold` | 0.7 | SEO 去重閾值 | slider |
| merchant | `pro_place_limit` | 5 | Pro 商家行程卡上限 | input |
| merchant | `premium_place_limit` | 20 | Premium 商家行程卡上限 | input |
| merchant | `grace_period_days` | 3 | 付款失敗寬限天數 | input |
| places | `review_required` | true | 新景點是否需審核 | switch |
| places | `min_photos` | 1 | 最少照片數 | input |

#### 參數讀取服務

```typescript
// server/services/configService.ts
class ConfigService {
  private cache: Map<string, any> = new Map();
  
  async get(category: string, key: string): Promise<any> {
    const cacheKey = `${category}:${key}`;
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }
    
    const config = await db.query.systemConfigs.findFirst({
      where: and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ),
    });
    
    if (config) {
      this.cache.set(cacheKey, config.value);
      return config.value;
    }
    
    return null;
  }
  
  async set(category: string, key: string, value: any, userId: number): Promise<void> {
    await db.update(systemConfigs)
      .set({ value, updatedAt: new Date(), updatedBy: userId })
      .where(and(
        eq(systemConfigs.category, category),
        eq(systemConfigs.key, key)
      ));
    
    // 清除快取
    this.cache.delete(`${category}:${key}`);
  }
  
  clearCache(): void {
    this.cache.clear();
  }
}

export const configService = new ConfigService();
```

---

### 三、架構健康檢查機制

#### 檢查項目

| 檢查項目 | 標準 | 頻率 |
|---------|------|------|
| 檔案大小 | < 500 行（警告）、< 1000 行（強制） | 每次提交 |
| 硬編碼數字 | 應移至 system_configs | 每週 |
| 記憶庫更新 | 30 天內有更新 | 每週 |
| API 一致性 | 回應格式統一 | 每月 |
| 資料表索引 | 常用查詢有索引 | 每月 |
| 設定檔漂移 | JSON/YAML 格式正確 | 每次提交 |

#### 自動化檢查腳本

```typescript
// server/scripts/architecture-check.ts
import fs from 'fs';
import path from 'path';

interface CheckResult {
  category: string;
  status: 'pass' | 'warn' | 'fail';
  message: string;
  details?: any;
}

const results: CheckResult[] = [];

// 遞迴取得所有 .ts 檔案
function getAllTsFiles(dir: string): string[] {
  const files: string[] = [];
  
  function walk(currentDir: string) {
    if (!fs.existsSync(currentDir)) return;
    
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.ts')) {
        files.push(fullPath);
      }
    }
  }
  
  walk(dir);
  return files;
}

// 1. 檔案大小檢查（遞迴）
function checkFileSize(dir: string, maxLines: number = 500) {
  const files = getAllTsFiles(dir);
  
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const lines = content.split('\n').length;
    const relativePath = path.relative(process.cwd(), filePath);
    
    if (lines > maxLines * 2) {
      results.push({
        category: '檔案大小',
        status: 'fail',
        message: `${relativePath} 有 ${lines} 行，超過 ${maxLines * 2} 行上限`,
        details: { file: relativePath, lines, limit: maxLines * 2 }
      });
    } else if (lines > maxLines) {
      results.push({
        category: '檔案大小',
        status: 'warn',
        message: `${relativePath} 有 ${lines} 行，建議控制在 ${maxLines} 行以內`,
        details: { file: relativePath, lines, suggested: maxLines }
      });
    }
  }
}

// 2. 記憶庫同步檢查
function checkMemorySync() {
  const memoryFiles = fs.readdirSync('docs').filter(f => f.startsWith('memory-'));
  
  for (const file of memoryFiles) {
    const content = fs.readFileSync(path.join('docs', file), 'utf-8');
    const lastUpdated = content.match(/更新日期[：:]\s*(\d{4}-\d{2}-\d{2})/);
    
    if (lastUpdated) {
      const date = new Date(lastUpdated[1]);
      const daysSinceUpdate = (Date.now() - date.getTime()) / (1000 * 60 * 60 * 24);
      
      if (daysSinceUpdate > 30) {
        results.push({
          category: '記憶庫',
          status: 'warn',
          message: `${file} 已超過 30 天未更新`,
          details: { file, lastUpdated: lastUpdated[1], daysSinceUpdate: Math.floor(daysSinceUpdate) }
        });
      }
    }
  }
}

// 3. 硬編碼數字檢查（遞迴）
function checkHardcodedNumbers(dir: string) {
  const patterns = [
    { regex: /\.default\((\d+)\)/g, name: '預設值' },
    { regex: /limit:\s*(\d+)/g, name: '限制值' },
    { regex: /quota.*?[=:]\s*(\d+)/gi, name: '額度' },
  ];
  
  const files = getAllTsFiles(dir);
  const findings: string[] = [];
  
  for (const filePath of files) {
    const content = fs.readFileSync(filePath, 'utf-8');
    const relativePath = path.relative(process.cwd(), filePath);
    
    for (const pattern of patterns) {
      const matches = content.matchAll(pattern.regex);
      for (const match of matches) {
        const num = parseInt(match[1]);
        if (num > 1 && num < 1000) {
          findings.push(`${relativePath}: ${pattern.name} = ${num}`);
        }
      }
    }
  }
  
  if (findings.length > 5) {
    results.push({
      category: '硬編碼',
      status: 'warn',
      message: `發現 ${findings.length} 處硬編碼數字，建議移至系統設定`,
      details: findings.slice(0, 10)
    });
  }
}

// 4. 設定檔格式檢查
function checkConfigFiles() {
  const configPatterns = ['*.json', 'tsconfig.json', 'package.json'];
  const configFiles = ['tsconfig.json', 'package.json', 'drizzle.config.ts'];
  
  for (const file of configFiles) {
    if (!fs.existsSync(file)) continue;
    
    if (file.endsWith('.json')) {
      try {
        const content = fs.readFileSync(file, 'utf-8');
        JSON.parse(content);
      } catch (e) {
        results.push({
          category: '設定檔',
          status: 'fail',
          message: `${file} JSON 格式錯誤`,
          details: { file, error: (e as Error).message }
        });
      }
    }
  }
}

// 執行檢查
async function runHealthCheck() {
  console.log('🏥 開始架構健康檢查...\n');
  
  // 遞迴掃描所有目錄
  checkFileSize('server');
  checkMemorySync();
  checkHardcodedNumbers('server');
  checkConfigFiles();
  
  // 輸出報告
  const fails = results.filter(r => r.status === 'fail');
  const warns = results.filter(r => r.status === 'warn');
  
  console.log(`\n📊 檢查結果：`);
  console.log(`   ❌ 失敗：${fails.length}`);
  console.log(`   ⚠️ 警告：${warns.length}`);
  console.log(`   ✅ 通過：${results.length - fails.length - warns.length}`);
  
  if (fails.length > 0) {
    console.log('\n❌ 需要立即處理：');
    fails.forEach(f => console.log(`   - ${f.message}`));
  }
  
  if (warns.length > 0) {
    console.log('\n⚠️ 建議改善：');
    warns.forEach(w => console.log(`   - ${w.message}`));
  }
  
  // 輸出 JSON 報告
  const report = {
    timestamp: new Date().toISOString(),
    summary: { fails: fails.length, warns: warns.length, total: results.length },
    results
  };
  
  fs.writeFileSync('logs/architecture-report.json', JSON.stringify(report, null, 2));
  console.log('\n📝 完整報告已輸出至 logs/architecture-report.json');
  
  return report;
}

runHealthCheck();
```

#### 使用方式

```bash
# 手動執行
npx tsx server/scripts/architecture-check.ts

# 查看報告
cat logs/architecture-report.json
```

---

## 🔧 實作步驟

> **原則**：健康檢查先行，及早發現問題

### Phase 0：健康檢查機制（最先實作）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 0.1 | 建立 `server/scripts/architecture-check.ts` | 30 分鐘 |
| 0.2 | 設定遞迴掃描 + JSON 報告輸出 | 15 分鐘 |
| 0.3 | 執行首次檢查，記錄 baseline | 10 分鐘 |

### Phase 1：路由模組化（優先級高）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 1.1 | 建立 `server/routes/` 目錄結構 | 10 分鐘 |
| 1.2 | 抽取共用 middleware 至 `server/middleware/` | 30 分鐘 |
| 1.3 | 拆分 auth 相關路由 | 30 分鐘 |
| 1.4 | 拆分 gacha 相關路由 | 45 分鐘 |
| 1.5 | 拆分 places 相關路由 | 45 分鐘 |
| 1.6 | 拆分 merchant 相關路由 | 45 分鐘 |
| 1.7 | 拆分其他路由（admin、specialist、trip、seo） | 60 分鐘 |
| 1.8 | 建立路由註冊中心 `server/routes/index.ts` | 20 分鐘 |
| 1.9 | 執行健康檢查，確認無 fail | 10 分鐘 |
| 1.10 | 測試所有 API 端點 | 30 分鐘 |

### Phase 1b：Storage 層拆分（Phase 1 完成後）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 1b.1 | 建立 `server/storage/` 目錄結構 | 10 分鐘 |
| 1b.2 | 定義各領域 Storage 介面 | 30 分鐘 |
| 1b.3 | 拆分 userStorage、placeStorage | 45 分鐘 |
| 1b.4 | 拆分 gachaStorage、merchantStorage | 45 分鐘 |
| 1b.5 | 拆分 tripStorage、adminStorage | 45 分鐘 |
| 1b.6 | 建立統一匯出 `server/storage/index.ts` | 15 分鐘 |
| 1b.7 | 更新路由層引用 | 30 分鐘 |
| 1b.8 | 執行健康檢查 + 測試 | 20 分鐘 |

### Phase 2：系統設定表（優先級中）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 2.1 | 新增 `system_configs` 資料表（含 isReadOnly） | 15 分鐘 |
| 2.2 | 建立 Zod 驗證器 `shared/validators/configValidators.ts` | 20 分鐘 |
| 2.3 | 建立 ConfigService（含快取） | 30 分鐘 |
| 2.4 | 建立 seed 腳本 `server/seed/configSeed.ts` | 20 分鐘 |
| 2.5 | 執行 seed，初始化預設值 | 10 分鐘 |
| 2.6 | 遷移現有硬編碼參數 | 60 分鐘 |
| 2.7 | 建立管理後台 API（GET/PUT） | 45 分鐘 |
| 2.8 | 建立管理後台 UI | 90 分鐘 |

### Phase 3：跨專案自我驗證與修正機制

> **目標**：建立後端、Expo App、Web 前端三專案的自動化驗證與同步機制

#### 三專案架構圖

```
┌─────────────────────────────────────────────────────────────┐
│                    後端 (Replit - 本專案)                     │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ API 定義    │→ │ 契約產生器  │→ │ API_CONTRACT.json   │  │
│  │ routes/*.ts │  │ (自動匯出)  │  │ (唯一來源)          │  │
│  └─────────────┘  └─────────────┘  └──────────┬──────────┘  │
└───────────────────────────────────────────────┼─────────────┘
                                                │ 同步
                    ┌───────────────────────────┼───────────────────────────┐
                    ▼                           ▼                           │
┌─────────────────────────────┐   ┌─────────────────────────────┐          │
│     Expo App (另一專案)      │   │   Web 前端 (另一 Replit)     │          │
│  ┌────────────────────────┐ │   │  ┌────────────────────────┐ │          │
│  │ types/api.d.ts        │ │   │  │ types/api.d.ts        │ │          │
│  │ (從契約自動產生)        │ │   │  │ (從契約自動產生)        │ │          │
│  └────────────────────────┘ │   │  └────────────────────────┘ │          │
└─────────────────────────────┘   └─────────────────────────────┘          │
```

#### API 契約格式

```typescript
// docs/API_CONTRACT.json
{
  "version": "1.0.0",
  "generatedAt": "2026-01-05T12:00:00Z",
  "endpoints": {
    "GET /api/gacha/spin": {
      "request": { "query": { "city": "string?" } },
      "response": { "places": "Place[]", "remaining": "number" },
      "auth": "jwt"
    },
    "POST /api/auth/apple": {
      "request": { "body": { "identityToken": "string" } },
      "response": { "token": "string", "user": "User", "isNewUser": "boolean" },
      "auth": "none"
    }
  },
  "types": {
    "Place": { "id": "number", "name": "string", "category": "string" },
    "User": { "id": "string", "email": "string?", "role": "string" }
  }
}
```

#### 驗證層級

| 層級 | 時機 | 檢查內容 | 失敗處理 |
|------|------|---------|---------|
| **L1 語法** | 每次存檔 | TypeScript 編譯 | 即時報錯 |
| **L2 契約** | 每次改 API | 前端型別與契約一致 | 阻止提交 |
| **L3 單元** | 每次改邏輯 | 函式行為正確 | 自動修復或報錯 |
| **L4 整合** | 每日 | 前後端串接正常 | 通知開發者 |
| **L5 回歸** | 重大版本 | 全功能測試 | 阻止發布 |

#### 自我修正循環

```
Agent 改後端 API
      ↓
① 產生新契約 (API_CONTRACT.json)
      ↓
② 輸出「📱 給前端的同步指令」
      ↓
③ 前端 Agent 更新型別
      ↓
④ TypeScript 編譯
      ↓
  ┌───┴───┐
  │ 通過？ │
  └───┬───┘
  是 ↓   ↓ 否
 完成   ⑤ 分析錯誤
          ↓
       ⑥ 修改代碼
          ↓
       ⑦ 重新編譯 → 回到 ④
```

#### 後端驗證指令

```bash
# 完整驗證流程
npm run validate

# 包含：
# 1. tsc --noEmit          # 型別檢查
# 2. eslint .              # 程式碼風格
# 3. npm run test          # 單元測試
# 4. npm run contract:gen  # 產生契約
```

#### 契約產生器

```typescript
// server/scripts/generate-contract.ts
import fs from 'fs';
import path from 'path';

interface ApiEndpoint {
  method: string;
  path: string;
  request: { query?: object; body?: object };
  response: object;
  auth: 'none' | 'jwt' | 'session';
}

// 從路由檔案解析 API 定義
function parseRoutes(): ApiEndpoint[] {
  // 解析 server/routes/*.ts
  // 提取 JSDoc 註解中的型別定義
  return [];
}

// 產生契約 JSON
function generateContract() {
  const endpoints = parseRoutes();
  const contract = {
    version: require('../../package.json').version,
    generatedAt: new Date().toISOString(),
    endpoints: Object.fromEntries(
      endpoints.map(e => [`${e.method} ${e.path}`, e])
    ),
  };
  
  fs.writeFileSync(
    'docs/API_CONTRACT.json',
    JSON.stringify(contract, null, 2)
  );
  
  console.log('✅ API 契約已產生：docs/API_CONTRACT.json');
}

generateContract();
```

#### 前端同步指令模板

每次後端修改 API 後，輸出：

```markdown
## 📱 給前端的同步指令

### 變更摘要
- **Endpoint**: `POST /api/gacha/spin`
- **變更類型**: 回應新增欄位
- **影響範圍**: GachaScreen, useGacha hook

### TypeScript Interface 更新
\`\`\`typescript
// 舊版
interface SpinResponse {
  places: Place[];
}

// 新版（請更新）
interface SpinResponse {
  places: Place[];
  remaining: number;  // 新增：剩餘次數
}
\`\`\`

### 前端需要做的事
1. 更新 `types/api.d.ts` 中的 SpinResponse
2. 在 GachaScreen 顯示剩餘次數
3. 執行 `npm run validate` 確認無錯誤
```

#### 前端專案同步指令

**Expo App**
```bash
# 拉取最新契約
npm run contract:pull

# 腳本內容 (scripts/pull-contract.ts)
curl -s https://mibu-backend.replit.app/api/contract > types/API_CONTRACT.json
npx tsx scripts/generate-types.ts

# 驗證型別
npm run validate
```

**Web 前端 (另一 Replit)**
```bash
# 同上流程
npm run contract:pull
npm run validate
```

#### CI/排程觸發規則

| 觸發點 | 後端動作 | 前端動作 |
|--------|---------|---------|
| 後端推送 | 自動產生契約 + 版本號 +1 | — |
| 每日 00:00 | — | 自動拉取契約 + 編譯檢查 |
| 前端編譯失敗 | — | 發送 Slack/Discord 通知 |
| 手動觸發 | `npm run contract:gen` | `npm run contract:pull` |

#### 實作步驟

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 3.1 | 建立 `server/scripts/generate-contract.ts` | 60 分鐘 |
| 3.2 | 定義 API_CONTRACT.json 格式規範 | 30 分鐘 |
| 3.3 | 在 routes 加入 JSDoc 型別註解 | 90 分鐘 |
| 3.4 | 建立 `npm run validate` 腳本 | 30 分鐘 |
| 3.5 | 建立「給前端同步指令」模板 | 20 分鐘 |
| 3.6 | 更新 memory-api-dictionary.md 加入契約流程 | 30 分鐘 |
| 3.7 | 首次產生完整契約 | 30 分鐘 |
| 3.8 | 在 Expo/Web 專案建立 contract:pull 腳本 | 45 分鐘 |
| 3.9 | 設定每日排程檢查（GitHub Actions / Replit Cron） | 30 分鐘 |

---

## 📁 新增檔案清單

### Phase 0
| 檔案 | 說明 |
|------|------|
| `server/scripts/architecture-check.ts` | 架構健康檢查腳本 |

### Phase 1
| 檔案 | 說明 |
|------|------|
| `server/routes/index.ts` | 路由註冊中心 |
| `server/routes/auth.ts` | 認證路由 |
| `server/routes/user.ts` | 用戶路由 |
| `server/routes/gacha.ts` | 扭蛋路由 |
| `server/routes/places.ts` | 景點路由 |
| `server/routes/merchant.ts` | 商家路由 |
| `server/routes/specialist.ts` | 策劃師路由 |
| `server/routes/trip.ts` | 行程路由 |
| `server/routes/admin.ts` | 管理路由 |
| `server/routes/webhooks.ts` | Webhook 路由 |
| `server/routes/seo.ts` | SEO 路由 |
| `server/middleware/validate.ts` | 請求驗證中間件 |
| `server/middleware/errorHandler.ts` | 統一錯誤處理 |

### Phase 1b
| 檔案 | 說明 |
|------|------|
| `server/storage/index.ts` | Storage 統一匯出 |
| `server/storage/userStorage.ts` | 用戶資料存取 |
| `server/storage/placeStorage.ts` | 景點資料存取 |
| `server/storage/gachaStorage.ts` | 扭蛋資料存取 |
| `server/storage/merchantStorage.ts` | 商家資料存取 |
| `server/storage/tripStorage.ts` | 行程資料存取 |
| `server/storage/adminStorage.ts` | 管理資料存取 |

### Phase 2
| 檔案 | 說明 |
|------|------|
| `server/services/configService.ts` | 設定讀取服務 |
| `server/seed/configSeed.ts` | 設定 seed 腳本 |
| `shared/validators/configValidators.ts` | 設定值 Zod 驗證器 |

### Phase 3
| 檔案 | 說明 |
|------|------|
| `server/scripts/generate-contract.ts` | API 契約產生器 |
| `docs/API_CONTRACT.json` | API 契約檔（機器可讀） |
| `docs/SYNC_TEMPLATE.md` | 前端同步指令模板 |

---

## 🔄 例行維護流程

### 每次開發
```bash
# 提交前執行檢查
npx tsx server/scripts/architecture-check.ts
```
- 確認無「失敗」項目
- 記錄「警告」項目到待辦清單

### 每週一
1. 執行完整架構檢查
2. 更新過期的記憶庫文件
3. 處理累積的「警告」項目

### 每月
1. 與 Agent 一起進行架構審查
2. 討論是否需要進一步拆分
3. 評估系統設定表是否需要新增參數

---

## 📊 檢查報告範例

```
🏥 架構健康檢查報告 - 2026-01-05

📊 檢查結果：
   ❌ 失敗：1
   ⚠️ 警告：3
   ✅ 通過：12

❌ 需要立即處理：
   - server/routes.ts 有 10,173 行，超過 1,000 行上限

⚠️ 建議改善：
   - server/storage.ts 有 2,788 行，建議控制在 500 行以內
   - memory-merchant.md 已超過 30 天未更新
   - 發現 15 處硬編碼數字，建議移至系統設定

📋 優先處理建議：
   1. 將 routes.ts 按領域拆分
   2. 更新 memory-merchant.md
   3. 將硬編碼參數移至 system_configs
```

---

## 📚 記憶庫治理規範

### 唯一來源原則

> **每個功能只記錄在一個記憶庫**，避免資訊重複與不同步

當需要新增功能文件時：
1. 確認該功能的職權歸屬
2. 更新對應的**唯一記憶庫**
3. 若跨越多個領域，選擇「主要職責」的記憶庫

### 完整索引（15 個記憶庫）

#### 功能模組（業務邏輯）

| 檔案 | 職權範圍 | 唯一負責內容 | 相關 API 前綴 |
|------|---------|-------------|--------------|
| `memory-travel-gacha.md` | 行程扭蛋 | Gacha V1/V2/V3 邏輯、**採集/審核/升級流程**、去重保護、七大分類、黑名單 | `/api/gacha/*` |
| `memory-trip-planner.md` | 旅程策劃 | 天數管理、活動排程、旅伴邀請 | `/api/trips/*` |
| `memory-user-client.md` | 用戶端 | 用戶 App 功能：背包、通知、收藏、每日額度 | `/api/users/*`, `/api/backpack/*` |
| `memory-merchant.md` | 商家端 | 商家認領、優惠券發放、**訂閱方案權限**、數據報表 | `/api/merchants/*` |
| `memory-specialist.md` | 專員端 | 策劃師服務、訂單管理、等級制度 | `/api/specialists/*` |
| `memory-admin.md` | 管理端 | 後台 UI、用戶/商家/專員審核、公告管理（不含採集流程） | `/api/admin/*` |
| `memory-web-official.md` | 官方網站 | Next.js 官網、程式化 SEO、商家訂閱購買流程 | `/api/seo/*` |

#### 基礎設施（跨模組共用）

| 檔案 | 職權範圍 | 唯一負責內容 | 使用場景 |
|------|---------|-------------|---------|
| `memory-data-schema.md` | 資料架構 | 47 張表定義、欄位關聯、約束條件 | 修改任何資料表時 |
| `memory-api-dictionary.md` | API 規範 | 所有端點清單、請求/回應格式、錯誤代碼、分頁規範 | 新增/修改 API 時 |
| `memory-auth.md` | 認證權限 | JWT、Session、Apple/Google Sign In、RBAC 角色 | 認證相關修改 |
| `memory-payment-commerce.md` | 金流商品 | Stripe 整合、購物車、訂單生命週期 | 金流/商品邏輯 |
| `memory-sos-safety.md` | SOS 安全 | 緊急求助、位置分享、警報觸發 | 安全功能開發 |
| `memory-integrations.md` | 第三方整合 | Google Places API、Gemini AI、Mapbox、Twilio | 外部 API 調用 |
| `memory-deployment.md` | 部署環境 | 環境變數、**開發→正式同步流程**、排程任務 | 部署/環境設定 |
| `memory-i18n.md` | 國際化 | 四語支援、JSONB 多語欄位、Fallback 機制 | 多語系功能 |

### 強制查閱規則

| 動作類型 | 必讀記憶庫 | 原因 |
|---------|-----------|------|
| 採集/審核/升級景點 | `memory-travel-gacha.md` | 唯一流程定義處 |
| 修改資料表結構 | `memory-data-schema.md` | 確認欄位關聯 |
| 新增/修改 API | `memory-api-dictionary.md` | 確認命名規範與錯誤碼 |
| 認證相關修改 | `memory-auth.md` | JWT/Session 規範 |
| 第三方 API 調用 | `memory-integrations.md` | API Key 與呼叫慣例 |
| 金流/商品邏輯 | `memory-payment-commerce.md` | Stripe/Recur 整合規範 |
| 官網開發 | `memory-web-official.md` | SEO 頁面、訂閱購買流程 |
| 部署/環境變數 | `memory-deployment.md` | 環境配置 |

### 記憶庫健康標準

| 項目 | 標準 | 檢查方式 |
|------|------|---------|
| 更新頻率 | 30 天內有更新 | 檢查「更新日期」欄位 |
| 內容結構 | 有「模組範圍」開頭說明 | 人工檢查 |
| 職權邊界 | 無與其他記憶庫重複的內容 | 交叉比對 |
| API 對應 | 列出相關的 API 端點 | 與 api-dictionary 核對 |

### 衝突解決機制

當同一功能可能歸屬於多個記憶庫時：

1. **流程優先**：如果是一個完整流程（如採集→審核→升級），歸屬於流程主記憶庫
2. **業務優先**：業務邏輯歸功能模組，技術細節歸基礎設施
3. **指向原則**：其他記憶庫可用 `> 參見 xxx.md` 指向唯一來源

#### 衝突解決操作步驟

| 步驟 | 負責人 | 時間窗 | 動作 |
|------|--------|--------|------|
| 1. 發現衝突 | Agent | 即時 | 在對話中標註「⚠️ 記憶庫歸屬待確認」 |
| 2. 判斷歸屬 | Agent | 5 分鐘內 | 依據上述三原則判斷 |
| 3. 確認歸屬 | 用戶（可選） | 若有疑慮則詢問 | 用戶確認或 Agent 自行決定 |
| 4. 執行修正 | Agent | 即時 | 移動內容至唯一來源，原位置加「參見」指向 |
| 5. 更新索引 | Agent | 即時 | 若有結構變更，更新 replit.md |

範例：
```markdown
# memory-admin.md

## 景點採集

> ⚠️ **職權說明**：採集/審核/升級流程請參閱 `memory-travel-gacha.md`
```

---

## 🔗 相關藍圖

- [程式化 SEO 藍圖](./blueprint-seo.md)
- [商家訂閱金流藍圖](./blueprint-merchant-subscription.md)
