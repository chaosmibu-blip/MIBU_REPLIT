import React from 'react';
import { AppView, Language } from '../types';
import { Compass, BookOpen, Package } from 'lucide-react';
import { TRANSLATIONS } from '../constants';

interface BottomNavProps {
  currentView: AppView;
  onChange: (view: AppView) => void;
  language: Language;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentView, onChange, language }) => {
  const t = TRANSLATIONS[language];
  const navItems: { id: AppView, icon: React.FC<any>, label: string }[] = [
    { id: 'home', icon: Compass, label: t.navGacha },
    { id: 'collection', icon: BookOpen, label: t.navCollection },
    { id: 'item_box', icon: Package, label: t.navMyBox }, 
  ];

  const handleMerchant = () => {
    if (currentView === 'merchant_dashboard' || currentView === 'merchant_login') {
      onChange('home');
    } else {
      onChange('merchant_login');
    }
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 pb-safe-bottom z-40 max-w-md mx-auto">
      <div className="flex justify-around items-center h-20 px-4">
        {navItems.map((item) => {
          const isActive = currentView === item.id || (item.id === 'home' && currentView === 'result');
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
        
        <button
           onClick={handleMerchant}
           className="flex flex-col items-center justify-center"
           data-testid="nav-merchant"
        >
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all ${
            currentView.startsWith('merchant') 
              ? 'bg-indigo-100 text-indigo-600' 
              : 'text-slate-300'
          }`}>
            <StoreIcon className="w-5 h-5" />
          </div>
          <span className={`text-xs font-medium mt-1 ${currentView.startsWith('merchant') ? 'text-indigo-600' : 'text-slate-300'}`}>
            {t.navStore}
          </span>
        </button>
      </div>
    </nav>
  );
};

const StoreIcon = (props: any) => (
  <svg {...props} xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m2 7 4.41-4.41A2 2 0 0 1 7.83 2h8.34a2 2 0 0 1 1.42.59L22 7"/><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><path d="M15 22v-4a2 2 0 0 0-2-2h-2a2 2 0 0 0-2 2v4"/><path d="M2 7h20"/><path d="M22 7v3a2 2 0 0 1-2 2v0a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 16 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 12 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 8 12a2.7 2.7 0 0 1-1.59-.63.7.7 0 0 0-.82 0A2.7 2.7 0 0 1 4 12v0a2 2 0 0 1-2-2V7"/></svg>
);
