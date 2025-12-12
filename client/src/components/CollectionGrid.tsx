import React, { useState, useMemo } from 'react';
import { Language, GachaItem } from '../types';
import { TRANSLATIONS } from '../constants';
import { MapPin, ChevronDown, X, Tag, Navigation } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

interface CollectionGridProps {
  items: GachaItem[];
  language: Language;
}

interface MerchantPromo {
  title: string;
  description: string;
  imageUrl?: string;
}

const getPlaceName = (item: any): string => {
  const name = item.placeName || item.place_name || '';
  if (typeof name === 'string') return cleanPlaceName(name);
  if (typeof name === 'object') {
    return cleanPlaceName(name['en'] || name['zh-TW'] || '');
  }
  return '';
};

const cleanPlaceName = (name: string): string => {
  if (!name) return '';
  return name
    .replace(/\s*[（(][^）)]*[）)]\s*/g, '')
    .replace(/\s*\|.*$/g, '')
    .trim();
};

const getDescription = (item: any): string => {
  const desc = item.description || item.ai_description || '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object') {
    return desc['en'] || desc['zh-TW'] || '';
  }
  return '';
};

const getPlaceId = (item: any): string | null => {
  return item.placeId || item.place_id || null;
};

const getLocation = (item: any): { lat: string; lng: string } | null => {
  if (item.locationLat && item.locationLng) {
    return { lat: item.locationLat, lng: item.locationLng };
  }
  if (item.location?.lat && item.location?.lng) {
    return { lat: String(item.location.lat), lng: String(item.location.lng) };
  }
  return null;
};

const getCity = (item: any): string => item.city || '';
const getCityDisplay = (item: any): string => item.cityDisplay || item.city || '';
const getDistrict = (item: any): string => item.district || '';
const getDistrictDisplay = (item: any): string => item.districtDisplay || item.district || '';
const getCategory = (item: any): string => (item.category || '').toLowerCase();
const getCollectedAt = (item: any): string => item.collectedAt || item.collected_at || '';

const getCategoryColor = (category: string): string => {
  const colorMap: Record<string, string> = {
    'food': '#ea580c',
    'stay': '#0891b2',
    'education': '#7c3aed',
    'entertainment': '#db2777',
    'scenery': '#10b981',
    'shopping': '#f59e0b',
    'activity': '#84cc16',
    'experience': '#f59e0b'
  };
  return colorMap[category?.toLowerCase()] || '#6366f1';
};

const getCategoryLabel = (category: string, language: Language): string => {
  const labels: Record<string, Record<string, string>> = {
    'food': { 'zh-TW': '美食', 'en': 'Food', 'ja': 'グルメ', 'ko': '맛집' },
    'stay': { 'zh-TW': '住宿', 'en': 'Stay', 'ja': '宿泊', 'ko': '숙박' },
    'education': { 'zh-TW': '生態文化', 'en': 'Culture', 'ja': '文化', 'ko': '문화' },
    'entertainment': { 'zh-TW': '娛樂', 'en': 'Fun', 'ja': '娯楽', 'ko': '놀이' },
    'scenery': { 'zh-TW': '景點', 'en': 'Scenery', 'ja': '景色', 'ko': '명소' },
    'shopping': { 'zh-TW': '購物', 'en': 'Shop', 'ja': '買物', 'ko': '쇼핑' },
    'activity': { 'zh-TW': '體驗', 'en': 'Activity', 'ja': '体験', 'ko': '체험' },
    'experience': { 'zh-TW': '體驗', 'en': 'Experience', 'ja': '体験', 'ko': '체험' }
  };
  const categoryKey = category?.toLowerCase() || '';
  return labels[categoryKey]?.[language] || labels[categoryKey]?.['zh-TW'] || category || '';
};

const formatDate = (dateStr: string | undefined): string => {
  if (!dateStr) return '';
  try {
    const date = new Date(dateStr);
    return `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, '0')}/${String(date.getDate()).padStart(2, '0')}`;
  } catch {
    return '';
  }
};

