import React from 'react';
import { ArrowLeft } from 'lucide-react';
import { Language, GachaSubView, PlannerSubView } from '../types';
import { TRANSLATIONS } from '../constants';

interface ModuleHeaderProps {
  title: string;
  onBack: () => void;
  language: Language;
}

export const ModuleHeader: React.FC<ModuleHeaderProps> = ({ title, onBack, language }) => {
  const t = TRANSLATIONS[language];
  
  return (
    <div className="flex items-center gap-3 mb-4">
      <button
        onClick={onBack}
        className="w-10 h-10 rounded-xl bg-white/80 backdrop-blur-sm border border-slate-100 flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
        data-testid="button-back"
        title={t.back || '返回'}
      >
        <ArrowLeft className="w-5 h-5" />
      </button>
      <h1 className="text-xl font-bold text-slate-800">{title}</h1>
    </div>
  );
};

interface GachaModuleNavProps {
  currentTab: GachaSubView;
  onChange: (tab: GachaSubView) => void;
  language: Language;
}

export const GachaModuleNav: React.FC<GachaModuleNavProps> = ({ currentTab, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const tabs: { id: GachaSubView; label: string }[] = [
    { id: 'gacha', label: t.navGacha || '扭蛋' },
    { id: 'collection', label: t.navCollection || '圖鑑' },
    { id: 'itembox', label: t.navMyBox || '道具箱' },
  ];

  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            currentTab === tab.id
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
          data-testid={`tab-gacha-${tab.id}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};

interface PlannerModuleNavProps {
  currentTab: PlannerSubView;
  onChange: (tab: PlannerSubView) => void;
  language: Language;
}

export const PlannerModuleNav: React.FC<PlannerModuleNavProps> = ({ currentTab, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const tabs: { id: PlannerSubView; label: string }[] = [
    { id: 'location', label: t.navLocation || '定位' },
    { id: 'itinerary', label: t.navItinerary || '行程' },
    { id: 'chat', label: t.navChat || '聊天' },
  ];

  return (
    <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-4">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-all ${
            currentTab === tab.id
              ? 'bg-white text-indigo-600 shadow-sm'
              : 'text-slate-500 hover:text-slate-700'
          }`}
          data-testid={`tab-planner-${tab.id}`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
};
