import React, { useState, useEffect, useCallback } from 'react';
import { ModuleHeader } from './ModuleNav';
import { Language } from '../types';
import { UsersReviewPage } from '../pages/admin/UsersReviewPage';
import { PlaceDraftsReviewPage } from '../pages/admin/PlaceDraftsReviewPage';


interface PlaceDraft {
  id: number;
  placeName: string;
  status: string;
}

interface AdminDashboardProps {
  language: Language;
  onBack: () => void;
  t: Record<string, string>;
}

type AdminView = 'home' | 'users_review' | 'drafts_review';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ language, onBack, t }) => {
  const [currentView, setCurrentView] = useState<AdminView>('home');
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingUsers: 0,
    pendingApps: 0,
    pendingDrafts: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [usersRes, pendingUsersRes, appsRes, draftsRes] = await Promise.all([
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/users/pending', { credentials: 'include' }),
        fetch('/api/admin/applications/pending', { credentials: 'include' }),
        fetch('/api/admin/place-drafts', { credentials: 'include' })
      ]);

      const [usersData, pendingUsersData, appsData, draftsData] = await Promise.all([
        usersRes.json(),
        pendingUsersRes.json(),
        appsRes.json(),
        draftsRes.json()
      ]);

      setStats({
        totalUsers: usersData.users?.length || 0,
        pendingUsers: pendingUsersData.users?.length || 0,
        pendingApps: appsData.applications?.length || 0,
        pendingDrafts: (draftsData.drafts || []).filter((d: PlaceDraft) => d.status === 'pending').length
      });
    } catch (err) {
      console.error('Failed to fetch stats', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (currentView === 'home') {
      fetchStats();
    }
  }, [currentView, fetchStats]);

  if (currentView === 'users_review') {
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setCurrentView('home')}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            data-testid="button-back-to-admin"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-slate-500">返回管理後台</span>
        </div>
        <UsersReviewPage language={language} t={t} />
      </div>
    );
  }

  if (currentView === 'drafts_review') {
    return (
      <div className="space-y-6 pb-24">
        <div className="flex items-center gap-3 mb-4">
          <button
            onClick={() => setCurrentView('home')}
            className="p-2 rounded-xl bg-white border border-slate-200 hover:bg-slate-50 transition-colors"
            data-testid="button-back-to-admin"
          >
            <svg className="w-5 h-5 text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <span className="text-sm text-slate-500">返回管理後台</span>
        </div>
        <PlaceDraftsReviewPage language={language} t={t} />
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-24">
      <ModuleHeader 
        onBack={onBack} 
        language={language} 
      />
      
      <div className="text-center py-8">
        <div className="w-20 h-20 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <span className="text-3xl">⚙️</span>
        </div>
        <h1 className="text-2xl font-bold text-slate-800 mb-2">{t.adminDashboard || '管理後台'}</h1>
        <p className="text-slate-500">{t.adminWelcome || '系統管理中心'}</p>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-500">載入中...</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-4 gap-3">
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
              <div className="text-xl font-bold text-indigo-600 mb-1" data-testid="text-total-users">{stats.totalUsers}</div>
              <div className="text-xs text-slate-500">總用戶</div>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
              <div className="text-xl font-bold text-amber-600 mb-1" data-testid="text-pending-users-count">{stats.pendingUsers}</div>
              <div className="text-xs text-slate-500">待審核用戶</div>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
              <div className="text-xl font-bold text-purple-600 mb-1" data-testid="text-pending-apps-count">{stats.pendingApps}</div>
              <div className="text-xs text-slate-500">待審核申請</div>
            </div>
            <div className="bg-white rounded-2xl p-3 shadow-sm border border-slate-100 text-center">
              <div className="text-xl font-bold text-teal-600 mb-1" data-testid="text-drafts-count">{stats.pendingDrafts}</div>
              <div className="text-xs text-slate-500">待發布</div>
            </div>
          </div>

          <div className="space-y-4">
            <h2 className="font-bold text-slate-700 text-lg">審核管理</h2>
            
            <div 
              onClick={() => setCurrentView('users_review')}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:border-purple-300 hover:shadow-md transition-all cursor-pointer"
              data-testid="card-users-review"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-purple-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">👥</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 text-lg">用戶與商家審核</h3>
                  <p className="text-slate-500 text-sm">審核用戶帳號、商家申請</p>
                </div>
                <div className="flex items-center gap-2">
                  {(stats.pendingUsers + stats.pendingApps) > 0 && (
                    <span className="px-3 py-1 bg-amber-100 text-amber-700 rounded-full text-sm font-medium">
                      {stats.pendingUsers + stats.pendingApps} 待處理
                    </span>
                  )}
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>

            <div 
              onClick={() => setCurrentView('drafts_review')}
              className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 hover:border-teal-300 hover:shadow-md transition-all cursor-pointer"
              data-testid="card-drafts-review"
            >
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-teal-100 rounded-2xl flex items-center justify-center flex-shrink-0">
                  <span className="text-2xl">📍</span>
                </div>
                <div className="flex-1">
                  <h3 className="font-bold text-slate-800 text-lg">草稿行程卡審核</h3>
                  <p className="text-slate-500 text-sm">建立與審核行程卡草稿，含地圖預覽</p>
                </div>
                <div className="flex items-center gap-2">
                  {stats.pendingDrafts > 0 && (
                    <span className="px-3 py-1 bg-teal-100 text-teal-700 rounded-full text-sm font-medium">
                      {stats.pendingDrafts} 待發布
                    </span>
                  )}
                  <svg className="w-5 h-5 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};
