import React from 'react';
import { ArrowLeft, Compass, BookOpen, Package, MapPin, Route, MessageCircle } from 'lucide-react';
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
  const tabs: { id: GachaSubView; label: string; icon: React.FC<any> }[] = [
    { id: 'gacha', label: t.navGacha || '扭蛋', icon: Compass },
    { id: 'collection', label: t.navCollection || '圖鑑', icon: BookOpen },
    { id: 'itembox', label: t.navMyBox || '道具箱', icon: Package },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe-bottom z-40">
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center flex-1"
              data-testid={`tab-gacha-${tab.id}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-indigo-100 text-indigo-600' : 'text-slate-400'
              }`}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-medium mt-1 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

interface PlannerModuleNavProps {
  currentTab: PlannerSubView;
  onChange: (tab: PlannerSubView) => void;
  language: Language;
}

export const PlannerModuleNav: React.FC<PlannerModuleNavProps> = ({ currentTab, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const tabs: { id: PlannerSubView; label: string; icon: React.FC<any> }[] = [
    { id: 'location', label: t.navLocation || '定位', icon: MapPin },
    { id: 'itinerary', label: t.navItinerary || '行程', icon: Route },
    { id: 'chat', label: t.navChat || '聊天', icon: MessageCircle },
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe-bottom z-40">
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => {
          const isActive = currentTab === tab.id;
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => onChange(tab.id)}
              className="flex flex-col items-center justify-center flex-1"
              data-testid={`tab-planner-${tab.id}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive ? 'bg-emerald-100 text-emerald-600' : 'text-slate-400'
              }`}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-[10px] font-medium mt-1 ${isActive ? 'text-emerald-600' : 'text-slate-400'}`}>
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
