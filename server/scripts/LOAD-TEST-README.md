# MIBU Backend Load Test

使用 k6 進行 MIBU 後端 API 壓力測試，目標為 DAU 1000（並發約 100-150 用戶）。

## 安裝 k6

### macOS
```bash
brew install k6
```

### Linux (Debian/Ubuntu)
```bash
sudo gpg -k
sudo gpg --no-default-keyring --keyring /usr/share/keyrings/k6-archive-keyring.gpg --keyserver hkp://keyserver.ubuntu.com:80 --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update
sudo apt-get install k6
```

### Windows
```bash
choco install k6
# 或
winget install k6
```

### Docker
```bash
docker pull grafana/k6
```

## 執行測試

### 基本執行
```bash
k6 run server/scripts/load-test.js
```

### 指定 Base URL（本地開發測試）
```bash
k6 run --env BASE_URL=http://localhost:5000 server/scripts/load-test.js
```

### 使用 Docker 執行
```bash
docker run -i grafana/k6 run - < server/scripts/load-test.js
```

### 輸出 JSON 結果
```bash
k6 run --out json=results.json server/scripts/load-test.js
```

### 輸出 CSV 結果
```bash
k6 run --out csv=results.csv server/scripts/load-test.js
```

## 測試階段

測試分為四個階段，模擬真實的流量模式：

| 階段 | 時長 | 用戶數 | 說明 |
|------|------|--------|------|
| Ramp-up | 1 分鐘 | 0 -> 50 | 逐步增加負載 |
| Stable | 3 分鐘 | 100 | 穩定負載測試 |
| Peak | 1 分鐘 | 150 | 尖峰負載測試 |
| Ramp-down | 1 分鐘 | 150 -> 0 | 逐步降載 |

**總測試時長：約 6.5 分鐘**

## 測試的 API 端點

### 核心扭蛋
- `POST /api/gacha/itinerary/v3` - 抽取行程（含 AI 排序）

### 認證
- `GET /api/auth/user` - 取得當前用戶

### 高頻讀取
- `GET /api/collections` - 用戶圖鑑
- `GET /api/seo/places/by-id/:id` - 景點詳情
- `GET /api/locations/regions/:countryId` - 縣市列表
- `GET /api/locations/countries` - 國家列表
- `GET /api/seo/cities` - 城市列表

### 商家
- `GET /api/coupons/region/:regionId/pool` - 區域優惠券獎池

### 其他
- `GET /api/announcements` - 公告列表

## 效能閾值

| 指標 | 閾值 | 說明 |
|------|------|------|
| HTTP P95 回應時間 | < 500ms | 全局 95% 回應時間 |
| HTTP 錯誤率 | < 1% | 整體錯誤率 |
| Gacha P95 | < 2000ms | 扭蛋 API（含 AI 呼叫）|
| Auth P95 | < 300ms | 認證 API |
| Collections P95 | < 400ms | 圖鑑 API |
| Places P95 | < 300ms | 景點 API |
| Regions P95 | < 200ms | 地區 API（可快取）|
| Gacha 成功率 | > 95% | 扭蛋成功率 |
| Auth 成功率 | > 99% | 認證成功率 |

## 測試場景分布

| 場景 | 比例 | 說明 |
|------|------|------|
| Full User Journey | 5% | 完整用戶流程 |
| Gacha Flow | 20% | 扭蛋抽取 |
| Browse Places | 20% | 瀏覽景點 |
| Browse Regions | 20% | 瀏覽地區 |
| Auth Check | 15% | 認證檢查（模擬 App 啟動）|
| Quick API Calls | 20% | 快速 API 呼叫 |

## 結果解讀

### 重要指標
- **http_req_duration**: HTTP 請求持續時間
  - `avg`: 平均回應時間
  - `p(95)`: 95% 請求在此時間內完成
  - `max`: 最大回應時間

- **http_req_failed**: HTTP 請求失敗率

- **http_reqs**: 總請求數和每秒請求數

- **vus**: 虛擬用戶數

### 自定義指標
- **gacha_success_rate**: 扭蛋 API 成功率
- **gacha_duration**: 扭蛋 API 回應時間趨勢
- **auth_success_rate**: 認證 API 成功率
- **api_errors**: 累計 API 錯誤數

