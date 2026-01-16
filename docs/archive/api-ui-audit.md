# API 與 UI 對照普查報告

> 產出日期：2025-12-25

## 統計摘要

| 項目 | 數量 |
|------|------|
| 後端 API 總數 | 158 |
| 前端已串接 | 27 |
| 無 UI 的 API | 131 |

---

## 一、管理後台 API（Admin）

### 已有 UI ✅

| API 路徑 | 功能說明 | 前端狀態 | 備註 |
|----------|----------|----------|------|
| GET /api/admin/place-drafts | 取得草稿列表 | ✅ 已串接 | PlaceDraftsReviewPage |
| GET /api/admin/place-drafts/filter | 草稿篩選 | ✅ 已串接 | PlaceDraftsReviewPage |
| PATCH /api/admin/place-drafts/:id | 編輯草稿 | ✅ 已串接 | PlaceDraftsReviewPage |
| DELETE /api/admin/place-drafts/:id | 刪除草稿 | ✅ 已串接 | PlaceDraftsReviewPage |
| POST /api/admin/place-drafts/:id/publish | 發布草稿 | ✅ 已串接 | PlaceDraftsReviewPage |
| POST /api/admin/place-drafts/:id/regenerate-description | 重新生成描述 | ✅ 已串接 | PlaceDraftsReviewPage |
| POST /api/admin/place-drafts/batch-publish | 批次發布 | ✅ 已串接 | PlaceDraftsReviewPage |
| POST /api/admin/place-drafts/batch-regenerate | 批次重新生成 | ✅ 已串接 | PlaceDraftsReviewPage |
| POST /api/admin/place-drafts/backfill-review-count | 回填評論數 | ✅ 已串接 | PlaceDraftsReviewPage |
| GET /api/admin/users | 取得用戶列表 | ✅ 已串接 | UsersReviewPage |
| GET /api/admin/users/pending | 待審核用戶 | ✅ 已串接 | UsersReviewPage |
| PATCH /api/admin/users/:id/approve | 審核用戶 | ✅ 已串接 | UsersReviewPage |
| GET /api/admin/applications/pending | 待審核申請 | ✅ 已串接 | UsersReviewPage |
| PATCH /api/admin/applications/:id/review | 審核申請 | ✅ 已串接 | UsersReviewPage |
| GET /api/admin/place-cache/review-stats | Cache 審核統計 | ✅ 已串接 | PlaceDraftsReviewPage |

### 無 UI ❌（需新增管理介面）

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| **POST /api/admin/places/batch-generate** | 批次生成景點 | ❌ 無 UI | 需在 Admin Dashboard 新增「批次採集」按鈕 |
| **POST /api/admin/places/batch-preview** | 預覽批次採集 | ❌ 無 UI | 同上 |
| GET /api/admin/ads | 取得廣告列表 | ❌ 無 UI | 需新增「廣告管理」頁面 |
| POST /api/admin/ads | 新增廣告 | ❌ 無 UI | 同上 |
| PATCH /api/admin/ads/:id | 編輯廣告 | ❌ 無 UI | 同上 |
| DELETE /api/admin/ads/:id | 刪除廣告 | ❌ 無 UI | 同上 |
| GET /api/admin/announcements | 取得公告列表 | ❌ 無 UI | 需新增「公告管理」頁面 |
| POST /api/admin/announcements | 新增公告 | ❌ 無 UI | 同上 |
| PATCH /api/admin/announcements/:id | 編輯公告 | ❌ 無 UI | 同上 |
| DELETE /api/admin/announcements/:id | 刪除公告 | ❌ 無 UI | 同上 |
| POST /api/admin/announcements/cleanup | 清理過期公告 | ❌ 無 UI | 同上 |
| GET /api/admin/global-exclusions | 全域排除列表 | ❌ 無 UI | 需新增「排除管理」頁面 |
| POST /api/admin/global-exclusions | 新增排除 | ❌ 無 UI | 同上 |
| DELETE /api/admin/global-exclusions/:id | 刪除排除 | ❌ 無 UI | 同上 |
| GET /api/admin/rarity-config | 稀有度配置 | ❌ 無 UI | 需新增「稀有度設定」頁面 |
| POST /api/admin/rarity-config | 新增稀有度 | ❌ 無 UI | 同上 |
| DELETE /api/admin/rarity-config/:id | 刪除稀有度 | ❌ 無 UI | 同上 |
| POST /api/admin/place-drafts | 新增草稿 | ❌ 無 UI | 可整合到草稿頁 |
| POST /api/admin/sync-database | 同步資料庫 | ❌ 無 UI | 需新增「系統工具」頁面 |
| GET /api/admin/export-places | 匯出地點 | ❌ 無 UI | 同上 |
| GET /api/admin/seed-places | Seed 地點 | ❌ 無 UI | 同上（開發用） |
| GET /api/admin/migrate-places | 遷移地點 | ❌ 無 UI | 同上（開發用） |
| POST /api/admin/migrate-cache-to-places | Cache 升級 | ❌ 無 UI | 同上 |
| GET /api/admin/migrate-cache-to-places | 查詢遷移狀態 | ❌ 無 UI | 同上 |

