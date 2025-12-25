# 行程扭蛋模組 (Travel Gacha Module)

> 最後更新：2025-12-25

## 概述
行程扭蛋是 Mibu 核心功能，透過隨機抽選方式為旅客推薦行程地點。

## 資料流程
```
Google Places API → place_cache（原始採集）
                          ↓
                    AI 批次審核
                          ↓
         ┌────────────────┴────────────────┐
         ↓                                  ↓
      places（通過）              place_drafts（不通過/待修改）
```

## 批次採集流程 (2025-12-25 更新)
1. **關鍵字擴散**：Gemini AI 將基礎關鍵字擴展為 8-10 個子關鍵字
2. **Google 搜尋**：每個關鍵字最多 3 頁（每頁 20 筆）
3. **過濾**：白名單類別 + 黑名單排除 + 名稱黑名單
4. **去重**：以 `google_place_id` 為主鍵去重
5. **AI 審核**：批次呼叫 Gemini 審核地點品質

## 批次生成參數限制
| 模式 | 最大關鍵字 | 最大頁數 |
|------|-----------|---------|
| batch-preview | 5 | 2 |
| batch-generate | 10 | 3 |

## 黑名單類別
- 政府機關：區公所、鄉公所、市政府、警察局、消防局
- 醫療機構：醫院、診所、牙醫、藥局
- 交通設施：停車場、加油站、車站
- 金融機構：銀行、ATM
- 殯葬服務：殯儀館、靈骨塔

## Gacha Pull 回傳結構
```typescript
interface GachaPullResponse {
  success: boolean;
  pull: {
    location: { district, region, country };
    category: { id, code, name, colorHex };
    subcategory: { id, code, name };
    place: { ... };
    meta: { source, isVerified };
  };
}
```

## 相關 API
- `POST /api/gacha/pull` - 單抽
- `POST /api/gacha/itinerary/v3` - 多抽行程
- `POST /api/admin/places/batch-preview` - 預覽採集
- `POST /api/admin/places/batch-generate` - 執行採集
