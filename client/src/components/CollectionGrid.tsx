import React, { useState, useMemo } from 'react';
import { Language, Category, GachaItem } from '../types';
import { TRANSLATIONS, GOOGLE_TYPE_TRANSLATIONS } from '../constants';
import { MapPin, ChevronDown, ChevronUp, Navigation, Star, Tag, Gift, X } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';

// Collection item can come from either GachaItem (local state) or Collection (from API)
interface CollectionGridProps {
  items: GachaItem[];
  language: Language;
}

interface MerchantPromo {
  title: string;
  description: string;
  imageUrl?: string;
}

// Helper to extract place name from various formats
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

// Helper to extract description
const getDescription = (item: any): string => {
  const desc = item.description || item.ai_description || '';
  if (typeof desc === 'string') return desc;
  if (typeof desc === 'object') {
    return desc['en'] || desc['zh-TW'] || '';
  }
  return '';
};

// Helper to extract placeId
const getPlaceId = (item: any): string | null => {
  return item.placeId || item.place_id || null;
};

// Helper to extract address
const getAddress = (item: any): string | null => {
  return item.address || item.verified_address || null;
};

// Helper to extract rating
const getRating = (item: any): string | null => {
  if (item.rating) return item.rating;
  if (item.google_rating) return String(item.google_rating);
  return null;
};

// Helper to extract location
const getLocation = (item: any): { lat: string; lng: string } | null => {
  if (item.locationLat && item.locationLng) {
    return { lat: item.locationLat, lng: item.locationLng };
  }
  if (item.location?.lat && item.location?.lng) {
    return { lat: String(item.location.lat), lng: String(item.location.lng) };
  }
  return null;
};

