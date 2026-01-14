import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface DashboardStats {
  users: {
    total: number;
    todayNew: number;
    monthlyActive: number;
  };
  gacha: {
    total: number;
    today: number;
    monthly: number;
  };
  places: {
    total: number;
    active: number;
  };
  merchants: {
    total: number;
    approved: number;
    pending: number;
  };
  subscriptions: {
    active: number;
    monthlyRevenue: number;
  };
  coupons: {
    total: number;
    redeemed: number;
    redemptionRate: number;
  };
  pending: {
    users: number;
    merchants: number;
    refunds: number;
    total: number;
  };
}

interface TrendData {
  date: string;
  count: number;
}

interface DashboardResponse {
  stats: DashboardStats;
  trends: {
    gacha: TrendData[];
    users: TrendData[];
  };
  generatedAt: string;
}

interface OperationsDashboardPageProps {
  language: Language;
  t: Record<string, string>;
  onNavigate?: (view: string) => void;
}

export const OperationsDashboardPage: React.FC<OperationsDashboardPageProps> = ({
  language,
  t,
  onNavigate
}) => {
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/dashboard', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入儀表板');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">載入營運數據中...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl">
        {error || '無法載入數據'}
      </div>
    );
  }

  const { stats, trends } = data;

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">營運儀表板</h2>
          <p className="text-slate-500">平台整體運營狀況一覽</p>
        </div>
        <button
          onClick={fetchDashboard}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新整理
        </button>
      </div>

      {/* 待處理事項警示 */}
      {stats.pending.total > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">⚠️</span>
            <div>
              <div className="font-medium text-amber-800">
                有 {stats.pending.total} 件待處理事項
              </div>
              <div className="text-sm text-amber-600 flex gap-4 mt-1">
                {stats.pending.users > 0 && (
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={() => onNavigate?.('users_review')}
                  >
                    {stats.pending.users} 個用戶待審核
                  </span>
                )}
                {stats.pending.merchants > 0 && (
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={() => onNavigate?.('users_review')}
                  >
                    {stats.pending.merchants} 個商家待審核
                  </span>
                )}
                {stats.pending.refunds > 0 && (
                  <span
                    className="cursor-pointer hover:underline"
                    onClick={() => onNavigate?.('refunds')}
                  >
                    {stats.pending.refunds} 個退款待處理
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 主要指標卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          title="本月活躍用戶"
          value={stats.users.monthlyActive}
          subtitle={`總用戶 ${stats.users.total}`}
          trend={stats.users.todayNew > 0 ? `+${stats.users.todayNew} 今日` : undefined}
          color="indigo"
        />
        <StatCard
          title="本月扭蛋次數"
          value={stats.gacha.monthly}
          subtitle={`總計 ${stats.gacha.total}`}
          trend={stats.gacha.today > 0 ? `+${stats.gacha.today} 今日` : undefined}
          color="purple"
        />
        <StatCard
          title="本月訂閱收入"
          value={`NT$${stats.subscriptions.monthlyRevenue.toLocaleString()}`}
          subtitle={`${stats.subscriptions.active} 個活躍訂閱`}
          color="green"
        />
        <StatCard
          title="優惠券核銷率"
          value={`${stats.coupons.redemptionRate}%`}
          subtitle={`${stats.coupons.redeemed}/${stats.coupons.total}`}
          color="amber"
        />
      </div>

      {/* 7日趨勢圖 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <TrendChart
          title="7日扭蛋趨勢"
          data={trends.gacha}
          color="#8b5cf6"
        />
        <TrendChart
          title="7日新增用戶"
          data={trends.users}
          color="#6366f1"
        />
      </div>

      {/* 詳細統計 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* 景點統計 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-4">景點庫存</h3>
          <div className="space-y-3">
            <StatRow label="總景點數" value={stats.places.total} />
            <StatRow label="啟用中" value={stats.places.active} color="green" />
            <StatRow
              label="停用中"
              value={stats.places.total - stats.places.active}
              color="red"
            />
          </div>
          <button
            onClick={() => onNavigate?.('places')}
            className="mt-4 w-full py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            管理景點 →
          </button>
        </div>

        {/* 商家統計 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-4">商家狀況</h3>
          <div className="space-y-3">
            <StatRow label="總商家數" value={stats.merchants.total} />
            <StatRow label="已審核" value={stats.merchants.approved} color="green" />
            <StatRow label="待審核" value={stats.merchants.pending} color="amber" />
          </div>
          <button
            onClick={() => onNavigate?.('merchants')}
            className="mt-4 w-full py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            管理商家 →
          </button>
        </div>

        {/* 訂閱統計 */}
        <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
          <h3 className="font-bold text-slate-700 mb-4">訂閱收入</h3>
          <div className="space-y-3">
            <StatRow label="活躍訂閱" value={stats.subscriptions.active} />
            <StatRow
              label="本月收入"
              value={`NT$${stats.subscriptions.monthlyRevenue.toLocaleString()}`}
              color="green"
            />
            <StatRow label="待處理退款" value={stats.pending.refunds} color="amber" />
          </div>
          <button
            onClick={() => onNavigate?.('finance')}
            className="mt-4 w-full py-2 text-sm text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
          >
            財務報表 →
          </button>
        </div>
      </div>

      {/* 更新時間 */}
      <div className="text-center text-sm text-slate-400">
        數據更新時間：{formatTWDate(data.generatedAt)}
      </div>
    </div>
  );
};

// 統計卡片組件
interface StatCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  trend?: string;
  color: 'indigo' | 'purple' | 'green' | 'amber' | 'red';
}

