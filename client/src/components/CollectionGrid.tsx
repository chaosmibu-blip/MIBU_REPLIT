import React, { useState, useMemo } from 'react';
import { GachaItem, Language, Category } from '../types';
import { CATEGORY_COLORS, TRANSLATIONS } from '../constants';
import { MapPin, ChevronDown, ChevronUp } from 'lucide-react';

interface CollectionGridProps {
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

const getPlaceName = (item: any, lang: Language): string => {
  const name = item.place_name || item.placeName || '';
  return cleanPlaceName(getContent(name, lang));
};

const getCategoryLabel = (category: string, t: any): string => {
  const labelMap: Record<string, string> = {
    'Food': t.catFood || '美食',
    'Stay': t.catStay || '住宿',
    'Scenery': t.catScenery || '景點',
    'Shopping': t.catShopping || '購物',
    'Entertainment': t.catEntertainment || '娛樂',
    'Education': t.catEducation || '生態文化',
    'Activity': t.catActivity || '體驗',
  };
  return labelMap[category] || category;
};

export const CollectionGrid: React.FC<CollectionGridProps> = ({ items, language }) => {
  const t = TRANSLATIONS[language] as any;
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());

  const toggleRegion = (region: string) => {
    setOpenRegions(prev => {
      const newSet = new Set(prev);
      if (newSet.has(region)) newSet.delete(region);
      else newSet.add(region);
      return newSet;
    });
  };

  const toggleCategory = (key: string) => {
    setOpenCategories(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) newSet.delete(key);
      else newSet.add(key);
      return newSet;
    });
  };

  const groupedData = useMemo(() => {
    const cityMap: Record<string, { items: GachaItem[], byCategory: Record<string, GachaItem[]> }> = {};
    
    items.forEach(item => {
      const city = item.city || t.unknown || 'Unknown';
      const category = item.category || 'Other';
      
      if (!cityMap[city]) {
        cityMap[city] = { items: [], byCategory: {} };
      }
      cityMap[city].items.push(item);
      
      if (!cityMap[city].byCategory[category]) {
        cityMap[city].byCategory[category] = [];
      }
      cityMap[city].byCategory[category].push(item);
    });
    
    return cityMap;
  }, [items, t.unknown]);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400">
        <MapPin className="w-16 h-16 mb-4 opacity-20" />
        <p className="font-bold text-lg">{t.noCollection}</p>
        <p className="text-sm">{t.startToCollect}</p>
      </div>
    );
  }

  const getRegionInitial = (region: string): string => {
    return region.charAt(0);
  };

  return (
    <div className="pb-32 max-w-md mx-auto">
      <div className="text-center py-8">
        <h1 className="text-3xl font-black text-slate-800 mb-2" data-testid="text-collection-title">
          {language === 'zh-TW' ? '我的足跡' : language === 'ja' ? '私の足跡' : 'My Footprints'}
        </h1>
        <span className="inline-block bg-slate-100 text-slate-600 text-sm font-bold px-4 py-1.5 rounded-full" data-testid="text-collection-count">
          {items.length} {language === 'zh-TW' ? '個地點' : language === 'ja' ? '箇所' : 'places'}
        </span>
      </div>

      <div className="px-4 space-y-4">
        {Object.entries(groupedData)
          .sort((a, b) => b[1].items.length - a[1].items.length)
          .map(([region, data]) => {
            const isRegionOpen = openRegions.has(region);
            
            return (
              <div key={region} className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
                <button
                  onClick={() => toggleRegion(region)}
                  className="w-full flex items-center justify-between p-4"
                  data-testid={`accordion-region-${region}`}
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-lg">
                      {getRegionInitial(region)}
                    </div>
                    <div className="text-left">
                      <p className="font-bold text-lg text-slate-800">{region}</p>
                      <p className="text-sm text-slate-400">{data.items.length} {language === 'zh-TW' ? '個地點' : 'places'}</p>
                    </div>
                  </div>
                  <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center text-indigo-500">
                    {isRegionOpen ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                  </div>
                </button>

                {isRegionOpen && (
                  <div className="px-4 pb-4 space-y-3">
                    {Object.entries(data.byCategory)
                      .sort((a, b) => b[1].length - a[1].length)
                      .map(([category, categoryItems]) => {
                        const categoryColor = CATEGORY_COLORS[category as Category] || '#6366f1';
                        const categoryKey = `${region}-${category}`;
                        const isCategoryOpen = openCategories.has(categoryKey);
                        
                        return (
                          <div key={categoryKey}>
                            <button
                              onClick={() => toggleCategory(categoryKey)}
                              className="w-full flex items-center justify-between p-4 bg-slate-50 rounded-xl"
                              data-testid={`accordion-category-${categoryKey}`}
                            >
                              <div className="flex items-center gap-3">
                                <div 
                                  className="w-1.5 h-8 rounded-full"
                                  style={{ backgroundColor: categoryColor }}
                                />
                                <span className="font-bold text-slate-700">
                                  {getCategoryLabel(category, t)}
                                </span>
                                <span className="text-sm text-slate-400 bg-white px-2 py-0.5 rounded-full">
                                  {categoryItems.length}
                                </span>
                              </div>
                              <ChevronDown 
                                className={`w-5 h-5 text-slate-400 transition-transform ${isCategoryOpen ? 'rotate-180' : ''}`} 
                              />
                            </button>
                            
                            {isCategoryOpen && (
                              <div className="mt-2 space-y-2 pl-4">
                                {categoryItems.map((item, idx) => (
                                  <a
                                    key={`${item.id}-${idx}`}
                                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(getPlaceName(item, language))}`}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="block p-3 rounded-xl border-2 transition-all hover:shadow-md relative overflow-hidden"
                                    style={{ 
                                      borderColor: categoryColor + '30',
                                      background: `linear-gradient(135deg, ${categoryColor}10 0%, white 60%)`
                                    }}
                                    data-testid={`card-collection-${item.id}`}
                                  >
                                    <div 
                                      className="absolute top-0 left-0 right-0 h-0.5"
                                      style={{ backgroundColor: categoryColor }}
                                    />
                                    <div className="flex items-center gap-2">
                                      <div 
                                        className="w-1 h-6 rounded-full"
                                        style={{ backgroundColor: categoryColor }}
                                      />
                                      <div className="flex-1 min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">
                                          {getPlaceName(item, language)}
                                        </p>
                                        {item.district && (
                                          <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <MapPin className="w-3 h-3" />
                                            {item.district}
                                          </p>
                                        )}
                                      </div>
                                    </div>
                                  </a>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            );
          })}
      </div>
    </div>
  );
};
