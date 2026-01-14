# 第三方服務整合文檔

> 最後更新：2026-01-14

---

## 快速總覽

| 分類 | 服務 | 狀態 | 用途 | 環境變數 |
|------|------|------|------|----------|
| **認證** | Apple Sign In | ✅ 已用 | iOS 登入 | `APPLE_CLIENT_ID` |
| | Google Sign In | 🔄 計畫 | Android 登入 | - |
| **AI** | Google Gemini | ✅ 已用 | 景點審核、扭蛋排序 | `AI_INTEGRATIONS_*` |
| **地圖** | Google Places | ✅ 已用 | 景點採集 | `GOOGLE_MAPS_API_KEY` |
| | Mapbox | ✅ 已用 | 前端地圖顯示 | `MAPBOX_ACCESS_TOKEN` |
| **通訊** | Twilio Conversations | ✅ 已用 | 專員/旅伴聊天 | `TWILIO_*` (5個) |
| | Twilio SMS | ✅ 已用 | SOS 簡訊 | 同上 |
| | FCM | 🔄 計畫 | APP 推播通知 | - |
| **金流** | Stripe | ✅ 已用 | 國際支付 | `STRIPE_*` |
| | Recur | ✅ 已用 | 台灣本地支付 | `RECUR_*` |
| **廣告** | Google AdMob | 🔄 計畫 | APP 內廣告 | - |

---

## 認證服務

### Apple Sign In ✅

| 項目 | 內容 |
|------|------|
| 用途 | iOS 用戶登入 |
| 環境變數 | `APPLE_CLIENT_ID` |
| 使用位置 | `server/routes/auth.ts` |
| 套件 | `apple-signin-auth` |

```typescript
import appleSignIn from 'apple-signin-auth';
const { sub, email } = await appleSignIn.verifyIdToken(identityToken, {
  audience: process.env.APPLE_CLIENT_ID
});
```

### Google Sign In 🔄 計畫中

| 項目 | 內容 |
|------|------|
| 用途 | Android 用戶登入 |
| 環境變數 | `GOOGLE_CLIENT_ID` |

---

## AI 服務

### Google Gemini ✅

| 項目 | 內容 |
|------|------|
| 用途 | 景點審核、描述生成、扭蛋排序 |
| 環境變數 | `AI_INTEGRATIONS_GEMINI_API_KEY`<br>`AI_INTEGRATIONS_GEMINI_BASE_URL` |
| 使用位置 | `server/lib/placeGenerator.ts` |
| 費用 | Replit 整合按量付費 |

**模型配置**

| 用途 | 模型 | temperature |
|------|------|-------------|
| 採集、審核、描述 | `gemini-2.5-flash` | 0.1-0.7 |
| 扭蛋排序 | `gemini-3-pro-preview` | 0.1 |

**調用規範**
- 所有 Gemini 調用應使用 `placeGenerator.ts` 導出的函數
- 內建 Rate Limit 防護（Exponential Backoff）

---

## 地圖服務

### Google Places API ✅

| 項目 | 內容 |
|------|------|
| 用途 | 景點資料採集（僅腳本使用） |
| 環境變數 | `GOOGLE_MAPS_API_KEY` |
| 使用位置 | `server/scripts/batch-parallel-collect.ts` |
| 費用 | ~NT$70-210/城市 |

> ⚠️ **僅採集腳本會產生費用**，正式運營的扭蛋功能從資料庫抽取，不呼叫 API。

### Mapbox ✅

| 項目 | 內容 |
|------|------|
| 用途 | 前端地圖顯示、路線規劃 |
| 環境變數 | `MAPBOX_ACCESS_TOKEN` |
| 取得 Token | `GET /api/config/mapbox` |

---

## 通訊服務

### Twilio ✅

| 項目 | 內容 |
|------|------|
| 用途 | 即時聊天、SOS 簡訊 |
| 使用位置 | `server/routes/chat.ts`<br>`server/routes/sos.ts` |

**環境變數**

