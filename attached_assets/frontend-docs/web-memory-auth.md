# 認證流程記憶庫 (官網)

## 認證機制

官網使用 **Cookie-based JWT 認證**，與 App 共用後端認證系統。

### 認證流程
```
1. 商家輸入帳密 → POST /api/merchant/login
2. 後端驗證 → 設定 HttpOnly Cookie
3. 後續請求自動帶 Cookie → 後端驗證 JWT
4. Token 過期 → 導向登入頁
```

---

## 頁面結構

```
app/merchant/
├── login/page.tsx          // 登入頁
├── register/page.tsx       // 註冊頁（可選）
├── forgot-password/page.tsx // 忘記密碼
└── ...                     // 其他需登入頁面
```

---

## API 端點

### 商家登入
```typescript
POST /api/merchant/login

Body: {
  email: string;
  password: string;
}

Response: {
  success: boolean;
  merchant: {
    id: number;
    name: string;
    email: string;
    level: 'free' | 'pro' | 'premium' | 'partner';
  };
}

// Cookie 自動設定
Set-Cookie: auth_token=xxx; HttpOnly; Secure; SameSite=Lax; Path=/
```

### 驗證 Session
```typescript
GET /api/merchant/verify

Response: {
  authenticated: boolean;
  merchant?: {
    id: number;
    name: string;
    email: string;
    level: string;
  };
}
```

### 登出
```typescript
POST /api/merchant/logout

Response: {
  success: boolean;
}

// Cookie 被清除
```

---

## TypeScript Interface

```typescript
// types/auth.ts
export interface Merchant {
  id: number;
  name: string;
  email: string;
  level: 'free' | 'pro' | 'premium' | 'partner';
  avatarUrl?: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  merchant: Merchant | null;
  isLoading: boolean;
}
```

---

## 登入頁 UI

```tsx
// app/merchant/login/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { toast } from 'sonner';

export default function MerchantLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch('/api/merchant/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || '登入失敗');
      }

      toast.success('登入成功');
      router.push('/merchant/dashboard');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-xl p-8">
        <h1 className="text-2xl font-bold text-center">商家登入</h1>
        <p className="text-gray-600 text-center mt-2">
          登入您的商家帳戶
        </p>

        <form onSubmit={handleSubmit} className="mt-8 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              電子郵件
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              密碼
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:border-primary focus:ring-2 focus:ring-primary/20 outline-none transition"
              placeholder="••••••••"
            />
          </div>

          <div className="flex justify-end">
            <a 
              href="/merchant/forgot-password" 
              className="text-sm text-primary hover:underline"
            >
              忘記密碼？
            </a>
          </div>

          <Button 
            type="submit" 
            loading={loading}
            className="w-full"
            size="lg"
          >
            登入
          </Button>
        </form>

        <div className="mt-6 text-center text-gray-600">
          還沒有帳戶？{' '}
          <a href="/merchant/register" className="text-primary hover:underline">
            立即註冊
          </a>
        </div>
      </div>
    </div>
  );
}
```

---

## 認證 Context

```tsx
// contexts/AuthContext.tsx
'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface Merchant {
  id: number;
  name: string;
  email: string;
  level: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  merchant: Merchant | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [merchant, setMerchant] = useState<Merchant | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    refresh();
  }, []);

  const refresh = async () => {
    try {
      const res = await fetch('/api/merchant/verify', {
        credentials: 'include',
      });
      const data = await res.json();
      
      if (data.authenticated && data.merchant) {
        setMerchant(data.merchant);
      } else {
        setMerchant(null);
      }
    } catch {
      setMerchant(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/merchant/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const error = await res.json();
      throw new Error(error.message || '登入失敗');
    }

    const data = await res.json();
    setMerchant(data.merchant);
  };

  const logout = async () => {
    await fetch('/api/merchant/logout', {
      method: 'POST',
      credentials: 'include',
    });
    setMerchant(null);
  };

  return (
    <AuthContext.Provider
      value={{
        isAuthenticated: !!merchant,
        merchant,
        isLoading,
        login,
        logout,
        refresh,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
```

---

## Middleware 保護

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // 商家專區需要登入（排除登入/註冊頁）
  const protectedPaths = ['/merchant/dashboard', '/merchant/subscription', '/merchant/places'];
  const isProtected = protectedPaths.some(path => pathname.startsWith(path));
  
  if (isProtected) {
    const token = request.cookies.get('auth_token');
    
    if (!token) {
      const loginUrl = new URL('/merchant/login', request.url);
      loginUrl.searchParams.set('redirect', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }
  
  return NextResponse.next();
}

export const config = {
  matcher: ['/merchant/:path*'],
};
```

---

## 使用範例

### 在需登入頁面中
```tsx
// app/merchant/dashboard/page.tsx
'use client';

import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function DashboardPage() {
  const { isAuthenticated, merchant, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/merchant/login');
    }
  }, [isAuthenticated, isLoading, router]);

  if (isLoading) return <LoadingSpinner />;
  if (!merchant) return null;

  return (
    <div>
      <h1>歡迎回來，{merchant.name}</h1>
      <p>您的方案：{merchant.level.toUpperCase()}</p>
    </div>
  );
}
```

### 登出按鈕
```tsx
function LogoutButton() {
  const { logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.push('/');
    toast.success('已登出');
  };

  return (
    <button onClick={handleLogout} className="text-red-600">
      登出
    </button>
  );
}
```

---

## 安全注意事項

- JWT Token 存在 HttpOnly Cookie，前端無法讀取
- 所有 API 請求需帶 `credentials: 'include'`
- Token 有效期 7 天
- 敏感操作（如變更密碼）需重新驗證
