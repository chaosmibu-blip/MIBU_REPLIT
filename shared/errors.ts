/**
 * 統一錯誤代碼表 (Global Error Code Enum)
 * 
 * 用途：前後端共用錯誤代碼，確保一致性
 * - 後端回傳 { errorCode: ErrorCode.AUTH_TOKEN_EXPIRED, message: '...' }
 * - 前端根據 errorCode 顯示對應的翻譯文案
 * 
 * 注意：此檔案必須是純 TypeScript，不依賴任何 Node.js 專用庫
 * 這樣 Expo 前端可以直接複製使用
 */

// ============ Error Code Enum ============
export enum ErrorCode {
  // Auth 認證相關 (E1xxx)
  AUTH_REQUIRED = 'E1001',
  AUTH_TOKEN_EXPIRED = 'E1002',
  AUTH_TOKEN_INVALID = 'E1003',
  INVALID_CREDENTIALS = 'E1004',
  EMAIL_ALREADY_EXISTS = 'E1005',
  PENDING_APPROVAL = 'E1006',
  ROLE_MISMATCH = 'E1007',
  ROLE_NOT_ACCESSIBLE = 'E1008',
  INVALID_ROLE = 'E1009',
  ADMIN_REQUIRED = 'E1010',
  FORBIDDEN = 'E1011',
  SPECIALIST_REQUIRED = 'E1012',
  ALREADY_REGISTERED = 'E1013',
  
  // Gacha 扭蛋相關 (E2xxx)
  GACHA_NO_CREDITS = 'E2001',
  GACHA_RATE_LIMITED = 'E2002',
  GACHA_GENERATION_FAILED = 'E2003',
  
  // Location 地點相關 (E3xxx)
  MISSING_LOCATION_ID = 'E3001',
  NO_DISTRICT_FOUND = 'E3002',
  REGION_NOT_FOUND = 'E3003',
  CITY_REQUIRED = 'E3004',
  NO_PLACES_AVAILABLE = 'E3005',
  COUNTRY_NOT_FOUND = 'E3006',
  
  // Merchant 商家相關 (E4xxx)
  MERCHANT_REQUIRED = 'E4001',
  MERCHANT_NOT_FOUND = 'E4002',
  NO_CODE_SET = 'E4003',
  CODE_EXPIRED = 'E4004',
  INVALID_CODE = 'E4005',
  COUPON_NOT_FOUND = 'E4006',
  COUPON_EXPIRED = 'E4007',
  COUPON_ALREADY_USED = 'E4008',
  PLACE_LIMIT_REACHED = 'E4009',
  COUPON_LIMIT_REACHED = 'E4010',
  RARITY_NOT_ALLOWED = 'E4011',

  // Validation 驗證相關 (E5xxx)
  VALIDATION_ERROR = 'E5001',
  INVALID_PARAMS = 'E5002',
  MISSING_REQUIRED_FIELD = 'E5003',
  CONFIG_READONLY = 'E5004',
  INVITE_EXPIRED = 'E5005',
  INVITE_ALREADY_USED = 'E5006',
  ALREADY_CLAIMED = 'E5007',
  ALREADY_ACTIVE = 'E5008',
  ALREADY_PROCESSED = 'E5009',
  ALREADY_COMPLETED = 'E5010',
  
  // Resource 資源相關 (E6xxx)
  RESOURCE_NOT_FOUND = 'E6001',
  USER_NOT_FOUND = 'E6002',
  COLLECTION_NOT_FOUND = 'E6003',
  INVENTORY_ITEM_NOT_FOUND = 'E6004',
  PLACE_NOT_FOUND = 'E6005',
  ANNOUNCEMENT_NOT_FOUND = 'E6006',
  CONFIG_NOT_FOUND = 'E6007',
  DRAFT_NOT_FOUND = 'E6008',
  SUBSCRIPTION_NOT_FOUND = 'E6009',
  PLAN_NOT_FOUND = 'E6010',
  SERVICE_NOT_FOUND = 'E6011',
  PRODUCT_NOT_FOUND = 'E6012',
  SOS_NOT_FOUND = 'E6013',
  INVITE_NOT_FOUND = 'E6014',
  EXCLUSION_NOT_FOUND = 'E6015',
  APPLICATION_NOT_FOUND = 'E6016',
  CONVERSATION_NOT_FOUND = 'E6017',
  AD_NOT_FOUND = 'E6018',
  TRANSACTION_NOT_FOUND = 'E6019',
  
