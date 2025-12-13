# Mibu 後端 API 對接指南

## 目錄
1. [登入驗證系統](#登入驗證系統)
2. [商家地點申請系統](#商家地點申請系統)
3. [輔助 API](#輔助-api)

---

## 登入驗證系統

### 登入流程（Expo App / React Native）

#### 步驟 1：APP 註冊 Deep Link

在 `app.json` 或 `app.config.js` 中設定：
```json
{
  "expo": {
    "scheme": "mibu"
  }
}
```

#### 步驟 2：開啟登入頁面

使用系統瀏覽器（不是 WebView）開啟：
```
https://[你的後端網址]/api/auth/login?redirect_uri=mibu://auth/callback
```

範例程式碼：
```javascript
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const login = async () => {
  const redirectUri = 'mibu://auth/callback';
  const loginUrl = `https://你的後端網址/api/auth/login?redirect_uri=${encodeURIComponent(redirectUri)}`;
  
  await WebBrowser.openBrowserAsync(loginUrl);
};
```

#### 步驟 3：監聽 Deep Link Callback

```javascript
import * as Linking from 'expo-linking';

useEffect(() => {
  const handleDeepLink = (event) => {
    const url = event.url;
    const { queryParams } = Linking.parse(url);
    
    if (queryParams?.token) {
      // 儲存 token
      await SecureStore.setItemAsync('authToken', queryParams.token);
      // 登入成功，導航到主頁
    }
  };

  Linking.addEventListener('url', handleDeepLink);
  return () => Linking.removeEventListener('url', handleDeepLink);
}, []);
```

#### 步驟 4：之後的 API 請求

所有需要登入的 API，都要在 Header 加上 Token：
```javascript
fetch('https://你的後端網址/api/xxx', {
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
```

---

### 驗證 Token

```
GET /api/auth/verify
```

**Request Header:**
```
Authorization: Bearer <token>
```

**Response (成功):**
```json
{
  "valid": true,
  "userId": "abc123",
  "email": "user@example.com"
}
```

**Response (失敗):**
```json
{
  "valid": false,
  "error": "Token expired"
}
```

---

### 更新 Token

```
POST /api/auth/refresh-token
```

**Request Header:**
```
Authorization: Bearer <舊的token>
```

**Response:**
```json
{
  "token": "新的JWT token"
}
```

---

### 取得當前用戶資料

```
GET /api/auth/user
```

**Response:**
```json
{
  "id": "user_id",
  "email": "user@example.com",
  "firstName": "名",
  "lastName": "姓",
  "role": "consumer",
  "profileImageUrl": "https://..."
}
```

---

## 商家地點申請系統

### 建立地點申請

```
POST /api/merchant/place-drafts
```

**說明：** 商家提交新地點申請，系統自動建立審核紀錄

**Request Body:**
```json
{
  "placeName": "店家名稱",
  "categoryId": 1,
  "subcategoryId": 5,
  "districtId": 10,
  "regionId": 2,
  "countryId": 1,
  "description": "店家介紹（可選）",
  "address": "詳細地址（可選）",
  "googlePlaceId": "ChIJxxxxx（可選）",
  "locationLat": "25.0330",
  "locationLng": "121.5654"
}
```

**欄位說明：**
| 欄位 | 必填 | 說明 |
|------|------|------|
| placeName | 是 | 店家名稱 |
| categoryId | 是 | 分類 ID，從 `/api/categories` 取得 |
| subcategoryId | 是 | 子分類 ID，從 `/api/categories/:id/subcategories` 取得 |
| districtId | 是 | 鄉鎮區 ID |
| regionId | 是 | 縣市 ID |
| countryId | 是 | 國家 ID（台灣 = 1） |
| description | 否 | 店家介紹 |
| address | 否 | 詳細地址 |
| googlePlaceId | 否 | Google Places API 的 place_id |
| locationLat | 否 | 緯度 |
| locationLng | 否 | 經度 |

**Response:**
```json
{
  "draft": {
    "id": 1,
    "placeName": "店家名稱",
    "status": "pending",
    "createdAt": "2025-12-13T10:00:00.000Z"
  },
  "application": {
    "id": 1,
    "status": "pending",
    "createdAt": "2025-12-13T10:00:00.000Z"
  }
}
```

---

### 取得我的草稿列表

```
GET /api/merchant/place-drafts
```

**Response:**
```json
{
  "drafts": [
    {
      "id": 1,
      "placeName": "店家名稱",
      "categoryId": 1,
      "subcategoryId": 5,
      "status": "pending",
      "createdAt": "2025-12-13T10:00:00.000Z"
    }
  ]
}
```

---

### 取得我的申請紀錄

```
GET /api/merchant/applications
```

**Response:**
```json
{
  "applications": [
    {
      "id": 1,
      "placeDraftId": 1,
      "status": "pending",
      "reviewNotes": null,
      "createdAt": "2025-12-13T10:00:00.000Z"
    }
  ]
}
```

**status 狀態說明：**
| 狀態 | 說明 |
|------|------|
| pending | 待審核 |
| approved | 已通過（地點已發布） |
| rejected | 已退回 |

---

### [管理員] 取得待審核申請

```
GET /api/admin/applications/pending
```

**權限：** 需要 admin 角色

**Response:**
```json
{
  "applications": [
    {
      "id": 1,
      "merchantId": 1,
      "placeDraftId": 1,
      "status": "pending",
      "createdAt": "2025-12-13T10:00:00.000Z"
    }
  ]
}
```

---

### [管理員] 審核申請

```
PATCH /api/admin/applications/:id/review
```

**權限：** 需要 admin 角色

**Request Body:**
```json
{
  "status": "approved",
  "reviewNotes": "審核備註（可選）"
}
```

**status 選項：**
- `approved` - 通過（自動發布地點 + 綁定商家）
- `rejected` - 退回

**Response:**
```json
{
  "application": {
    "id": 1,
    "status": "approved",
    "reviewedBy": "admin_user_id",
    "reviewedAt": "2025-12-13T11:00:00.000Z",
    "reviewNotes": "審核通過",
    "placeCacheId": 100
  }
}
```

---

## 輔助 API

### 取得分類列表

```
GET /api/categories
```

**Response:**
```json
{
  "categories": [
    { "id": 1, "code": "food", "nameZh": "食", "nameEn": "Food" },
    { "id": 2, "code": "accommodation", "nameZh": "宿", "nameEn": "Accommodation" }
  ]
}
```

---

### 取得子分類列表

```
GET /api/categories/:categoryId/subcategories
```

**Response:**
```json
{
  "subcategories": [
    { "id": 1, "nameZh": "火鍋", "nameEn": "Hot Pot" },
    { "id": 2, "nameZh": "咖啡廳", "nameEn": "Cafe" }
  ]
}
```

---

### 取得國家列表

```
GET /api/locations/countries
```

**Response:**
```json
{
  "countries": [
    { "id": 1, "code": "TW", "nameZh": "台灣", "nameEn": "Taiwan" }
  ]
}
```

---

### 取得縣市列表

```
GET /api/locations/regions/:countryId
```

**Response:**
```json
{
  "regions": [
    { "id": 1, "nameZh": "台北市", "nameEn": "Taipei City" },
    { "id": 2, "nameZh": "新北市", "nameEn": "New Taipei City" }
  ]
}
```

---

### 取得鄉鎮區列表

```
GET /api/locations/districts/:regionId
```

**Response:**
```json
{
  "districts": [
    { "id": 1, "nameZh": "中正區", "nameEn": "Zhongzheng District" },
    { "id": 2, "nameZh": "大安區", "nameEn": "Da'an District" }
  ]
}
```

---

## 錯誤回應格式

所有 API 錯誤回應格式：
```json
{
  "error": "錯誤訊息"
}
```

**常見錯誤碼：**
| HTTP Code | 說明 |
|-----------|------|
| 400 | 請求格式錯誤 |
| 401 | 未登入或 Token 無效 |
| 403 | 權限不足 |
| 404 | 資源不存在 |
| 500 | 伺服器錯誤 |

---

## 登入問題排查

如果登入後無法跳轉回 APP，請確認：

1. **Deep Link Scheme 已註冊**
   - iOS: 在 `Info.plist` 或 `app.json` 設定 URL Scheme
   - Android: 在 `AndroidManifest.xml` 設定 intent-filter

2. **使用系統瀏覽器**
   - 使用 `expo-web-browser` 或 `react-native-inappbrowser`
   - 不要使用 WebView

3. **redirect_uri 正確編碼**
   ```javascript
   const redirectUri = encodeURIComponent('mibu://auth/callback');
   ```

4. **監聽 Deep Link 事件**
   - 使用 `Linking.addEventListener` 監聽 URL 變化
   - APP 在背景時也要能接收

5. **測試 Deep Link**
   - iOS: `xcrun simctl openurl booted "mibu://auth/callback?token=test"`
   - Android: `adb shell am start -W -a android.intent.action.VIEW -d "mibu://auth/callback?token=test"`
