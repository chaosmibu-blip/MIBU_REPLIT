import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GachaItem, Language } from '../types';
import { CATEGORY_COLORS, TRANSLATIONS } from '../constants';
import { Sparkles, Ticket, Tag } from 'lucide-react';

interface CouponCelebrationProps {
  items: GachaItem[];
  language: Language;
  onClose: () => void;
}

const getContent = (content: any, lang: Language): string => {
  if (!content) return '';
  if (typeof content === 'string') return content;
  return content[lang] || content['en'] || '';
};

export const CouponCelebration: React.FC<CouponCelebrationProps> = ({ items, language, onClose }) => {
  const t = TRANSLATIONS[language] as any;
  const bestItem = items[0];
  const categoryColor = bestItem?.category ? CATEGORY_COLORS[bestItem.category] || '#6366f1' : '#6366f1';

  if (!bestItem) return null;

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
        
        <div className="absolute inset-0 animate-[spin_8s_linear_infinite] opacity-10 pointer-events-none">
           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent_0_20deg,var(--color-gacha-primary)_20deg_40deg,transparent_40deg_60deg,var(--color-gacha-primary)_60deg_80deg,transparent_80deg_100deg,var(--color-gacha-primary)_100deg_120deg,transparent_120deg_140deg,var(--color-gacha-primary)_140deg_160deg,transparent_160deg_180deg,var(--color-gacha-primary)_180deg_200deg,transparent_200deg_220deg,var(--color-gacha-primary)_220deg_240deg,transparent_240deg_260deg,var(--color-gacha-primary)_260deg_280deg,transparent_280deg_300deg,var(--color-gacha-primary)_300deg_320deg,transparent_320deg_340deg,var(--color-gacha-primary)_340deg_360deg)]" />
        </div>

        <motion.div 
           animate={{ rotate: [0, 10, -10, 0] }}
           transition={{ delay: 0.3, duration: 0.5 }}
           className="w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-6 shadow-xl border-4 border-white"
           style={{ backgroundColor: categoryColor }}
        >
           <Ticket className="w-12 h-12 text-white" />
        </motion.div>

        <h2 className="text-3xl font-black text-slate-800 mb-2">{t.lucky}</h2>
        <p className="text-slate-500 mb-6 font-medium">{t.foundCoupon}</p>

        {bestItem.category && (
          <div className="mb-4">
            <span 
              className="inline-flex items-center gap-1 text-xs font-bold uppercase px-3 py-1 rounded-full text-white"
              style={{ backgroundColor: categoryColor }}
            >
              <Tag className="w-3 h-3" />
              {t[`cat${bestItem.category}`] || bestItem.category}
            </span>
          </div>
        )}

        <div className="bg-white rounded-2xl p-4 border-2 border-dashed border-indigo-200 mb-8">
           <h3 className="font-bold text-lg text-indigo-900 mb-1">{getContent(bestItem.coupon_data?.title, language)}</h3>
           <p className="text-sm text-slate-400">{getContent(bestItem.place_name, language)}</p>
        </div>

        <button 
          onClick={onClose}
          className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:scale-105 transition-transform"
          data-testid="button-collect-reward"
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
