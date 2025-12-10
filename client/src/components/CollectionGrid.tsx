import React, { useState } from 'react';
import { GachaItem, Language } from '../types';
import { RARITY_COLORS, TRANSLATIONS } from '../constants';
import { MapPin, BookOpen, Filter, Sparkles } from 'lucide-react';

interface CollectionGridProps {
  items: GachaItem[];
  language: Language;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

const RARITY_ORDER = ['SP', 'SSR', 'SR', 'S', 'R'] as const;

export const CollectionGrid: React.FC<CollectionGridProps> = ({ items, language }) => {
  const t = TRANSLATIONS[language] as any;
  const [selectedRarity, setSelectedRarity] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const rarityStats = RARITY_ORDER.reduce((acc, rarity) => {
    acc[rarity] = items.filter(i => i.rarity === rarity).length;
    return acc;
  }, {} as Record<string, number>);
  
  const uniqueCategories = Array.from(new Set(items.map(i => i.category).filter(Boolean))) as string[];

  const filteredItems = items.filter(item => {
    if (selectedRarity && item.rarity !== selectedRarity) return false;
    if (selectedCategory && item.category !== selectedCategory) return false;
    return true;
  });

  const sortedItems = [...filteredItems].sort((a, b) => {
    const rarityA = RARITY_ORDER.indexOf(a.rarity as any);
    const rarityB = RARITY_ORDER.indexOf(b.rarity as any);
    if (rarityA !== rarityB) return rarityA - rarityB;
    return new Date(b.collected_at || 0).getTime() - new Date(a.collected_at || 0).getTime();
  });

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 pt-16">
        <BookOpen className="w-20 h-20 mb-4 opacity-20" />
        <p className="font-bold text-lg">{t.noCollection}</p>
        <p className="text-sm">{t.startToCollect}</p>
      </div>
    );
  }

  return (
    <div className="pb-32 max-w-md mx-auto pt-16">
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white sticky top-16 z-10">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5" />
            <span className="font-black text-lg" data-testid="text-collection-title">{t.navCollection}</span>
          </div>
          <div className="bg-white/20 px-3 py-1 rounded-full text-sm font-bold" data-testid="text-collection-count">
            {items.length} {language === 'zh-TW' ? '張' : language === 'ja' ? '枚' : ''}
          </div>
        </div>
        
        <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-hide">
          {RARITY_ORDER.map(rarity => (
            <button
              key={rarity}
              onClick={() => setSelectedRarity(selectedRarity === rarity ? null : rarity)}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedRarity === rarity 
                  ? 'bg-white text-indigo-600 shadow-lg scale-105' 
                  : 'bg-white/20 hover:bg-white/30'
              }`}
              data-testid={`button-filter-rarity-${rarity}`}
            >
              <span 
                className="w-2 h-2 rounded-full" 
                style={{ backgroundColor: RARITY_COLORS[rarity] }}
              />
              {rarity}
              <span className="opacity-70">({rarityStats[rarity]})</span>
            </button>
          ))}
        </div>
      </div>

      <div className="px-4 py-2 flex gap-2 overflow-x-auto scrollbar-hide bg-slate-50 border-b border-slate-100">
        <button
          onClick={() => setSelectedCategory(null)}
          className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
            !selectedCategory ? 'bg-slate-800 text-white' : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="button-filter-all"
        >
          {language === 'zh-TW' ? '全部' : language === 'ja' ? 'すべて' : language === 'ko' ? '전체' : 'All'}
        </button>
        {uniqueCategories.map(cat => {
          const count = items.filter(i => i.category === cat).length;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(selectedCategory === cat ? null : cat)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all ${
                selectedCategory === cat 
                  ? 'bg-slate-800 text-white' 
                  : 'bg-white text-slate-600 border border-slate-200'
              }`}
              data-testid={`button-filter-category-${cat}`}
            >
              {t[`cat${cat}`] || cat} ({count})
            </button>
          );
        })}
      </div>

      {sortedItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400">
          <Filter className="w-12 h-12 mb-3 opacity-30" />
          <p className="text-sm">{language === 'zh-TW' ? '沒有符合條件的卡片' : 'No matching cards'}</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-2 gap-3">
          {sortedItems.map((item, idx) => (
            <div 
              key={`${item.id}-${idx}`}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-100 flex flex-col relative group hover:shadow-md transition-shadow"
              data-testid={`card-collection-${item.id}`}
            >
              <div 
                className="h-2 w-full relative overflow-hidden" 
                style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
              >
                {(item.rarity === 'SP' || item.rarity === 'SSR') && (
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
                )}
              </div>
              <div className="p-3 flex-1 flex flex-col justify-between min-h-[120px]">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span 
                      className="inline-block text-[10px] font-black uppercase px-1.5 py-0.5 rounded text-white"
                      style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
                    >
                      {item.rarity}
                    </span>
                    {item.is_coupon && (
                      <Sparkles className="w-3 h-3 text-amber-500" />
                    )}
                  </div>
                  <h4 className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight">
                    {getContent(item.place_name, language)}
                  </h4>
                  {item.category && (
                    <span className="text-[10px] text-slate-400 font-medium mt-1 block">
                      {t[`cat${item.category}`] || item.category}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between mt-2">
                  <div className="text-[10px] text-slate-400 font-medium">
                    {new Date(item.collected_at || Date.now()).toLocaleDateString()}
                  </div>
                  {item.city && (
                    <div className="flex items-center gap-0.5 text-[10px] text-slate-400">
                      <MapPin className="w-2.5 h-2.5" />
                      {item.city}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <style>{`
        @keyframes shimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
        .animate-shimmer {
          animation: shimmer 2s infinite;
        }
        .scrollbar-hide::-webkit-scrollbar {
          display: none;
        }
        .scrollbar-hide {
          -ms-overflow-style: none;
          scrollbar-width: none;
        }
      `}</style>
    </div>
  );
};
