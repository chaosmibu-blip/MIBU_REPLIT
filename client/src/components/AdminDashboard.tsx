import React, { useState, useEffect, useCallback } from 'react';
import { ModuleHeader } from './ModuleNav';
import { Language } from '../types';
import { UsersReviewPage } from '../pages/admin/UsersReviewPage';
import { PlaceDraftsReviewPage } from '../pages/admin/PlaceDraftsReviewPage';
import { BatchGeneratePage } from '../pages/admin/BatchGeneratePage';
import { AnnouncementsPage } from '../pages/admin/AnnouncementsPage';
import { ExclusionsPage } from '../pages/admin/ExclusionsPage';
import { SubscriptionPlansPage } from '../pages/admin/SubscriptionPlansPage';
import { SystemConfigsPage } from '../pages/admin/SystemConfigsPage';
import { SystemServicesPage } from '../pages/admin/SystemServicesPage';

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

type AdminView = 'home' | 'users_review' | 'drafts_review' | 'batch_generate' | 'announcements' | 'exclusions' | 'subscription_plans' | 'system_configs' | 'system_services';

const BackButton: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    onClick={onClick}
    className="inline-flex items-center gap-2 text-slate-500 hover:text-slate-700 transition-colors mb-6"
    data-testid="button-back-to-admin"
  >
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
    </svg>
    <span className="text-sm">返回</span>
  </button>
);

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ language, onBack, t }) => {
  const [currentView, setCurrentView] = useState<AdminView>('home');
  const [stats, setStats] = useState({
    totalUsers: 0,
    pendingUsers: 0,
    pendingApps: 0,
    pendingDrafts: 0,
    announcementsCount: 0,
    exclusionsCount: 0
  });
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    try {
      const [usersRes, pendingUsersRes, appsRes, draftsRes, announcementsRes, exclusionsRes] = await Promise.all([
        fetch('/api/admin/users', { credentials: 'include' }),
        fetch('/api/admin/users/pending', { credentials: 'include' }),
        fetch('/api/admin/applications/pending', { credentials: 'include' }),
        fetch('/api/admin/place-drafts', { credentials: 'include' }),
        fetch('/api/admin/announcements', { credentials: 'include' }).catch(() => ({ json: () => ({ announcements: [] }) })),
        fetch('/api/admin/global-exclusions', { credentials: 'include' }).catch(() => ({ json: () => ({ exclusions: [] }) }))
      ]);

      const [usersData, pendingUsersData, appsData, draftsData, announcementsData, exclusionsData] = await Promise.all([
        usersRes.json(),
        pendingUsersRes.json(),
        appsRes.json(),
        draftsRes.json(),
        announcementsRes.json ? announcementsRes.json() : announcementsRes,
        exclusionsRes.json ? exclusionsRes.json() : exclusionsRes
      ]);

      setStats({
        totalUsers: usersData.users?.length || 0,
        pendingUsers: pendingUsersData.users?.length || 0,
        pendingApps: appsData.applications?.length || 0,
        pendingDrafts: (draftsData.drafts || []).filter((d: PlaceDraft) => d.status === 'pending').length,
        announcementsCount: announcementsData.announcements?.length || 0,
        exclusionsCount: exclusionsData.exclusions?.length || 0
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

  const renderSubPage = () => {
    switch (currentView) {
      case 'users_review':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <UsersReviewPage language={language} t={t} />
          </div>
        );
      case 'drafts_review':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <PlaceDraftsReviewPage language={language} t={t} />
          </div>
        );
      case 'batch_generate':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <BatchGeneratePage language={language} t={t} />
          </div>
        );
      case 'announcements':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <AnnouncementsPage language={language} t={t} />
          </div>
        );
      case 'exclusions':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <ExclusionsPage language={language} t={t} />
          </div>
        );
      case 'subscription_plans':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <SubscriptionPlansPage language={language} t={t} />
          </div>
        );
      case 'system_configs':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <SystemConfigsPage language={language} t={t} />
          </div>
        );
      case 'system_services':
        return (
          <div className="pb-24">
            <BackButton onClick={() => setCurrentView('home')} />
            <SystemServicesPage language={language} t={t} />
          </div>
        );
      default:
        return null;
    }
  };

  if (currentView !== 'home') {
    return renderSubPage();
  }

  return (
    <div className="pb-24">
      <ModuleHeader 
        onBack={onBack} 
        language={language} 
      />
      
      <div className="py-8">
        <h1 className="text-2xl font-semibold text-slate-800">{t.adminDashboard || '管理後台'}</h1>
        <p className="text-slate-400 mt-1">{t.adminWelcome || '系統管理中心'}</p>
      </div>

      {loading ? (
        <div className="py-12 text-center">
          <div className="w-6 h-6 border-2 border-slate-300 border-t-slate-600 rounded-full animate-spin mx-auto"></div>
        </div>
      ) : (
        <div className="space-y-10">
          <div className="grid grid-cols-4 gap-4">
            <div className="text-center">
              <div className="text-2xl font-semibold text-slate-700" data-testid="text-total-users">{stats.totalUsers}</div>
              <div className="text-xs text-slate-400 mt-1">總用戶</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-amber-600" data-testid="text-pending-users-count">{stats.pendingUsers}</div>
              <div className="text-xs text-slate-400 mt-1">待審核</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-purple-600" data-testid="text-pending-apps-count">{stats.pendingApps}</div>
              <div className="text-xs text-slate-400 mt-1">待審申請</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-semibold text-teal-600" data-testid="text-drafts-count">{stats.pendingDrafts}</div>
              <div className="text-xs text-slate-400 mt-1">待發布</div>
            </div>
          </div>

          <div className="border-t border-slate-100"></div>

          <section>
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">審核管理</h2>
            <div className="space-y-2">
              <MenuItem 
                onClick={() => setCurrentView('users_review')}
                title="用戶與商家審核"
                badge={stats.pendingUsers + stats.pendingApps > 0 ? stats.pendingUsers + stats.pendingApps : undefined}
                badgeColor="amber"
                testId="card-users-review"
              />
              <MenuItem 
                onClick={() => setCurrentView('drafts_review')}
                title="草稿行程卡審核"
                badge={stats.pendingDrafts > 0 ? stats.pendingDrafts : undefined}
                badgeColor="teal"
                testId="card-drafts-review"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">資料管理</h2>
            <div className="space-y-2">
              <MenuItem 
                onClick={() => setCurrentView('batch_generate')}
                title="批次採集地點"
                testId="card-batch-generate"
              />
              <MenuItem 
                onClick={() => setCurrentView('exclusions')}
                title="全域排除管理"
                badge={stats.exclusionsCount > 0 ? stats.exclusionsCount : undefined}
                badgeColor="red"
                testId="card-exclusions"
              />
            </div>
          </section>

          <section>
            <h2 className="text-xs font-medium text-slate-400 uppercase tracking-wider mb-4">營運管理</h2>
            <div className="space-y-2">
              <MenuItem 
                onClick={() => setCurrentView('announcements')}
                title="公告管理"
                badge={stats.announcementsCount > 0 ? stats.announcementsCount : undefined}
                badgeColor="indigo"
                testId="card-announcements"
              />
              <MenuItem 
                onClick={() => setCurrentView('subscription_plans')}
                title="訂閱方案管理"
                testId="card-subscription-plans"
              />
              <MenuItem
                onClick={() => setCurrentView('system_configs')}
                title="系統設定"
                testId="card-system-configs"
              />
              <MenuItem
                onClick={() => setCurrentView('system_services')}
                title="系統服務狀態"
                testId="card-system-services"
              />
            </div>
          </section>
        </div>
      )}
    </div>
  );
};

interface MenuItemProps {
  onClick: () => void;
  title: string;
  badge?: number;
  badgeColor?: 'amber' | 'teal' | 'red' | 'indigo' | 'purple';
  testId: string;
}

const MenuItem: React.FC<MenuItemProps> = ({ onClick, title, badge, badgeColor = 'amber', testId }) => {
  const badgeColors = {
    amber: 'bg-amber-50 text-amber-600',
    teal: 'bg-teal-50 text-teal-600',
    red: 'bg-red-50 text-red-600',
    indigo: 'bg-indigo-50 text-indigo-600',
    purple: 'bg-purple-50 text-purple-600'
  };

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center justify-between py-4 px-1 border-b border-slate-50 hover:bg-slate-50 transition-colors text-left"
      data-testid={testId}
    >
      <span className="text-slate-700">{title}</span>
      <div className="flex items-center gap-3">
        {badge !== undefined && (
          <span className={`text-xs px-2 py-0.5 rounded-full ${badgeColors[badgeColor]}`}>
            {badge}
          </span>
        )}
        <svg className="w-4 h-4 text-slate-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 5l7 7-7 7" />
        </svg>
      </div>
    </button>
  );
};