---

## 二、商家端 API（Merchant）

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/merchant | 取得商家資訊 | ❌ 無 UI | 需建立商家儀表板 |
| POST /api/merchant | 建立商家 | ❌ 無 UI | 同上 |
| GET /api/merchant/me | 當前商家資訊 | ❌ 無 UI | 同上 |
| POST /api/merchant/register | 商家註冊 | ❌ 無 UI | 需建立商家註冊頁 |
| POST /api/merchant/apply | 商家申請 | ❌ 無 UI | 同上 |
| POST /api/merchant/verify | 商家驗證 | ❌ 無 UI | 同上 |
| GET /api/merchant/analytics | 商家分析 | ❌ 無 UI | 需建立分析儀表板 |
| GET /api/merchant/daily-code | 每日驗證碼 | ❌ 無 UI | 需建立驗證碼頁面 |
| POST /api/merchant/verify-code | 驗證碼核銷 | ❌ 無 UI | 同上 |
| GET /api/merchant/redemption-code | 兌換碼 | ❌ 無 UI | 同上 |
| GET /api/merchant/coupons | 優惠券列表 | ❌ 無 UI | 需建立優惠券管理頁 |
| POST /api/merchant/coupons | 新增優惠券 | ❌ 無 UI | 同上 |
| PUT /api/merchant/coupons/:id | 編輯優惠券 | ❌ 無 UI | 同上 |
| DELETE /api/merchant/coupons/:id | 刪除優惠券 | ❌ 無 UI | 同上 |
| GET /api/merchant/places | 商家地點 | ❌ 無 UI | 需建立地點管理頁 |
| GET /api/merchant/places/search | 搜尋地點 | ❌ 無 UI | 同上 |
| POST /api/merchant/places/claim | 認領地點 | ❌ 無 UI | 同上 |
| PUT /api/merchant/places/:linkId | 編輯地點 | ❌ 無 UI | 同上 |
| POST /api/merchant/places/:linkId/upgrade | 地點升級 | ❌ 無 UI | 同上 |
| POST /api/merchant/places/:linkId/upgrade/confirm | 確認升級 | ❌ 無 UI | 同上 |
| GET /api/merchant/products | 商品列表 | ❌ 無 UI | 需建立商品管理頁 |
| POST /api/merchant/products | 新增商品 | ❌ 無 UI | 同上 |
| PUT /api/merchant/products/:productId | 編輯商品 | ❌ 無 UI | 同上 |
| DELETE /api/merchant/products/:productId | 刪除商品 | ❌ 無 UI | 同上 |
| GET /api/merchant/place-drafts | 商家草稿 | ❌ 無 UI | 需建立草稿管理頁 |
| POST /api/merchant/place-drafts | 新增草稿 | ❌ 無 UI | 同上 |
| GET /api/merchant/subscription | 訂閱資訊 | ❌ 無 UI | 需建立訂閱管理頁 |
| GET /api/merchant/subscription/plans | 訂閱方案 | ❌ 無 UI | 同上 |
| POST /api/merchant/subscription/upgrade | 升級訂閱 | ❌ 無 UI | 同上 |
| POST /api/merchant/subscription/confirm | 確認升級 | ❌ 無 UI | 同上 |
| GET /api/merchant/credits | 點數餘額 | ❌ 無 UI | 需建立點數管理頁 |
| POST /api/merchant/credits/purchase | 購買點數 | ❌ 無 UI | 同上 |
| POST /api/merchant/credits/confirm | 確認購買 | ❌ 無 UI | 同上 |
| GET /api/merchant/transactions | 交易紀錄 | ❌ 無 UI | 需建立交易紀錄頁 |
| GET /api/merchant/applications | 申請紀錄 | ❌ 無 UI | 需建立申請狀態頁 |

