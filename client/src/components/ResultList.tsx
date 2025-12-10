import React from 'react';
import { motion } from 'framer-motion';
import { GachaResponse, GachaItem, Language } from '../types';
import { MapPin, Ticket, Clock, Info, RefreshCw } from 'lucide-react';
import { RARITY_COLORS, TRANSLATIONS } from '../constants';

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

export const ResultList: React.FC<ResultListProps> = ({ data, language, onResearch, isLoading }) => {
  const t = TRANSLATIONS[language];
  return (
    <div className="pb-32 px-4 pt-4 max-w-md mx-auto">
      <div className="mb-6 flex justify-between items-end">
        <div>
          <h2 className="text-3xl font-black text-slate-800">{getContent(data.meta.locked_district, language)}</h2>
          <p className="text-slate-500 font-medium">{t.tripLevel.replace('{level}', data.meta.user_level.toString())}</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full text-xs font-bold">
            {t.spotsCount.replace('{count}', data.inventory.length.toString())}
          </div>
          {onResearch && (
            <button
              onClick={onResearch}
              disabled={isLoading}
              className="flex items-center gap-1.5 bg-indigo-500 hover:bg-indigo-600 disabled:bg-indigo-300 text-white px-3 py-1.5 rounded-full text-xs font-bold transition-colors"
              data-testid="button-research"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              {language === 'zh-TW' ? '重新搜索' : language === 'ja' ? '再検索' : language === 'ko' ? '다시 검색' : 'Research'}
            </button>
          )}
        </div>
      </div>

      <div className="space-y-4">
        {data.inventory.map((item, idx) => (
          <motion.div
            key={item.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
            className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 relative overflow-hidden group"
          >
             {/* Rarity Stripe */}
             <div 
               className="absolute left-0 top-0 bottom-0 w-1.5" 
               style={{ backgroundColor: RARITY_COLORS[item.rarity] }} 
             />

             <div className="pl-3">
               <div className="flex justify-between items-start mb-2">
                 <span 
                   className="text-[10px] font-black uppercase px-2 py-0.5 rounded text-white"
                   style={{ backgroundColor: RARITY_COLORS[item.rarity] }}
                 >
                   {item.rarity}
                 </span>
                 <div className="flex items-center text-slate-400 text-xs gap-1">
                   <Clock className="w-3 h-3" />
                   {item.suggested_time}
                 </div>
               </div>

               <h3 className="text-lg font-bold text-slate-800 leading-tight mb-1">
                 {getContent(item.place_name, language)}
               </h3>
               
               <p className="text-sm text-slate-500 line-clamp-2 mb-3">
                 {getContent(item.description, language)}
               </p>

               {/* Coupon / Promo Section */}
               {(item.is_coupon || item.is_promo_active) && (
                 <div className="mt-3 bg-indigo-50/50 rounded-xl p-3 border border-indigo-100 flex items-center gap-3">
                   <div className="bg-indigo-100 p-2 rounded-lg text-indigo-600">
                     <Ticket className="w-5 h-5" />
                   </div>
                   <div className="flex-1 min-w-0">
                     {item.is_coupon ? (
                        <>
                          <p className="text-xs font-bold text-indigo-900 uppercase">{t.couponUnlocked}</p>
                          <p className="text-sm font-medium text-indigo-700 truncate">{getContent(item.coupon_data?.title, language)}</p>
                        </>
                     ) : (
                        <>
                          <p className="text-xs font-bold text-pink-600 uppercase">{t.specialPromo}</p>
                          <p className="text-sm font-medium text-pink-700 truncate">{getContent(item.store_promo, language)}</p>
                        </>
                     )}
                   </div>
                 </div>
               )}
             </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
};
