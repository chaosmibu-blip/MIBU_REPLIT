# 🌐 官網同步指令

> 此檔案由後端自動更新，官網 Claude Code 讀取後執行

---

## 最新更新

### 2026-01-16 #001：🔧 架構升級 - 三端協作規範

**變更類型**: 🔴 架構升級（非 API 變更）

**背景說明**:
後端已建立「三端協作規範」，定義後端/APP/官網的協作框架。官網需要配合建立對應文件。

**協作規範文件位置**:
- 後端：`docs/COLLABORATION.md`
- GitHub：https://github.com/chaosmibu-blip/MIBU_REPLIT/blob/main/docs/COLLABORATION.md

---

#### 官網需要做的事

##### 1. 建立 `docs/` 目錄和 `docs/sync-backend.md`

用途：回報後端同步指令的完成狀態

```markdown
# 🔄 後端同步回報

> 官網完成後端同步指令後，在此記錄狀態

---

## 最新回報

### 2026-01-16 #001

| 項目 | 內容 |
|------|------|
| 來源 | 後端 sync-web.md #001 |
| 收到時間 | YYYY-MM-DD HH:MM |
| 完成時間 | YYYY-MM-DD HH:MM |
| 狀態 | ✅ 完成 / 🔄 進行中 / ❌ 有問題 |

### 完成項目
- [ ] 建立 docs/ 目錄
- [ ] 建立 docs/sync-backend.md
- [ ] 更新 CLAUDE.md 加入「三端協作」段落
- [ ] 建立記憶庫

### 異常回報
（如果有問題，寫在這裡讓後端 AI 知道）

---

## 歷史回報

（舊的回報往下移動）
```

##### 2. 更新 CLAUDE.md

在 CLAUDE.md 開頭的「專案定位」段落之後，加入以下內容：

```markdown
## 三端協作

> - 後端 GitHub: https://github.com/chaosmibu-blip/MIBU_REPLIT
> - APP GitHub: https://github.com/chaosmibu-blip/Mibu-Replit-APP-
> - 官網 GitHub: https://github.com/chaosmibu-blip/Mibu-Pages
> - 協作規範：後端 `docs/COLLABORATION.md`
> - 同步機制：
>   - 讀取：後端 `docs/sync-web.md`
>   - 回報：本專案 `docs/sync-backend.md`
```

##### 3. 建立記憶庫

根據官網現有功能，建議建立以下記憶庫：

| 檔案 | 職權 | 跨端對應 |
|------|------|----------|
| `docs/memory-seo-pages.md` | SEO 公開頁面（城市、景點、行程） | 後端 `memory-web-official.md` |
| `docs/memory-merchant-portal.md` | 商家後台（登入、儀表板、優惠券） | 後端 `memory-merchant.md` |
| `docs/memory-components.md` | 共用元件 | （前端專屬） |

每個記憶庫開頭加入：

```markdown
> **跨端對應**
> - 後端：`docs/memory-xxx.md`（對應的後端記憶庫）
> - APP：（如有對應）
```

##### 4. 補齊 CLAUDE.md 的「強制查閱規則」

```markdown
## 強制查閱規則

| 動作類型 | 必讀記憶庫 |
|---------|-----------|
| 修改 SEO 頁面 | `docs/memory-seo-pages.md` |
| 修改商家後台 | `docs/memory-merchant-portal.md` |
| 修改共用元件 | `docs/memory-components.md` |
| API 相關修改 | 後端 `docs/contracts/WEB.md` |
```

---

#### 驗證方式

1. `docs/` 目錄存在
2. `docs/sync-backend.md` 檔案存在
3. CLAUDE.md 包含「三端協作」和「強制查閱規則」段落
4. 至少有一個記憶庫檔案

---

#### 完成後

1. Commit + Push
2. 在 `docs/sync-backend.md` 記錄完成狀態
3. 再次 Commit + Push

---

## 歷史記錄

(舊的同步指令往下移動)
