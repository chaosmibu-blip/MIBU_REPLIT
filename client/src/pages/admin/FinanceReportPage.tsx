import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface SubscriptionRevenue {
  date: string;
  revenue: number;
  count: number;
  tier: string;
}

interface RefundStat {
  date: string;
  amount: number;
  count: number;
}

interface SubscriptionSummary {
  tier: string;
  count: number;
  total_revenue: number;
}

interface FinanceData {
  period: {
    startDate: string;
    endDate: string;
  };
  subscriptionRevenue: SubscriptionRevenue[];
  refundStats: RefundStat[];
  subscriptionSummary: SubscriptionSummary[];
  monthlyComparison: {
    current_month_revenue: number;
    last_month_revenue: number;
  };
  pendingRefunds: {
    total: number;
    count: number;
  };
  todayRevenue: number;
  generatedAt: string;
}

interface FinanceReportPageProps {
  language: Language;
  t: Record<string, string>;
}

export const FinanceReportPage: React.FC<FinanceReportPageProps> = ({ language }) => {
  const [data, setData] = useState<FinanceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        startDate,
        endDate,
      });

      const res = await fetch(`/api/admin/finance/report?${params}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入財務報表');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const calculateGrowth = (current: number, previous: number) => {
    if (previous === 0) return current > 0 ? 100 : 0;
    return ((current - previous) / previous * 100).toFixed(1);
  };

  const getTierLabel = (tier: string) => {
    const labels: Record<string, string> = {
      free: '免費版',
      pro: 'Pro',
      premium: 'Premium',
    };
    return labels[tier] || tier;
  };

  if (loading && !data) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入財務報表中...</p>
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

  if (!data) return null;

  const growth = parseFloat(calculateGrowth(
    data.monthlyComparison.current_month_revenue,
    data.monthlyComparison.last_month_revenue
  ));

  // 計算期間總收入
  const periodRevenue = data.subscriptionRevenue.reduce((sum, r) => sum + (Number(r.revenue) || 0), 0);
  const periodRefunds = data.refundStats.reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
  const netRevenue = periodRevenue - periodRefunds;

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">財務報表</h2>
          <p className="text-slate-500">訂閱收入與退款統計</p>
        </div>
        <button
          onClick={fetchReport}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 日期篩選 */}
      <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">起始日期</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm text-slate-500">結束日期</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-3 py-2 border border-slate-200 rounded-lg"
            />
          </div>
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            套用
          </button>
        </div>
      </div>

      {/* 主要指標 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-xl p-5 border border-green-100">
          <div className="text-sm text-slate-500 mb-1">今日收入</div>
          <div className="text-2xl font-bold text-green-600">
            NT${Number(data.todayRevenue || 0).toLocaleString()}
          </div>
        </div>
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-xl p-5 border border-indigo-100">
          <div className="text-sm text-slate-500 mb-1">本月收入</div>
          <div className="text-2xl font-bold text-indigo-600">
            NT${Number(data.monthlyComparison.current_month_revenue || 0).toLocaleString()}
          </div>
          <div className={`text-xs mt-1 ${growth >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {growth >= 0 ? '+' : ''}{growth}% vs 上月
          </div>
        </div>
        <div className="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl p-5 border border-amber-100">
          <div className="text-sm text-slate-500 mb-1">待處理退款</div>
          <div className="text-2xl font-bold text-amber-600">
            NT${Number(data.pendingRefunds.total || 0).toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">{data.pendingRefunds.count} 筆待處理</div>
        </div>
        <div className="bg-gradient-to-br from-slate-50 to-zinc-50 rounded-xl p-5 border border-slate-200">
          <div className="text-sm text-slate-500 mb-1">期間淨收入</div>
          <div className={`text-2xl font-bold ${netRevenue >= 0 ? 'text-slate-800' : 'text-red-600'}`}>
            NT${netRevenue.toLocaleString()}
          </div>
          <div className="text-xs text-slate-400 mt-1">
            收入 {periodRevenue.toLocaleString()} - 退款 {periodRefunds.toLocaleString()}
          </div>
        </div>
      </div>

      {/* 訂閱方案分佈 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="font-bold text-slate-700 mb-4">活躍訂閱分佈</h3>
        <div className="grid grid-cols-3 gap-4">
          {data.subscriptionSummary.map((summary) => (
            <div
              key={summary.tier}
              className={`p-4 rounded-xl ${
                summary.tier === 'premium' ? 'bg-purple-50 border-purple-100' :
                summary.tier === 'pro' ? 'bg-indigo-50 border-indigo-100' :
                'bg-slate-50 border-slate-100'
              } border`}
            >
              <div className="text-sm text-slate-500">{getTierLabel(summary.tier)}</div>
              <div className="text-2xl font-bold text-slate-800 mt-1">
                {Number(summary.count || 0)} 個
              </div>
              <div className="text-sm text-slate-500 mt-1">
                累計 NT${Number(summary.total_revenue || 0).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 收入趨勢圖 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-4">訂閱收入趨勢</h3>
          {data.subscriptionRevenue.length > 0 ? (
            <div className="space-y-2">
              {data.subscriptionRevenue.slice(-10).map((item, index) => {
                const maxRevenue = Math.max(...data.subscriptionRevenue.map(r => Number(r.revenue) || 0));
                const width = maxRevenue > 0 ? (Number(item.revenue) / maxRevenue) * 100 : 0;
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-slate-500">
                      {new Date(item.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-indigo-400 to-purple-400 rounded-full"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="w-24 text-right text-sm font-medium text-slate-700">
                      NT${Number(item.revenue || 0).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">此期間無訂閱收入資料</div>
          )}
        </div>

        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-4">退款記錄</h3>
          {data.refundStats.length > 0 ? (
            <div className="space-y-2">
              {data.refundStats.slice(-10).map((item, index) => {
                const maxAmount = Math.max(...data.refundStats.map(r => Number(r.amount) || 0));
                const width = maxAmount > 0 ? (Number(item.amount) / maxAmount) * 100 : 0;
                return (
                  <div key={index} className="flex items-center gap-3">
                    <div className="w-20 text-xs text-slate-500">
                      {new Date(item.date).toLocaleDateString('zh-TW', { month: 'short', day: 'numeric' })}
                    </div>
                    <div className="flex-1 h-6 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-red-300 to-red-400 rounded-full"
                        style={{ width: `${width}%` }}
                      />
                    </div>
                    <div className="w-24 text-right text-sm font-medium text-red-600">
                      -NT${Number(item.amount || 0).toLocaleString()}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-slate-400 py-8">此期間無退款記錄</div>
          )}
        </div>
      </div>

      {/* 月度對比 */}
      <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
        <h3 className="font-bold text-slate-700 mb-4">月度收入對比</h3>
        <div className="flex gap-8">
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-2">上月收入</div>
            <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-slate-400 rounded-full"
                style={{
                  width: `${Math.min(100, (Number(data.monthlyComparison.last_month_revenue) /
                    Math.max(Number(data.monthlyComparison.current_month_revenue), Number(data.monthlyComparison.last_month_revenue), 1)) * 100)}%`
                }}
              />
            </div>
            <div className="text-lg font-bold text-slate-600 mt-2">
              NT${Number(data.monthlyComparison.last_month_revenue || 0).toLocaleString()}
            </div>
          </div>
          <div className="flex-1">
            <div className="text-sm text-slate-500 mb-2">本月收入</div>
            <div className="h-8 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-green-400 to-emerald-400 rounded-full"
                style={{
                  width: `${Math.min(100, (Number(data.monthlyComparison.current_month_revenue) /
                    Math.max(Number(data.monthlyComparison.current_month_revenue), Number(data.monthlyComparison.last_month_revenue), 1)) * 100)}%`
                }}
              />
            </div>
            <div className="text-lg font-bold text-green-600 mt-2">
              NT${Number(data.monthlyComparison.current_month_revenue || 0).toLocaleString()}
            </div>
          </div>
        </div>
      </div>

      {/* 更新時間 */}
      <div className="text-center text-sm text-slate-400">
        報表產生時間：{formatTWDate(data.generatedAt)}
      </div>
    </div>
  );
};
