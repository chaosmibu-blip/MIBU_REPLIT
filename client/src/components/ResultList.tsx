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

const cleanPlaceName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/\s*[（(][^）)]*[）)]\s*/g, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
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

const GOOGLE_TYPE_TRANSLATIONS: Record<string, string> = {
  'department_store': '百貨公司',
  'shopping_mall': '購物中心',
  'store': '商店',
  'restaurant': '餐廳',
  'cafe': '咖啡廳',
  'bakery': '烘焙坊',
  'bar': '酒吧',
  'night_club': '夜店',
  'food': '美食',
  'meal_delivery': '外送餐廳',
  'meal_takeaway': '外帶餐廳',
  'lodging': '住宿',
  'hotel': '飯店',
  'tourist_attraction': '觀光景點',
  'museum': '博物館',
  'art_gallery': '藝廊',
  'park': '公園',
  'natural_feature': '自然景觀',
  'campground': '露營地',
  'zoo': '動物園',
  'aquarium': '水族館',
  'amusement_park': '遊樂園',
  'bowling_alley': '保齡球館',
  'movie_theater': '電影院',
  'stadium': '體育場',
  'gym': '健身房',
  'spa': 'SPA',
  'beauty_salon': '美容院',
  'hair_care': '美髮店',
  'clothing_store': '服飾店',
  'shoe_store': '鞋店',
  'jewelry_store': '珠寶店',
  'electronics_store': '電器行',
  'furniture_store': '傢俱店',
  'book_store': '書店',
  'convenience_store': '便利商店',
  'supermarket': '超市',
  'grocery_or_supermarket': '超市雜貨',
  'liquor_store': '酒類專賣',
  'florist': '花店',
  'pet_store': '寵物店',
  'pharmacy': '藥局',
  'temple': '寺廟',
  'church': '教會',
  'hindu_temple': '印度廟',
  'mosque': '清真寺',
  'synagogue': '猶太教堂',
  'place_of_worship': '宗教場所',
  'transit_station': '轉運站',
  'train_station': '火車站',
  'bus_station': '公車站',
  'subway_station': '捷運站',
  'airport': '機場',
  'car_rental': '租車',
  'gas_station': '加油站',
  'parking': '停車場',
  'atm': 'ATM',
  'bank': '銀行',
  'post_office': '郵局',
  'hospital': '醫院',
  'doctor': '診所',
  'dentist': '牙醫',
  'veterinary_care': '獸醫',
  'police': '警察局',
  'fire_station': '消防局',
  'city_hall': '市政府',
  'local_government_office': '政府機關',
  'school': '學校',
  'university': '大學',
  'library': '圖書館',
  'casino': '賭場',
  'laundry': '洗衣店',
  'rv_park': '露營車營地',
  'home_goods_store': '居家用品店',
  'hardware_store': '五金行',
  'bicycle_store': '自行車店',
  'car_dealer': '汽車經銷商',
};

