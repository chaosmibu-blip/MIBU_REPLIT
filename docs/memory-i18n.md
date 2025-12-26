# Mibu 國際化（i18n）架構

## 概述
支援四種語言：zh-TW（繁體中文，預設）、en（英文）、ja（日文）、ko（韓文）

---

## 資料庫架構

### JSONB 多語系欄位設計
採用 JSONB 欄位儲存多語系資料，新增語言不需改 schema：

```typescript
// places 表多語系欄位
placeNameI18n: jsonb("place_name_i18n"),     // { en: "...", ja: "...", ko: "..." }
descriptionI18n: jsonb("description_i18n"),   // { en: "...", ja: "...", ko: "..." }
addressI18n: jsonb("address_i18n"),           // { en: "...", ja: "...", ko: "..." }

// 地理層級表（countries, regions, districts）
nameZh: text("name_zh"),  // 繁中名稱（主要欄位）
nameEn: text("name_en"),  // 英文名稱
nameJa: text("name_ja"),  // 日文名稱
nameKo: text("name_ko"),  // 韓文名稱
```

### Fallback 機制
- zh-TW：使用原始欄位（description, place_name）
- en/ja/ko：優先使用 i18n 欄位，無則回退至 zh-TW

---

## 後端 API 多語系支援

### getLocalizedName (地理層級)
```typescript
const getLocalizedName = (item: any, lang: string): string => {
  switch (lang) {
    case 'ja': return item.nameJa || item.nameZh || item.nameEn;
    case 'ko': return item.nameKo || item.nameZh || item.nameEn;
    case 'en': return item.nameEn;
    default: return item.nameZh || item.nameEn;
  }
};
```

### getLocalizedDescription (景點描述)
```typescript
const getLocalizedDescription = (place: any, lang: string): string => {
  const i18n = place.descriptionI18n || place.description_i18n;
  const defaultDesc = place.description || '';
  if (!i18n) return defaultDesc;
  switch (lang) {
    case 'ja': return i18n.ja || defaultDesc;
    case 'ko': return i18n.ko || defaultDesc;
    case 'en': return i18n.en || defaultDesc;
    default: return defaultDesc;
  }
};
```

---

## 前端多語系支援

### 語言參數傳遞
前端透過 API 請求傳遞 `language` 參數：
```typescript
const response = await fetch('/api/gacha/itinerary', {
  method: 'POST',
  body: JSON.stringify({ countryId, regionId, language: 'ja', itemCount: 8 })
});
```

### 前端 getDescription 函數
```typescript
const getDescription = (item: any, language: Language = 'zh-TW'): string => {
  const i18n = item.descriptionI18n || item.description_i18n;
  const rawDesc = item.description || item.ai_description || '';
  
  // 處理 JSON 物件格式的 description，防止 "[object Object]"
  const resolveDesc = (desc: any): string => {
    if (typeof desc === 'string') return desc;
    if (desc && typeof desc === 'object') {
      return desc['zh-TW'] || desc['en'] || desc['ja'] || desc['ko'] || '';
    }
    return '';
  };
  
  const defaultDesc = resolveDesc(rawDesc);
  
  if (i18n && typeof i18n === 'object') {
    switch (language) {
      case 'ja': return i18n.ja || defaultDesc;
      case 'ko': return i18n.ko || defaultDesc;
      case 'en': return i18n.en || defaultDesc;
      default: return defaultDesc;
    }
  }
  return defaultDesc;
};
```

### UI 文字翻譯
位於 `client/src/constants.ts` 的 TRANSLATIONS 物件：
```typescript
export const TRANSLATIONS = {
  'zh-TW': { welcome: '歡迎', ... },
  'en': { welcome: 'Welcome', ... },
  'ja': { welcome: 'ようこそ', ... },
  'ko': { welcome: '환영합니다', ... }
};
```

---

## AI 多語描述生成

### batchGenerateDescriptionsI18n
位於 `server/lib/placeGenerator.ts`，一次生成四種語言描述：
```typescript
async function batchGenerateDescriptionsI18n(places: Place[]): Promise<Map<number, DescriptionI18n>> {
  // 批次生成 { zh-TW, en, ja, ko } 描述
  // 返回 Map<placeId, { zhTW: "...", en: "...", ja: "...", ko: "..." }>
}
```

---

## 相關檔案
| 檔案 | 用途 |
|------|------|
| shared/schema.ts | JSONB 多語欄位定義 |
| server/routes.ts | getLocalizedName/Description 函數 |
| server/lib/placeGenerator.ts | AI 多語描述生成 |
| client/src/constants.ts | TRANSLATIONS UI 翻譯 |
| client/src/components/CollectionGrid.tsx | 前端多語顯示 |

---

## 設計決策
1. **JSONB vs 獨立欄位**：選擇 JSONB 因彈性高，新增語言無需改 schema
2. **後端選擇 vs 前端選擇**：後端依據 language 參數選擇描述，簡化前端邏輯
3. **Fallback 策略**：優先使用對應語系，無則回退 zh-TW，確保永遠有內容顯示

---

## 更新日誌
| 日期 | 變更 |
|------|------|
| 2025-12-26 | 建立 i18n 架構，JSONB 欄位設計，前後端多語支援 |
