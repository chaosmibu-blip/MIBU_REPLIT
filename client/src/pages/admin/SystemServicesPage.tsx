import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';
import { formatTWDate } from '../../lib/utils';

interface EnvVar {
  name: string;
  configured: boolean;
  masked?: string;
}

interface ServiceStatus {
  name: string;
  category: string;
  status: 'configured' | 'not_configured' | 'partial';
  envVars: EnvVar[];
  description: string;
}

interface Category {
  id: string;
  name: string;
}

interface SystemStatusResponse {
  summary: {
    total: number;
    configured: number;
    partial: number;
    notConfigured: number;
  };
  services: ServiceStatus[];
  byCategory: Record<string, ServiceStatus[]>;
  categories: Category[];
  checkedAt: string;
}

interface SystemServicesPageProps {
  language: Language;
  t: Record<string, string>;
}

export const SystemServicesPage: React.FC<SystemServicesPageProps> = ({ language }) => {
  const [data, setData] = useState<SystemStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedServices, setExpandedServices] = useState<Set<string>>(new Set());

  const fetchStatus = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/system-status', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入系統狀態');
      const result = await res.json();
      setData(result);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const toggleService = (serviceName: string) => {
    const newExpanded = new Set(expandedServices);
    if (newExpanded.has(serviceName)) {
      newExpanded.delete(serviceName);
    } else {
      newExpanded.add(serviceName);
    }
    setExpandedServices(newExpanded);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'configured':
        return 'bg-green-100 text-green-700 border-green-200';
      case 'partial':
        return 'bg-yellow-100 text-yellow-700 border-yellow-200';
      case 'not_configured':
        return 'bg-red-100 text-red-700 border-red-200';
      default:
        return 'bg-slate-100 text-slate-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'configured':
        return '已設定';
      case 'partial':
        return '部分設定';
      case 'not_configured':
        return '未設定';
      default:
        return status;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'configured':
        return '✓';
      case 'partial':
        return '!';
      case 'not_configured':
        return '✗';
      default:
        return '?';
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
        <p className="text-slate-500">檢查系統狀態中...</p>
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

  return (
    <div className="space-y-6">
      {/* 標題 */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">系統服務狀態</h2>
          <p className="text-slate-500">檢查第三方服務的環境變數設定</p>
        </div>
        <button
          onClick={fetchStatus}
          className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-medium hover:bg-slate-200 transition-colors"
        >
          重新檢查
        </button>
      </div>

      {/* 統計摘要 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 shadow-sm border border-slate-100">
          <div className="text-3xl font-bold text-slate-800">{data.summary.total}</div>
          <div className="text-sm text-slate-500">總服務數</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-green-100">
          <div className="text-3xl font-bold text-green-600">{data.summary.configured}</div>
          <div className="text-sm text-slate-500">已設定</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-yellow-100">
          <div className="text-3xl font-bold text-yellow-600">{data.summary.partial}</div>
          <div className="text-sm text-slate-500">部分設定</div>
        </div>
        <div className="bg-white rounded-xl p-4 shadow-sm border border-red-100">
          <div className="text-3xl font-bold text-red-600">{data.summary.notConfigured}</div>
          <div className="text-sm text-slate-500">未設定</div>
        </div>
      </div>

      {/* 服務列表 - 按分類 */}
      {data.categories.map((category) => {
        const services = data.byCategory[category.id] || [];
        if (services.length === 0) return null;

        return (
          <div key={category.id} className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100">
              <h3 className="font-bold text-slate-700">{category.name}</h3>
            </div>
            <div className="divide-y divide-slate-100">
              {services.map((service) => (
                <div key={service.name} className="p-4">
                  <div
                    className="flex items-center justify-between cursor-pointer"
                    onClick={() => toggleService(service.name)}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${getStatusColor(service.status)}`}
                      >
                        {getStatusIcon(service.status)}
                      </span>
                      <div>
                        <div className="font-medium text-slate-800">{service.name}</div>
                        <div className="text-sm text-slate-500">{service.description}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span
                        className={`px-3 py-1 rounded-full text-sm font-medium border ${getStatusColor(service.status)}`}
                      >
                        {getStatusLabel(service.status)}
                      </span>
                      <span className="text-slate-400">
                        {expandedServices.has(service.name) ? '▼' : '▶'}
                      </span>
                    </div>
                  </div>

                  {/* 環境變數詳情 */}
                  {expandedServices.has(service.name) && (
                    <div className="mt-4 ml-11 space-y-2">
                      {service.envVars.map((envVar) => (
                        <div
                          key={envVar.name}
                          className={`flex items-center justify-between p-3 rounded-lg ${
                            envVar.configured ? 'bg-green-50' : 'bg-red-50'
                          }`}
                        >
                          <code className="text-sm font-mono text-slate-700">{envVar.name}</code>
                          <div className="flex items-center gap-2">
                            {envVar.configured ? (
                              <>
                                <code className="text-xs font-mono text-slate-500 bg-white px-2 py-1 rounded">
                                  {envVar.masked}
                                </code>
                                <span className="text-green-600 text-sm">✓ 已設定</span>
                              </>
                            ) : (
                              <span className="text-red-600 text-sm">✗ 未設定</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {/* 檢查時間 */}
      <div className="text-center text-sm text-slate-400">
        最後檢查時間：{formatTWDate(data.checkedAt)}
      </div>
    </div>
  );
};