const PlaceDetailModal: React.FC<{
  item: any;
  language: Language;
  onClose: () => void;
}> = ({ item, language, onClose }) => {
  const placeName = getPlaceName(item);
  const placeId = getPlaceId(item);
  const location = getLocation(item);
  const description = getDescription(item);
  const category = getCategory(item);
  const categoryColor = getCategoryColor(category);
  const date = formatDate(getCollectedAt(item));
  const city = getCity(item);
  const cityDisplay = getCityDisplay(item);
  const district = getDistrict(item);
  const districtDisplay = getDistrictDisplay(item);
  
  const { data: promoData } = useQuery<{ promo: MerchantPromo | null }>({
    queryKey: ['placePromo', placeId, placeName, district, city],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (placeId) params.append('placeId', placeId);
      if (placeName) params.append('placeName', placeName);
      if (district) params.append('district', district);
      if (city) params.append('city', city);
      const res = await fetch(`/api/place/promo?${params}`);
      return res.json();
    },
    staleTime: 5 * 60 * 1000,
  });
  
  const promo = promoData?.promo;
  
  const handleNavigate = () => {
    let url: string;
    if (location) {
      url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
    } else {
      const query = [placeName, districtDisplay, cityDisplay].filter(Boolean).join(' ');
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
    }
    window.open(url, '_blank');
  };

  const locationText = [districtDisplay, cityDisplay].filter(Boolean).join(' • ') || cityDisplay;

  return (
    <div 
      className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-hidden relative animate-in slide-in-from-bottom duration-300"
        onClick={e => e.stopPropagation()}
      >
        <div 
          className="h-32 w-full relative"
          style={{ backgroundColor: categoryColor }}
        >
          <button
            onClick={onClose}
            className="absolute top-4 right-4 w-10 h-10 bg-white/90 rounded-full flex items-center justify-center shadow-lg"
            data-testid="button-close-detail"
          >
            <X className="w-5 h-5 text-slate-600" />
          </button>
          
          <div className="absolute bottom-4 left-5">
            <span className="inline-block px-3 py-1.5 rounded-full text-xs font-bold bg-white/20 text-white backdrop-blur-sm">
              {getCategoryLabel(category, language)}
            </span>
          </div>
        </div>
        
        <div className="px-5 pb-6 pt-4 overflow-y-auto max-h-[calc(85vh-128px)]">
          <h2 className="text-2xl font-black text-slate-800 mb-2" data-testid="text-detail-name">
            {placeName}
          </h2>
          
          <div className="flex items-center gap-2 text-slate-500 mb-5">
            <span className="text-sm font-medium">{date}</span>
            {locationText && (
              <>
                <span className="text-slate-300">•</span>
                <span className="text-sm">{locationText}</span>
              </>
            )}
          </div>
          
          {description && (
            <p className="text-slate-600 leading-relaxed mb-5" data-testid="text-detail-description">
              {description}
            </p>
          )}
          
          {promo && (
            <div 
              className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 mb-5"
              data-testid="promo-section"
            >
              <div className="flex items-center gap-2 mb-2">
                <Tag className="w-5 h-5 text-amber-600" />
                <span className="font-bold text-amber-700">店家優惠資訊</span>
              </div>
              <p className="text-amber-800" data-testid="text-promo-title">
                {promo.title || promo.description || '憑券享優惠'}
              </p>
            </div>
          )}
          
          <button
            onClick={handleNavigate}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-all active:scale-98 bg-slate-800 hover:bg-slate-700"
            data-testid="button-navigate"
          >
            <Navigation className="w-5 h-5" />
            在 Google 地圖中查看
          </button>
        </div>
      </div>
    </div>
  );
};