const getGoogleTypeLabel = (types: string[] | undefined, lang: string): string | null => {
  if (!types || types.length === 0) return null;
  const genericTypes = ['point_of_interest', 'establishment', 'premise', 'political', 'locality', 'sublocality'];
  const primaryType = types.find(t => !genericTypes.includes(t));
  if (!primaryType) return null;
  if (lang === 'zh-TW') {
    return GOOGLE_TYPE_TRANSLATIONS[primaryType] || primaryType.replace(/_/g, ' ');
  }
  return primaryType.replace(/_/g, ' ');
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
    <div className="pb-32 max-w-md mx-auto">
      <div className="sticky top-16 z-20 px-4 py-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h2 className="text-2xl font-black tracking-tight" data-testid="text-district-name">{getContent(data.meta.locked_district, language)}</h2>
            <p className="text-white/70 text-sm font-medium">{data.meta.city}</p>
          </div>
          <div className="flex items-center gap-2">
            {onResearch && (
              <button
                onClick={onResearch}
                disabled={isLoading}
                className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-bold transition-all backdrop-blur-sm"
                data-testid="button-research"
              >
                <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                {language === 'zh-TW' ? '重新抽取' : language === 'ja' ? '再抽選' : language === 'ko' ? '다시 뽑기' : 'Re-pull'}
              </button>
            )}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-2 text-xs text-white/60">
          <span className="bg-white/20 px-2 py-1 rounded-full">{visibleItems.length} {language === 'zh-TW' ? '個景點' : 'places'}</span>
        </div>
      </div>

      <div className="px-4 space-y-3">
        <AnimatePresence mode="popLayout">
        {visibleItems.map((item, idx) => {
          const categoryColor = item.category ? CATEGORY_COLORS[item.category] || '#6366f1' : '#6366f1';
          const isExcluding = excludingIds.has(item.id);
          
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, x: -100, height: 0, marginBottom: 0 }}
              transition={{ delay: idx * 0.03, duration: 0.2 }}
              className="bg-white rounded-2xl shadow-sm border border-slate-100/80 relative overflow-hidden group hover:shadow-md transition-shadow"
              data-testid={`card-itinerary-${item.id}`}
            >
              <button
                onClick={() => handleExclude(item)}
                disabled={isExcluding}
                className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-full bg-slate-100/80 hover:bg-red-100 text-slate-400 hover:text-red-500 transition-all opacity-60 hover:opacity-100 z-10 backdrop-blur-sm"
                data-testid={`button-exclude-${item.id}`}
                title={language === 'zh-TW' ? '不喜歡這個地點' : 'Exclude this place'}
              >
                {isExcluding ? (
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <X className="w-4 h-4" />
                )}
              </button>

              <div 
                className="absolute left-0 top-0 bottom-0 w-1" 
                style={{ backgroundColor: categoryColor }} 
              />

              <div className="p-4 pl-5">
                <div className="flex items-center flex-wrap gap-2 mb-2">
                  <span 
                    className="inline-flex items-center gap-1 text-[10px] font-bold uppercase px-2 py-1 rounded-md text-white"
                    style={{ backgroundColor: categoryColor }}
                    data-testid={`tag-category-${item.id}`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    {(t as any)[getCategoryTranslationKey(item.category as any)] || item.category}
                  </span>
                  {(() => {
                    const googleTypeLabel = getGoogleTypeLabel((item as any).google_types, language);
                    return googleTypeLabel ? (
                      <span 
                        className="inline-flex items-center text-[10px] font-medium px-2 py-1 rounded-md bg-slate-100 text-slate-600"
                        data-testid={`tag-google-type-${item.id}`}
                      >
                        {googleTypeLabel}
                      </span>
                    ) : null;
                  })()}
                  <span className="text-[10px] text-slate-400 font-medium">#{idx + 1}</span>
                </div>

                <h3 className="text-lg font-bold text-slate-800 leading-snug mb-2 pr-8">
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
                    className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-4 py-2 rounded-xl text-xs font-bold transition-colors"
                    data-testid={`button-search-${item.id}`}
                  >
                    <Search className="w-3.5 h-3.5" />
                    {language === 'zh-TW' ? '查看地圖' : language === 'ja' ? 'マップで見る' : language === 'ko' ? '지도 보기' : 'View on Map'}
                  </a>
                )}

                {(item.is_coupon || item.is_promo_active) && (
                  <div className="mt-4 bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-3 border border-indigo-100/50 flex items-center gap-3">
                    <div className="bg-white p-2 rounded-lg text-indigo-600 shadow-sm">
                      <Ticket className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      {item.is_coupon ? (
                         <>
                           <p className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">{t.couponUnlocked}</p>
                           <p className="text-sm font-semibold text-indigo-900 truncate">{getContent(item.coupon_data?.title, language)}</p>
                         </>
                      ) : (
                         <>
                           <p className="text-[10px] font-bold text-pink-600 uppercase tracking-wide">{t.specialPromo}</p>
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