  // Payment 支付相關 (E7xxx)
  PAYMENT_FAILED = 'E7001',
  SUBSCRIPTION_EXPIRED = 'E7002',
  INSUFFICIENT_BALANCE = 'E7003',
  
  // Server/Config 伺服器相關 (E9xxx)
  SERVER_ERROR = 'E9001',
  INTERNAL_ERROR = 'E9002',
  SERVICE_UNAVAILABLE = 'E9003',
  RATE_LIMITED = 'E9004',
  CHAT_NOT_CONFIGURED = 'E9005',
  WEBHOOK_NOT_CONFIGURED = 'E9006',
  PAYMENT_NOT_CONFIGURED = 'E9007',
  TWILIO_NOT_CONFIGURED = 'E9008',
}

// ============ Error Messages (Backend Default) ============
// 後端預設訊息，前端可選擇使用或覆蓋
export const ErrorMessages: Record<ErrorCode, string> = {
  // Auth
  [ErrorCode.AUTH_REQUIRED]: '請先登入',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: '登入已過期，請重新登入',
  [ErrorCode.AUTH_TOKEN_INVALID]: '無效的登入憑證',
  [ErrorCode.INVALID_CREDENTIALS]: '電子郵件或密碼錯誤',
  [ErrorCode.EMAIL_ALREADY_EXISTS]: '此電子郵件已被註冊',
  [ErrorCode.PENDING_APPROVAL]: '帳號審核中，請等待管理員核准',
  [ErrorCode.ROLE_MISMATCH]: '帳號類型不符',
  [ErrorCode.ROLE_NOT_ACCESSIBLE]: '您沒有權限切換到此角色',
  [ErrorCode.INVALID_ROLE]: '無效的角色',
  [ErrorCode.ADMIN_REQUIRED]: '需要管理員權限',
  [ErrorCode.FORBIDDEN]: '無權限執行此操作',
  [ErrorCode.SPECIALIST_REQUIRED]: '需要專員身份',
  [ErrorCode.ALREADY_REGISTERED]: '已經註冊過',
  
  // Gacha
  [ErrorCode.GACHA_NO_CREDITS]: '扭蛋次數不足',
  [ErrorCode.GACHA_RATE_LIMITED]: '操作過於頻繁，請稍後再試',
  [ErrorCode.GACHA_GENERATION_FAILED]: '行程生成失敗，請稍後再試',
  
  // Location
  [ErrorCode.MISSING_LOCATION_ID]: '請提供 regionId 或 countryId',
  [ErrorCode.NO_DISTRICT_FOUND]: '找不到可用的區域',
  [ErrorCode.REGION_NOT_FOUND]: '找不到指定的縣市',
  [ErrorCode.CITY_REQUIRED]: '請選擇城市',
  [ErrorCode.NO_PLACES_AVAILABLE]: '該區域暫無景點資料',
  [ErrorCode.COUNTRY_NOT_FOUND]: '找不到指定的國家',
  
  // Merchant
  [ErrorCode.MERCHANT_REQUIRED]: '需要商家帳號',
  [ErrorCode.MERCHANT_NOT_FOUND]: '商家不存在',
  [ErrorCode.NO_CODE_SET]: '商家尚未設定核銷碼',
  [ErrorCode.CODE_EXPIRED]: '核銷碼已過期',
  [ErrorCode.INVALID_CODE]: '核銷碼錯誤',
  [ErrorCode.COUPON_NOT_FOUND]: '找不到優惠券',
  [ErrorCode.COUPON_EXPIRED]: '優惠券已過期',
  [ErrorCode.COUPON_ALREADY_USED]: '優惠券已使用',
  [ErrorCode.PLACE_LIMIT_REACHED]: '已達景點認領上限',
  [ErrorCode.COUPON_LIMIT_REACHED]: '已達優惠券數量上限',
  [ErrorCode.RARITY_NOT_ALLOWED]: '您的方案不支援此稀有度',

  // Validation
  [ErrorCode.VALIDATION_ERROR]: '輸入資料格式錯誤',
  [ErrorCode.INVALID_PARAMS]: '無效的參數',
  [ErrorCode.MISSING_REQUIRED_FIELD]: '缺少必要欄位',
  [ErrorCode.CONFIG_READONLY]: '此設定為唯讀',
  [ErrorCode.INVITE_EXPIRED]: '邀請已過期',
  [ErrorCode.INVITE_ALREADY_USED]: '邀請已被使用',
  [ErrorCode.ALREADY_CLAIMED]: '已被認領',
  [ErrorCode.ALREADY_ACTIVE]: '已有進行中的服務',
  [ErrorCode.ALREADY_PROCESSED]: '已處理',
  [ErrorCode.ALREADY_COMPLETED]: '已完成',
  
  // Resource
  [ErrorCode.RESOURCE_NOT_FOUND]: '找不到資源',
  [ErrorCode.USER_NOT_FOUND]: '找不到用戶資料',
  [ErrorCode.COLLECTION_NOT_FOUND]: '找不到圖鑑',
  [ErrorCode.INVENTORY_ITEM_NOT_FOUND]: '找不到道具',
  [ErrorCode.PLACE_NOT_FOUND]: '找不到景點',
  [ErrorCode.ANNOUNCEMENT_NOT_FOUND]: '找不到公告',
  [ErrorCode.CONFIG_NOT_FOUND]: '找不到設定',
  [ErrorCode.DRAFT_NOT_FOUND]: '找不到草稿',
  [ErrorCode.SUBSCRIPTION_NOT_FOUND]: '找不到訂閱',
  [ErrorCode.PLAN_NOT_FOUND]: '找不到方案',
  [ErrorCode.SERVICE_NOT_FOUND]: '找不到服務',
  [ErrorCode.PRODUCT_NOT_FOUND]: '找不到商品',
  [ErrorCode.SOS_NOT_FOUND]: '找不到求救記錄',
  [ErrorCode.INVITE_NOT_FOUND]: '找不到邀請',
  [ErrorCode.EXCLUSION_NOT_FOUND]: '找不到排除項目',
  [ErrorCode.APPLICATION_NOT_FOUND]: '找不到申請',
  [ErrorCode.CONVERSATION_NOT_FOUND]: '找不到對話',
  [ErrorCode.AD_NOT_FOUND]: '找不到廣告',
  [ErrorCode.TRANSACTION_NOT_FOUND]: '找不到交易',
  
  // Payment
  [ErrorCode.PAYMENT_FAILED]: '付款失敗',
  [ErrorCode.SUBSCRIPTION_EXPIRED]: '訂閱已過期',
  [ErrorCode.INSUFFICIENT_BALANCE]: '餘額不足',
  
  // Server
  [ErrorCode.SERVER_ERROR]: '伺服器錯誤，請稍後再試',
  [ErrorCode.INTERNAL_ERROR]: '內部錯誤',
  [ErrorCode.SERVICE_UNAVAILABLE]: '服務暫時無法使用',
  [ErrorCode.RATE_LIMITED]: '請求過於頻繁，請稍後再試',
  [ErrorCode.CHAT_NOT_CONFIGURED]: '聊天服務未設定',
  [ErrorCode.WEBHOOK_NOT_CONFIGURED]: 'Webhook 未設定',
  [ErrorCode.PAYMENT_NOT_CONFIGURED]: '支付系統未設定',
  [ErrorCode.TWILIO_NOT_CONFIGURED]: 'Twilio 未設定',
};

