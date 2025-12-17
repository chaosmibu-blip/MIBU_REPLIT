import React, { useState, useEffect } from 'react';
import { AppState, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { Loader2, Gift, X } from 'lucide-react';

interface Country {
  id: number;
  code: string;
  nameEn: string;
  nameZh: string;
  nameJa: string | null;
  nameKo: string | null;
}

interface Region {
  id: number;
  countryId: number;
  nameEn: string;
  nameZh: string;
  nameJa: string | null;
  nameKo: string | null;
}

interface InputFormProps {
  state: AppState;
  onUpdate: (updates: Partial<AppState>) => void;
  onSubmit: () => void;
  userName?: string;
}

export const InputForm: React.FC<InputFormProps> = ({ state, onUpdate, onSubmit, userName }) => {
  const t = TRANSLATIONS[state.language];
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districtCount, setDistrictCount] = useState<number>(0);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingRegions, setLoadingRegions] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [showPrizePool, setShowPrizePool] = useState(false);
  const [prizePoolCoupons, setPrizePoolCoupons] = useState<any[]>([]);
  const [loadingPrizePool, setLoadingPrizePool] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      setFetchError(null);
      try {
        const response = await fetch('/api/locations/countries', {
          method: 'GET',
          headers: { 'Accept': 'application/json' },
          credentials: 'same-origin'
        });
        if (response.ok) {
          const data = await response.json();
          setCountries(data.countries || []);
        } else {
          setFetchError(`無法載入目的地 (${response.status})`);
        }
      } catch (error) {
        setFetchError('網路連線錯誤，請重新整理頁面');
      } finally {
        setLoadingCountries(false);
      }
    };
    fetchCountries();
  }, []);

  useEffect(() => {
    if (selectedCountryId) {
      const fetchRegions = async () => {
        setLoadingRegions(true);
        try {
          const response = await fetch(`/api/locations/regions/${selectedCountryId}`);
          if (response.ok) {
            const data = await response.json();
            setRegions(data.regions || []);
          }
        } catch (error) {
          console.error('Failed to fetch regions:', error);
        } finally {
          setLoadingRegions(false);
        }
      };
      fetchRegions();
      setSelectedRegionId(null);
    }
  }, [selectedCountryId]);

  useEffect(() => {
    const fetchDistrictCount = async () => {
      try {
        let url: string;
        if (selectedRegionId) {
          url = `/api/locations/districts/${selectedRegionId}`;
        } else if (selectedCountryId) {
          url = `/api/locations/districts/country/${selectedCountryId}`;
        } else {
          setDistrictCount(0);
          return;
        }
        const response = await fetch(url);
        if (response.ok) {
          const data = await response.json();
          setDistrictCount(data.districts?.length || data.count || 0);
        }
      } catch (error) {
        console.error('Failed to fetch district count:', error);
      }
    };
    fetchDistrictCount();
  }, [selectedCountryId, selectedRegionId]);

  const getLocalizedName = (item: Country | Region): string => {
    switch (state.language) {
      case 'ja': return item.nameJa || item.nameZh || item.nameEn;
      case 'ko': return item.nameKo || item.nameZh || item.nameEn;
      case 'en': return item.nameEn;
      default: return item.nameZh || item.nameEn;
    }
  };

  const handleCountryChange = (value: string) => {
    const countryId = parseInt(value, 10);
    if (isNaN(countryId)) return;
    const country = countries.find(c => c.id === countryId);
    if (country) {
      setSelectedCountryId(countryId);
      setSelectedRegionId(null);
      onUpdate({ country: country.code, countryId: countryId, regionId: null });
    }
  };

  const handleRegionChange = (regionId: number | null) => {
    setSelectedRegionId(regionId);
    onUpdate({ regionId: regionId });
  };

  const getLevelLabel = () => {
    return `${state.level}`;
  };

  const fetchPrizePool = async () => {
    if (!selectedRegionId) return;
    setLoadingPrizePool(true);
    try {
      const response = await fetch(`/api/coupons/region/${selectedRegionId}/pool`);
      if (response.ok) {
        const data = await response.json();
        setPrizePoolCoupons(data.coupons || []);
      }
    } catch (error) {
      console.error('Failed to fetch prize pool:', error);
    } finally {
      setLoadingPrizePool(false);
    }
  };

  const handleShowPrizePool = () => {
    fetchPrizePool();
    setShowPrizePool(true);
  };

  const canSubmit = selectedCountryId && selectedRegionId && districtCount > 0;

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-8 pb-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t.appTitle}</h1>
        <p className="text-slate-500 mt-2 text-sm font-medium">
          {state.language === 'zh-TW' ? '今天去哪玩?老天說了算' : 
           state.language === 'ja' ? '今日はどこへ？運命に任せよう' : 
           state.language === 'ko' ? '오늘 어디로? 운에 맡기자' : 
           "Where to today? Let fate decide"}
        </p>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            {state.language === 'zh-TW' ? '選擇探索國家' : t.destination}
          </label>
          {loadingCountries ? (
            <div className="w-full px-4 py-4 bg-slate-50 rounded-2xl flex items-center">
              <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              <span className="ml-2 text-slate-400">{t.loading}</span>
            </div>
          ) : fetchError ? (
            <div className="w-full px-4 py-4 bg-red-50 rounded-2xl flex items-center justify-between">
              <span className="text-red-500 text-sm">{fetchError}</span>
              <button 
                onClick={() => window.location.reload()} 
                className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-lg"
              >
                重試
              </button>
            </div>
          ) : (
            <select
              value={selectedCountryId || ''}
              onChange={(e) => handleCountryChange(e.target.value)}
              className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200"
              data-testid="select-country"
            >
              <option value="" disabled>
                {state.language === 'zh-TW' ? '請選擇國家' : t.selectDestination}
              </option>
              {countries.map(country => (
                <option key={country.id} value={country.id}>
                  {getLocalizedName(country)}
                </option>
              ))}
            </select>
          )}
        </div>

        {selectedCountryId && (
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-2">
              {state.language === 'zh-TW' ? '選擇城市/地區' : 'Select City/Region'}
            </label>
            {loadingRegions ? (
              <div className="w-full px-4 py-4 bg-slate-50 rounded-2xl flex items-center">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : (
              <select
                value={selectedRegionId || ''}
                onChange={(e) => handleRegionChange(e.target.value ? parseInt(e.target.value) : null)}
                className="w-full px-4 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200"
                data-testid="select-region"
              >
                <option value="" disabled>
                  {state.language === 'zh-TW' ? '請選擇城市/地區' : 'Select City/Region'}
                </option>
                {regions.map(region => (
                  <option key={region.id} value={region.id}>
                    {getLocalizedName(region)}
                  </option>
                ))}
              </select>
            )}
          </div>
        )}

        {selectedRegionId && (
          <div className="pt-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-700">
                {state.language === 'zh-TW' ? '行程數量' : state.language === 'ja' ? '行程数' : state.language === 'ko' ? '일정 수' : 'Itinerary Count'}
              </span>
              <span className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-sm font-bold" data-testid="text-level">
                {getLevelLabel()}
              </span>
            </div>
            <div className="relative">
              <div className="h-2 bg-slate-200 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-500 rounded-full transition-all duration-200"
                  style={{ width: `${((state.level - 5) / 7) * 100}%` }}
                />
              </div>
              <input
                type="range"
                min="5"
                max="12"
                value={state.level}
                onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                data-testid="slider-level"
              />
              <div 
                className="absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full border-2 border-indigo-500 shadow-sm pointer-events-none transition-all duration-200"
                style={{ left: `calc(${((state.level - 5) / 7) * 100}% - 10px)` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-xs text-slate-400">
              <span>{state.language === 'zh-TW' ? '悠閒' : state.language === 'ja' ? 'ゆったり' : state.language === 'ko' ? '여유로운' : 'Relaxed'}</span>
              <span>{state.language === 'zh-TW' ? '充實' : state.language === 'ja' ? '充実' : state.language === 'ko' ? '알찬' : 'Packed'}</span>
            </div>
          </div>
        )}

        {selectedRegionId && (
          <button
            onClick={handleShowPrizePool}
            className="w-full py-3 rounded-2xl font-bold text-sm mt-2 bg-gradient-to-r from-amber-400 to-orange-400 text-white shadow-md hover:from-amber-500 hover:to-orange-500 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            data-testid="button-view-prize-pool"
          >
            <Gift className="w-4 h-4" />
            {state.language === 'zh-TW' ? '查看獎池' : state.language === 'ja' ? '賞品プールを見る' : state.language === 'ko' ? '상품풀 보기' : 'View Prize Pool'}
          </button>
        )}

        <button
          onClick={onSubmit}
          disabled={!canSubmit}
          className={`w-full py-4 rounded-2xl font-bold text-base mt-4 transition-all ${
            canSubmit
              ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98]'
              : 'bg-slate-100 text-slate-400 cursor-not-allowed'
          }`}
          data-testid="button-start-gacha"
        >
          {state.language === 'zh-TW' ? '開始扭蛋' : state.language === 'ja' ? 'ガチャを回す' : state.language === 'ko' ? '가챠 시작' : 'START GACHA'}
        </button>
      </div>

      {showPrizePool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md max-h-[80vh] overflow-hidden">
            <div className="bg-gradient-to-r from-amber-400 to-orange-400 px-6 py-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Gift className="w-5 h-5" />
                {state.language === 'zh-TW' ? '獎池內容' : 'Prize Pool'}
              </h3>
              <button
                onClick={() => setShowPrizePool(false)}
                className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white hover:bg-white/30 transition-colors"
                data-testid="button-close-prize-pool"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {loadingPrizePool ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
                </div>
              ) : prizePoolCoupons.length === 0 ? (
                <div className="text-center py-8">
                  <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Gift className="w-8 h-8 text-slate-400" />
                  </div>
                  <p className="text-slate-500">
                    {state.language === 'zh-TW' ? '目前此區域沒有特殊優惠券' : 'No special coupons in this region'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {prizePoolCoupons.map((coupon, index) => (
                    <div 
                      key={coupon.id || index}
                      className={`p-4 rounded-2xl border-2 ${
                        coupon.rarity === 'SP' 
                          ? 'bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200' 
                          : 'bg-gradient-to-r from-amber-50 to-orange-50 border-amber-200'
                      }`}
                      data-testid={`prize-coupon-${coupon.id || index}`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                          coupon.rarity === 'SP' 
                            ? 'bg-purple-500 text-white' 
                            : 'bg-amber-500 text-white'
                        }`}>
                          {coupon.rarity || 'SSR'}
                        </span>
                        {coupon.merchantName && (
                          <span className="text-xs text-slate-500">{coupon.merchantName}</span>
                        )}
                      </div>
                      <h4 className="font-bold text-slate-800">{coupon.title || coupon.name}</h4>
                      {coupon.description && (
                        <p className="text-sm text-slate-500 mt-1">{coupon.description}</p>
                      )}
                      {coupon.discount && (
                        <div className="mt-2 text-lg font-bold text-orange-600">
                          {coupon.discount}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
