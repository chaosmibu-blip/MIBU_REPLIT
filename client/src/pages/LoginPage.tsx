import React from 'react';
import { LogIn } from 'lucide-react';
import { STORAGE_KEYS, generateGuestId } from '../hooks/useAppState';
import { AppState } from '../types';

interface LoginPageProps {
  selectedRole: 'consumer' | 'merchant' | 'agent' | 'admin';
  setSelectedRole: (role: 'consumer' | 'merchant' | 'agent' | 'admin') => void;
  showRoleMenu: boolean;
  setShowRoleMenu: (show: boolean) => void;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  t: any;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  selectedRole,
  setSelectedRole,
  showRoleMenu,
  setShowRoleMenu,
  setState,
  t,
}) => {
  const handleGoogleLogin = () => {
    localStorage.setItem(STORAGE_KEYS.SELECTED_ROLE, selectedRole);
    window.location.href = '/api/login';
  };

  const handleGuestLogin = () => {
    const guestId = generateGuestId();
    localStorage.setItem(STORAGE_KEYS.GUEST_ID, guestId);
    setState(prev => ({
      ...prev,
      view: 'mibu_home',
      user: {
        id: guestId,
        name: t.guest || '訪客',
        email: null,
        avatar: null,
        provider: 'guest'
      }
    }));
  };

  const getRoleButtonColor = () => {
    switch (selectedRole) {
      case 'merchant': return 'bg-emerald-500 hover:bg-emerald-600';
      case 'agent': return 'bg-purple-500 hover:bg-purple-600';
      case 'admin': return 'bg-amber-500 hover:bg-amber-600';
      default: return 'bg-indigo-500 hover:bg-indigo-600';
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] space-y-8 relative">
      <button
        onClick={() => setShowRoleMenu(!showRoleMenu)}
        className="absolute top-0 right-0 text-xs text-slate-400 hover:text-indigo-600 transition-colors"
        data-testid="button-switch-role"
      >
        {t.switchRole || '切換用戶別'}
      </button>
      
      {showRoleMenu && (
        <div className="absolute top-8 right-0 bg-white rounded-xl shadow-xl border border-slate-100 overflow-hidden w-32 py-1 z-50">
          <button
            onClick={() => { setSelectedRole('consumer'); setShowRoleMenu(false); }}
            className={`w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-medium ${selectedRole === 'consumer' ? 'text-indigo-600 bg-indigo-50' : 'text-slate-700'}`}
            data-testid="role-consumer"
          >
            {t.roleConsumer || '旅客'}
          </button>
          <button
            onClick={() => { setSelectedRole('merchant'); setShowRoleMenu(false); }}
            className={`w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-medium ${selectedRole === 'merchant' ? 'text-emerald-600 bg-emerald-50' : 'text-slate-700'}`}
            data-testid="role-merchant"
          >
            {t.roleMerchant || '企業端'}
          </button>
          <button
            onClick={() => { setSelectedRole('agent'); setShowRoleMenu(false); }}
            className={`w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-medium ${selectedRole === 'agent' ? 'text-purple-600 bg-purple-50' : 'text-slate-700'}`}
            data-testid="role-agent"
          >
            {t.roleAgent || '專員端'}
          </button>
          <button
            onClick={() => { setSelectedRole('admin'); setShowRoleMenu(false); }}
            className={`w-full px-4 py-3 text-left hover:bg-slate-50 text-sm font-medium ${selectedRole === 'admin' ? 'text-amber-600 bg-amber-50' : 'text-slate-700'}`}
            data-testid="role-admin"
          >
            {t.roleAdmin || '管理端'}
          </button>
        </div>
      )}
      
      <div className="text-center">
        <h1 className="text-4xl font-bold text-slate-800 mb-2">Mibu</h1>
        <p className="text-slate-500">{t.appSubtitle || '探索台灣的最佳方式'}</p>
      </div>
      
      <div className="w-full max-w-sm space-y-4">
        <button
          onClick={handleGoogleLogin}
          className={`flex items-center justify-center gap-2 w-full font-bold py-4 rounded-2xl transition-colors shadow-lg text-white ${getRoleButtonColor()}`}
          data-testid="button-google-login"
        >
          <LogIn className="w-5 h-5" />
          {t.loginWithGoogle || 'Google 登入'}
        </button>
        
        {selectedRole === 'consumer' && (
          <button
            onClick={handleGuestLogin}
            className="w-full bg-slate-100 text-slate-700 font-medium py-4 rounded-2xl hover:bg-slate-200 transition-colors"
            data-testid="button-guest-login"
          >
            {t.guestLogin || '訪客登入'}
          </button>
        )}
      </div>
      
      <p className="text-xs text-slate-400 text-center max-w-xs">
        {t.loginDisclaimer || '登入即表示您同意我們的服務條款與隱私權政策'}
      </p>
    </div>
  );
};
