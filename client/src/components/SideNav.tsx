import React from 'react';
import { AppView, Language } from '../types';
import { Home, Compass, Map, Settings } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface SideNavProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
  language: Language;
}

export const SideNav: React.FC<SideNavProps> = ({ currentView, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const navItems: { id: AppView, icon: React.FC<any>, label: string }[] = [
    { id: 'mibu_home', icon: Home, label: t.navHome || '首頁' },
    { id: 'gacha_module', icon: Compass, label: t.navGachaModule || '行程扭蛋' },
    { id: 'planner_module', icon: Map, label: t.navPlannerModule || '旅程策劃' },
    { id: 'settings', icon: Settings, label: t.navSettings || '設定' },
  ];

  const isActiveView = (itemId: AppView) => {
    if (itemId === 'gacha_module') {
      return ['gacha_module', 'result'].includes(currentView);
    }
    if (itemId === 'planner_module') {
      return currentView === 'planner_module';
    }
    return currentView === itemId;
  };

  return (
    <>
      {/* Desktop: Right side vertical nav */}
      <nav className="hidden md:flex fixed right-0 top-1/2 -translate-y-1/2 bg-white/90 backdrop-blur-md border-l border-slate-100 shadow-lg rounded-l-2xl z-40 py-4 px-2">
        <div className="flex flex-col items-center gap-2">
          {navItems.map((item) => {
            const isActive = isActiveView(item.id);
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className="flex flex-col items-center justify-center p-2 group"
                data-testid={`nav-${item.id}`}
                title={item.label}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive 
                    ? 'bg-indigo-100 text-indigo-600' 
                    : 'text-slate-400 hover:bg-slate-50 hover:text-slate-600'
                }`}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-medium mt-1 whitespace-nowrap ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Mobile: Bottom nav */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe-bottom z-40">
        <div className="flex justify-around items-center h-16 px-2">
          {navItems.map((item) => {
            const isActive = isActiveView(item.id);
            const Icon = item.icon;
            
            return (
              <button
                key={item.id}
                onClick={() => onChange(item.id)}
                className="flex flex-col items-center justify-center flex-1"
                data-testid={`nav-${item.id}`}
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                  isActive 
                    ? 'bg-indigo-100 text-indigo-600' 
                    : 'text-slate-400'
                }`}>
                  <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
                </div>
                <span className={`text-[10px] font-medium mt-1 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