---

## 三、專員端 API（Specialist）

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/specialist/me | 專員資訊 | ❌ 無 UI | 需建立專員儀表板 |
| POST /api/specialist/register | 專員註冊 | ❌ 無 UI | 需建立專員註冊頁 |
| GET /api/specialist/services | 服務列表 | ❌ 無 UI | 需建立服務管理頁 |
| POST /api/specialist/match | 配對旅客 | ❌ 無 UI | 需建立配對頁面 |
| POST /api/specialist/toggle-online | 上線/離線 | ❌ 無 UI | 需建立狀態切換 |
| POST /api/specialist/service/:serviceId/end | 結束服務 | ❌ 無 UI | 需建立服務控制 |

---

## 四、旅客端 API（User/Traveler）

### 已有 UI ✅

| API 路徑 | 功能說明 | 前端狀態 | 備註 |
|----------|----------|----------|------|
| GET /api/auth/user | 當前用戶 | ✅ 已串接 | 登入驗證 |
| GET /api/categories | 類別列表 | ✅ 已串接 | 選擇器 |
| GET /api/categories/:categoryId/subcategories | 子類別 | ✅ 已串接 | 選擇器 |
| GET /api/collections | 收藏列表 | ✅ 已串接 | 收藏頁 |
| GET /api/coupons/region/:regionId/pool | 優惠券池 | ✅ 已串接 | 扭蛋 |
| POST /api/feedback/exclude | 排除反饋 | ✅ 已串接 | 扭蛋 |
| POST /api/generate-itinerary | 生成行程 | ✅ 已串接 | 扭蛋 |
| GET /api/locations/countries | 國家列表 | ✅ 已串接 | 選擇器 |
| GET /api/locations/regions/:countryId | 地區列表 | ✅ 已串接 | 選擇器 |
| GET /api/locations/districts/:regionId | 鄉鎮列表 | ✅ 已串接 | 選擇器 |
| GET /api/locations/districts/country/:countryId | 全國鄉鎮 | ✅ 已串接 | 選擇器 |
| GET /api/place/promo | 地點促銷 | ✅ 已串接 | 扭蛋 |

