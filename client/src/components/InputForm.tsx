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
                 value={selectedCountryId ?? ''}
                 onChange={(e) => e.target.value && handleCountryChange(parseInt(e.target.value))}
                 className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-200 appearance-none"
                 data-testid="select-country"
               >
                 <option value="">{t.selectDestination}</option>
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
                  value={selectedRegionId ?? ''}
                  onChange={(e) => handleRegionChange(e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-purple-200 appearance-none"
                  data-testid="select-region"
                >
                  <option value="">
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
              <span className="text-sm font-bold text-indigo-600" data-testid="text-level">{state.level}</span>
            </div>
            <div className="space-y-3">
              <input
                type="range"
                min="5"
                max="12"
                value={state.level}
                onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}
                className="w-full h-2 bg-gradient-to-r from-blue-200 to-indigo-300 rounded-lg appearance-none cursor-pointer"
                style={{
                  background: `linear-gradient(to right, rgb(191, 219, 254) 0%, rgb(191, 219, 254) ${((state.level - 5) / 7) * 100}%, rgb(199, 210, 254) ${((state.level - 5) / 7) * 100}%, rgb(199, 210, 254) 100%)`
                }}
                data-testid="slider-level"
              />
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
