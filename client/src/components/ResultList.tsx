import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GachaResponse, GachaItem, Language } from '../types';
import { Ticket, RefreshCw, MapPin, X } from 'lucide-react';
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

const cleanPlaceName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/\s*[（(][^）)]*[）)]\s*/g, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
};

const getCategoryLabel = (category: any, t: any): string => {
  if (typeof category === 'object' && category?.name) {
    return category.name;
  }
  const code = typeof category === 'string' ? category.toLowerCase() : '';
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
  const key = codeMap[code] || 'catActivity';
  return t[key] || code;
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
    <div className="pb-28 max-w-md mx-auto">
      <div className="sticky top-0 z-20 px-4 py-4 bg-white border-b border-slate-100">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold text-slate-800" data-testid="text-district-name">
              {getContent(data.meta.locked_district, language)}
            </h2>
            <p className="text-slate-400 text-sm">{visibleItems.length} {language === 'zh-TW' ? '個地點' : 'places'}</p>
          </div>
          {onResearch && (
            <button
              onClick={onResearch}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-slate-800 text-white px-4 py-2.5 rounded-full text-sm font-bold disabled:opacity-50 transition-all active:scale-95"
              data-testid="button-research"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              {language === 'zh-TW' ? '重新扭蛋' : 'Re-pull'}
            </button>
          )}
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">
        <AnimatePresence mode="popLayout">
        {visibleItems.map((item, idx) => {
          const getCategoryColor = () => {
            if (!item.category) return '#6366f1';
            const cat = item.category as any;
            if (typeof cat === 'object' && cat.colorHex) {
              return cat.colorHex;
            }
            const code = typeof cat === 'string' ? cat.toLowerCase() : '';
            const colorMap: Record<string, string> = {
              'food': '#ea580c', 'stay': '#0891b2', 'education': '#7c3aed',
              'entertainment': '#db2777', 'scenery': '#10b981', 'shopping': '#f59e0b',
              'activity': '#84cc16', 'experience': '#f59e0b'
            };
            return colorMap[code] || '#6366f1';
          };
          const categoryColor = getCategoryColor();
          const isExcluding = excludingIds.has(item.id);
          const duration = item.duration || '1h';
          
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0, marginBottom: 0 }}
              transition={{ delay: idx * 0.02, duration: 0.15 }}
              className="rounded-2xl border-2 relative overflow-hidden"
              style={{ 
                borderColor: categoryColor + '50',
                background: `linear-gradient(135deg, ${categoryColor}08 0%, white 50%)`
              }}
              data-testid={`card-itinerary-${item.id}`}
            >
              <div 
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: `linear-gradient(90deg, ${categoryColor}, ${categoryColor}80)` }}
              />
              
              <button
                onClick={() => handleExclude(item)}
                disabled={isExcluding}
                className="absolute top-4 right-3 w-6 h-6 flex items-center justify-center rounded-full bg-white/80 text-slate-400 hover:bg-red-100 hover:text-red-500 transition-colors z-10 backdrop-blur-sm"
                data-testid={`button-exclude-${item.id}`}
              >
                {isExcluding ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <X className="w-3.5 h-3.5" />
                )}
              </button>

              <div 
                className="absolute left-0 top-0 bottom-0 w-1" 
                style={{ backgroundColor: categoryColor }} 
              />

              <div className="p-4 pl-4 pt-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-xs text-slate-400 font-medium px-2 py-1 bg-slate-50 rounded-full">
                    {duration}
                  </span>
                  <span 
                    className="text-xs font-bold px-2.5 py-1 rounded-full"
                    style={{ backgroundColor: categoryColor + '20', color: categoryColor }}
                    data-testid={`tag-category-${item.id}`}
                  >
                    {getCategoryLabel(item.category as any, t)}
                  </span>
                </div>

                <h3 className="text-lg font-bold text-slate-800 leading-snug mb-2 pr-6">
                  {cleanPlaceName(getContent(item.place_name, language))}
                </h3>
                
                <p className="text-sm text-slate-500 leading-relaxed mb-4 line-clamp-3">
                  {getContent(item.ai_description || item.description, language)}
                </p>

                {(item.verified_name || item.place_name) && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(item.verified_name || getContent(item.place_name, language))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 text-slate-600 hover:text-slate-800 text-sm font-medium transition-colors"
                    data-testid={`button-search-${item.id}`}
                  >
                    <MapPin className="w-4 h-4" />
                    {language === 'zh-TW' ? '在 Google 地圖中查看' : 'View on Google Maps'}
                  </a>
                )}

                {(item.is_coupon || item.is_promo_active) && (
                  <div className="mt-4 bg-indigo-50 rounded-xl p-3 border border-indigo-100 border-dashed flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg text-indigo-600">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.is_coupon ? (
                         <>
                           <p className="text-[10px] font-bold text-indigo-600 uppercase">{t.couponUnlocked}</p>
                           <p className="text-sm font-semibold text-indigo-900 truncate">{getContent(item.coupon_data?.title, language)}</p>
                         </>
                      ) : (
                         <>
                           <p className="text-[10px] font-bold text-pink-600 uppercase">{t.specialPromo}</p>
                           <p className="text-sm font-semibold text-pink-900 truncate">{getContent(item.store_promo, language)}</p>
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
