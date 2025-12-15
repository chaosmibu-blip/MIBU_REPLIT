# AutoDraft 系統評估報告

## 概述
本文件評估 AutoDraft 系統的效能限制、最大處理量，以及建議的 AI 審查機制。

## 現有架構分析

### 核心流程
1. **快取優先**：先檢查 place_cache 資料表
2. **AI 生成**：若無快取，呼叫 Gemini API 生成地點
3. **Google 驗證**：使用 Google Places API 驗證地點真實性
4. **儲存快取**：驗證成功後存入 place_cache

### API 呼叫流程
```
用戶請求 → 檢查快取 → (命中) → 返回快取結果
                    → (未命中) → Gemini AI 生成 → Google Places 驗證 → 存入快取 → 返回結果
```

---

## Gemini API 限制分析

### 免費層級限制 (Gemini 2.5 Flash)
| 限制類型 | 數值 |
|---------|------|
| 每分鐘請求數 (RPM) | 15 |
| 每分鐘 Token 數 (TPM) | 1,000,000 |
| 每日請求數 (RPD) | 1,500 |

### 付費層級限制 (Pay-as-you-go)
| 限制類型 | 數值 |
|---------|------|
| 每分鐘請求數 (RPM) | 2,000 |
| 每分鐘 Token 數 (TPM) | 4,000,000 |
| 每日請求數 (RPD) | 無限 |

### 成本估算
- 輸入: $0.10 / 1M tokens (標準)
- 輸出: $0.40 / 1M tokens (標準)
- 單次地點生成估算: ~200 tokens 輸入 + ~100 tokens 輸出 ≈ $0.00006

---

## AutoDraft 最大值建議

### 批次生成建議
| 場景 | 建議最大值 | 原因 |
|-----|-----------|------|
| 單次手動觸發 | 50 個地點 | 避免長時間等待，約需 3-5 分鐘 |
| 每小時自動排程 | 100 個地點 | 預留 API 容量給即時請求 |
| 每日最大量 | 1,000 個地點 | 保守估算，預留 33% 容量 |

### 執行時間估算
| 地點數量 | 預估時間 (含重試) |
|---------|------------------|
| 10 個 | 30-60 秒 |
| 50 個 | 2-5 分鐘 |
| 100 個 | 5-10 分鐘 |
| 500 個 | 25-50 分鐘 |

---

## AI 審查機制建議

### 第一階段：自動品質篩選
在 Gemini 生成後、Google 驗證前加入以下檢查：

```typescript
interface QualityCheck {
  // 名稱長度檢查
  nameMinLength: 2;
  nameMaxLength: 50;
  
  // 描述品質檢查
  descriptionMinLength: 20;
  descriptionMaxLength: 200;
  
  // 禁用詞彙檢查
  blockedPatterns: string[];
  
  // 必須包含地區關鍵字
  requireDistrictMention: boolean;
}
```

### 第二階段：AI 複審機制
對於高價值地點（如熱門區域），加入二次 AI 審核：

```typescript
async function aiReviewPlace(place: GeneratedPlace): Promise<ReviewResult> {
  const prompt = `請評估以下推薦地點的品質：
  
地點名稱：${place.name}
描述：${place.description}
位置：${place.district}, ${place.region}
類型：${place.category}

請評分（1-10）並說明：
1. 適合觀光程度
2. 描述吸引力
3. 地點獨特性

回傳 JSON: { "score": number, "approved": boolean, "reason": string }`;

  return await callGemini(prompt);
}
```

### 第三階段：人工審核流程
- 所有 AutoDraft 生成的草稿預設狀態為 `pending`
- 管理員可在草稿審核頁面查看地圖預覽後決定發布
- 支援批次審核功能

---

## 實作建議

### 1. Rate Limiting 機制
```typescript
const rateLimiter = {
  geminiRPM: 10,  // 保守使用 10/15 的配額
  googleRPM: 50,  // Google Places API 限制
  retryDelayMs: 1000,
  maxRetries: 2
};
```

### 2. 批次處理佇列
```typescript
interface AutoDraftJob {
  id: string;
  regionId: number;
  categoryIds: number[];
  maxPlaces: number;
  priority: 'low' | 'normal' | 'high';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  createdAt: Date;
  completedAt?: Date;
  generatedCount: number;
  errorCount: number;
}
```

### 3. 監控與告警
- 追蹤每日 API 使用量
- 當使用量達到 80% 時發送告警
- 記錄失敗率並自動暫停高失敗率區域

---

## 結論

### 短期建議（立即可行）
1. ✅ 維持現有快取機制，減少重複 API 呼叫
2. ✅ 單次批次限制在 50 個地點以內
3. ✅ 所有 AutoDraft 結果進入人工審核流程

### 中期建議（1-2 週）
1. 加入基本品質篩選邏輯
2. 實作批次處理佇列
3. 加入 API 使用量監控

### 長期建議（1 個月+）
1. 升級為付費 Gemini API 以獲得更高限制
2. 實作 AI 二次審核機制
3. 建立區域品質評分系統

---

## 相關檔案
- `server/lib/placeGenerator.ts` - Gemini 呼叫與 Google 驗證
- `server/routes.ts` - API 路由（行 1341-1463 為核心邏輯）
- `server/storage.ts` - 快取儲存邏輯
- `client/src/pages/admin/PlaceDraftsReviewPage.tsx` - 草稿審核介面
