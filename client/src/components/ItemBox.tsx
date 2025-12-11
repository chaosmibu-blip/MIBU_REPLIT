import React from 'react';
import { GachaItem, Language } from '../types';
import { Ticket, Copy, Tag, Gift } from 'lucide-react';
import { CATEGORY_COLORS, TRANSLATIONS } from '../constants';

interface ItemBoxProps {
  items: GachaItem[];
  language: Language;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

const cleanPlaceName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/\s*[（(][^）)]*[）)]\s*/g, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
};

export const ItemBox: React.FC<ItemBoxProps> = ({ items, language }) => {
  const t = TRANSLATIONS[language] as any;
  const coupons = items.filter(i => i.is_coupon && i.coupon_data);

  if (coupons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 pt-16">
        <div className="w-20 h-20 rounded-full bg-slate-100 flex items-center justify-center mb-4">
          <Gift className="w-10 h-10 text-slate-300" />
        </div>
        <p className="font-bold text-slate-500">{t.noCoupons}</p>
        <p className="text-sm text-slate-400 mt-1">{language === 'zh-TW' ? '抽到優惠券會顯示在這裡' : 'Your coupons will appear here'}</p>
      </div>
    );
  }

  return (
    <div className="pb-32 max-w-md mx-auto pt-16">
      <div className="sticky top-16 z-20 px-4 py-4 bg-gradient-to-r from-amber-500 to-orange-500 text-white mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Ticket className="w-5 h-5" />
            <span className="font-black text-lg">{t.navMyBox}</span>
          </div>
          <span className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold">
            {coupons.length} {language === 'zh-TW' ? '張' : ''}
          </span>
        </div>
      </div>
      
      <div className="px-4 space-y-3">
        {coupons.map((item) => {
          const categoryColor = item.category ? CATEGORY_COLORS[item.category] || '#6366f1' : '#6366f1';
          
          return (
            <div 
              key={item.id} 
              className="bg-white rounded-2xl shadow-sm border border-slate-100/80 overflow-hidden hover:shadow-md transition-shadow" 
              data-testid={`coupon-${item.id}`}
            >
              <div className="flex gap-4 p-4">
                <div 
                  className="w-14 h-14 rounded-xl flex items-center justify-center text-white shrink-0 shadow-sm"
                  style={{ backgroundColor: categoryColor }}
                >
                  <Ticket className="w-7 h-7" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1.5">
                    {item.category && (
                      <span 
                        className="inline-flex items-center gap-0.5 text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-md text-white"
                        style={{ backgroundColor: categoryColor }}
                      >
                        <Tag className="w-2 h-2" />
                        {t[`cat${item.category}`] || item.category}
                      </span>
                    )}
                  </div>
                  <h4 className="font-bold text-slate-800 text-sm leading-snug">{getContent(item.coupon_data?.title, language)}</h4>
                  <p className="text-xs text-slate-500 mt-0.5 truncate">{cleanPlaceName(getContent(item.place_name, language))}</p>
                </div>
              </div>
              <div className="bg-slate-50 px-4 py-2.5 flex justify-between items-center border-t border-slate-100">
                <code className="text-xs font-mono font-bold text-slate-700 tracking-wider">{item.coupon_data?.code}</code>
                <button className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 hover:text-indigo-700 transition-colors">
                  <Copy className="w-3.5 h-3.5" />
                  {language === 'zh-TW' ? '複製' : 'Copy'}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
