import React from 'react';
import { AppView, Language } from '../types';
import { Compass, BookOpen, Package, Map } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface BottomNavProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
  language: Language;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const navItems: { id: AppView, icon: React.FC<any>, label: string }[] = [
    { id: 'gacha_module', icon: Compass, label: t.navGacha },
    { id: 'planner_module', icon: Map, label: t.navPlanner || '策劃師' },
    { id: 'mibu_home', icon: BookOpen, label: t.navCollection },
    { id: 'settings', icon: Package, label: t.navMyBox }, 
  ];

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe-bottom z-40 max-w-md mx-auto">
      <div className="flex justify-around items-center h-20 px-4">
        {navItems.map((item) => {
          const isActive = currentView === item.id || (item.id === 'gacha_module' && currentView === 'result');
          const Icon = item.icon;
          
          return (
            <button
              key={item.id}
              onClick={() => onChange(item.id)}
              className="flex flex-col items-center justify-center"
              data-testid={`nav-${item.id}`}
            >
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
                isActive 
                  ? 'bg-indigo-100 text-indigo-600' 
                  : 'text-slate-400'
              }`}>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.5 : 2} />
              </div>
              <span className={`text-xs font-medium mt-1 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};
