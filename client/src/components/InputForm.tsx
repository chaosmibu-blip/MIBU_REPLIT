import React from 'react';
import { motion } from 'framer-motion';
import { AppState, LocationData, AppView, Language } from '../types';
import { LOCATION_DATA, MAX_LEVEL, TRANSLATIONS } from '../constants';
import { MapPin, Zap, Search, Globe } from 'lucide-react';

interface InputFormProps {
  state: AppState;
  onUpdate: (updates: Partial<AppState>) => void;
  onSubmit: () => void;
}

export const InputForm: React.FC<InputFormProps> = ({ state, onUpdate, onSubmit }) => {
  const t = TRANSLATIONS[state.language];
  const locationName = LOCATION_DATA[state.country === 'taiwan' ? 'taiwan' : state.country === 'japan' ? 'japan' : 'hong_kong']?.names[state.language] || t.destination;
  
  const countries = Object.keys(LOCATION_DATA);
  const cities = state.country ? Object.keys(LOCATION_DATA[state.country]?.cities || {}) : [];

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
             <select
               value={state.country}
               onChange={(e) => onUpdate({ country: e.target.value, city: '' })}
               className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-200 appearance-none"
             >
               <option value="" disabled>{t.selectDestination}</option>
               {countries.map(c => (
                 <option key={c} value={c}>
                   {LOCATION_DATA[c].names[state.language]}
                 </option>
               ))}
             </select>
          </div>
        </div>

        {/* City Selection */}
        {state.country && (
          <div className="space-y-3">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">{t.city}</label>
             <div className="relative">
               <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-indigo-400" />
               <select
                 value={state.city}
                 onChange={(e) => onUpdate({ city: e.target.value })}
                 className="w-full pl-12 pr-4 py-4 bg-slate-50 border-none rounded-2xl text-slate-700 font-bold focus:ring-2 focus:ring-indigo-200 appearance-none"
               >
                 <option value="">{t.selectCity}</option>
                 {cities.map(cityKey => (
                   <option key={cityKey} value={cityKey}>
                     {LOCATION_DATA[state.country].cities[cityKey][state.language]}
                   </option>
                 ))}
               </select>
             </div>
          </div>
        )}

        {/* Level Slider */}
        <div className="space-y-4 pt-2">
           <div className="flex justify-between items-end px-1">
             <label className="text-xs font-bold text-slate-400 uppercase tracking-wider">{t.intensity}</label>
             <span className="text-2xl font-black text-indigo-600">Lv.{state.level}</span>
           </div>
           <input
             type="range"
             min="5"
             max={MAX_LEVEL}
             value={state.level}
             onChange={(e) => onUpdate({ level: parseInt(e.target.value) })}
             className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
           />
           <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase px-1">
             <span>{t.chill}</span>
             <span>{t.standard}</span>
             <span>{t.hardcore}</span>
           </div>
        </div>

        {/* Submit Button */}
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={onSubmit}
          disabled={!state.city || !state.country}
          className={`w-full py-5 rounded-2xl font-black text-lg shadow-xl transition-all ${
            !state.city 
              ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
              : 'bg-indigo-600 text-white shadow-indigo-200 hover:shadow-indigo-300'
          }`}
        >
          {t.startGacha}
        </motion.button>
      </div>
    </div>
  );
};
