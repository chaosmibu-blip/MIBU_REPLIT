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
| `docs/` | 13 個記憶庫，文件系統完善 |
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
- 資料操作保留在 `storage.ts`（或未來拆分）

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
  
  // 後台顯示
  label: text("label").notNull(),           // 中文標籤
  description: text("description"),          // 說明文字
  uiType: varchar("ui_type", { length: 20 }), // 'input' | 'select' | 'switch' | 'slider'
  uiOptions: jsonb("ui_options"),            // 下拉選項、slider 範圍等
  
  // 驗證規則
  validation: jsonb("validation"),           // { min: 1, max: 10 } 等
  
  // 權限
  editableBy: varchar("editable_by", { length: 20 }).default('admin'), // 'admin' | 'super_admin'
  
  // 時間戳
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: integer("updated_by"),
});

// 唯一約束
CREATE UNIQUE INDEX idx_system_configs_key ON system_configs(category, key);
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

// 1. 檔案大小檢查
function checkFileSize(dir: string, maxLines: number = 500) {
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    const lines = content.split('\n').length;
    
    if (lines > maxLines * 2) {
      results.push({
        category: '檔案大小',
        status: 'fail',
        message: `${file} 有 ${lines} 行，超過 ${maxLines * 2} 行上限`,
        details: { file, lines, limit: maxLines * 2 }
      });
    } else if (lines > maxLines) {
      results.push({
        category: '檔案大小',
        status: 'warn',
        message: `${file} 有 ${lines} 行，建議控制在 ${maxLines} 行以內`,
        details: { file, lines, suggested: maxLines }
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

// 3. 硬編碼數字檢查
function checkHardcodedNumbers(dir: string) {
  const patterns = [
    { regex: /\.default\((\d+)\)/g, name: '預設值' },
    { regex: /limit:\s*(\d+)/g, name: '限制值' },
    { regex: /quota.*?[=:]\s*(\d+)/gi, name: '額度' },
  ];
  
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.ts'));
  const findings: string[] = [];
  
  for (const file of files) {
    const content = fs.readFileSync(path.join(dir, file), 'utf-8');
    
    for (const pattern of patterns) {
      const matches = content.matchAll(pattern.regex);
      for (const match of matches) {
        const num = parseInt(match[1]);
        if (num > 1 && num < 1000) { // 排除常見的 0、1、大數
          findings.push(`${file}: ${pattern.name} = ${num}`);
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

// 執行檢查
async function runHealthCheck() {
  console.log('🏥 開始架構健康檢查...\n');
  
  checkFileSize('server');
  checkFileSize('server/lib');
  checkMemorySync();
  checkHardcodedNumbers('server');
  
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

### Phase 1：路由模組化（優先級高）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 1.1 | 建立 `server/routes/` 目錄結構 | 10 分鐘 |
| 1.2 | 拆分 auth 相關路由 | 30 分鐘 |
| 1.3 | 拆分 gacha 相關路由 | 45 分鐘 |
| 1.4 | 拆分 places 相關路由 | 45 分鐘 |
| 1.5 | 拆分 merchant 相關路由 | 45 分鐘 |
| 1.6 | 拆分其他路由 | 60 分鐘 |
| 1.7 | 建立路由註冊中心 | 20 分鐘 |
| 1.8 | 測試所有 API 端點 | 30 分鐘 |

### Phase 2：系統設定表（優先級中）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 2.1 | 新增 `system_configs` 資料表 | 15 分鐘 |
| 2.2 | 建立 ConfigService | 30 分鐘 |
| 2.3 | 遷移現有硬編碼參數 | 60 分鐘 |
| 2.4 | 建立管理後台 API | 45 分鐘 |
| 2.5 | 建立管理後台 UI | 90 分鐘 |

### Phase 3：健康檢查機制（優先級中）

| 步驟 | 內容 | 預估時間 |
|------|------|---------|
| 3.1 | 建立檢查腳本 | 45 分鐘 |
| 3.2 | 設定報告輸出 | 15 分鐘 |
| 3.3 | 建立報告模板 | 20 分鐘 |

---

## 📁 新增檔案清單

| 檔案 | 說明 |
|------|------|
| `server/routes/index.ts` | 路由註冊中心 |
| `server/routes/auth.ts` | 認證路由 |
| `server/routes/gacha.ts` | 扭蛋路由 |
| `server/routes/places.ts` | 景點路由 |
| `server/routes/merchant.ts` | 商家路由 |
| `server/routes/admin.ts` | 管理路由 |
| `server/services/configService.ts` | 設定服務 |
| `server/scripts/architecture-check.ts` | 架構檢查腳本 |

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