### 無 UI ❌

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| POST /api/gacha/pull | 扭蛋 V1 | ❌ 無 UI | App 端需串接 |
| POST /api/gacha/pull/v2 | 扭蛋 V2 | ❌ 無 UI | App 端需串接 |
| POST /api/gacha/pull/v3 | 扭蛋 V3 | ❌ 無 UI | App 端需串接 |
| POST /api/gacha/itinerary | 行程扭蛋 | ❌ 無 UI | App 端需串接 |
| POST /api/gacha/itinerary/v3 | 行程扭蛋 V3 | ❌ 無 UI | App 端需串接 |
| GET /api/gacha/pool | 扭蛋池 | ❌ 無 UI | App 端需串接 |
| GET /api/gacha/pool/:city | 城市扭蛋池 | ❌ 無 UI | App 端需串接 |
| GET /api/gacha/pool/:city/:district | 地區扭蛋池 | ❌ 無 UI | App 端需串接 |
| GET /api/gacha/prize-pool | 獎池 | ❌ 無 UI | App 端需串接 |
| GET /api/inventory | 背包列表 | ❌ 無 UI | App 端需串接 |
| GET /api/inventory/:id | 背包物品 | ❌ 無 UI | App 端需串接 |
| POST /api/inventory/:id/read | 已讀物品 | ❌ 無 UI | App 端需串接 |
| POST /api/inventory/:id/redeem | 兌換物品 | ❌ 無 UI | App 端需串接 |
| DELETE /api/inventory/:id | 刪除物品 | ❌ 無 UI | App 端需串接 |
| GET /api/inventory/config | 背包設定 | ❌ 無 UI | App 端需串接 |
| GET /api/profile | 個人資料 | ❌ 無 UI | App 端需串接 |
| PATCH /api/profile | 更新資料 | ❌ 無 UI | App 端需串接 |
| GET /api/notifications | 通知列表 | ❌ 無 UI | App 端需串接 |
| POST /api/notifications/:type/seen | 已讀通知 | ❌ 無 UI | App 端需串接 |
| GET /api/collection/with-promo | 收藏+促銷 | ❌ 無 UI | App 端需串接 |
| POST /api/collection/auto-save | 自動收藏 | ❌ 無 UI | App 端需串接 |
| POST /api/collections | 新增收藏 | ❌ 無 UI | App 端需串接 |

---

## 五、SOS 安全模組

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/sos/eligibility | SOS 資格 | ❌ 無 UI | App 端需串接 |
| POST /api/sos/alert | 發送警報 | ❌ 無 UI | App 端需串接 |
| GET /api/sos/alerts | 警報列表 | ❌ 無 UI | App 端需串接 |
| PATCH /api/sos/alerts/:id/cancel | 取消警報 | ❌ 無 UI | App 端需串接 |
| POST /api/sos/trigger | 觸發 SOS | ❌ 無 UI | App 端需串接 |
| POST /api/sos/deactivate | 停用 SOS | ❌ 無 UI | App 端需串接 |
| GET /api/user/sos-link | SOS 連結 | ❌ 無 UI | App 端需串接 |
| POST /api/user/sos-key/regenerate | 重新生成金鑰 | ❌ 無 UI | App 端需串接 |
| POST /api/location/update | 更新位置 | ❌ 無 UI | App 端需串接 |
| GET /api/location/me | 我的位置 | ❌ 無 UI | App 端需串接 |

---

## 六、聊天模組（Chat）

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/chat/token | 聊天 Token | ❌ 無 UI | App 端需串接 |
| GET /api/chat/conversations | 對話列表 | ❌ 無 UI | App 端需串接 |
| POST /api/chat/conversations | 新增對話 | ❌ 無 UI | App 端需串接 |
| DELETE /api/chat/conversations/:conversationSid | 刪除對話 | ❌ 無 UI | App 端需串接 |
| POST /api/chat/conversations/:conversationSid/call | 語音通話 | ❌ 無 UI | App 端需串接 |
| POST /api/chat/conversations/:conversationSid/invite-link | 邀請連結 | ❌ 無 UI | App 端需串接 |
| POST /api/chat/conversations/:conversationSid/join | 加入對話 | ❌ 無 UI | App 端需串接 |
| POST /api/chat/invites/:inviteCode/accept | 接受邀請 | ❌ 無 UI | App 端需串接 |
| POST /api/voice/connect | 語音連線 | ❌ 無 UI | App 端需串接 |

---