## 範例輸出

```
          /\      |‾‾| /‾‾/   /‾‾/
     /\  /  \     |  |/  /   /  /
    /  \/    \    |     (   /   ‾‾\
   /          \   |  |\  \ |  (‾)  |
  / __________ \  |__| \__\ \_____/ .io

  execution: local
     script: server/scripts/load-test.js
     output: -

  scenarios: (100.00%) 1 scenario, 150 max VUs, 7m30s max duration
           * default: Up to 150 looping VUs for 6m30s

running (6m30.0s), 000/150 VUs, 12847 complete and 0 interrupted iterations
default ✓ [======================================] 000/150 VUs  6m30s

     ✓ Gacha V3: valid status
     ✓ Gacha V3: has itinerary or error
     ✓ GET /api/seo/cities: status is 200
     ✓ GET /api/locations/regions: status is 200

     checks.........................: 99.52% ✓ 51234     ✗ 245
     data_received..................: 89 MB  229 kB/s
     data_sent......................: 4.2 MB 11 kB/s
     gacha_duration.................: avg=1234ms  min=456ms max=4523ms p(95)=1890ms
     gacha_success_rate.............: 97.23% ✓ 2456      ✗ 70
     http_req_blocked...............: avg=1.23ms  min=0s    max=456ms  p(95)=3.45ms
     http_req_duration..............: avg=234ms   min=12ms  max=4523ms p(95)=478ms
       { endpoint:auth_user }.......: avg=45ms    min=12ms  max=234ms  p(95)=123ms
       { endpoint:gacha_v3 }........: avg=1234ms  min=456ms max=4523ms p(95)=1890ms
       { endpoint:regions }.........: avg=34ms    min=8ms   max=156ms  p(95)=89ms
     http_req_failed................: 0.48%  ✓ 245       ✗ 51234
     http_reqs......................: 51479  131.8/s
     vus............................: 1      min=1       max=150
     vus_max........................: 150    min=150     max=150
```

## 進階使用

### 帶認證測試
如果需要測試認證後的端點，請設定 JWT Token：

```bash
k6 run --env TEST_JWT_TOKEN=your_jwt_token server/scripts/load-test.js
```

然後在腳本中啟用 `authenticatedScenario` 函數。

### 調整測試強度

修改 `load-test.js` 中的 `options.stages` 來調整：

```javascript
export const options = {
  stages: [
    { duration: '2m', target: 100 },   // 更長的 ramp-up
    { duration: '5m', target: 200 },   // 更高的負載
    { duration: '2m', target: 300 },   // 更高的尖峰
    { duration: '2m', target: 0 },
  ],
  // ...
};
```

### 持續集成整合

```yaml
# GitHub Actions 範例
- name: Run Load Tests
  run: |
    k6 run --out json=results.json server/scripts/load-test.js
    # 分析結果並判斷是否通過
```

### 將結果輸出到 Grafana Cloud

```bash
k6 run --out cloud server/scripts/load-test.js
```

需要先設定 `K6_CLOUD_TOKEN` 環境變數。

## 注意事項

1. **生產環境測試**：請在非尖峰時段執行，避免影響真實用戶
2. **API 限流**：扭蛋 API 有每日限額（36 張/天），測試時會觸發限流
3. **AI 呼叫**：扭蛋 API 包含 Gemini AI 呼叫，回應時間較長是正常的
4. **認證端點**：無 token 時會返回 401，這是預期行為
5. **資料依賴**：確保測試環境有足夠的景點資料

## 問題排查

### 錯誤率過高
- 檢查 API 服務是否正常運行
- 檢查網路連線是否穩定
- 降低並發用戶數重新測試

### 回應時間過長
- 檢查資料庫連線是否有瓶頸
- 檢查 AI API 回應時間
- 考慮增加快取機制

### 測試無法啟動
- 確認 k6 已正確安裝
- 確認 BASE_URL 可以訪問
- 檢查腳本語法是否正確

## 相關文件

- [k6 官方文檔](https://k6.io/docs/)
- [MIBU API 文檔](/docs/memory-api-dictionary.md)
- [部署文檔](/docs/memory-deployment.md)