const StatCard: React.FC<StatCardProps> = ({ title, value, subtitle, trend, color }) => {
  const colors = {
    indigo: 'bg-indigo-50 border-indigo-100',
    purple: 'bg-purple-50 border-purple-100',
    green: 'bg-green-50 border-green-100',
    amber: 'bg-amber-50 border-amber-100',
    red: 'bg-red-50 border-red-100',
  };

  const textColors = {
    indigo: 'text-indigo-600',
    purple: 'text-purple-600',
    green: 'text-green-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  };

  return (
    <div className={`rounded-xl p-4 border ${colors[color]}`}>
      <div className="text-sm text-slate-500 mb-1">{title}</div>
      <div className={`text-2xl font-bold ${textColors[color]}`}>{value}</div>
      <div className="flex items-center justify-between mt-1">
        {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
        {trend && (
          <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
            {trend}
          </span>
        )}
      </div>
    </div>
  );
};

// 統計行組件
interface StatRowProps {
  label: string;
  value: string | number;
  color?: 'green' | 'amber' | 'red';
}

const StatRow: React.FC<StatRowProps> = ({ label, value, color }) => {
  const textColors = {
    green: 'text-green-600',
    amber: 'text-amber-600',
    red: 'text-red-600',
  };

  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-slate-500">{label}</span>
      <span className={`font-medium ${color ? textColors[color] : 'text-slate-700'}`}>
        {value}
      </span>
    </div>
  );
};

// 趨勢圖組件
interface TrendChartProps {
  title: string;
  data: TrendData[];
  color: string;
}

const TrendChart: React.FC<TrendChartProps> = ({ title, data, color }) => {
  const maxValue = Math.max(...data.map(d => d.count), 1);

  return (
    <div className="bg-white rounded-xl p-5 shadow-sm border border-slate-100">
      <h3 className="font-bold text-slate-700 mb-4">{title}</h3>
      <div className="flex items-end gap-1 h-32">
        {data.map((item, index) => {
          const height = (item.count / maxValue) * 100;
          const dayName = new Date(item.date).toLocaleDateString('zh-TW', { weekday: 'short' });

          return (
            <div key={index} className="flex-1 flex flex-col items-center gap-1">
              <div
                className="w-full rounded-t transition-all duration-300 hover:opacity-80"
                style={{
                  height: `${Math.max(height, 4)}%`,
                  backgroundColor: color,
                }}
                title={`${item.date}: ${item.count}`}
              />
              <span className="text-xs text-slate-400">{dayName}</span>
            </div>
          );
        })}
      </div>
      <div className="flex justify-between mt-2 text-xs text-slate-400">
        <span>總計: {data.reduce((sum, d) => sum + d.count, 0)}</span>
        <span>平均: {Math.round(data.reduce((sum, d) => sum + d.count, 0) / data.length)}/日</span>
      </div>
    </div>
  );
};
