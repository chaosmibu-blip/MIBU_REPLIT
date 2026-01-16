# 推薦系統記憶庫 (Referral System)

## 模組範圍

用戶推薦用戶、用戶推薦商家的獎勵機制，包含推薦碼、獎勵發放、餘額提現。

---

## 核心設計

### 推薦類型

| 類型 | 說明 | 獎勵 |
|------|------|------|
| 推薦用戶 | 推薦碼 → 新用戶註冊 | 經驗值 + 現金 |
| 推薦商家 | 填寫商家資料 → 審核通過 | 經驗值 + 現金 |
| 商家自推 | 商家推薦自己的店 | 經驗值 + 免費試用期 |

### 推薦層級

**單層推薦**（A → B）

```
推薦人 A → 被推薦人 B
    │
    └── A 獲得獎勵

❌ 不做多層次（A → B → C，A 不從 C 獲得獎勵）
```

---

## 推薦用戶

### 流程

```
推薦人 A 分享推薦碼/連結
         │
         ▼
新用戶 B 使用推薦碼註冊
         │
         ▼
系統記錄推薦關係（A → B）
         │
         ▼
B 完成註冊 → A 獲得獎勵（經驗值）
         │
         ▼
B 完成首次扭蛋 → A 獲得額外獎勵（經驗值 + 現金）
```

### 獎勵設計

| 事件 | 推薦人獎勵 | 被推薦人獎勵 |
|------|-----------|-------------|
| 註冊成功 | 100 經驗值 | 50 經驗值 |
| 首次扭蛋 | 150 經驗值 + NT$ 10 | - |

### 推薦碼格式

```
格式：MIBU + 6 位英數字
範例：MIBUAB1234

或使用深度連結：
https://mibu.app/invite/AB1234
```

---

## 推薦商家

### 流程

```
用戶 A 發現潛在商家
         │
         ▼
填寫商家推薦表單
├── 商家名稱（必填）
├── 地址/城市（必填）
├── 分類（必填）
├── 聯絡方式（選填）
├── Google Place ID（選填）
└── 備註（選填）
         │
         ▼
後台審核
├── AI 預審（是否為合法商家）
└── 人工確認
         │
         ▼
審核通過 → 商家資料進入 place_drafts
         │
         ▼
A 獲得獎勵（經驗值 + 現金）
         │
         ▼
商家聯繫 & 註冊 → A 獲得額外獎勵
```

### 獎勵設計

| 事件 | 推薦人獎勵 |
|------|-----------|
| 推薦審核通過 | 500 經驗值 + NT$ 50 |
| 商家完成註冊 | 1,000 經驗值 + NT$ 100 |
| 商家首次訂閱 | NT$ 200（一次性）|

### 商家自推

```
商家想加入平台
         │
         ▼
註冊為一般用戶
         │
         ▼
使用「推薦商家」功能
填寫自己的店家資訊
         │
         ▼
審核通過 → 自動關聯商家身份
         │
         ▼
獲得：
├── 500 經驗值
├── 1-2 個月免費試用期
└── 不獲得現金獎勵（自推）
```

---

## 餘額與提現

### 用戶餘額

每個用戶有一個「可提現餘額」：

```typescript
type UserBalance = {
  userId: string;
  availableBalance: number;  // 可提現金額（NT$）
  pendingBalance: number;    // 待確認金額
  lifetimeEarned: number;    // 累計獲得
  lifetimeWithdrawn: number; // 累計提現
}
```

### 提現方案

| 階段 | 方案 | 說明 |
|------|------|------|
| **初期** | 人工匯款 | Excel 管理 + 兩週結算一次 |
| **後期** | 串接金流 | 綠界/藍新代付 API |

### 提現規則

| 項目 | 規則 |
|------|------|
| 最低提現 | NT$ 100 |
| 提現週期 | 每月 1、15 日可申請 |
| 處理時間 | 7 個工作天內 |
| 手續費 | NT$ 15/筆（或滿 NT$ 500 免手續費）|

### 人工匯款流程（初期）

```
用戶申請提現
         │
         ▼
填寫銀行帳號資訊
├── 銀行代碼
├── 帳號
└── 戶名
         │
         ▼
後台審核
├── 確認餘額足夠
├── 確認帳號正確
└── 標記「處理中」
         │
         ▼
財務人員匯款
         │
         ▼
標記「已完成」
         │
         ▼
通知用戶
```

---

## 成就連動

| 成就 | 條件 | 獎勵 |
|------|------|------|
| 口碑傳播 | 推薦 3 位用戶 | 「傳播者」稱號 |
| 人脈達人 | 推薦 10 位用戶 | 推廣者頭框 |
| 社群領袖 | 推薦 30 位用戶 | 金色稱號 |
| 影響力大師 | 推薦 100 位用戶 | 傳說頭框 |
| 商業夥伴 | 推薦 1 家商家 | 「夥伴」徽章 |
| 業務達人 | 推薦 5 家商家 | 業務頭框 |
| 商業大使 | 推薦 10 家商家 | 金色稱號 |
| 商業巨擘 | 推薦 30 家商家 | 傳說頭框 |