// Helper to extract google types
const getGoogleTypes = (item: any): string[] => {
  if (item.googleTypes && typeof item.googleTypes === 'string') {
    return item.googleTypes.split(',').filter(Boolean);
  }
  if (Array.isArray(item.google_types)) {
    return item.google_types;
  }
  return [];
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

const getGoogleTypeLabel = (type: string): string => {
  return GOOGLE_TYPE_TRANSLATIONS[type] || type;
};

// Detail card modal component
const PlaceDetailModal: React.FC<{
  item: any;
  language: Language;
  categoryColor: string;
  onClose: () => void;
}> = ({ item, language, categoryColor, onClose }) => {
  const t = TRANSLATIONS[language] as any;
  const placeName = getPlaceName(item);
  const placeId = getPlaceId(item);
  const address = getAddress(item);
  const rating = getRating(item);
  const location = getLocation(item);
  const googleTypes = getGoogleTypes(item);
  const description = getDescription(item);
  
  // Fetch merchant promo
  const { data: promoData } = useQuery<{ promo: MerchantPromo | null }>({
    queryKey: ['placePromo', placeId, placeName, item.district, item.city],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (placeId) params.append('placeId', placeId);
      if (placeName) params.append('placeName', placeName);
      if (item.district) params.append('district', item.district);
      if (item.city) params.append('city', item.city);
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
      url = `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(placeName + ' ' + (item.district || '') + ' ' + (item.city || ''))}`;
    }
    window.open(url, '_blank');
  };

  return (
    <div 
      className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
      onClick={onClose}
    >
      <div 
        className="bg-white rounded-t-3xl sm:rounded-3xl w-full max-w-md max-h-[85vh] overflow-hidden relative"
        onClick={e => e.stopPropagation()}
      >
        {/* Header with color bar */}
        <div 
          className="h-2 w-full"
          style={{ backgroundColor: categoryColor }}
        />
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-6 right-6 w-8 h-8 bg-white/80 rounded-full flex items-center justify-center shadow-md z-10"
          data-testid="button-close-detail"
        >
          <X className="w-4 h-4" />
        </button>
        
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-8px)]">
          {/* Place name and category */}
          <div className="mb-4">
            <span 
              className="inline-block px-3 py-1 rounded-full text-xs font-bold text-white mb-2"
              style={{ backgroundColor: categoryColor }}
            >
              {getCategoryLabel(item.category || '', t)}
            </span>
            <h2 className="text-2xl font-black text-slate-800" data-testid="text-detail-name">
              {placeName}
            </h2>
          </div>
          
          {/* Location info */}
          <div className="flex items-center gap-2 text-slate-500 mb-4">
            <MapPin className="w-4 h-4" />
            <span className="text-sm">
              {[item.district, item.city].filter(Boolean).join(', ')}
            </span>
          </div>
          
          {/* Address */}
          {address && (
            <div className="bg-slate-50 rounded-xl p-4 mb-4">
              <p className="text-sm text-slate-600" data-testid="text-detail-address">
                {address}
              </p>
            </div>
          )}
          
          {/* Rating */}
          {rating && (
            <div className="flex items-center gap-2 mb-4">
              <Star className="w-5 h-5 text-yellow-400 fill-yellow-400" />
              <span className="font-bold text-slate-700" data-testid="text-detail-rating">
                {rating}
              </span>
              <span className="text-slate-400 text-sm">Google 評分</span>
            </div>
          )}
          
          {/* Google types as tags */}
          {googleTypes.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {googleTypes.slice(0, 5).map((type: string, idx: number) => (
                <span 
                  key={idx}
                  className="inline-flex items-center gap-1 px-2 py-1 bg-slate-100 rounded-lg text-xs text-slate-600"
                >
                  <Tag className="w-3 h-3" />
                  {getGoogleTypeLabel(type.trim())}
                </span>
              ))}
            </div>
          )}
          
          {/* Description */}
          {description && (
            <div className="mb-6">
              <p className="text-sm text-slate-600 leading-relaxed" data-testid="text-detail-description">
                {description}
              </p>
            </div>
          )}
          
          {/* Merchant promo section */}
          {promo && (
            <div 
              className="bg-gradient-to-r from-orange-50 to-amber-50 border-2 border-orange-200 rounded-2xl p-4 mb-6"
              data-testid="promo-section"
            >
              <div className="flex items-center gap-2 mb-2">
                <Gift className="w-5 h-5 text-orange-500" />
                <span className="font-bold text-orange-700">商家優惠</span>
              </div>
              <h3 className="font-bold text-lg text-slate-800 mb-1" data-testid="text-promo-title">
                {promo.title}
              </h3>
              {promo.description && (
                <p className="text-sm text-slate-600" data-testid="text-promo-description">
                  {promo.description}
                </p>
              )}
              {promo.imageUrl && (
                <img 
                  src={promo.imageUrl} 
                  alt={promo.title}
                  className="mt-3 rounded-xl w-full object-cover max-h-40"
                />
              )}
            </div>
          )}
          
          {/* Navigation button */}
          <button
            onClick={handleNavigate}
            className="w-full py-4 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition-transform active:scale-95"
            style={{ backgroundColor: categoryColor }}
            data-testid="button-navigate"
          >
            <Navigation className="w-5 h-5" />
            {language === 'zh-TW' ? '導航前往' : language === 'ja' ? 'ナビ開始' : 'Navigate'}
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
  const [selectedColor, setSelectedColor] = useState<string>('#6366f1');

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
    const cityMap: Record<string, { items: any[], byCategory: Record<string, any[]> }> = {};
    
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

  const colorMap: Record<string, string> = {
    'food': '#ea580c', 'stay': '#0891b2', 'education': '#7c3aed',
    'entertainment': '#db2777', 'scenery': '#10b981', 'shopping': '#f59e0b',
    'activity': '#84cc16', 'experience': '#f59e0b'
  };

  const handleCardClick = (item: any, categoryColor: string) => {
    setSelectedItem(item);
    setSelectedColor(categoryColor);
  };

  return (
    <>
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
                          const categoryColor = colorMap[category.toLowerCase()] || '#6366f1';
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
                                  {categoryItems.map((item: any, idx: number) => {
                                    const placeName = getPlaceName(item);
                                    const rating = getRating(item);
                                    
                                    return (
                                      <button
                                        key={`${item.id || idx}-${idx}`}
                                        onClick={() => handleCardClick(item, categoryColor)}
                                        className="w-full text-left p-3 rounded-xl border-2 transition-all hover:shadow-md relative overflow-hidden"
                                        style={{ 
                                          borderColor: categoryColor + '30',
                                          background: `linear-gradient(135deg, ${categoryColor}10 0%, white 60%)`
                                        }}
                                        data-testid={`card-collection-${item.id || idx}`}
                                      >
                                        <div 
                                          className="absolute top-0 left-0 right-0 h-0.5"
                                          style={{ backgroundColor: categoryColor }}
                                        />
                                        <div className="flex items-start gap-2">
                                          <div 
                                            className="w-1 h-full min-h-[40px] rounded-full flex-shrink-0"
                                            style={{ backgroundColor: categoryColor }}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="font-bold text-slate-800 text-sm truncate">
                                              {placeName}
                                            </p>
                                            {item.district && (
                                              <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                                <MapPin className="w-3 h-3" />
                                                {item.district}
                                              </p>
                                            )}
                                            {/* Show rating if available */}
                                            {rating && (
                                              <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                                                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                                                {rating}
                                              </p>
                                            )}
                                          </div>
                                          <ChevronDown className="w-4 h-4 text-slate-300 flex-shrink-0 -rotate-90" />
                                        </div>
                                      </button>
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
      
      {/* Detail modal */}
      {selectedItem && (
        <PlaceDetailModal
          item={selectedItem}
          language={language}
          categoryColor={selectedColor}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
};