export const CollectionGrid: React.FC<CollectionGridProps> = ({ items, language }) => {
  const t = TRANSLATIONS[language] as any;
  const [openRegions, setOpenRegions] = useState<Set<string>>(new Set());
  const [openCategories, setOpenCategories] = useState<Set<string>>(new Set());
  const [selectedItem, setSelectedItem] = useState<any>(null);

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
    const cityMap: Record<string, { displayName: string, items: any[], byCategory: Record<string, any[]> }> = {};
    
    items.forEach(item => {
      const city = getCity(item) || t.unknown || 'Unknown';
      const cityDisplay = getCityDisplay(item) || city;
      const category = getCategory(item) || 'other';
      
      if (!cityMap[city]) {
        cityMap[city] = { displayName: cityDisplay, items: [], byCategory: {} };
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

  const myCollectionTitle = {
    'zh-TW': '我的圖鑑',
    'en': 'My Collection',
    'ja': 'マイ図鑑',
    'ko': '내 도감'
  };

  return (
    <>
      <div className="pb-32 max-w-md mx-auto px-4 pt-4">
        <h1 className="text-2xl font-black text-slate-800 mb-4" data-testid="text-collection-title">
          {myCollectionTitle[language]}
        </h1>
        <div className="space-y-3">
          {Object.entries(groupedData)
            .sort((a, b) => b[1].items.length - a[1].items.length)
            .map(([regionKey, data]) => {
              const isRegionOpen = openRegions.has(regionKey);
              const displayName = data.displayName || regionKey;
              
              return (
                <div key={regionKey} className="bg-white rounded-2xl border-2 border-slate-100 overflow-hidden">
                  <button
                    onClick={() => toggleRegion(regionKey)}
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 transition-colors"
                    data-testid={`accordion-region-${regionKey}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-indigo-500 rounded-xl flex items-center justify-center text-white font-black text-sm">
                        {displayName.charAt(0)}
                      </div>
                      <div className="text-left">
                        <p className="font-bold text-slate-800">{displayName}</p>
                        <p className="text-xs text-slate-400">
                          {language === 'zh-TW' ? `${data.items.length} 個地點` : 
                           language === 'ja' ? `${data.items.length} スポット` : 
                           language === 'ko' ? `${data.items.length}개 장소` : 
                           `${data.items.length} spots`}
                        </p>
                      </div>
                    </div>
                    <ChevronDown 
                      className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${isRegionOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isRegionOpen && (
                    <div className="px-4 pb-4 space-y-2">
                      {Object.entries(data.byCategory)
                        .sort((a, b) => b[1].length - a[1].length)
                        .map(([category, categoryItems]) => {
                          const categoryColor = getCategoryColor(category);
                          const categoryKey = `${regionKey}-${category}`;
                          const isCategoryOpen = openCategories.has(categoryKey);
                          
                          return (
                            <div key={categoryKey}>
                              <button
                                onClick={() => toggleCategory(categoryKey)}
                                className="w-full flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors"
                                style={{ backgroundColor: `${categoryColor}10` }}
                                data-testid={`accordion-category-${categoryKey}`}
                              >
                                <div className="flex items-center gap-3">
                                  <div 
                                    className="w-1.5 h-6 rounded-full"
                                    style={{ backgroundColor: categoryColor }}
                                  />
                                  <span className="font-bold text-slate-700">
                                    {getCategoryLabel(category, language)}
                                  </span>
                                  <span 
                                    className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                    style={{ backgroundColor: categoryColor }}
                                  >
                                    {categoryItems.length}
                                  </span>
                                </div>
                                <ChevronDown 
                                  className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isCategoryOpen ? 'rotate-180' : ''}`}
                                />
                              </button>
                              
                              {isCategoryOpen && (
                                <div className="mt-2 space-y-2 pl-2">
                                  {categoryItems.map((item: any, idx: number) => {
                                    const placeName = getPlaceName(item);
                                    const description = getDescription(item);
                                    const date = formatDate(getCollectedAt(item));
                                    const districtForDisplay = getDistrictDisplay(item);
                                    const location = getLocation(item);
                                    
                                    const handleMapClick = (e: React.MouseEvent) => {
                                      e.stopPropagation();
                                      let url: string;
                                      if (location) {
                                        url = `https://www.google.com/maps/dir/?api=1&destination=${location.lat},${location.lng}`;
                                      } else {
                                        const query = [placeName, districtForDisplay, displayName].filter(Boolean).join(' ');
                                        url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(query)}`;
                                      }
                                      window.open(url, '_blank');
                                    };
                                    
                                    return (
                                      <div
                                        key={`${item.id || idx}-${idx}`}
                                        onClick={() => setSelectedItem(item)}
                                        className="bg-white rounded-2xl border-2 p-4 cursor-pointer transition-all hover:shadow-md relative overflow-hidden"
                                        style={{ 
                                          borderColor: `${categoryColor}40`,
                                          background: `linear-gradient(135deg, ${categoryColor}08 0%, white 50%)`
                                        }}
                                        data-testid={`card-collection-${item.id || idx}`}
                                      >
                                        <div 
                                          className="absolute top-0 left-0 right-0 h-1"
                                          style={{ backgroundColor: categoryColor }}
                                        />
                                        
                                        <div className="flex items-center justify-between mb-2">
                                          <span className="text-xs text-slate-400">{date}</span>
                                          <span 
                                            className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                                            style={{ backgroundColor: categoryColor }}
                                          >
                                            {getCategoryLabel(category, language)}
                                          </span>
                                        </div>
                                        
                                        <h3 className="font-black text-slate-800 mb-1">
                                          {placeName}
                                        </h3>
                                        
                                        {description && (
                                          <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                                            {description}
                                          </p>
                                        )}
                                        
                                        <button
                                          onClick={handleMapClick}
                                          className="flex items-center gap-1.5 text-slate-500 hover:text-slate-700 transition-colors text-sm"
                                          data-testid={`button-map-${item.id || idx}`}
                                        >
                                          <MapPin className="w-3.5 h-3.5" />
                                          <span>在 Google 地圖中查看</span>
                                        </button>
                                      </div>
                                    );
                                  })}
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
      
      {selectedItem && (
        <PlaceDetailModal
          item={selectedItem}
          language={language}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
};
