# 策劃師服務金流記憶庫 (App 專用)

## 模組範圍
旅客在 App 中購買策劃師服務的完整金流流程。

> ⚠️ 這是 App 中唯一的金流入口，商家訂閱僅在官網提供。

---

## 畫面結構

```
screens/
├── specialist/
│   ├── SpecialistProfileScreen.tsx    // 策劃師個人頁（含服務列表）
│   ├── ServiceDetailScreen.tsx        // 服務詳情頁
│   ├── ServiceCheckoutScreen.tsx      // 付款確認頁
│   ├── ServiceSuccessScreen.tsx       // 付款成功頁
│   └── MyOrdersScreen.tsx             // 我的訂單列表
```

---

## 服務類型

| 類型 | 說明 | 價格範圍 |
|------|------|---------|
| `consultation` | 線上諮詢 | NT$200-500/30分鐘 |
| `trip_planning` | 行程規劃 | NT$500-2000/次 |
| `local_assist` | 在地協助 | NT$300-800/小時 |

---

## API 端點

### 1. 取得策劃師服務列表
```typescript
GET /api/specialist/:specialistId/services

Response: {
  services: Array<{
    id: number;
    name: string;
    description: string;
    type: 'consultation' | 'trip_planning' | 'local_assist';
    price: number;
    duration: number;  // 分鐘
    isActive: boolean;
  }>;
}
```

### 2. 購買服務（建立訂單）
```typescript
POST /api/specialist/service/purchase

Body: {
  specialistId: number;
  serviceId: number;
  scheduledAt?: string;  // ISO 日期，預約時間
  notes?: string;        // 備註
}

Response: {
  orderId: number;
  orderNumber: string;
  amount: number;
  status: 'pending';
  paymentUrl?: string;   // 若需跳轉付款
}
```

### 3. 我的訂單列表
```typescript
GET /api/user/specialist-orders

Response: {
  orders: Array<{
    id: number;
    orderNumber: string;
    serviceName: string;
    specialistName: string;
    specialistAvatar: string;
    amount: number;
    status: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled';
    scheduledAt?: string;
    createdAt: string;
  }>;
}
```

### 4. 訂單詳情
```typescript
GET /api/user/specialist-orders/:orderId

Response: {
  order: {
    id: number;
    orderNumber: string;
    service: { id, name, description, type, duration };
    specialist: { id, name, avatar, rating };
    amount: number;
    status: string;
    scheduledAt?: string;
    notes?: string;
    createdAt: string;
    paidAt?: string;
    completedAt?: string;
  };
}
```

---

## TypeScript Interface

```typescript
// types/specialist.ts

export interface SpecialistService {
  id: number;
  name: string;
  description: string;
  type: 'consultation' | 'trip_planning' | 'local_assist';
  price: number;
  duration: number;
  isActive: boolean;
}

export interface SpecialistOrder {
  id: number;
  orderNumber: string;
  serviceName: string;
  specialistName: string;
  specialistAvatar: string;
  amount: number;
  status: 'pending' | 'paid' | 'confirmed' | 'completed' | 'cancelled';
  scheduledAt?: string;
  createdAt: string;
}

export type ServiceOrderStatus = 
  | 'pending'      // 待付款
  | 'paid'         // 已付款
  | 'confirmed'    // 策劃師已確認
  | 'completed'    // 服務完成
  | 'cancelled';   // 已取消
```

---

## UI 元件實作

