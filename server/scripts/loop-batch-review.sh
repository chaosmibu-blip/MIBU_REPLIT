#!/bin/bash
# 迴圈呼叫批次審核 API
# 每次處理 5 筆，避免 60 秒限制

LOG_FILE="/tmp/loop-batch-review.log"
TOTAL_PROCESSED=0
BATCH_COUNT=0

echo "🚀 開始迴圈批次審核 $(date)" | tee -a $LOG_FILE

while true; do
  BATCH_COUNT=$((BATCH_COUNT + 1))
  
  # 呼叫 API（需要先登入取得 cookie）
  # 這裡直接用內部 curl，實際使用需要有效的 session
  RESULT=$(curl -s -X POST http://localhost:5000/api/admin/place-cache/batch-review \
    -H "Content-Type: application/json" \
    -H "Cookie: $ADMIN_COOKIE" \
    -d '{"limit": 5}' 2>/dev/null)
  
  REMAINING=$(echo $RESULT | grep -o '"remaining":[0-9]*' | grep -o '[0-9]*')
  REVIEWED=$(echo $RESULT | grep -o '"reviewed":[0-9]*' | grep -o '[0-9]*')
  
  if [ -z "$REMAINING" ] || [ "$REMAINING" = "0" ]; then
    echo "✅ 全部完成！" | tee -a $LOG_FILE
    break
  fi
  
  TOTAL_PROCESSED=$((TOTAL_PROCESSED + REVIEWED))
  echo "📦 批次 #$BATCH_COUNT: 處理 $REVIEWED 筆, 剩餘 $REMAINING 筆" | tee -a $LOG_FILE
  
  # 等待 2 秒再繼續
  sleep 2
done

echo "🎉 完成！總共處理 $TOTAL_PROCESSED 筆 $(date)" | tee -a $LOG_FILE
