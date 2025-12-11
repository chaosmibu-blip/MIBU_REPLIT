import React, { useState, useMemo } from 'react';
import { GachaItem, Language, Category } from '../types';
import { CATEGORY_COLORS, TRANSLATIONS } from '../constants';
import { MapPin, BookOpen, ChevronDown, ChevronRight, Sparkles, Tag, FolderOpen } from 'lucide-react';

interface CollectionGridProps {
  items: GachaItem[];
  language: Language;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

const getPlaceName = (item: any, lang: Language): string => {
  const name = item.place_name || item.placeName || '';
  return getContent(name, lang);
};

interface AccordionSectionProps {
  title: string;
  count: number;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: string;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({ 
  title, count, isOpen, onToggle, children, icon, color 
}) => (
  <div className="mb-2">
    <button
      onClick={onToggle}
      className="w-full flex items-center justify-between p-3 bg-white rounded-xl shadow-sm border border-slate-100 hover:bg-slate-50 transition-colors"
      data-testid={`accordion-${title}`}
    >
      <div className="flex items-center gap-2">
        {isOpen ? <ChevronDown className="w-4 h-4 text-slate-400" /> : <ChevronRight className="w-4 h-4 text-slate-400" />}
        {icon}
        <span className="font-bold text-slate-700">{title}</span>
      </div>
      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
        {count}
      </span>
    </button>
    {isOpen && (
      <div className="mt-2 pl-2">
        {children}
      </div>
    )}
  </div>
);

export const CollectionGrid: React.FC<CollectionGridProps> = ({ items, language }) => {
  const t = TRANSLATIONS[language] as any;
  const [openDistricts, setOpenDistricts] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<'district' | 'category'>('district');

  const toggleDistrict = (district: string) => {
    setOpenDistricts(prev => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(district)) {
        newSet.delete(district);
      } else {
        newSet.add(district);
      }
      return newSet;
    });
  };

  const toggleCategory = (category: string) => {
    setOpenCategories(prev => {
      const newSet = new Set(Array.from(prev));
      if (newSet.has(category)) {
        newSet.delete(category);
      } else {
        newSet.add(category);
      }
      return newSet;
    });
  };

  const groupedByDistrict = useMemo(() => {
    const groups: Record<string, GachaItem[]> = {};
    items.forEach(item => {
      const district = item.district || item.city || t.unknown || 'Unknown';
      if (!groups[district]) groups[district] = [];
      groups[district].push(item);
    });
    return groups;
  }, [items, t.unknown]);

  const groupedByCategory = useMemo(() => {
    const groups: Record<string, GachaItem[]> = {};
    items.forEach(item => {
      const category = item.category || 'Other';
      if (!groups[category]) groups[category] = [];
      groups[category].push(item);
    });
    return groups;
  }, [items]);

  const sortedItems = (itemsToSort: GachaItem[]) => {
    return [...itemsToSort].sort((a, b) => 
      new Date(b.collectedAt || 0).getTime() - new Date(a.collectedAt || 0).getTime()
    );
  };

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-slate-400 pt-16">
        <BookOpen className="w-20 h-20 mb-4 opacity-20" />
        <p className="font-bold text-lg">{t.noCollection}</p>
        <p className="text-sm">{t.startToCollect}</p>
      </div>
    );
  }

  const renderItemCard = (item: GachaItem, idx: number) => {
    const categoryColor = item.category ? CATEGORY_COLORS[item.category] || '#6366f1' : '#6366f1';
    
    return (
      <div 
        key={`${item.id}-${idx}`}
        className="bg-white rounded-xl p-3 shadow-sm border border-slate-100 relative overflow-hidden hover:shadow-md transition-shadow"
        data-testid={`card-collection-${item.id}`}
      >
        <div 
          className="absolute left-0 top-0 bottom-0 w-1" 
          style={{ backgroundColor: categoryColor }}
        />
        <div className="pl-2">
          <div className="flex items-center justify-between mb-1">
            {item.category && (
              <span 
                className="inline-flex items-center gap-1 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded text-white"
                style={{ backgroundColor: categoryColor }}
                data-testid={`tag-category-collection-${item.id}`}
              >
                <Tag className="w-2 h-2" />
                {t[`cat${item.category}`] || item.category}
              </span>
            )}
            {item.is_coupon && (
              <Sparkles className="w-3 h-3 text-amber-500" />
            )}
          </div>
          <h4 className="font-bold text-sm text-slate-800 line-clamp-2 leading-tight mb-1">
            {getPlaceName(item, language)}
          </h4>
          <div className="flex items-center justify-between mt-1">
            <div className="text-[10px] text-slate-400 font-medium">
              {new Date(item.collectedAt || Date.now()).toLocaleDateString()}
            </div>
            {item.district && (
              <div className="flex items-center gap-0.5 text-[10px] text-slate-400">
                <MapPin className="w-2.5 h-2.5" />
                {item.district}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

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
        
        <div className="flex gap-2">
          <button
            onClick={() => setViewMode('district')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'district' 
                ? 'bg-white text-indigo-600' 
                : 'bg-white/20 hover:bg-white/30'
            }`}
            data-testid="button-view-district"
          >
            <MapPin className="w-3.5 h-3.5" />
            {language === 'zh-TW' ? '依行政區' : language === 'ja' ? '地区別' : language === 'ko' ? '지역별' : 'By District'}
          </button>
          <button
            onClick={() => setViewMode('category')}
            className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
              viewMode === 'category' 
                ? 'bg-white text-indigo-600' 
                : 'bg-white/20 hover:bg-white/30'
            }`}
            data-testid="button-view-category"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            {language === 'zh-TW' ? '依種類' : language === 'ja' ? 'カテゴリ別' : language === 'ko' ? '카테고리별' : 'By Category'}
          </button>
        </div>
      </div>

      <div className="p-4">
        {viewMode === 'district' && (
          <div>
            {Object.entries(groupedByDistrict)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([district, districtItems]) => (
                <AccordionSection
                  key={district}
                  title={district}
                  count={districtItems.length}
                  isOpen={openDistricts.has(district)}
                  onToggle={() => toggleDistrict(district)}
                  icon={<MapPin className="w-4 h-4 text-indigo-500" />}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {sortedItems(districtItems).map((item, idx) => renderItemCard(item, idx))}
                  </div>
                </AccordionSection>
              ))}
          </div>
        )}

        {viewMode === 'category' && (
          <div>
            {Object.entries(groupedByCategory)
              .sort((a, b) => b[1].length - a[1].length)
              .map(([category, categoryItems]) => {
                const categoryColor = CATEGORY_COLORS[category as Category] || '#6366f1';
                return (
                  <AccordionSection
                    key={category}
                    title={t[`cat${category}`] || category}
                    count={categoryItems.length}
                    isOpen={openCategories.has(category)}
                    onToggle={() => toggleCategory(category)}
                    icon={
                      <div 
                        className="w-4 h-4 rounded-full flex items-center justify-center"
                        style={{ backgroundColor: categoryColor }}
                      >
                        <Tag className="w-2.5 h-2.5 text-white" />
                      </div>
                    }
                  >
                    <div className="grid grid-cols-2 gap-2">
                      {sortedItems(categoryItems).map((item, idx) => renderItemCard(item, idx))}
                    </div>
                  </AccordionSection>
                );
              })}
          </div>
        )}
      </div>
    </div>
  );
};
