# 三端協作規範 v1.0

> 本文件定義 MIBU 專案三端（後端、APP、官網）的協作框架，供 AI 助手遵循。

---

## 三端定義

| 名稱 | GitHub Repo | 技術棧 | 職責 |
|------|-------------|--------|------|
| **後端** | `chaosmibu-blip/MIBU_REPLIT` | Node.js + Express + Drizzle | API 服務、資料庫、商業邏輯 |
| **APP** | `chaosmibu-blip/Mibu-Replit-APP-` | Expo + React Native | 用戶端行動應用 |
| **官網** | `chaosmibu-blip/Mibu-Pages` | Next.js 15 + Tailwind | SEO 頁面、商家後台 |

### 協作原則

1. **後端是唯一真相來源** — API 契約由後端制定，前端依契約實作
2. **先契約後程式碼** — 不可先改程式碼再補文件
3. **透過 sync 文件溝通** — AI 之間透過 sync 文件傳遞任務

---

## 記憶庫映射機制

三端記憶庫命名邏輯不同，透過映射表對應：

### 全局映射表

見 `docs/MEMORY_MAP.md`（待建立）

### 各端記憶庫內標註格式

```markdown
# memory-xxx.md

> **跨端對應**
> - 後端：`docs/memory-xxx.md`
> - APP：`docs/memory-yyy.md` → 相關段落
> - 官網：`docs/memory-zzz.md`（待建）

---

（原有內容...）
```

---

## 同步機制

### 文件結構

| 專案 | 文件 | 功能 |
|------|------|------|
| **後端** | `docs/sync-app.md` | → 給 APP AI 的指令 |
| **後端** | `docs/sync-web.md` | → 給官網 AI 的指令 |
| **APP** | `docs/sync-backend.md` | ← 回報後端完成狀態 |
| **官網** | `docs/sync-backend.md` | ← 回報後端完成狀態 |

### 同步流程

```
後端 AI 施作完成
    ↓
寫入 sync-app.md 或 sync-web.md
    ↓
用戶 commit + push
    ↓
用戶去前端專案，讓前端 AI 讀取後端 sync 文件
    ↓
前端 AI 完成工作
    ↓
前端 AI 寫入 sync-backend.md
    ↓
用戶 commit + push
    ↓
用戶回到後端，後端 AI 讀取前端 sync-backend.md 確認
```

### sync 文件格式

#### 後端 → 前端（sync-app.md / sync-web.md）

```markdown
## YYYY-MM-DD #序號

### 📋 變更摘要
| 類型 | 🟢 新增 API / 🟡 修改 API / 🔴 Breaking Change |
| 影響模組 | 模組名稱 |
| 優先級 | 高 / 中 / 低 |

### 🔌 API 內容
```
METHOD /api/path
```

**Request**
```typescript
interface XxxRequest {
  // ...
}
```

**Response**
```typescript
interface XxxResponse {
  // ...
}
```

### 📚 後端參考
- 記憶庫：`docs/memory-xxx.md` → 相關段落
- 程式碼：`server/routes/xxx.ts`

### 🎯 前端需要做的事
1. 新增 TypeScript Interface
2. 新增 API 呼叫函式
3. 在某頁面串接此 API

### ✅ 驗證方式
- 驗證條件說明

---
```

#### 前端 → 後端（sync-backend.md）

```markdown
## YYYY-MM-DD #序號

| 項目 | 內容 |
|------|------|
| 來源 | 後端 sync-app.md #序號 |
| 收到時間 | YYYY-MM-DD HH:MM |
| 完成時間 | YYYY-MM-DD HH:MM |
| 狀態 | ✅ 完成 / 🔄 進行中 / ❌ 有問題 |

### 完成項目
- [x] 項目 1
- [x] 項目 2
- [ ] 項目 3

### 異常回報
（如果有問題，寫在這裡讓後端 AI 知道）

---
```

---

## CLAUDE.md 統一格式