```
TWILIO_ACCOUNT_SID          # 帳戶 ID
TWILIO_AUTH_TOKEN           # 認證 Token
TWILIO_PHONE_NUMBER         # 簡訊發送號碼
TWILIO_API_KEY_SID          # API Key（聊天用）
TWILIO_API_KEY_SECRET       # API Secret（聊天用）
TWILIO_CONVERSATIONS_SERVICE_SID  # Conversations 服務 ID
```

**功能對應**

| 功能 | Twilio 產品 | API |
|------|------------|-----|
| 專員/旅伴聊天 | Conversations | `GET /api/chat/token` |
| SOS 緊急簡訊 | SMS | 內部呼叫 |

**費用**
- SMS：$0.0075/則（台灣）
- Conversations：按用量計費

### FCM (Firebase Cloud Messaging) 🔄 計畫中

| 項目 | 內容 |
|------|------|
| 用途 | APP 推播通知 |
| 預計功能 | 優惠券到期提醒、系統公告 |

---

## 金流服務

### Stripe ✅

| 項目 | 內容 |
|------|------|
| 用途 | 國際信用卡支付、訂閱管理 |
| 環境變數 | `STRIPE_SECRET_KEY`<br>`STRIPE_WEBHOOK_SECRET` |
| Webhook | `POST /api/stripe/webhook/:uuid` |
| 使用位置 | `server/routes/gacha/payment.ts` |

### Recur ✅

| 項目 | 內容 |
|------|------|
| 用途 | 台灣本地支付（信用卡、超商） |
| 環境變數 | `RECUR_API_KEY`<br>`RECUR_WEBHOOK_SECRET` |
| Webhook | `POST /api/recur/webhook` |
| 使用位置 | `server/routes/gacha/recur-payment.ts` |

> 詳見 `memory-payment-commerce.md`

---

## 廣告服務

### Google AdMob 🔄 計畫中

| 項目 | 內容 |
|------|------|
| 用途 | APP 內廣告變現 |
| 後端 API | `GET /api/ads/placements`（已建立） |
| 資料表 | `ad_placements` |

**預計廣告位置**

| 位置 | 廣告類型 |
|------|----------|
| 扭蛋載入 | Interstitial |
| 扭蛋結果 | Banner |
| 圖鑑詳情 | Native |
| 背包開啟 | Rewarded（換扭蛋次數） |

**APP 端套件**
```bash
npx expo install react-native-google-mobile-ads expo-build-properties expo-tracking-transparency
```

---

## 環境變數檢查清單

### 必要（正式運營）

```bash
# 資料庫
DATABASE_URL

# 認證
APPLE_CLIENT_ID
JWT_SECRET

# AI
AI_INTEGRATIONS_GEMINI_API_KEY
AI_INTEGRATIONS_GEMINI_BASE_URL

# 地圖
MAPBOX_ACCESS_TOKEN

# 金流
STRIPE_SECRET_KEY
STRIPE_WEBHOOK_SECRET
RECUR_API_KEY
RECUR_WEBHOOK_SECRET
```

### 選用（依功能啟用）

```bash
# 景點採集（僅腳本需要）
GOOGLE_MAPS_API_KEY

# Twilio 通訊
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_PHONE_NUMBER
TWILIO_API_KEY_SID
TWILIO_API_KEY_SECRET
TWILIO_CONVERSATIONS_SERVICE_SID

# 管理後台
ADMIN_MIGRATION_KEY
```

---

## 錯誤處理原則

1. **第三方 API 失敗不應阻擋主流程** - 使用 fallback
2. **記錄錯誤但不暴露 API 金鑰**
3. **設定合理的 timeout**（10-30 秒）
4. **Rate Limit 防護** - Exponential Backoff

---

## 相關文檔

| 文檔 | 內容 |
|------|------|
| `memory-auth.md` | 認證詳細流程 |
| `memory-payment-commerce.md` | 金流詳細設定 |
| `memory-deployment.md` | 環境變數完整列表 |
