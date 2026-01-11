# 📱 App 同步指令

> 此檔案由後端自動更新，前端 Claude Code 讀取後執行

---

## 最新更新

### 2026-01-12：認證錯誤格式統一

**變更類型**: API 修改（錯誤回應格式）

**影響範圍**: 所有需要認證的 API 端點

**修改前的錯誤格式**:
```typescript
// 後端返回（不符合規範）
{ message: "Unauthorized" }
{ message: "Invalid token" }
{ message: "User not found" }
{ message: "Forbidden: insufficient permissions" }
```

**修改後的錯誤格式**:
```typescript
// 標準化錯誤回應
interface ApiError {
  error: string;  // 人類可讀訊息
  code: string;   // 機器可讀代碼
}

// 401 錯誤
{ error: "Unauthorized", code: "UNAUTHORIZED" }
{ error: "Invalid token", code: "INVALID_TOKEN" }
{ error: "User not found", code: "USER_NOT_FOUND" }

// 403 錯誤
{ error: "Forbidden: insufficient permissions", code: "FORBIDDEN" }
```

**cURL 測試**:
```bash
# 測試無 Token 請求（應返回 401）
curl -X POST https://gacha-travel--s8869420.replit.app/api/gacha/itinerary/v3 \
  -H "Content-Type: application/json" \
  -d '{"regionId": 1, "days": 1}'

# 預期回應
{ "error": "Unauthorized", "code": "UNAUTHORIZED" }
```

**邏輯說明**:
- 統一所有認證錯誤的回應格式為 `{ error, code }`
- 前端可透過 `response.error` 或 `response.code` 判斷錯誤類型
- 修正了 20% 用戶「查無景點」誤報問題的後端部分

**前端需要做的事**:
- [x] 已新增 `response.message` 檢查（相容舊格式）
- [x] 已新增 Token 前置檢查
- [ ] 可選：移除 `response.message` 檢查（後端已不再使用）
- [ ] 建議：統一使用 `response.error` 或 `response.code` 判斷錯誤

---

## 歷史記錄

(無歷史記錄)
