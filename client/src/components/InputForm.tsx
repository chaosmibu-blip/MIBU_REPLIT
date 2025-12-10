import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { AppState, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { MapPin, Globe, Sparkles, Loader2 } from 'lucide-react';

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
}

export const InputForm: React.FC<InputFormProps> = ({ state, onUpdate, onSubmit }) => {
  const t = TRANSLATIONS[state.language];
  const [countries, setCountries] = useState<Country[]>([]);
  const [regions, setRegions] = useState<Region[]>([]);
  const [districtCount, setDistrictCount] = useState<number>(0);
  const [selectedCountryId, setSelectedCountryId] = useState<number | null>(null);
  const [selectedRegionId, setSelectedRegionId] = useState<number | null>(null);
  const [loadingCountries, setLoadingCountries] = useState(true);
  const [loadingRegions, setLoadingRegions] = useState(false);

  useEffect(() => {
    const fetchCountries = async () => {
      try {
        const response = await fetch('/api/locations/countries');
        if (response.ok) {
          const data = await response.json();
          setCountries(data.countries || []);
        }
      } catch (error) {
        console.error('Failed to fetch countries:', error);
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

  const handleCountryChange = (countryId: number) => {
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

  const selectedCountry = countries.find(c => c.id === selectedCountryId);
  const selectedRegion = regions.find(r => r.id === selectedRegionId);

  return (
    <div className="w-full max-w-md mx-auto p-6 space-y-8 mt-10">
      <div className="text-center space-y-2">
        <h1 className="text-4xl font-black text-indigo-600 tracking-tight">{t.appTitle}</h1>
        <p className="text-slate-500 font-medium">{t.appSubtitle}</p>
      </div>

      <div className="bg-white rounded-3xl p-6 shadow-xl shadow-indigo-100 border border-indigo-50 space-y-6">
        {/* Country Selection */}
        <div className="space-y-3">
          <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{t.destination}</label>
          <div className="relative">
             <Globe className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
             {loadingCountries ? (
               <div className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl flex items-center">
                 <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                 <span className="ml-2 text-slate-400">{t.loading}</span>
               </div>
             ) : (
               <select
                 value={selectedCountryId || ''}
                 onChange={(e) => handleCountryChange(parseInt(e.target.value))}
                 className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-200 appearance-none"
                 data-testid="select-country"
               >
                 <option value="" disabled>{t.selectDestination}</option>
                 {countries.map(country => (
                   <option key={country.id} value={country.id}>
                     {getLocalizedName(country)}
                   </option>
                 ))}
               </select>
             )}
          </div>
        </div>

        {/* City/County Selection */}
        {selectedCountryId && regions.length > 0 && (
          <div className="space-y-3">
            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">
              {state.language === 'zh-TW' && '選擇縣市（選填）'}
              {state.language === 'en' && 'Select City/County (Optional)'}
              {state.language === 'ja' && '市区町村を選択（任意）'}
              {state.language === 'ko' && '시/군 선택 (선택사항)'}
            </label>
            <div className="relative">
              <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-purple-400" />
              {loadingRegions ? (
                <div className="w-full pl-12 pr-4 py-4 bg-slate-50 rounded-2xl flex items-center">
                  <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
                  <span className="ml-2 text-slate-400">{t.loading}</span>
                </div>
              ) : (
                <select
                  value={selectedRegionId || ''}
                  onChange={(e) => handleRegionChange(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-purple-200 appearance-none"
                  data-testid="select-region"
                >
                  <option value="">
                    {state.language === 'zh-TW' && '全部縣市（隨機）'}
                    {state.language === 'en' && 'All Cities/Counties (Random)'}
                    {state.language === 'ja' && 'すべての市区町村（ランダム）'}
                    {state.language === 'ko' && '모든 시/군 (랜덤)'}
                  </option>
                  {regions.map(region => (
                    <option key={region.id} value={region.id}>
                      {getLocalizedName(region)}
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        )}

        {/* District Info Display */}
        {selectedCountry && districtCount > 0 && (
          <div className="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-2xl p-4 space-y-2">
            <div className="flex items-center gap-2 text-indigo-600">
              <MapPin className="w-4 h-4" />
              <span className="font-bold text-sm">
                {selectedRegion ? getLocalizedName(selectedRegion) : getLocalizedName(selectedCountry)}
              </span>
            </div>
            <div className="text-xs text-slate-500">
              {state.language === 'zh-TW' && `${districtCount} 個鄉鎮區等你探索！`}
              {state.language === 'en' && `${districtCount} districts waiting to explore!`}
              {state.language === 'ja' && `${districtCount} 地区が探検を待っています！`}
              {state.language === 'ko' && `${districtCount}개 지역이 탐험을 기다리고 있습니다!`}
            </div>
            <div className="text-[10px] text-slate-400 uppercase tracking-wider">
              {state.language === 'zh-TW' && '隨機抽選：鄉鎮區 × 類別 × 子類別'}
              {state.language === 'en' && 'Random draw: District × Category × Subcategory'}
              {state.language === 'ja' && 'ランダム抽選：地区 × カテゴリ × サブカテゴリ'}
              {state.language === 'ko' && '랜덤 뽑기: 지역 × 카테고리 × 하위 카테고리'}
            </div>
          </div>
        )}

        {/* Gacha Info */}
        <div className="bg-gradient-to-r from-amber-50 to-orange-50 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-orange-200">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <div className="font-bold text-orange-700 text-sm mb-1">
                {state.language === 'zh-TW' && '扭蛋機制'}
                {state.language === 'en' && 'Gacha Mechanics'}
                {state.language === 'ja' && 'ガチャの仕組み'}
                {state.language === 'ko' && '가챠 메커니즘'}
              </div>
              <div className="text-xs text-orange-600 leading-relaxed">
                {state.language === 'zh-TW' && (
                  <>
                    <div>1️⃣ 隨機抽選一個區域 (1/{districtCount || 'N'} 機率)</div>
                    <div>2️⃣ 隨機抽選一個類別 (1/8 機率)</div>
                    <div>3️⃣ 隨機抽選子類別，查詢真實地點</div>
                  </>
                )}
                {state.language === 'en' && (
                  <>
                    <div>1️⃣ Random district (1/{districtCount || 'N'} chance)</div>
                    <div>2️⃣ Random category (1/8 chance)</div>
                    <div>3️⃣ Random subcategory → Real place search</div>
                  </>
                )}
                {state.language === 'ja' && (
                  <>
                    <div>1️⃣ ランダム地区 (1/{districtCount || 'N'} 確率)</div>
                    <div>2️⃣ ランダムカテゴリ (1/8 確率)</div>
                    <div>3️⃣ サブカテゴリ → 実際の場所を検索</div>
                  </>
                )}
                {state.language === 'ko' && (
                  <>
                    <div>1️⃣ 랜덤 지역 (1/{districtCount || 'N'} 확률)</div>
                    <div>2️⃣ 랜덤 카테고리 (1/8 확률)</div>
                    <div>3️⃣ 하위 카테고리 → 실제 장소 검색</div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubmit}
          disabled={!selectedCountryId || districtCount === 0}
          className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all ${
            !selectedCountryId || districtCount === 0
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-indigo-200 hover:shadow-indigo-300'
          }`}
          data-testid="button-start-gacha"
        >
          {t.startGacha}
        </motion.button>
      </div>
    </div>
  );
};
