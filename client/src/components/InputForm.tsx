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

  const [fetchError, setFetchError] = useState<string | null>(null);

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
          console.error('Countries API returned:', response.status, response.statusText);
          setFetchError(`無法載入目的地 (${response.status})`);
        }
      } catch (error) {
        console.error('Failed to fetch countries:', error);
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

  const selectedCountry = countries.find(c => c.id === selectedCountryId);
  const selectedRegion = regions.find(r => r.id === selectedRegionId);

  return (
    <div className="w-full max-w-md mx-auto p-4 space-y-6 mt-6">
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-black bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent tracking-tight">{t.appTitle}</h1>
        <p className="text-slate-500 font-medium text-sm">{t.appSubtitle}</p>
      </div>

      <div className="bg-white rounded-2xl p-5 shadow-lg shadow-slate-200/50 border border-slate-100 space-y-5">
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
             ) : fetchError ? (
               <div className="w-full pl-12 pr-4 py-4 bg-red-50 rounded-2xl flex items-center justify-between">
                 <span className="text-red-500 text-sm">{fetchError}</span>
                 <button 
                   onClick={() => window.location.reload()} 
                   className="text-xs bg-red-100 text-red-600 px-3 py-1 rounded-lg hover:bg-red-200"
                 >
                   重試
                 </button>
               </div>
             ) : (
               <select
                 value={selectedCountryId || ''}
                 onChange={(e) => handleCountryChange(e.target.value)}
                 className="w-full pl-12 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-200 appearance-none cursor-pointer"
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
              {state.language === 'zh-TW' && '選擇縣市'}
              {state.language === 'en' && 'Select City/County'}
              {state.language === 'ja' && '市区町村を選択'}
              {state.language === 'ko' && '시/군 선택'}
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
                  className="w-full pl-12 pr-10 py-4 bg-slate-50 border border-slate-200 rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-purple-200"
                  data-testid="select-region"
                >
                  <option value="" disabled>
                    {state.language === 'zh-TW' && '選擇縣市'}
                    {state.language === 'en' && 'Select City/County'}
                    {state.language === 'ja' && '市区町村を選択'}
                    {state.language === 'ko' && '시/군 선택'}
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

        {/* Itinerary Length Slider */}
        {selectedCountryId && (
          <div className="space-y-3">
            <div className="flex items-center justify-between ml-1">
              <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                {state.language === 'zh-TW' && '行程數量'}
                {state.language === 'en' && 'Itinerary Length'}
                {state.language === 'ja' && '行程の長さ'}
                {state.language === 'ko' && '행정 길이'}
              </label>
              <motion.span 
                key={state.level}
                initial={{ scale: 1.3, color: '#4f46e5' }}
                animate={{ scale: 1, color: '#4f46e5' }}
                className="text-lg font-black text-indigo-600 tabular-nums" 
                data-testid="text-level"
              >
                {state.level}
              </motion.span>
            </div>
            <div className="space-y-3">
              <div className="relative h-10 flex items-center">
                <div className="absolute inset-x-0 h-3 bg-slate-200 rounded-full overflow-hidden">
                  <motion.div 
                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full"
                    initial={false}
                    animate={{ width: `${((state.level - 5) / 7) * 100}%` }}
                    transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  />
                </div>
                <input
                  type="range"
                  min="5"
                  max="12"
                  value={state.level}
                  onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                  data-testid="slider-level"
                />
                <motion.div 
                  className="absolute w-6 h-6 bg-white rounded-full shadow-lg border-2 border-indigo-500 pointer-events-none"
                  initial={false}
                  animate={{ left: `calc(${((state.level - 5) / 7) * 100}% - 12px)` }}
                  transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                  whileTap={{ scale: 1.2 }}
                />
              </div>
              <div className="flex justify-between px-1">
                <span className="text-xs font-bold text-slate-500">
                  {state.language === 'zh-TW' && '悠閒'}
                  {state.language === 'en' && 'Relaxed'}
                  {state.language === 'ja' && 'リラックス'}
                  {state.language === 'ko' && '여유로운'}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {state.language === 'zh-TW' && '標準'}
                  {state.language === 'en' && 'Standard'}
                  {state.language === 'ja' && '標準'}
                  {state.language === 'ko' && '표준'}
                </span>
                <span className="text-xs font-bold text-slate-500">
                  {state.language === 'zh-TW' && '充實'}
                  {state.language === 'en' && 'Packed'}
                  {state.language === 'ja' && '充実'}
                  {state.language === 'ko' && '알찬'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubmit}
          disabled={!selectedCountryId || districtCount === 0}
          className={`w-full py-4 rounded-xl font-bold text-base shadow-lg transition-all ${
            !selectedCountryId || districtCount === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-indigo-200 hover:shadow-indigo-300 hover:opacity-95'
          }`}
          data-testid="button-start-gacha"
        >
          <span className="flex items-center justify-center gap-2">
            <Sparkles className="w-5 h-5" />
            {t.startGacha}
          </span>
        </motion.button>
      </div>
    </div>
  );
};