### 1. 策劃師服務列表
```tsx
// SpecialistProfileScreen.tsx
<View className="flex-1 bg-white">
  {/* 策劃師頭像與資訊 */}
  <View className="p-4 items-center">
    <Image source={{ uri: specialist.avatarUrl }} className="w-24 h-24 rounded-full" />
    <Text className="text-xl font-bold mt-2">{specialist.name}</Text>
    <Text className="text-gray-500">{specialist.title}</Text>
    <View className="flex-row mt-2">
      <StarRating rating={specialist.rating} />
      <Text className="ml-2 text-gray-600">({specialist.reviewCount})</Text>
    </View>
  </View>

  {/* 服務列表 */}
  <Text className="px-4 text-lg font-semibold">提供服務</Text>
  <FlatList
    data={specialist.services}
    renderItem={({ item }) => (
      <Pressable 
        className="mx-4 my-2 p-4 bg-gray-50 rounded-xl"
        onPress={() => navigation.navigate('ServiceDetail', { serviceId: item.id })}
      >
        <Text className="font-semibold">{item.name}</Text>
        <Text className="text-gray-600 text-sm mt-1">{item.description}</Text>
        <View className="flex-row justify-between mt-2">
          <Text className="text-primary font-bold">NT${item.price}</Text>
          <Text className="text-gray-400">{item.duration}分鐘</Text>
        </View>
      </Pressable>
    )}
  />
</View>
```

### 2. 付款確認頁
```tsx
// ServiceCheckoutScreen.tsx
<View className="flex-1 bg-white p-4">
  {/* 服務摘要 */}
  <View className="bg-gray-50 rounded-xl p-4">
    <Text className="text-lg font-bold">{service.name}</Text>
    <Text className="text-gray-600 mt-1">{specialist.name}</Text>
    <View className="border-t border-gray-200 mt-4 pt-4">
      <View className="flex-row justify-between">
        <Text>服務費用</Text>
        <Text className="font-semibold">NT${service.price}</Text>
      </View>
    </View>
  </View>

  {/* 付款按鈕 */}
  <Pressable 
    className="mt-6 bg-primary py-4 rounded-xl items-center"
    onPress={handlePurchase}
    disabled={loading}
  >
    <Text className="text-white font-bold text-lg">
      {loading ? '處理中...' : '確認付款'}
    </Text>
  </Pressable>
</View>
```

### 3. 訂單列表
```tsx
// MyOrdersScreen.tsx
<FlatList
  data={orders}
  renderItem={({ item }) => (
    <View className="mx-4 my-2 p-4 bg-white rounded-xl shadow-sm">
      <View className="flex-row justify-between">
        <Text className="font-semibold">{item.serviceName}</Text>
        <StatusBadge status={item.status} />
      </View>
      <Text className="text-gray-500 text-sm mt-1">{item.specialistName}</Text>
      <View className="flex-row justify-between mt-2">
        <Text className="text-gray-400">{formatDate(item.createdAt)}</Text>
        <Text className="font-bold text-primary">NT${item.amount}</Text>
      </View>
    </View>
  )}
/>
```

### 4. 狀態標籤元件
```tsx
// components/StatusBadge.tsx
const statusConfig = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: '待付款' },
  paid: { bg: 'bg-blue-100', text: 'text-blue-800', label: '已付款' },
  confirmed: { bg: 'bg-purple-100', text: 'text-purple-800', label: '已確認' },
  completed: { bg: 'bg-green-100', text: 'text-green-800', label: '已完成' },
  cancelled: { bg: 'bg-gray-100', text: 'text-gray-800', label: '已取消' },
};

export const StatusBadge = ({ status }: { status: ServiceOrderStatus }) => {
  const config = statusConfig[status];
  return (
    <View className={`px-2 py-1 rounded-full ${config.bg}`}>
      <Text className={`text-xs ${config.text}`}>{config.label}</Text>
    </View>
  );
};
```

---

## Socket 事件

```typescript
// 監聽訂單狀態更新
socket.on('specialist:order:updated', (data) => {
  // data: { orderId, status, updatedAt }
  // 更新本地狀態、顯示通知
});
```

---

## 錯誤處理

| 錯誤碼 | 說明 | 前端處理 |
|--------|------|---------|
| 400 | 參數錯誤 | 顯示具體錯誤訊息 |
| 401 | 未登入 | 導向登入頁 |
| 404 | 服務/策劃師不存在 | 顯示「服務不存在」並返回 |
| 409 | 時段已被預約 | 提示選擇其他時段 |
| 500 | 伺服器錯誤 | 顯示「系統繁忙，請稍後再試」 |

---

## 待開發功能
- [ ] 服務評價與評論
- [ ] 預約時段選擇器
- [ ] 取消訂單（有條件）
- [ ] 聊天室（訂單確認後開啟）
