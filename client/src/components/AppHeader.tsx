import React from 'react';
import { Globe, LogIn, LogOut } from 'lucide-react';
import { Language } from '../types';
import { STORAGE_KEYS } from '../hooks/useAppState';

interface AppHeaderProps {
  isAuthenticated: boolean;
  user: any;
  showLangMenu: boolean;
  setShowLangMenu: (show: boolean) => void;
  handleLanguageChange: (lang: Language) => void;
  onLogout: () => void;
  onLoginClick: () => void;
  currentView: string;
  t: any;
}

export const AppHeader: React.FC<AppHeaderProps> = ({
  isAuthenticated,
  user,
  showLangMenu,
  setShowLangMenu,
  handleLanguageChange,
  onLogout,
  onLoginClick,
  currentView,
  t,
}) => {
  return (
    <nav className="sticky top-0 z-[999] px-6 pt-safe-top pb-4 flex justify-between items-center w-full glass-nav transition-all">
      <div className="flex items-center gap-2">
        <img src="/app-icon.jpg" alt="Mibu" className="w-8 h-8 rounded-lg object-cover" />
        <span className="font-display font-bold text-xl tracking-tight text-slate-800">MIBU</span>
      </div>
      
      <div className="flex items-center gap-3">
        <div className="relative">
          <button 
            onClick={() => setShowLangMenu(!showLangMenu)} 
            className="p-2 bg-slate-100 rounded-full hover:bg-slate-200 transition-colors" 
            data-testid="button-language"
          >
            <Globe className="w-5 h-5 text-slate-600" />
          </button>
          {showLangMenu && (
            <div className="absolute top-full right-0 mt-2 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden w-32 py-1 flex flex-col z-50">
              <button onClick={() => handleLanguageChange('zh-TW')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-zh">繁體中文</button>
              <button onClick={() => handleLanguageChange('en')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-en">English</button>
              <button onClick={() => handleLanguageChange('ja')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-ja">日本語</button>
              <button onClick={() => handleLanguageChange('ko')} className="px-4 py-2 text-left hover:bg-slate-50 text-sm font-bold text-slate-700" data-testid="button-lang-ko">한국어</button>
            </div>
          )}
        </div>

        {isAuthenticated && user ? (
          <button 
            onClick={onLogout}
            className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity" 
            data-testid="button-logout"
          >
            <img 
              src={user.profileImageUrl || `https://ui-avatars.com/api/?name=${user.firstName || 'U'}`} 
              className="w-8 h-8 rounded-full border border-white shadow-sm object-cover" 
              alt="User" 
            />
            <span className="text-xs font-bold text-slate-600 hidden sm:block">{user.firstName || user.email}</span>
            <LogOut className="w-4 h-4 text-slate-400" />
          </button>
        ) : currentView !== 'login' ? (
          <button 
            onClick={onLoginClick}
            className="flex items-center gap-2 text-xs font-bold bg-indigo-500 text-white px-4 py-2 rounded-full hover:bg-indigo-600 transition-colors"
            data-testid="button-login"
          >
            <LogIn className="w-4 h-4" />
            {t.login}
          </button>
        ) : null}
      </div>
    </nav>
  );
};
