import React, { useState, useEffect, useCallback } from 'react';
import { ModuleHeader } from './ModuleNav';
import { Language } from '../types';

interface PendingUser {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isApproved: boolean;
  createdAt: string;
}

interface PendingApplication {
  id: number;
  merchantId: number;
  placeDraftId: number;
  status: string;
  createdAt: string;
  placeDraft?: {
    id: number;
    placeName: string;
    description: string | null;
    source: string;
    status: string;
    categoryId: number | null;
    subcategoryId: number | null;
    districtId: number | null;
    address: string | null;
    googlePlaceId: string | null;
    googleRating: string | null;
  };
  merchant?: {
    id: number;
    name: string;
    email: string;
  };
}

interface AdminDashboardProps {
  language: Language;
  onBack: () => void;
  t: Record<string, string>;
}

type TabType = 'pending_users' | 'all_users' | 'pending_apps';

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ language, onBack, t }) => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [pendingApplications, setPendingApplications] = useState<PendingApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [reviewingApp, setReviewingApp] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>('pending_users');

  const fetchPendingUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users/pending', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入待審核用戶');
      }
      const data = await response.json();
      setPendingUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchAllUsers = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/users', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入用戶列表');
      }
      const data = await response.json();
      setAllUsers(data.users || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  const fetchPendingApplications = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/applications/pending', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('無法載入待審核申請');
      }
      const data = await response.json();
      setPendingApplications(data.applications || []);
    } catch (err: any) {
      setError(err.message);
    }
  }, []);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPendingUsers(), fetchAllUsers(), fetchPendingApplications()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPendingUsers, fetchAllUsers, fetchPendingApplications]);

  const handleApproveUser = async (userId: string) => {
    setApproving(userId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users/${userId}/approve`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ approved: true })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '審核失敗');
      }
      
      await Promise.all([fetchPendingUsers(), fetchAllUsers()]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setApproving(null);
    }
  };

  const handleReviewApplication = async (applicationId: number, status: 'approved' | 'rejected') => {
    setReviewingApp(applicationId);
    setError(null);
    try {
      const response = await fetch(`/api/admin/applications/${applicationId}/review`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.error || '審核失敗');
      }
      
      await fetchPendingApplications();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setReviewingApp(null);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      consumer: '消費者',
      merchant: '商家',
      specialist: '策劃師',
      admin: '管理員'
    };
    return labels[role] || role;
  };

  const getRoleColor = (role: string) => {
    const colors: Record<string, string> = {
      consumer: 'bg-blue-100 text-blue-700',
      merchant: 'bg-emerald-100 text-emerald-700',
      specialist: 'bg-purple-100 text-purple-700',
      admin: 'bg-amber-100 text-amber-700'
    };
    return colors[role] || 'bg-slate-100 text-slate-700';
  };

  const getSourceLabel = (source: string) => {
    const labels: Record<string, string> = {
      'ai': 'AI 生成',
      'merchant': '商家建立'
    };
    return labels[source] || source;
  };

  const totalPending = pendingUsers.length + pendingApplications.length;

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
      
      <div className="grid grid-cols-3 gap-4">
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-indigo-600 mb-1" data-testid="text-total-users">{allUsers.length}</div>
          <div className="text-xs text-slate-500">{t.totalUsers || '總用戶'}</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-amber-600 mb-1" data-testid="text-pending-users-count">{pendingUsers.length}</div>
          <div className="text-xs text-slate-500">待審核用戶</div>
        </div>
        <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 text-center">
          <div className="text-2xl font-bold text-purple-600 mb-1" data-testid="text-pending-apps-count">{pendingApplications.length}</div>
          <div className="text-xs text-slate-500">待審核申請</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4 overflow-x-auto">
        <button
          onClick={() => setActiveTab('pending_users')}
          className={`flex-1 py-3 px-2 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'pending_users' 
              ? 'bg-amber-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-pending-users"
        >
          待審核用戶 ({pendingUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('pending_apps')}
          className={`flex-1 py-3 px-2 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'pending_apps' 
              ? 'bg-purple-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-pending-apps"
        >
          待審核申請 ({pendingApplications.length})
        </button>
        <button
          onClick={() => setActiveTab('all_users')}
          className={`flex-1 py-3 px-2 rounded-xl font-medium transition-colors text-sm whitespace-nowrap ${
            activeTab === 'all_users' 
              ? 'bg-indigo-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-all-users"
        >
          所有用戶 ({allUsers.length})
        </button>
      </div>

      {loading ? (
        <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
          <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          <p className="text-slate-500">載入中...</p>
        </div>
      ) : error ? (
        <div className="bg-red-50 rounded-2xl p-6 border border-red-200 text-center">
          <p className="text-red-600">{error}</p>
          <button 
            onClick={() => { setError(null); fetchPendingUsers(); fetchAllUsers(); fetchPendingApplications(); }}
            className="mt-2 text-sm text-red-500 underline"
          >
            重試
          </button>
        </div>
      ) : activeTab === 'pending_users' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">待審核用戶</h3>
          {pendingUsers.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有待審核的用戶</p>
          ) : (
            <div className="space-y-3">
              {pendingUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl"
                  data-testid={`pending-user-${user.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email}
                    </p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <span className={`inline-block text-xs px-2 py-1 rounded-full mt-1 ${getRoleColor(user.role)}`}>
                      {getRoleLabel(user.role)}
                    </span>
                  </div>
                  <button
                    onClick={() => handleApproveUser(user.id)}
                    disabled={approving === user.id}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid={`button-approve-user-${user.id}`}
                  >
                    {approving === user.id ? '審核中...' : '通過'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : activeTab === 'pending_apps' ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">待審核行程卡申請</h3>
          {pendingApplications.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有待審核的申請</p>
          ) : (
            <div className="space-y-4">
              {pendingApplications.map((app) => (
                <div 
                  key={app.id} 
                  className="py-4 px-4 bg-slate-50 rounded-xl"
                  data-testid={`pending-app-${app.id}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <p className="font-bold text-slate-800 text-lg">
                        {app.placeDraft?.placeName || '未命名地點'}
                      </p>
                      <div className="flex gap-2 mt-1">
                        <span className="inline-block text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-700">
                          {getSourceLabel(app.placeDraft?.source || '')}
                        </span>
                        {app.placeDraft?.googleRating && (
                          <span className="inline-block text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                            ⭐ {app.placeDraft.googleRating}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {app.placeDraft?.description && (
                    <p className="text-sm text-slate-600 mb-3 line-clamp-2">
                      {app.placeDraft.description}
                    </p>
                  )}
                  
                  {app.placeDraft?.address && (
                    <p className="text-xs text-slate-500 mb-3">
                      📍 {app.placeDraft.address}
                    </p>
                  )}

                  {app.merchant && (
                    <p className="text-xs text-slate-500 mb-3">
                      👤 申請商家：{app.merchant.name} ({app.merchant.email})
                    </p>
                  )}
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleReviewApplication(app.id, 'approved')}
                      disabled={reviewingApp === app.id}
                      className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-approve-app-${app.id}`}
                    >
                      {reviewingApp === app.id ? '處理中...' : '通過'}
                    </button>
                    <button
                      onClick={() => handleReviewApplication(app.id, 'rejected')}
                      disabled={reviewingApp === app.id}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg font-medium hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-reject-app-${app.id}`}
                    >
                      {reviewingApp === app.id ? '處理中...' : '退回'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-800 mb-4">所有用戶</h3>
          {allUsers.length === 0 ? (
            <p className="text-slate-400 text-center py-4">目前沒有用戶</p>
          ) : (
            <div className="space-y-3">
              {allUsers.map((user) => (
                <div 
                  key={user.id} 
                  className="flex items-center justify-between py-3 px-4 bg-slate-50 rounded-xl"
                  data-testid={`user-${user.id}`}
                >
                  <div className="flex-1">
                    <p className="font-medium text-slate-800">
                      {user.firstName || user.lastName 
                        ? `${user.firstName || ''} ${user.lastName || ''}`.trim()
                        : user.email}
                    </p>
                    <p className="text-sm text-slate-500">{user.email}</p>
                    <div className="flex gap-2 mt-1">
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${getRoleColor(user.role)}`}>
                        {getRoleLabel(user.role)}
                      </span>
                      <span className={`inline-block text-xs px-2 py-1 rounded-full ${
                        user.isApproved ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.isApproved ? '已審核' : '待審核'}
                      </span>
                    </div>
                  </div>
                  {!user.isApproved && (
                    <button
                      onClick={() => handleApproveUser(user.id)}
                      disabled={approving === user.id}
                      className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      data-testid={`button-approve-all-${user.id}`}
                    >
                      {approving === user.id ? '審核中...' : '通過'}
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
