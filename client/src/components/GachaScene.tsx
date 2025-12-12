import React from 'react';
import { Language } from '../types';
import { TRANSLATIONS } from '../constants';
import { Loader2 } from 'lucide-react';

interface GachaSceneProps {
    language: Language;
}

export const GachaScene: React.FC<GachaSceneProps> = ({ language }) => {
  const t = TRANSLATIONS[language];
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-white/95 backdrop-blur-sm">
      <Loader2 className="w-12 h-12 text-indigo-500 animate-spin" />
      <h2 className="mt-6 text-lg font-bold text-slate-700">
        {t.generating}
      </h2>
      <p className="text-slate-400 mt-1 text-sm">{t.findingGems}</p>
    </div>
  );
};
