import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GachaItem, Language } from '../types';
import { RARITY_COLORS, TRANSLATIONS } from '../constants';
import { Sparkles } from 'lucide-react';

interface CouponCelebrationProps {
  items: GachaItem[];
  language: Language;
  onClose: () => void;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || content['zh-TW'] || '';
};

const getPlaceName = (item: any, lang: Language): string => {
  const placeName = item.place_name || item.placeName;
  return getContent(placeName, lang);
};

const getCouponTitle = (item: any, lang: Language): string => {
  const couponData = item.coupon_data || item.couponData;
  if (!couponData) return '';
  return getContent(couponData.title, lang);
};

export const CouponCelebration: React.FC<CouponCelebrationProps> = ({ items, language, onClose }) => {
  const t = TRANSLATIONS[language];
  // Show highest rarity
  const bestItem = items.sort((a, b) => {
    const rarityOrder = { SP: 5, SSR: 4, SR: 3, S: 2, R: 1 };
    return rarityOrder[b.rarity] - rarityOrder[a.rarity];
  })[0];

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4" onClick={onClose}>
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.5, opacity: 0 }}
        className="relative bg-white rounded-3xl p-8 max-w-sm w-full text-center overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-pink-50 -z-10" />
        
        {/* Rays */}
        <div className="absolute inset-0 animate-[spin_8s_linear_infinite] opacity-10 pointer-events-none">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0_20deg,var(--color-gacha-primary)_20deg_40deg,transparent_40deg_60deg,var(--color-gacha-primary)_60deg_80deg,transparent_80deg_100deg,var(--color-gacha-primary)_100deg_120deg,transparent_120deg_140deg,var(--color-gacha-primary)_140deg_160deg,transparent_160deg_180deg,var(--color-gacha-primary)_180deg_200deg,transparent_200deg_220deg,var(--color-gacha-primary)_220deg_240deg,transparent_240deg_260deg,var(--color-gacha-primary)_260deg_280deg,transparent_280deg_300deg,var(--color-gacha-primary)_300deg_320deg,transparent_320deg_340deg,var(--color-gacha-primary)_340deg_360deg)]" />
        </div>

        <motion.div 
           animate={{ rotate: [0, 10, -10, 0] }}
           transition={{ delay: 0.3, duration: 0.5 }}
           className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl font-black text-white shadow-xl border-4 border-white"
           style={{ backgroundColor: RARITY_COLORS[bestItem.rarity] }}
        >
           {bestItem.rarity}
        </motion.div>

        <h2 className="text-3xl font-black text-slate-800 mb-2">{t.lucky}</h2>
        <p className="text-slate-500 mb-6 font-medium">{t.foundCoupon}</p>

        <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-indigo-200 mb-8">
           <h3 className="font-bold text-lg text-indigo-900 mb-1">{getCouponTitle(bestItem, language)}</h3>
           <p className="text-sm text-slate-400">{getPlaceName(bestItem, language)}</p>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform"
        >
          {t.collectReward}
        </button>

        <div className="absolute top-0 left-0 w-full h-full pointer-events-none">
           <Sparkles className="absolute top-10 left-10 text-yellow-400 w-8 h-8 animate-bounce" />
           <Sparkles className="absolute bottom-20 right-10 text-pink-400 w-6 h-6 animate-pulse" />
        </div>
      </motion.div>
    </div>
  );
};