// ============ Helper Functions ============

/**
 * 建立標準化的錯誤回應物件
 */
export function createErrorResponse(
  code: ErrorCode, 
  customMessage?: string,
  details?: unknown
): { errorCode: ErrorCode; message: string; details?: unknown } {
  const response: { errorCode: ErrorCode; message: string; details?: unknown } = {
    errorCode: code,
    message: customMessage || ErrorMessages[code],
  };
  if (details !== undefined) {
    response.details = details;
  }
  return response;
}

/**
 * 取得錯誤代碼的預設訊息
 */
export function getErrorMessage(code: ErrorCode): string {
  return ErrorMessages[code] || '未知錯誤';
}

/**
 * 檢查錯誤代碼是否為認證相關錯誤
 */
export function isAuthError(code: ErrorCode): boolean {
  return code.startsWith('E1');
}

/**
 * 檢查錯誤代碼是否為伺服器錯誤
 */
export function isServerError(code: ErrorCode): boolean {
  return code.startsWith('E9');
}

// ============ API Response Types ============

/**
 * 標準化的 API 錯誤回應格式
 */
export interface ApiErrorResponse {
  errorCode: ErrorCode;
  message: string;
  details?: unknown;
}

/**
 * 標準化的 API 成功回應格式
 */
export interface ApiSuccessResponse<T = unknown> {
  success: true;
  data: T;
}
