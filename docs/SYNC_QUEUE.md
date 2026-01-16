# 前端同步指令清單 (SYNC_QUEUE)

> **用途**：後端施作完成後，記錄需要官網/APP 同步的任務
> **使用方式**：用戶下指令「派發同步任務給官網」或「派發同步任務給 APP」

---

## 待處理 (Pending)

### [2026-01-16] API 契約結構重組

**影響範圍**: WEB + APP

**後端變更摘要**:
- 新增 `docs/contracts/COMMON.md` - 認證、錯誤碼、共用型別
- 新增 `docs/contracts/WEB.md` - 官網專用 API（SEO、商家訂閱）
- 新增 `docs/contracts/APP.md` - APP 專用 API（扭蛋、收藏、庫存）
- 更新 `docs/API_CONTRACT.md` - 改為索引 + 變更日誌

**官網同步指令**:
```
讀取後端的 docs/contracts/COMMON.md 和 docs/contracts/WEB.md，
同步官網的 TypeScript 型別定義，確保與後端契約一致。
完成後更新官網的 CLAUDE.md 記錄此次同步。
```

**APP 同步指令**:
```
讀取後端的 docs/contracts/COMMON.md 和 docs/contracts/APP.md，
同步 APP 的 TypeScript 型別定義，確保與後端契約一致。
完成後更新 APP 的 CLAUDE.md 記錄此次同步。
```

**狀態**: ⏳ pending

**需更新的記憶庫**:
- 後端：`docs/API_CONTRACT.md` ✅ 已完成
- 官網：待官網更新其 CLAUDE.md
- APP：待 APP 更新其 CLAUDE.md

---

## 已完成 (Completed)

（完成後移到這裡，格式：日期 + 摘要 + 完成時間）

---

## 使用說明

### 用戶指令

| 指令 | 作用 |
|------|------|
| 「派發同步任務給官網」 | 產出官網要執行的完整指令 |
| 「派發同步任務給 APP」 | 產出 APP 要執行的完整指令 |
| 「官網已完成 XXX」 | 將任務標記為 completed |
| 「APP 已完成 XXX」 | 將任務標記為 completed |
| 「查看同步清單」 | 顯示所有 pending 任務 |

### 後端記錄格式

```markdown
### [日期] 任務標題

**影響範圍**: WEB / APP / BOTH

**後端變更摘要**:
- 變更 1
- 變更 2

**官網同步指令**:
（如果影響官網）

**APP 同步指令**:
（如果影響 APP）

**狀態**: ⏳ pending

**需更新的記憶庫**:
- 後端：哪個記憶庫
- 官網：哪個記憶庫
- APP：哪個記憶庫
```
