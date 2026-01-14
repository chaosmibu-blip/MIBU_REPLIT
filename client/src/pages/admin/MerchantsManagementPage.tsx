import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface Merchant {
  id: number;
  user_id: string;
  business_name: string;
  contact_name: string;
  contact_phone: string;
  status: string;
  subscription_tier: string;
  created_at: string;
  updated_at: string;
  user_email: string;
  user_display_name: string;
  places_count: number;
  active_coupons: number;
  subscription_id: number | null;
  subscription_status: string | null;
  current_period_end: string | null;
}

interface MerchantsResponse {
  merchants: Merchant[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface MerchantsManagementPageProps {
  language: Language;
  t: Record<string, string>;
}

export const MerchantsManagementPage: React.FC<MerchantsManagementPageProps> = ({ language }) => {
  const [data, setData] = useState<MerchantsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedMerchant, setSelectedMerchant] = useState<Merchant | null>(null);

  const fetchMerchants = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(search && { search }),
        ...(statusFilter && { status: statusFilter }),
      });

      const res = await fetch(`/api/admin/merchants?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入商家');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, search, statusFilter]);

  useEffect(() => {
    fetchMerchants();
  }, [fetchMerchants]);

  const handleUpdateStatus = async (merchantId: number, status: string) => {
    try {
      const res = await fetch(`/api/admin/merchants/${merchantId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('更新狀態失敗');
      fetchMerchants();
      setSelectedMerchant(null);
    } catch (err: any) {
      alert(err.message);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(1);
    fetchMerchants();
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      approved: 'bg-green-100 text-green-700',
      pending: 'bg-amber-100 text-amber-700',
      rejected: 'bg-red-100 text-red-700',
    };
    const labels: Record<string, string> = {
      approved: '已核准',
      pending: '待審核',
      rejected: '已拒絕',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getTierBadge = (tier: string) => {
    const styles: Record<string, string> = {
      premium: 'bg-purple-100 text-purple-700',
      pro: 'bg-indigo-100 text-indigo-700',
      free: 'bg-slate-100 text-slate-600',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[tier] || 'bg-slate-100 text-slate-600'}`}>
        {tier.toUpperCase()}
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入商家資料中...</p>
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
          <h2 className="text-2xl font-bold text-slate-800">商家管理</h2>
          <p className="text-slate-500">檢視及管理所有商家帳號</p>
        </div>
        <button
          onClick={fetchMerchants}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 搜尋與篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <form onSubmit={handleSearch} className="flex flex-wrap gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="搜尋商家名稱、聯絡人或 Email..."
            className="flex-1 min-w-[200px] px-4 py-2 border border-slate-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">全部狀態</option>
            <option value="approved">已核准</option>
            <option value="pending">待審核</option>
            <option value="rejected">已拒絕</option>
          </select>
          <button
            type="submit"
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
          >
            搜尋
          </button>
        </form>
      </div>

      {/* 統計 */}
      {data && (
        <div className="text-sm text-slate-500">
          共 {data.pagination.total} 個商家
        </div>
      )}

      {/* 商家列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-slate-50 border-b border-slate-100">
              <tr>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">商家資訊</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">聯絡資訊</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">方案</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">景點/優惠券</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">狀態</th>
                <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">註冊時間</th>
                <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {data?.merchants.map((merchant) => (
                <tr key={merchant.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-800">{merchant.business_name}</div>
                    <div className="text-xs text-slate-400">ID: {merchant.id}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="text-sm text-slate-600">{merchant.contact_name}</div>
                    <div className="text-xs text-slate-400">{merchant.user_email}</div>
                    {merchant.contact_phone && (
                      <div className="text-xs text-slate-400">{merchant.contact_phone}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getTierBadge(merchant.subscription_tier)}
                    {merchant.subscription_status === 'active' && (
                      <div className="text-xs text-green-600 mt-1">有效訂閱</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="text-sm">
                      <span className="text-slate-600">{merchant.places_count || 0}</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-slate-600">{merchant.active_coupons || 0}</span>
                    </div>
                    <div className="text-xs text-slate-400">景點 / 優惠券</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {getStatusBadge(merchant.status)}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">
                    {formatTWDate(merchant.created_at)}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="flex gap-1 justify-center">
                      {merchant.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleUpdateStatus(merchant.id, 'approved')}
                            className="px-2 py-1 text-xs bg-green-50 text-green-600 rounded hover:bg-green-100"
                          >
                            核准
                          </button>
                          <button
                            onClick={() => handleUpdateStatus(merchant.id, 'rejected')}
                            className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                          >
                            拒絕
                          </button>
                        </>
                      )}
                      {merchant.status !== 'pending' && (
                        <button
                          onClick={() => setSelectedMerchant(merchant)}
                          className="px-2 py-1 text-xs bg-slate-50 text-slate-600 rounded hover:bg-slate-100"
                        >
                          詳情
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* 分頁 */}
        {data && data.pagination.totalPages > 1 && (
          <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between">
            <div className="text-sm text-slate-500">
              第 {data.pagination.page} / {data.pagination.totalPages} 頁
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50"
              >
                上一頁
              </button>
              <button
                onClick={() => setPage(p => Math.min(data.pagination.totalPages, p + 1))}
                disabled={page >= data.pagination.totalPages}
                className="px-3 py-1 border border-slate-200 rounded text-sm disabled:opacity-50"
              >
                下一頁
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 商家詳情 Modal */}
      {selectedMerchant && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">商家詳情</h3>
              <button
                onClick={() => setSelectedMerchant(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <div className="text-sm text-slate-500">商家名稱</div>
                <div className="font-medium">{selectedMerchant.business_name}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">聯絡人</div>
                <div className="font-medium">{selectedMerchant.contact_name}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">Email</div>
                <div className="font-medium">{selectedMerchant.user_email}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">電話</div>
                <div className="font-medium">{selectedMerchant.contact_phone || '-'}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">訂閱方案</div>
                <div>{getTierBadge(selectedMerchant.subscription_tier)}</div>
              </div>
              <div>
                <div className="text-sm text-slate-500">狀態</div>
                <div className="flex gap-2 mt-1">
                  {getStatusBadge(selectedMerchant.status)}
                </div>
              </div>
              <div className="pt-4 border-t border-slate-100">
                <div className="text-sm text-slate-500 mb-2">變更狀態</div>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleUpdateStatus(selectedMerchant.id, 'approved')}
                    className="px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                  >
                    核准
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedMerchant.id, 'pending')}
                    className="px-4 py-2 bg-amber-500 text-white rounded-lg hover:bg-amber-600"
                  >
                    待審核
                  </button>
                  <button
                    onClick={() => handleUpdateStatus(selectedMerchant.id, 'rejected')}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                  >
                    拒絕
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
