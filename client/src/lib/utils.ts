import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 格式化日期為台灣時間 (UTC+8)
 * @param dateStr - ISO 日期字串或 Date 物件
 * @param options - 格式化選項
 * @returns 格式化後的台灣時間字串
 */
export function formatTWDate(
  dateStr: string | Date | null | undefined,
  options: {
    showTime?: boolean;
    showSeconds?: boolean;
  } = { showTime: true, showSeconds: false }
): string {
  if (!dateStr) return '-';

  const date = typeof dateStr === 'string' ? new Date(dateStr) : dateStr;

  if (isNaN(date.getTime())) return '-';

  const formatOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  };

  if (options.showTime) {
    formatOptions.hour = '2-digit';
    formatOptions.minute = '2-digit';
    if (options.showSeconds) {
      formatOptions.second = '2-digit';
    }
    formatOptions.hour12 = false;
  }

  return date.toLocaleString('zh-TW', formatOptions);
}
