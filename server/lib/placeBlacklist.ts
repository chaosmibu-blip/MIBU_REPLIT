/**
 * 共用黑名單模組
 * 統一管理所有審核腳本的過濾規則
 * 
 * 來源：合併自 short-batch-review.ts 與 deep-review-places.ts
 * 更新日期：2026-01-01
 */

export const EXCLUDE_KEYWORDS = [
  // 政府機關
  '區公所', '市公所', '鄉公所', '鎮公所', '戶政事務所', '戶政所',
  '地政事務所', '國稅局', '稅捐處', '監理站', '監理所',
  '警察局', '派出所', '分局', '消防局', '消防隊',
  '法院', '地檢署', '調解委員會', '兵役課', '役政署',
  '監獄', '看守所',

  // 醫療機構
  '衛生所', '衛生局', '疾病管制', '健保署', '長照中心',
  '醫院', '診所', '藥局',

  // 殯葬
  '殯儀館', '火葬場', '納骨塔', '靈骨塔', '墓園', '公墓',
  '殯葬', '喪葬', '葬儀', '禮儀公司',

  // 基礎設施
  '停車場', '停車塔', '加油站', '充電站',
  '變電所', '汙水處理', '污水處理', '自來水', '焚化爐',
  '垃圾場', '垃圾處理', '回收站', '資源回收',

  // 金融（非旅遊相關）
  '銀行', '銀行分行', '郵局', '農會信用部', '證券', '保險公司',

  // 教育機構（非觀光）
  '教育局', '學區', '督學', '國小', '國中', '高中', '大學', 
  '學校', '幼兒園', '幼稚園', '幼稒園', '補習班', '安親班', '托兒所',

  // 交通服務（非景點）
  '包車', '租車', '計程車行', '客運站', '公車站',

  // 娛樂設施（連鎖/非特色）
  '影城', '電影院', '電影', 'KTV', '健身房', '健身中心', '健身',
  'gym', '保齡球', '撞球', '網咖', '瑜珈', 'yoga', '瑜伽',

  // 活動類（時效性強，平時無內容）
  '展覽', '市集', '音樂會', '節慶', '運動賽事', '工作坊', '講座',
  '演唱會', '表演', '慶典', '祭典', '嘉年華',

  // 服務業（非旅遊）
  '資材行', '水電行', '五金行', '建材行',
  '汽車修理', '機車行', '輪胎行', '保養廠',
  '洗衣店', '乾洗店', '自助洗衣',
  '當舖', '當鋪',
  '快餐店', '便當店',
  '美容院', '美髮', '髮廊', '理髮', '美甲', '美睫',
  '工廠', '倉庫', '物流中心',
  '運動用品店', '運動中心',
] as const;

export const EXACT_EXCLUDE_NAMES = [
  '台灣小吃', '台灣美食', '台灣料理', '台灣餐廳',
  '小吃店', '美食店', '餐廳', '飯店', '旅館', '民宿',
  '便利商店', '超商', '7-11', '全家', '萊爾富', 'OK超商',
] as const;

export const PRESERVE_LIST = [
  '蘭城百匯',
  '森本屋',
] as const;

/**
 * 判斷地點是否應被前置過濾
 * @returns { filtered: boolean, reason: string }
 */
export function shouldPreFilter(placeName: string): { filtered: boolean; reason: string } {
  const lowerName = placeName.toLowerCase();
  
  for (const preserved of PRESERVE_LIST) {
    if (lowerName.includes(preserved.toLowerCase())) {
      return { filtered: false, reason: '' };
    }
  }

  for (const exactName of EXACT_EXCLUDE_NAMES) {
    if (lowerName === exactName.toLowerCase()) {
      return { filtered: true, reason: `通用名稱不適合作為景點: ${exactName}` };
    }
  }

  for (const keyword of EXCLUDE_KEYWORDS) {
    if (lowerName.includes(keyword.toLowerCase())) {
      return { filtered: true, reason: `包含排除關鍵字: ${keyword}` };
    }
  }

  return { filtered: false, reason: '' };
}

/**
 * 取得黑名單關鍵字的 prompt 格式字串
 * 用於 AI 審核時告知哪些類型應刪除
 */
export function getBlacklistPromptText(): string {
  const half = Math.ceil(EXCLUDE_KEYWORDS.length / 2);
  return `【不適合旅遊的類型 - 回傳 x】
${EXCLUDE_KEYWORDS.slice(0, half).join('、')}
以及：${EXCLUDE_KEYWORDS.slice(half).join('、')}

【通用名稱黑名單 - 回傳 x】
${EXACT_EXCLUDE_NAMES.join('、')}`;
}
