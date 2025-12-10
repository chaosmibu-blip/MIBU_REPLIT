import React from 'react';
import { GachaItem, Language } from '../types';
import { RARITY_COLORS } from '../constants';
import { MapPin } from 'lucide-react';

interface CollectionGridProps {
  items: GachaItem[];
  language: Language;
}

const getContent = (content: any, lang: Language): string => {
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

export const CollectionGrid: React.FC<CollectionGridProps> = ({ items, language }) => {
  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <MapPin className="w-16 h-16 mb-4 opacity-20" />
        <p className="font-medium">No collection yet.</p>
        <p className="text-sm">Start gacha to collect spots!</p>
      </div>
    );
  }

  return (
    <div className="p-4 grid grid-cols-2 gap-4 pb-32 max-w-md mx-auto pt-20">
      {items.map((item) => (
        <div 
          key={item.id} 
          className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col h-40 relative group"
        >
          <div 
             className="h-1 w-full" 
             style={{ backgroundColor: RARITY_COLORS[item.rarity] }} 
          />
          <div className="p-3 flex-1 flex flex-col justify-between">
            <div>
              <span 
                className="inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded text-white mb-2"
                style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
              >
                {item.rarity}
              </span>
              <h4 className="font-bold text-sm text-slate-800 line-clamp-2">
                {getContent(item.place_name, language)}
              </h4>
            </div>
            <div className="text-[10px] text-slate-400 font-medium">
               {new Date(item.collected_at || Date.now()).toLocaleDateString()}
            </div>
          </div>
          {item.is_coupon && (
            <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
          )}
        </div>
      ))}
    </div>
  );
};