---

## API 設計

### 推薦碼

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/referral/my-code` | 取得我的推薦碼 |
| POST | `/api/referral/generate-code` | 生成推薦碼（首次）|
| GET | `/api/referral/validate/:code` | 驗證推薦碼 |

### 推薦關係

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/referral/apply` | 使用推薦碼（註冊時）|
| GET | `/api/referral/my-referrals` | 我推薦的人列表 |
| GET | `/api/referral/my-referrer` | 誰推薦了我 |

### 推薦商家

| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | `/api/referral/merchant` | 提交商家推薦 |
| GET | `/api/referral/my-merchant-referrals` | 我推薦的商家列表 |

### 餘額與提現

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/referral/balance` | 我的餘額 |
| GET | `/api/referral/transactions` | 獎勵/提現記錄 |
| POST | `/api/referral/withdraw` | 申請提現 |
| GET | `/api/referral/withdraw/history` | 提現歷史 |

### 管理（Admin）

| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | `/api/admin/referral/withdrawals` | 提現申請列表 |
| PATCH | `/api/admin/referral/withdrawals/:id` | 更新提現狀態 |
| GET | `/api/admin/referral/merchant-referrals` | 商家推薦審核列表 |
| PATCH | `/api/admin/referral/merchant-referrals/:id` | 審核商家推薦 |

---

## 資料表設計

```typescript
// 推薦碼
referralCodes {
  id: serial PK,
  userId: string FK UNIQUE,
  code: string UNIQUE,        // 'AB1234'
  createdAt: timestamp
}

// 推薦關係（用戶）
userReferrals {
  id: serial PK,
  referrerId: string FK,      // 推薦人
  refereeId: string FK,       // 被推薦人
  status: 'registered' | 'activated', // activated = 完成首次扭蛋
  registeredAt: timestamp,
  activatedAt: timestamp | null,
  referrerRewardPaid: boolean,
  createdAt: timestamp
}
// UNIQUE: (refereeId) - 每人只能被推薦一次

// 商家推薦
merchantReferrals {
  id: serial PK,
  referrerId: string FK,      // 推薦人
  merchantName: string,
  address: string,
  city: string,
  country: string,
  category: string,
  contactInfo: string | null,
  googlePlaceId: string | null,
  notes: string | null,
  status: 'pending' | 'approved' | 'rejected' | 'merchant_registered',
  reviewedBy: string | null,
  reviewedAt: timestamp | null,
  linkedMerchantId: number | null, // 關聯的商家 ID
  createdAt: timestamp
}

// 用戶餘額
userBalances {
  userId: string PK,
  availableBalance: number default 0,
  pendingBalance: number default 0,
  lifetimeEarned: number default 0,
  lifetimeWithdrawn: number default 0,
  updatedAt: timestamp
}

// 餘額交易記錄
balanceTransactions {
  id: serial PK,
  userId: string FK,
  amount: number,             // 正=收入，負=支出
  type: 'referral_user' | 'referral_merchant' | 'withdraw' | 'adjustment',
  referenceType: string | null, // 'user_referral', 'merchant_referral', 'withdrawal'
  referenceId: number | null,
  description: string,
  createdAt: timestamp
}

// 提現申請
withdrawalRequests {
  id: serial PK,
  userId: string FK,
  amount: number,
  fee: number,                // 手續費
  netAmount: number,          // 實際匯款金額
  bankCode: string,
  bankAccount: string,
  accountName: string,
  status: 'pending' | 'processing' | 'completed' | 'rejected',
  processedBy: string | null,
  processedAt: timestamp | null,
  rejectionReason: string | null,
  createdAt: timestamp
}
```

---

## 防作弊機制

| 風險 | 防範措施 |
|------|----------|
| 自己推薦自己 | 檢查 IP、裝置指紋、同帳號 |
| 假帳號刷推薦 | 需完成首次扭蛋才算「激活」|
| 商家重複推薦 | 依 Google Place ID 或地址去重 |
| 虛假商家 | AI + 人工審核 |

---

## 與其他模組的關聯

- **經濟系統**: 推薦成功 → 觸發經驗值
- **成就系統**: 推廣者/業務成就線
- **認證系統**: 註冊時帶入推薦碼
- **商家模組**: 商家推薦 → place_drafts → merchants

---

## 待開發功能

- [ ] 推薦碼生成與驗證
- [ ] 用戶推薦流程
- [ ] 商家推薦流程
- [ ] 餘額系統
- [ ] 提現申請 API
- [ ] 提現後台管理
- [ ] 防作弊檢測
- [ ] 獎勵自動發放