## 七、電商模組（Commerce）

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/commerce/cart | 購物車 | ❌ 無 UI | App 端需串接 |
| POST /api/commerce/cart | 加入購物車 | ❌ 無 UI | App 端需串接 |
| PATCH /api/commerce/cart/:itemId | 更新數量 | ❌ 無 UI | App 端需串接 |
| DELETE /api/commerce/cart | 清空購物車 | ❌ 無 UI | App 端需串接 |
| DELETE /api/commerce/cart/:itemId | 移除商品 | ❌ 無 UI | App 端需串接 |
| POST /api/commerce/checkout | 結帳 | ❌ 無 UI | App 端需串接 |
| GET /api/commerce/orders | 訂單列表 | ❌ 無 UI | App 端需串接 |
| GET /api/commerce/products/place/:placeId | 地點商品 | ❌ 無 UI | App 端需串接 |
| GET /api/commerce/products/by-name | 依名稱搜尋 | ❌ 無 UI | App 端需串接 |
| GET /api/commerce/places/search | 搜尋地點 | ❌ 無 UI | App 端需串接 |
| GET /api/commerce/places/names | 地點名稱 | ❌ 無 UI | App 端需串接 |

---

## 八、其他 API

| API 路徑 | 功能說明 | 前端狀態 | 建議行動 |
|----------|----------|----------|----------|
| GET /api/health | 健康檢查 | ✅ 系統用 | 無需 UI |
| GET /api/config/mapbox | Mapbox 設定 | ❌ 無 UI | App 端需串接 |
| GET /api/announcements | 公告列表 | ❌ 無 UI | App 端需串接 |
| GET /api/ads/placements | 廣告版位 | ❌ 無 UI | App 端需串接 |
| GET /api/rarity-config | 稀有度設定 | ❌ 無 UI | App 端需串接 |
| GET /api/token | Token | ❌ 無 UI | App 端需串接 |
| GET /api/service/current | 當前服務 | ❌ 無 UI | App 端需串接 |
| POST /api/service/request | 請求服務 | ❌ 無 UI | App 端需串接 |
| POST /api/service/:id/end | 結束服務 | ❌ 無 UI | App 端需串接 |
| POST /api/klook/detect | Klook 偵測 | ❌ 無 UI | App 端需串接 |
| GET /api/klook/highlights/:conversationSid | Klook 重點 | ❌ 無 UI | App 端需串接 |
| GET /api/klook/highlights/:conversationSid/:messageSid | 訊息重點 | ❌ 無 UI | App 端需串接 |
| POST /api/checkout/create-session | 建立結帳 | ❌ 無 UI | App 端需串接 |
| GET /api/checkout/session/:sessionId | 結帳狀態 | ❌ 無 UI | App 端需串接 |
| POST /api/webhooks/recur | Webhook | ✅ 系統用 | 無需 UI |
| GET /api/webhooks/recur/info | Webhook 資訊 | ✅ 系統用 | 無需 UI |

---

## 待補 UI 優先順序

### 🔴 高優先（管理後台必備）

| 功能模組 | 需新增的頁面 | 相關 API 數量 |
|----------|--------------|--------------|
| 批次採集 | BatchGeneratePage | 2 |
| 廣告管理 | AdsManagePage | 4 |
| 公告管理 | AnnouncementsPage | 5 |
| 全域排除 | ExclusionsPage | 3 |
| 稀有度設定 | RarityConfigPage | 3 |

### 🟡 中優先（商家端）

| 功能模組 | 需新增的頁面 | 相關 API 數量 |
|----------|--------------|--------------|
| 商家儀表板 | MerchantDashboard | 5 |
| 優惠券管理 | CouponsManagePage | 4 |
| 地點管理 | PlacesManagePage | 6 |
| 商品管理 | ProductsManagePage | 4 |
| 訂閱管理 | SubscriptionPage | 4 |
| 點數管理 | CreditsPage | 3 |

### 🟢 低優先（App 端）

| 功能模組 | 說明 | 相關 API 數量 |
|----------|------|--------------|
| 扭蛋 | App 專用 | 9 |
| 背包 | App 專用 | 6 |
| SOS 安全 | App 專用 | 10 |
| 聊天 | App 專用 | 9 |
| 電商 | App 專用 | 11 |
| 專員 | App 專用 | 6 |
