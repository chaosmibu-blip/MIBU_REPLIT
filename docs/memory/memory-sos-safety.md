# SOS 安全系統記憶庫 (SOS Safety Module)

## 模組範圍
旅客緊急求助系統，包含 SOS 觸發、即時位置追蹤、緊急聯絡人通知、警報機制。

## 核心流程
```
1. 用戶觸發 SOS（長按按鈕 3 秒）
2. 建立 sos_events 記錄
3. 開始即時位置追蹤（每 30 秒更新）
4. 發送警報給緊急聯絡人
5. 可選：通知附近旅伴
6. 用戶主動取消或逾時自動關閉（24 小時）
```

## 相關資料表

### sos_events (SOS 事件)
```typescript
{
  id: number;
  eventCode: string;         // 唯一識別碼 e.g. SOS-20241224-ABC123
  userId: string;
  status: 'active' | 'resolved' | 'cancelled' | 'expired';
  triggerType: 'manual' | 'auto' | 'fall_detected';
  initialLatitude: number;
  initialLongitude: number;
  lastLatitude?: number;
  lastLongitude?: number;
  lastLocationUpdate?: Date;
  notes?: string;            // 用戶備註
  resolvedAt?: Date;
  resolvedBy?: string;       // 誰解除的
  createdAt: Date;
}
```

### sos_alerts (SOS 警報)
```typescript
{
  id: number;
  sosEventId: number;
  recipientType: 'emergency_contact' | 'companion' | 'admin';
  recipientId?: string;      // userId 或 contactId
  recipientPhone?: string;
  recipientEmail?: string;
  alertMethod: 'sms' | 'push' | 'email';
  status: 'pending' | 'sent' | 'delivered' | 'failed';
  sentAt?: Date;
  deliveredAt?: Date;
  errorMessage?: string;
}
```

### user_locations (即時位置)
```typescript
{
  id: number;
  userId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;         // 精確度（公尺）
  altitude?: number;
  speed?: number;
  heading?: number;
  updatedAt: Date;
}
// SOS 期間每 30 秒更新
// 正常狀態可選擇性更新（旅伴追蹤）
```

## 主要 API

### SOS 操作
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/sos/trigger | 觸發 SOS |
| POST | /api/sos/cancel | 取消 SOS |
| GET | /api/sos/status | 查詢當前狀態 |
| GET | /api/sos/history | SOS 歷史記錄 |

### 位置更新
| Method | Endpoint | 說明 |
|--------|----------|------|
| POST | /api/sos/location | 更新位置 |
| GET | /api/sos/location/:eventId | 取得事件位置歷史 |

### 緊急聯絡人
| Method | Endpoint | 說明 |
|--------|----------|------|
| GET | /api/emergency-contacts | 列出緊急聯絡人 |
| POST | /api/emergency-contacts | 新增聯絡人 |
| PATCH | /api/emergency-contacts/:id | 更新聯絡人 |
| DELETE | /api/emergency-contacts/:id | 刪除聯絡人 |

## SOS 觸發請求
```typescript
POST /api/sos/trigger
Body: {
  latitude: number;
  longitude: number;
  accuracy?: number;
  notes?: string;            // "我在這裡迷路了"
  triggerType?: 'manual' | 'fall_detected';
}

Response: {
  success: true;
  eventCode: "SOS-20241224-ABC123";
  message: "SOS 已啟動，緊急聯絡人將收到通知";
}
```

## 警報發送機制

### SMS 通知 (Twilio)
```typescript
// 訊息模板
`【Mibu 緊急通知】
${userName} 觸發了 SOS 求助！
位置：${locationUrl}
時間：${timestamp}
請立即確認安全狀況。`
```

### Push 通知
```typescript
{
  title: "緊急求助",
  body: "${userName} 需要您的幫助",
  data: {
    type: "sos_alert",
    eventCode: "SOS-xxx",
    location: { lat, lng }
  }
}
```

## Socket.IO 即時追蹤
```typescript
// 連接
socket.emit('sos:join', { eventCode });

// 位置更新
socket.on('sos:location', (data) => {
  // { latitude, longitude, timestamp }
});

// SOS 狀態變更
socket.on('sos:status', (data) => {
  // { status: 'resolved' | 'cancelled' }
});
```

## 自動清理排程
```typescript
// 每 1 小時執行
// 將超過 24 小時的 active 事件標記為 expired
AutoCleanup: "0 * * * *"
```

## 安全與隱私
- 位置資料僅在 SOS 期間頻繁更新
- 歷史位置資料保留 30 天
- 緊急聯絡人需驗證（簡訊驗證碼）
- 位置資料加密傳輸

## 待開發功能
- [ ] 跌倒偵測自動觸發
- [ ] 語音求助
- [ ] 與當地警察局連動
- [ ] 離線 SOS（預錄訊息）
- [ ] 安全區域設定（離開時警報）
