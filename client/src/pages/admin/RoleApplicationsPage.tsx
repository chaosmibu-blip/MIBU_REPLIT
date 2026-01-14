import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface RoleApplication {
  id: number;
  userId: string;
  role: string;
  status: string;
  appliedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    provider: string;
  };
}

interface RoleApplicationsPageProps {
  language: Language;
  t: Record<string, string>;
}

export const RoleApplicationsPage: React.FC<RoleApplicationsPageProps> = ({ language }) => {
  const [applications, setApplications] = useState<RoleApplication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [roleFilter, setRoleFilter] = useState('');

  const fetchApplications = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (roleFilter) params.append('role', roleFilter);

      const res = await fetch(`/api/admin/role-applications?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入角色申請');
      const result = await res.json();
      setApplications(result.applications || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [roleFilter]);

  useEffect(() => {
    fetchApplications();
  }, [fetchApplications]);

  const handleApprove = async (id: number) => {
    try {
      setProcessing(id);
      const res = await fetch(`/api/admin/role-applications/${id}/approve`, {
        method: 'PATCH',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('核准失敗');
      fetchApplications();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id: number) => {
    const reason = prompt('請輸入拒絕原因（選填）:');
    try {
      setProcessing(id);
      const res = await fetch(`/api/admin/role-applications/${id}/reject`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ reason }),
      });
      if (!res.ok) throw new Error('拒絕失敗');
      fetchApplications();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(null);
    }
  };

  const getRoleLabel = (role: string) => {
    const labels: Record<string, string> = {
      traveler: '旅客',
      merchant: '商家',
      specialist: '策劃師',
      admin: '管理員',
    };
    return labels[role] || role;
  };

  const getRoleBadgeStyle = (role: string) => {
    const styles: Record<string, string> = {
      traveler: 'bg-blue-100 text-blue-700',
      merchant: 'bg-purple-100 text-purple-700',
      specialist: 'bg-amber-100 text-amber-700',
      admin: 'bg-red-100 text-red-700',
    };
    return styles[role] || 'bg-slate-100 text-slate-600';
  };

  if (loading && applications.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入角色申請中...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        {error}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">角色申請審核</h2>
          <p className="text-slate-500">審核商家和策劃師的身份申請</p>
        </div>
        <button
          onClick={fetchApplications}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex gap-3">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">全部角色</option>
            <option value="merchant">商家</option>
            <option value="specialist">策劃師</option>
          </select>
        </div>
      </div>

      {/* 統計 */}
      <div className="text-sm text-slate-500">
        共 {applications.length} 筆待審核申請
      </div>

      {/* 申請列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {applications.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            目前沒有待審核的角色申請
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">用戶</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">申請角色</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">登入方式</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">申請時間</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {applications.map((app) => (
                  <tr key={app.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">
                        {[app.user.firstName, app.user.lastName].filter(Boolean).join(' ') || '未設定名稱'}
                      </div>
                      <div className="text-sm text-slate-500">{app.user.email}</div>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-3 py-1 text-sm rounded-full ${getRoleBadgeStyle(app.role)}`}>
                        {getRoleLabel(app.role)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm text-slate-600 capitalize">{app.user.provider}</span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatTWDate(app.appliedAt)}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => handleApprove(app.id)}
                          disabled={processing === app.id}
                          className="px-4 py-2 bg-green-500 text-white text-sm rounded-lg hover:bg-green-600 disabled:opacity-50 transition-colors"
                        >
                          {processing === app.id ? '處理中...' : '核准'}
                        </button>
                        <button
                          onClick={() => handleReject(app.id)}
                          disabled={processing === app.id}
                          className="px-4 py-2 bg-red-500 text-white text-sm rounded-lg hover:bg-red-600 disabled:opacity-50 transition-colors"
                        >
                          拒絕
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 說明 */}
      <div className="bg-blue-50 border border-blue-100 rounded-xl p-4">
        <h4 className="font-medium text-blue-800 mb-2">說明</h4>
        <ul className="text-sm text-blue-700 space-y-1">
          <li>• 旅客身份會自動啟用，不需要審核</li>
          <li>• 商家和策劃師需要管理員審核後才能使用相關功能</li>
          <li>• 一個用戶可以同時擁有多個角色</li>
        </ul>
      </div>
    </div>
  );
};
