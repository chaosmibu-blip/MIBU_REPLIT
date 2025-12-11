import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GachaResponse, GachaItem, Language } from '../types';
import { Ticket, RefreshCw, Search, Tag, X } from 'lucide-react';
import { CATEGORY_COLORS, TRANSLATIONS } from '../constants';

interface ResultListProps {
  data: GachaResponse;
  language: Language;
  onResearch?: () => void;
  isLoading?: boolean;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

const getCategoryTranslationKey = (categoryCode: string): string => {
  const codeMap: Record<string, string> = {
    'food': 'catFood',
    'stay': 'catStay',
    'scenery': 'catScenery',
    'shopping': 'catShopping',
    'entertainment': 'catEntertainment',
    'education': 'catEducation',
    'activity': 'catActivity',
    'experience': 'catActivity',
  };
  return codeMap[categoryCode?.toLowerCase()] || 'catActivity';
};

export const ResultList: React.FC<ResultListProps> = ({ data, language, onResearch, isLoading }) => {
  const t = TRANSLATIONS[language];
  const [excludedIds, setExcludedIds] = useState<Set<number>>(new Set());
  const [excludingIds, setExcludingIds] = useState<Set<number>>(new Set());

  const handleExclude = async (item: GachaItem) => {
    const itemId = item.id;
    setExcludingIds(prev => new Set(prev).add(itemId));
    
    try {
      const response = await fetch('/api/feedback/exclude', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          placeName: typeof item.place_name === 'string' ? item.place_name : item.place_name?.['zh-TW'] || item.place_name?.['en'],
          district: typeof data.meta.locked_district === 'string' ? data.meta.locked_district : data.meta.locked_district?.['zh-TW'],
          city: data.meta.city,
          placeCacheId: (item as any).place_cache_id || null
        })
      });
      
      if (response.ok) {
        setExcludedIds(prev => new Set(prev).add(itemId));
      }
    } catch (error) {
      console.error('Failed to exclude place:', error);
    } finally {
      setExcludingIds(prev => {
        const next = new Set(prev);
        next.delete(itemId);
        return next;
      });
    }
  };

  const visibleItems = data.inventory.filter(item => !excludedIds.has(item.id));

  return (
    <div className="pb-32 px-4 pt-4 max-w-md mx-auto">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800" data-testid="text-district-name">{getContent(data.meta.locked_district, language)}</h2>
          <p className="text-slate-500 font-medium">{data.meta.city}</p>
        </div>
        <div className="flex items-center gap-2">
          {onResearch && (
            <button
              onClick={onResearch}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
              data-testid="button-research"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {language === 'zh-TW' ? '重新搜索' : language === 'ja' ? '再検索' : language === 'ko' ? '다시 검색' : 'Research'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        <AnimatePresence mode="popLayout">
        {visibleItems.map((item, idx) => {
          const categoryColor = item.category ? CATEGORY_COLORS[item.category] || '#6366f1' : '#6366f1';
          const isExcluding = excludingIds.has(item.id);
          
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0 }}
              transition={{ delay: idx * 0.05 }}
              className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative overflow-hidden group"
              data-testid={`card-itinerary-${item.id}`}
            >
              <button
                onClick={() => handleExclude(item)}
                disabled={isExcluding}
                className="absolute top-2 right-2 w-6 h-6 flex items-center justify-center rounded-full bg-slate-100 hover:bg-red-100 text-slate-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                data-testid={`button-exclude-${item.id}`}
                title={language === 'zh-TW' ? '不喜歡這個地點' : 'Exclude this place'}
              >
                {isExcluding ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>

              <div 
                className="absolute left-0 top-0 bottom-0 w-1.5" 
                style={{ backgroundColor: categoryColor }} 
              />

              <div className="pl-3 pr-6">
                <div className="flex justify-between items-start mb-2">
                  <span 
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded text-white"
                    style={{ backgroundColor: categoryColor }}
                    data-testid={`tag-category-${item.id}`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {(t as any)[getCategoryTranslationKey(item.category as any)] || item.category}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-800 leading-tight mb-1">
                  {getContent(item.place_name, language)}
                </h3>
                
                <p className="text-sm text-slate-500 mb-3">
                  {getContent(item.ai_description || item.description, language)}
                </p>

                {(item.verified_name || item.place_name) && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.verified_name || getContent(item.place_name, language))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 bg-blue-500 hover:bg-blue-600 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-colors mb-3"
                    data-testid={`button-search-${item.id}`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    {language === 'zh-TW' ? '在GOOGLE中導航' : language === 'ja' ? 'Googleで案内' : language === 'ko' ? 'Google에서 길찾기' : 'Navigate in Google'}
                  </a>
                )}

                {(item.is_coupon || item.is_promo_active) && (
                  <div className="mt-3 bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex items-center gap-3">
                    <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.is_coupon ? (
                         <>
                           <p className="text-xs font-bold text-indigo-900 uppercase">{t.couponUnlocked}</p>
                           <p className="text-sm font-medium text-indigo-700 truncate">{getContent(item.coupon_data?.title, language)}</p>
                         </>
                      ) : (
                         <>
                           <p className="text-xs font-bold text-pink-600 uppercase">{t.specialPromo}</p>
                           <p className="text-sm font-medium text-pink-700 truncate">{getContent(item.store_promo, language)}</p>
                         </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          );
        })}
        </AnimatePresence>
      </div>
    </div>
  );
};
