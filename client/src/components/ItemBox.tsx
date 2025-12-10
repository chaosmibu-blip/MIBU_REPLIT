import React from 'react';
import { GachaItem, Language } from '../types';
import { Ticket, Copy } from 'lucide-react';
import { RARITY_COLORS } from '../constants';

interface ItemBoxProps {
  items: GachaItem[];
  language: Language;
}

const getContent = (content: any, lang: Language): string => {
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

export const ItemBox: React.FC<ItemBoxProps> = ({ items, language }) => {
  const coupons = items.filter(i => i.is_coupon && i.coupon_data);

  if (coupons.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <Ticket className="w-16 h-16 mb-4 opacity-20" />
        <p className="font-medium">No coupons yet.</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 pb-32 max-w-md mx-auto pt-20">
      {coupons.map((item) => (
        <div key={item.id} className="bg-white rounded-xl p-4 shadow-sm border border-slate-100 flex gap-4">
          <div 
            className="w-16 h-16 rounded-xl flex items-center justify-center text-white font-black text-xl shrink-0"
            style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
          >
            {item.rarity}
          </div>
          <div className="flex-1 min-w-0">
            <h4 className="font-bold text-slate-800">{getContent(item.coupon_data?.title, language)}</h4>
            <p className="text-xs text-slate-500 mb-2 truncate">{getContent(item.place_name, language)}</p>
            <div className="bg-slate-50 rounded-lg px-3 py-1.5 flex justify-between items-center">
              <code className="text-xs font-mono font-bold text-slate-600">{item.coupon_data?.code}</code>
              <Copy className="w-3 h-3 text-slate-400" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
};
