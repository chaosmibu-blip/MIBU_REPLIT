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
  
  // Validation 驗證相關 (E5xxx)
  VALIDATION_ERROR = 'E5001',
  INVALID_PARAMS = 'E5002',
  MISSING_REQUIRED_FIELD = 'E5003',
  
  // Resource 資源相關 (E6xxx)
  RESOURCE_NOT_FOUND = 'E6001',
  USER_NOT_FOUND = 'E6002',
  COLLECTION_NOT_FOUND = 'E6003',
  INVENTORY_ITEM_NOT_FOUND = 'E6004',
  
  // Payment 支付相關 (E7xxx)
  PAYMENT_FAILED = 'E7001',
  SUBSCRIPTION_EXPIRED = 'E7002',
  INSUFFICIENT_BALANCE = 'E7003',
  
  // Server 伺服器相關 (E9xxx)
  SERVER_ERROR = 'E9001',
  INTERNAL_ERROR = 'E9002',
  SERVICE_UNAVAILABLE = 'E9003',
  RATE_LIMITED = 'E9004',
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
  
  // Validation
  [ErrorCode.VALIDATION_ERROR]: '輸入資料格式錯誤',
  [ErrorCode.INVALID_PARAMS]: '無效的參數',
  [ErrorCode.MISSING_REQUIRED_FIELD]: '缺少必要欄位',
  
  // Resource
  [ErrorCode.RESOURCE_NOT_FOUND]: '找不到資源',
  [ErrorCode.USER_NOT_FOUND]: '找不到用戶資料',
  [ErrorCode.COLLECTION_NOT_FOUND]: '找不到收藏',
  [ErrorCode.INVENTORY_ITEM_NOT_FOUND]: '找不到道具',
  
  // Payment
  [ErrorCode.PAYMENT_FAILED]: '付款失敗',
  [ErrorCode.SUBSCRIPTION_EXPIRED]: '訂閱已過期',
  [ErrorCode.INSUFFICIENT_BALANCE]: '餘額不足',
  
  // Server
  [ErrorCode.SERVER_ERROR]: '伺服器錯誤，請稍後再試',
  [ErrorCode.INTERNAL_ERROR]: '內部錯誤',
  [ErrorCode.SERVICE_UNAVAILABLE]: '服務暫時無法使用',
  [ErrorCode.RATE_LIMITED]: '請求過於頻繁，請稍後再試',
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
