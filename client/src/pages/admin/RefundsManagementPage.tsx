import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface Refund {
  id: number;
  subscription_id: number;
  merchant_id: number;
  status: string;
  reason: string;
  requested_amount: number;
  refund_amount: number | null;
  admin_note: string | null;
  created_at: string;
  processed_at: string | null;
  merchant_name: string;
  merchant_contact: string;
  user_email: string;
  subscription_tier: string;
  subscription_amount: number;
}

interface RefundsResponse {
  refunds: Refund[];
  summary: {
    pending: number;
    approved: number;
    rejected: number;
    processed: number;
  };
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

interface RefundsManagementPageProps {
  language: Language;
  t: Record<string, string>;
}

export const RefundsManagementPage: React.FC<RefundsManagementPageProps> = ({ language }) => {
  const [data, setData] = useState<RefundsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');
  const [selectedRefund, setSelectedRefund] = useState<Refund | null>(null);
  const [processing, setProcessing] = useState(false);
  const [adminNote, setAdminNote] = useState('');

  const fetchRefunds = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        page: page.toString(),
        limit: '30',
        ...(statusFilter && { status: statusFilter }),
      });

      const res = await fetch(`/api/admin/refunds?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入退款請求');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    fetchRefunds();
  }, [fetchRefunds]);

  const handleProcessRefund = async (refundId: number, status: string, refundAmount?: number) => {
    try {
      setProcessing(true);
      const res = await fetch(`/api/admin/refunds/${refundId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status,
          adminNote: adminNote || undefined,
          refundAmount,
        }),
      });
      if (!res.ok) throw new Error('處理退款失敗');
      fetchRefunds();
      setSelectedRefund(null);
      setAdminNote('');
    } catch (err: any) {
      alert(err.message);
    } finally {
      setProcessing(false);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-amber-100 text-amber-700',
      approved: 'bg-blue-100 text-blue-700',
      rejected: 'bg-red-100 text-red-700',
      processed: 'bg-green-100 text-green-700',
    };
    const labels: Record<string, string> = {
      pending: '待處理',
      approved: '已核准',
      rejected: '已拒絕',
      processed: '已完成',
    };
    return (
      <span className={`px-2 py-1 text-xs rounded ${styles[status] || 'bg-slate-100 text-slate-600'}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入退款請求中...</p>
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
          <h2 className="text-2xl font-bold text-slate-800">退款管理</h2>
          <p className="text-slate-500">處理商家訂閱退款請求</p>
        </div>
        <button
          onClick={fetchRefunds}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 狀態統計 */}
      {data && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-amber-50 rounded-xl p-4 border border-amber-100">
            <div className="text-2xl font-bold text-amber-600">{data.summary.pending}</div>
            <div className="text-sm text-slate-500">待處理</div>
          </div>
          <div className="bg-blue-50 rounded-xl p-4 border border-blue-100">
            <div className="text-2xl font-bold text-blue-600">{data.summary.approved}</div>
            <div className="text-sm text-slate-500">已核准</div>
          </div>
          <div className="bg-green-50 rounded-xl p-4 border border-green-100">
            <div className="text-2xl font-bold text-green-600">{data.summary.processed}</div>
            <div className="text-sm text-slate-500">已完成</div>
          </div>
          <div className="bg-red-50 rounded-xl p-4 border border-red-100">
            <div className="text-2xl font-bold text-red-600">{data.summary.rejected}</div>
            <div className="text-sm text-slate-500">已拒絕</div>
          </div>
        </div>
      )}

      {/* 篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex gap-3">
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-200 rounded-lg"
          >
            <option value="">全部狀態</option>
            <option value="pending">待處理</option>
            <option value="approved">已核准</option>
            <option value="processed">已完成</option>
            <option value="rejected">已拒絕</option>
          </select>
        </div>
      </div>

      {/* 退款列表 */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-100 overflow-hidden">
        {data?.refunds.length === 0 ? (
          <div className="p-8 text-center text-slate-500">
            目前沒有退款請求
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">商家</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">訂閱方案</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">退款原因</th>
                  <th className="text-right px-4 py-3 text-sm font-medium text-slate-600">金額</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">狀態</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-slate-600">申請時間</th>
                  <th className="text-center px-4 py-3 text-sm font-medium text-slate-600">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data?.refunds.map((refund) => (
                  <tr key={refund.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-800">{refund.merchant_name}</div>
                      <div className="text-xs text-slate-400">{refund.user_email}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="px-2 py-1 text-xs bg-indigo-100 text-indigo-700 rounded">
                        {refund.subscription_tier?.toUpperCase()}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-600 max-w-[200px] truncate">
                      {refund.reason}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="font-medium text-slate-800">
                        NT${refund.requested_amount?.toLocaleString()}
                      </div>
                      {refund.refund_amount && refund.refund_amount !== refund.requested_amount && (
                        <div className="text-xs text-green-600">
                          實際: NT${refund.refund_amount.toLocaleString()}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {getStatusBadge(refund.status)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-500">
                      {formatTWDate(refund.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {refund.status === 'pending' && (
                        <button
                          onClick={() => setSelectedRefund(refund)}
                          className="px-3 py-1 text-xs bg-indigo-50 text-indigo-600 rounded hover:bg-indigo-100"
                        >
                          處理
                        </button>
                      )}
                      {refund.status !== 'pending' && (
                        <button
                          onClick={() => setSelectedRefund(refund)}
                          className="px-3 py-1 text-xs bg-slate-50 text-slate-600 rounded hover:bg-slate-100"
                        >
                          詳情
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

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

      {/* 處理退款 Modal */}
      {selectedRefund && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-slate-800">
                {selectedRefund.status === 'pending' ? '處理退款請求' : '退款詳情'}
              </h3>
              <button
                onClick={() => { setSelectedRefund(null); setAdminNote(''); }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">商家名稱</div>
                  <div className="font-medium">{selectedRefund.merchant_name}</div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">訂閱方案</div>
                  <div className="font-medium">{selectedRefund.subscription_tier?.toUpperCase()}</div>
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">退款原因</div>
                <div className="font-medium text-slate-700 bg-slate-50 p-3 rounded-lg mt-1">
                  {selectedRefund.reason}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm text-slate-500">申請金額</div>
                  <div className="text-xl font-bold text-slate-800">
                    NT${selectedRefund.requested_amount?.toLocaleString()}
                  </div>
                </div>
                <div>
                  <div className="text-sm text-slate-500">原訂閱金額</div>
                  <div className="font-medium">
                    NT${selectedRefund.subscription_amount?.toLocaleString()}
                  </div>
                </div>
              </div>
              <div>
                <div className="text-sm text-slate-500">目前狀態</div>
                <div className="mt-1">{getStatusBadge(selectedRefund.status)}</div>
              </div>
              {selectedRefund.admin_note && (
                <div>
                  <div className="text-sm text-slate-500">管理員備註</div>
                  <div className="text-sm text-slate-600 bg-slate-50 p-3 rounded-lg mt-1">
                    {selectedRefund.admin_note}
                  </div>
                </div>
              )}
              {selectedRefund.processed_at && (
                <div>
                  <div className="text-sm text-slate-500">處理時間</div>
                  <div className="font-medium">{formatTWDate(selectedRefund.processed_at)}</div>
                </div>
              )}

              {/* 處理區域 - 只在 pending 時顯示 */}
              {selectedRefund.status === 'pending' && (
                <div className="pt-4 border-t border-slate-100 space-y-4">
                  <div>
                    <label className="text-sm text-slate-500 block mb-1">備註（選填）</label>
                    <textarea
                      value={adminNote}
                      onChange={(e) => setAdminNote(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                      rows={2}
                      placeholder="輸入處理備註..."
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleProcessRefund(selectedRefund.id, 'processed', selectedRefund.requested_amount)}
                      disabled={processing}
                      className="flex-1 px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50"
                    >
                      核准並退款
                    </button>
                    <button
                      onClick={() => handleProcessRefund(selectedRefund.id, 'rejected')}
                      disabled={processing}
                      className="flex-1 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50"
                    >
                      拒絕
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
