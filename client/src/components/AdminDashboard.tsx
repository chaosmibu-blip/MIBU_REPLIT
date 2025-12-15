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

interface AdminDashboardProps {
  language: Language;
  onBack: () => void;
  t: Record<string, string>;
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({ language, onBack, t }) => {
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [allUsers, setAllUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'pending' | 'all'>('pending');

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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPendingUsers(), fetchAllUsers()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPendingUsers, fetchAllUsers]);

  const handleApprove = async (userId: string) => {
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
      
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <div className="text-3xl font-bold text-indigo-600 mb-1" data-testid="text-total-users">{allUsers.length}</div>
          <div className="text-sm text-slate-500">{t.totalUsers || '總用戶數'}</div>
        </div>
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
          <div className="text-3xl font-bold text-amber-600 mb-1" data-testid="text-pending-count">{pendingUsers.length}</div>
          <div className="text-sm text-slate-500">{t.pendingApprovals || '待審核'}</div>
        </div>
      </div>

      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'pending' 
              ? 'bg-amber-500 text-white' 
              : 'bg-white text-slate-600 border border-slate-200'
          }`}
          data-testid="tab-pending"
        >
          待審核 ({pendingUsers.length})
        </button>
        <button
          onClick={() => setActiveTab('all')}
          className={`flex-1 py-3 rounded-xl font-medium transition-colors ${
            activeTab === 'all' 
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
            onClick={() => { setError(null); fetchPendingUsers(); fetchAllUsers(); }}
            className="mt-2 text-sm text-red-500 underline"
          >
            重試
          </button>
        </div>
      ) : activeTab === 'pending' ? (
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
                    onClick={() => handleApprove(user.id)}
                    disabled={approving === user.id}
                    className="px-4 py-2 bg-emerald-500 text-white rounded-lg font-medium hover:bg-emerald-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid={`button-approve-${user.id}`}
                  >
                    {approving === user.id ? '審核中...' : '通過'}
                  </button>
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
                      onClick={() => handleApprove(user.id)}
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
