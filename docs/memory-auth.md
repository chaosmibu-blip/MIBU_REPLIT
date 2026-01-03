# 認證與權限記憶庫 (Authentication & Authorization)

## 模組範圍
用戶身份認證、Session 管理、JWT Token、角色權限控制。

---

## 認證方式

### 1. Replit Auth (Web Admin)
```typescript
// Session-based 認證
// 使用 connect.sid Cookie

// 中介軟體
import { isAuthenticated } from './replitAuth';

app.get('/api/protected', isAuthenticated, (req, res) => {
  const userId = req.user.claims.sub;
});
```

### 2. Apple Sign In (Mobile)
```typescript
POST /api/auth/apple
Body: { identityToken: string }

// 後端驗證
import appleSignIn from 'apple-signin-auth';

const payload = await appleSignIn.verifyIdToken(identityToken, {
  audience: process.env.APPLE_CLIENT_ID
});

// payload = { sub, email, email_verified }
```

### 3. JWT Token (Mobile API)
```typescript
// 登入成功後發放 JWT
const token = jwt.sign(
  { userId, email, role },
  process.env.JWT_SECRET,
  { expiresIn: '7d' }
);

// 請求時帶入 Header
Authorization: Bearer <token>

// 後端驗證中介軟體
const verifyJWT = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  const decoded = jwt.verify(token, process.env.JWT_SECRET);
  req.jwtUser = decoded;
  next();
};
```

---

## JWT 結構

```typescript
interface JWTPayload {
  userId: string;      // Apple/Google sub
  email: string;
  role: 'user' | 'merchant' | 'specialist' | 'admin';
  iat: number;         // 發放時間
  exp: number;         // 過期時間 (7 天後)
}
```

### JWT Secret
```
JWT_SECRET=mibu_secret_key_2024_xxx
```
⚠️ 開發/生產環境必須使用相同的 JWT_SECRET，否則 Token 無法跨環境驗證

---

## 角色權限 (RBAC)

### 角色定義
```typescript
type UserRole = 'user' | 'merchant' | 'specialist' | 'admin';
```

### 權限矩陣
| 功能 | user | merchant | specialist | admin |
|------|------|----------|------------|-------|
| 扭蛋抽卡 | ✅ | ✅ | ✅ | ✅ |
| 建立行程 | ✅ | ✅ | ✅ | ✅ |
| 認領店家 | ❌ | ✅ | ❌ | ✅ |
| 建立優惠券 | ❌ | ✅ | ❌ | ✅ |
| 提供服務 | ❌ | ❌ | ✅ | ✅ |
| 審核景點 | ❌ | ❌ | ❌ | ✅ |
| 管理用戶 | ❌ | ❌ | ❌ | ✅ |

### 權限檢查中介軟體
```typescript
const requireRole = (...roles: UserRole[]) => {
  return (req, res, next) => {
    const userRole = req.user?.role || req.jwtUser?.role;
    if (!roles.includes(userRole)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    next();
  };
};

// 使用
app.get('/api/admin/users', isAuthenticated, requireRole('admin'), handler);
```

---

## Super Admin

### 環境變數
```
SUPER_ADMIN_EMAIL=xxx@xxx.com
SUPER_ADMIN_PASSWORD=xxx
```

### 用途
- 初始管理員登入
- 緊急存取
- 不依賴第三方認證

---

## Session 管理

### Web Session
```typescript
import session from 'express-session';
import pgSession from 'connect-pg-simple';

app.use(session({
  store: new (pgSession(session))({ pool }),
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 天
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true
  }
}));
```

### Session 資料表
```typescript
// sessions 表 (由 connect-pg-simple 管理)
{
  sid: string PRIMARY KEY;
  sess: json;
  expire: timestamp;
}
```

---

## 認證流程圖

### Apple Sign In
```
Mobile App                    Backend                      Apple
    |                            |                           |
    |-- identityToken ---------> |                           |
    |                            |-- verifyIdToken --------> |
    |                            | <---- payload (sub,email) |
    |                            |                           |
    |                            |-- upsert user ----------> DB
    |                            |-- generate JWT            |
    | <----- { token, user } --- |                           |
    |                            |                           |
    |-- API request + Bearer --> |                           |
    |                            |-- verify JWT              |
    | <----- response ---------- |                           |
```

---

## 安全注意事項

1. **JWT Secret 保密**
   - 不要 commit 到版本控制
   - 開發/生產使用相同 secret
   - ✅ 2026-01-03 已設定 `JWT_SECRET` 環境變數

2. **Token 過期處理**
   - 前端檢測 401 → 重新登入
   - 不實作 refresh token（簡化）

3. **CORS 設定**
   - 允許來源白名單
   - credentials: true

4. **Rate Limiting**
   - 登入 API: 5 req/min
   - Admin API: 10 req/min（✅ 2026-01-03 已添加）
   - 防止暴力破解

---

## 資安檢查記錄（2026-01-03）

### 已修復問題
| 問題 | 修復方式 |
|------|---------|
| 硬編碼 JWT Secret | ✅ 移至環境變數 `JWT_SECRET` |
| 硬編碼 Migration Key | ✅ 移至環境變數 `ADMIN_MIGRATION_KEY` |
| Debug 日誌洩露 Token | ✅ 移除 replitAuth.ts 中的 debug console.log |
| Admin API 無 Rate Limit | ✅ 添加 adminRateLimiter（10 req/min） |
| SQL 注入風險 | ✅ export-places API 改用參數化查詢 |

### 尚可接受的風險
| 問題 | 說明 |
|------|------|
| unify-categories 的 sql.raw | 值為硬編碼（非用戶輸入），風險低 |
| delete-blacklist-places 的 sql.raw | 值為硬編碼（非用戶輸入），風險低 |
| Mapbox Token 公開 | 設計如此，需在 Mapbox Dashboard 限制 URL |
| Stripe clientSecret 回傳前端 | Stripe 標準設計，用於 PaymentIntent |

### 前端自我檢查清單
```
□ 使用 expo-secure-store 儲存 JWT Token
□ 不使用 AsyncStorage 儲存敏感資訊
□ 所有 API 請求使用 HTTPS
□ 移除 console.log 中的 Token/密碼輸出
□ 正式版關閉 React Native Debug Mode
□ .env 檔案不會被打包進 App
□ 深層連結驗證來源
```

---

## 待開發功能
- [ ] Google Sign In
- [ ] Refresh Token 機制
- [ ] 雙因素認證 (2FA)
- [ ] 登入記錄 / 異常登入通知
- [ ] OAuth2 for 第三方應用
