# 元件庫記憶庫 (官網)

## 設計系統

### 顏色
```css
:root {
  --primary: #6366f1;        /* Indigo 500 */
  --primary-dark: #4f46e5;   /* Indigo 600 */
  --secondary: #f59e0b;      /* Amber 500 */
  --success: #10b981;        /* Emerald 500 */
  --warning: #f59e0b;        /* Amber 500 */
  --error: #ef4444;          /* Red 500 */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-500: #6b7280;
  --gray-900: #111827;
}
```

### 字體
```tsx
// app/layout.tsx
import { Noto_Sans_TC } from 'next/font/google';

const notoSans = Noto_Sans_TC({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  display: 'swap',
});
```

### 間距
```
4px, 8px, 12px, 16px, 24px, 32px, 48px, 64px
```

---

## 共用元件

### Button
```tsx
// components/ui/Button.tsx
import { cva } from 'class-variance-authority';

const buttonVariants = cva(
  'inline-flex items-center justify-center rounded-xl font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
  {
    variants: {
      variant: {
        primary: 'bg-primary text-white hover:bg-primary-dark focus:ring-primary',
        secondary: 'bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500',
        outline: 'border-2 border-primary text-primary hover:bg-primary/5 focus:ring-primary',
        ghost: 'text-gray-600 hover:bg-gray-100 hover:text-gray-900',
        danger: 'bg-red-500 text-white hover:bg-red-600 focus:ring-red-500',
      },
      size: {
        sm: 'px-3 py-1.5 text-sm',
        md: 'px-4 py-2 text-base',
        lg: 'px-6 py-3 text-lg',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
    },
  }
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
}

export function Button({ 
  variant, size, loading, children, disabled, ...props 
}: ButtonProps) {
  return (
    <button
      className={buttonVariants({ variant, size })}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Spinner className="mr-2 h-4 w-4" />}
      {children}
    </button>
  );
}
```

### Card
```tsx
// components/ui/Card.tsx
interface CardProps {
  children: React.ReactNode;
  className?: string;
  hover?: boolean;
}

export function Card({ children, className = '', hover = false }: CardProps) {
  return (
    <div className={`
      bg-white rounded-2xl shadow-lg p-6
      ${hover ? 'hover:shadow-xl transition-shadow cursor-pointer' : ''}
      ${className}
    `}>
      {children}
    </div>
  );
}

export function CardHeader({ children, className = '' }) {
  return <div className={`mb-4 ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`text-xl font-bold ${className}`}>{children}</h3>;
}

export function CardContent({ children, className = '' }) {
  return <div className={className}>{children}</div>;
}
```

### Dialog (Modal)
```tsx
// components/ui/Dialog.tsx
import * as DialogPrimitive from '@radix-ui/react-dialog';

export function Dialog({ open, onOpenChange, children }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      {children}
    </DialogPrimitive.Root>
  );
}

export function DialogContent({ children, className = '' }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-black/50 z-50" />
      <DialogPrimitive.Content className={`
        fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2
        bg-white rounded-2xl shadow-xl p-6 z-50
        max-w-md w-full max-h-[90vh] overflow-y-auto
        ${className}
      `}>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function DialogHeader({ children }) {
  return <div className="mb-4">{children}</div>;
}

export function DialogTitle({ children }) {
  return (
    <DialogPrimitive.Title className="text-xl font-bold">
      {children}
    </DialogPrimitive.Title>
  );
}

export function DialogFooter({ children }) {
  return <div className="flex justify-end gap-3 mt-6">{children}</div>;
}
```

### Toast
```tsx
// 使用 sonner 套件
import { Toaster, toast } from 'sonner';

// 在 layout.tsx 中
<Toaster position="top-right" richColors />

// 使用方式
toast.success('訂閱成功！');
toast.error('操作失敗，請稍後再試');
toast.loading('處理中...');
```

### Spinner
```tsx
// components/ui/Spinner.tsx
export function Spinner({ className = 'h-6 w-6' }) {
  return (
    <svg
      className={`animate-spin text-current ${className}`}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}
```

---

## 業務元件

### PricingCard
```tsx
// components/pricing/PricingCard.tsx
// 見 memory-merchant-subscription.md
```

### PaymentMethodSelector
```tsx
// components/pricing/PaymentMethodSelector.tsx
// 見 memory-merchant-subscription.md
```

### Header
```tsx
// components/layout/Header.tsx
export function Header() {
  return (
    <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b">
      <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Mibu" width={32} height={32} />
          <span className="font-bold text-xl">Mibu</span>
        </Link>
        
        <nav className="hidden md:flex items-center gap-8">
          <Link href="/features" className="text-gray-600 hover:text-gray-900">
            功能
          </Link>
          <Link href="/pricing" className="text-gray-600 hover:text-gray-900">
            方案
          </Link>
          <Link href="/about" className="text-gray-600 hover:text-gray-900">
            關於
          </Link>
        </nav>
        
        <div className="flex items-center gap-4">
          <Link href="/merchant/login">
            <Button variant="outline" size="sm">商家登入</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
```

### Footer
```tsx
// components/layout/Footer.tsx
export function Footer() {
  return (
    <footer className="bg-gray-900 text-white py-12">
      <div className="max-w-7xl mx-auto px-4">
        <div className="grid md:grid-cols-4 gap-8">
          <div>
            <Image src="/logo-white.svg" alt="Mibu" width={32} height={32} />
            <p className="mt-4 text-gray-400">
              專為自由行旅客打造的旅遊安全平台
            </p>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">產品</h4>
            <ul className="space-y-2 text-gray-400">
              <li><Link href="/features">功能介紹</Link></li>
              <li><Link href="/pricing">訂閱方案</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">公司</h4>
            <ul className="space-y-2 text-gray-400">
              <li><Link href="/about">關於我們</Link></li>
              <li><Link href="/contact">聯絡我們</Link></li>
            </ul>
          </div>
          
          <div>
            <h4 className="font-semibold mb-4">法律</h4>
            <ul className="space-y-2 text-gray-400">
              <li><Link href="/privacy">隱私政策</Link></li>
              <li><Link href="/terms">服務條款</Link></li>
            </ul>
          </div>
        </div>
        
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-gray-400">
          © {new Date().getFullYear()} Mibu. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
```

---

## 動畫

### Framer Motion 常用動畫
```tsx
import { motion } from 'framer-motion';

// 淡入
const fadeIn = {
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5 },
};

// 使用
<motion.div {...fadeIn}>Content</motion.div>

// 交錯動畫（列表）
const stagger = {
  animate: {
    transition: {
      staggerChildren: 0.1,
    },
  },
};

<motion.ul variants={stagger} initial="initial" animate="animate">
  {items.map(item => (
    <motion.li key={item.id} variants={fadeIn}>
      {item.name}
    </motion.li>
  ))}
</motion.ul>
```
