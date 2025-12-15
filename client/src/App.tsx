import React, { useEffect } from 'react';
import { AdminDashboard } from './components/AdminDashboard';
import { useAppState, STORAGE_KEYS } from './hooks/useAppState';
import { LoginPage } from './pages/LoginPage';

const App: React.FC = () => {
  const {
    state,
    setState,
    user,
    authLoading,
    isAuthenticated,
    t,
    showRoleMenu,
    setShowRoleMenu,
    selectedRole,
    setSelectedRole,
  } = useAppState();

  useEffect(() => {
    if (isAuthenticated && user?.role === 'admin' && state.view === 'login') {
      setState(prev => ({ ...prev, view: 'admin_dashboard' }));
    }
  }, [isAuthenticated, user, state.view, setState]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-slate-600">{t.loading || 'Loading...'}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col font-sans relative bg-slate-50 text-slate-900 transition-colors duration-500 pb-20 select-none">
      <div className="fixed top-0 left-0 w-full h-96 bg-gradient-to-b from-indigo-50 to-transparent pointer-events-none -z-10"></div>

      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-lg border-b border-slate-100">
        <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-slate-800">Mibu Admin</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAuthenticated && user && (
              <>
                <span className="text-sm text-slate-600">{user.email}</span>
                <button
                  onClick={() => {
                    localStorage.removeItem(STORAGE_KEYS.GUEST_ID);
                    window.location.href = '/api/logout';
                  }}
                  className="px-3 py-1.5 text-sm bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
                  data-testid="button-logout"
                >
                  登出
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-6 py-6">
        {state.view === 'login' && (
          <LoginPage
            selectedRole={selectedRole}
            setSelectedRole={setSelectedRole}
            showRoleMenu={showRoleMenu}
            setShowRoleMenu={setShowRoleMenu}
            setState={setState}
            t={t}
          />
        )}

        {state.view === 'admin_dashboard' && (
          <AdminDashboard
            language={state.language}
            onBack={() => setState(prev => ({ ...prev, view: 'login' }))}
            t={t}
          />
        )}

        {state.view !== 'login' && state.view !== 'admin_dashboard' && (
          <div className="text-center py-12">
            <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-3xl">🔒</span>
            </div>
            <h2 className="text-xl font-bold text-slate-800 mb-2">管理後台</h2>
            <p className="text-slate-500 mb-6">請使用管理員帳號登入</p>
            <button
              onClick={() => setState(prev => ({ ...prev, view: 'login' }))}
              className="px-6 py-3 bg-indigo-500 text-white rounded-xl font-medium hover:bg-indigo-600 transition-colors"
              data-testid="button-go-login"
            >
              前往登入
            </button>
          </div>
        )}
      </main>
    </div>
  );
};

export default App;