三端 CLAUDE.md 必須包含以下段落：

```markdown
# CLAUDE.md

## 專案定位
> 這是 [後端/APP/官網]，負責 [職責範圍]

## 三端協作
> - 後端 GitHub: https://github.com/chaosmibu-blip/MIBU_REPLIT
> - APP GitHub: https://github.com/chaosmibu-blip/Mibu-Replit-APP-
> - 官網 GitHub: https://github.com/chaosmibu-blip/Mibu-Pages
> - 協作規範：後端 `docs/COLLABORATION.md`
> - 同步機制：見 `sync-*.md` / `sync-backend.md`

## 強制查閱規則
| 動作類型 | 必讀記憶庫 |
|---------|-----------|
| ... | ... |

## 技術棧
| 層級 | 技術 |
|------|------|
| ... | ... |

## 常用指令
```bash
npm run dev
npm run build
...
```

## 專案架構
```
src/
├── ...
```

## 記憶庫索引
| 檔案 | 職權 |
|------|------|
| ... | ... |
```

---

## 跨專案工作流程 SOP

### ⚠️ 核心原則：完成任務後必須檢查前端影響

> **後端 AI 完成任何任務後，必須判斷是否影響 APP 或官網。如果有影響，必須：**
> 1. 寫入對應的 sync 文件
> 2. 告訴用戶「請 commit 後轉交給 APP/官網執行」

### 影響判斷標準

| 變更類型 | 影響 APP？ | 影響官網？ |
|----------|:----------:|:----------:|
| API 新增/修改/刪除 | ✅ 看契約 | ✅ 看契約 |
| 資料表結構變更 | ✅ 可能影響回傳格式 | ✅ 可能影響回傳格式 |
| 認證邏輯變更 | ✅ | ✅ |
| 文件結構變更 | ✅ 如果影響協作規範 | ✅ 如果影響協作規範 |
| 純後端邏輯（不影響 API） | ❌ | ❌ |
| 腳本/採集流程 | ❌ | ❌ |

---

### 情境 A：純後端任務

```
用戶指令 → 後端 AI 執行

1. 讀 CLAUDE.md → 確認要看哪些記憶庫
2. 讀相關記憶庫 → 理解現有邏輯
3. 執行修改
4. 更新記憶庫（如有需要）
5. ⚠️ 判斷是否影響前端（見上方判斷標準）：
   - 影響 APP → 寫入 sync-app.md + 告訴用戶
   - 影響官網 → 寫入 sync-web.md + 告訴用戶
   - 都不影響 → 完成
```

### 情境 B：跨端任務（需要前端配合）

```
用戶指令 → 後端 AI 執行 → 前端 AI 執行

1. 讀 CLAUDE.md → 確認要看哪些記憶庫
2. 讀後端記憶庫 → 理解現有邏輯
3. 讀前端 CLAUDE.md（透過 GitHub）→ 理解前端架構
4. 設計 API
5. 實作後端
6. 更新後端記憶庫
7. 寫入 sync-app.md 或 sync-web.md
8. 告訴用戶：「後端完成，請 commit 後去前端執行同步」
```

### 情境 C：確認前端完成狀態

```
用戶指令 → 後端 AI 確認

1. 讀前端 sync-backend.md（透過 GitHub）
2. 回報狀態給用戶
3. 如果有異常，判斷是否需要後端調整
```

---

## 待建立文件清單

| 專案 | 文件 | 狀態 |
|------|------|------|
| 後端 | `docs/MEMORY_MAP.md` | ⏳ 待建立 |
| APP | `docs/sync-backend.md` | ⏳ 待建立 |
| 官網 | `docs/sync-backend.md` | ⏳ 待建立 |
| 官網 | `docs/` 目錄 + 記憶庫 | ⏳ 待建立 |

---

## 版本記錄

| 版本 | 日期 | 變更 |
|------|------|------|
| v1.0 | 2026-01-16 | 初版建立 |
