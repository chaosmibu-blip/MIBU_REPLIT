/**
 * Gacha V3 共用工具函數
 */

export function getLocalizedName(item: any, lang: string): string {
  switch (lang) {
    case 'ja': return item.nameJa || item.nameZh || item.nameEn;
    case 'ko': return item.nameKo || item.nameZh || item.nameEn;
    case 'en': return item.nameEn;
    default: return item.nameZh || item.nameEn;
  }
}

export function getLocalizedDescription(item: any, lang: string): string {
  const i18n = item.i18n || item.descriptionI18n || item.description_i18n;
  const defaultDesc = item.description || '';
  if (!i18n) return defaultDesc;
  switch (lang) {
    case 'ja': return i18n.ja || defaultDesc;
    case 'ko': return i18n.ko || defaultDesc;
    case 'en': return i18n.en || defaultDesc;
    default: return defaultDesc;
  }
}
