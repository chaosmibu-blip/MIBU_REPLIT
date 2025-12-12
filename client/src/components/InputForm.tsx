import React, { useState, useEffect } from 'react';
import { AppState, Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { Loader2 } from 'lucide-react';

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
    if (state.language === 'zh-TW') return `${state.level} Stops`;
    if (state.language === 'ja') return `${state.level} スポット`;
    if (state.language === 'ko') return `${state.level} 스톱`;
    return `${state.level} Stops`;
  };

  return (
    <div className="w-full max-w-md mx-auto px-5 pt-8 pb-4">
      <div className="text-center mb-8">
        <h1 className="text-3xl font-black text-slate-800 tracking-tight">{t.appTitle}</h1>
        {userName && (
          <p className="text-slate-400 mt-2 text-sm">
            {state.language === 'zh-TW' ? `歡迎回來, ${userName}` : `Welcome back, ${userName}`}
          </p>
        )}
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-2">
            {state.language === 'zh-TW' ? '選擇探索國家' : t.destination}
          </label>
          <div className="relative">
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
        </div>

        {selectedCountryId && regions.length > 0 && (
          <div className="relative">
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

        {selectedCountryId && selectedRegionId && (
          <div className="pt-4">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-bold text-slate-700">
                {state.language === 'zh-TW' ? '行程豐富度' : 'Itinerary Length'}
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
              <span>{state.language === 'zh-TW' ? '惬意 (5點)' : 'Relaxed (5)'}</span>
              <span>{state.language === 'zh-TW' ? '極限 (12點)' : 'Packed (12)'}</span>
            </div>
          </div>
        )}

        <button
          onClick={onSubmit}
          disabled={!selectedCountryId || !selectedRegionId || districtCount === 0}
          className={`w-full py-4 rounded-2xl font-bold text-base mt-6 transition-all ${
            !selectedCountryId || !selectedRegionId || districtCount === 0
              ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-lg shadow-indigo-200 hover:bg-indigo-700 active:scale-[0.98]'
          }`}
          data-testid="button-start-gacha"
        >
          {state.language === 'zh-TW' ? '開始探索' : t.startGacha}
        </button>
      </div>
    </div>
  );
};
