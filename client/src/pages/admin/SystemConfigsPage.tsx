import React, { useState, useEffect, useCallback } from 'react';
import { Language } from '../../types';

interface SystemConfig {
  id: number;
  category: string;
  key: string;
  value: any;
  valueType: string;
  defaultValue: any;
  label: string;
  description: string | null;
  uiType: string | null;
  uiOptions: any;
  validation: any;
  editableBy: string;
  isReadOnly: boolean;
  updatedAt: string;
  updatedBy: number | null;
}

interface SystemConfigsPageProps {
  language: Language;
  t: Record<string, string>;
}

export const SystemConfigsPage: React.FC<SystemConfigsPageProps> = ({ language }) => {
  const [configs, setConfigs] = useState<Record<string, SystemConfig[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingConfig, setEditingConfig] = useState<SystemConfig | null>(null);
  const [editValue, setEditValue] = useState<string>('');
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  const fetchConfigs = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/configs', {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('無法載入設定');
      const data = await res.json();
      setConfigs(data.configs || {});
      setExpandedCategories(new Set(Object.keys(data.configs || {})));
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfigs();
  }, [fetchConfigs]);

  useEffect(() => {
    if (success || error) {
      const timer = setTimeout(() => {
        setSuccess(null);
        setError(null);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [success, error]);

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories);
    if (newExpanded.has(category)) {
      newExpanded.delete(category);
    } else {
      newExpanded.add(category);
    }
    setExpandedCategories(newExpanded);
  };

  const startEditing = (config: SystemConfig) => {
    if (config.isReadOnly) return;
    setEditingConfig(config);
    setEditValue(
      typeof config.value === 'object'
        ? JSON.stringify(config.value, null, 2)
        : String(config.value)
    );
  };

  const cancelEditing = () => {
    setEditingConfig(null);
    setEditValue('');
  };

  const saveConfig = async () => {
    if (!editingConfig) return;

    try {
      let parsedValue: any;
      
      switch (editingConfig.valueType) {
        case 'number':
          parsedValue = Number(editValue);
          if (isNaN(parsedValue)) {
            throw new Error('請輸入有效數字');
          }
          break;
        case 'boolean':
          parsedValue = editValue === 'true' || editValue === '1';
          break;
        case 'json':
          try {
            parsedValue = JSON.parse(editValue);
          } catch {
            throw new Error('無效的 JSON 格式');
          }
          break;
        default:
          parsedValue = editValue;
      }

      const res = await fetch(`/api/admin/configs/${editingConfig.category}/${editingConfig.key}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ value: parsedValue }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '更新失敗');
      }

      setSuccess('設定已更新');
      setEditingConfig(null);
      setEditValue('');
      fetchConfigs();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const resetConfig = async (config: SystemConfig) => {
    if (config.defaultValue === null) return;

    try {
      const res = await fetch(`/api/admin/configs/${config.category}/${config.key}/reset`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || '重置失敗');
      }

      setSuccess('設定已重置為預設值');
      fetchConfigs();
    } catch (err: any) {
      setError(err.message);
    }
  };

  const formatValue = (config: SystemConfig): string => {
    if (typeof config.value === 'object') {
      return JSON.stringify(config.value);
    }
    if (typeof config.value === 'boolean') {
      return config.value ? '是' : '否';
    }
    return String(config.value);
  };

  const getCategoryLabel = (category: string): string => {
    const labels: Record<string, string> = {
      gacha: '扭蛋系統',
      place: '景點設定',
      user: '用戶設定',
      merchant: '商家設定',
      payment: '金流設定',
      notification: '通知設定',
      general: '一般設定',
    };
    return labels[category] || category;
  };

  const getCategoryIcon = (category: string): string => {
    const icons: Record<string, string> = {
      gacha: '🎰',
      place: '📍',
      user: '👤',
      merchant: '🏪',
      payment: '💳',
      notification: '🔔',
      general: '⚙️',
    };
    return icons[category] || '📋';
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
        <div className="animate-spin h-8 w-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-slate-500">載入系統設定中...</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">系統設定管理</h2>
          <p className="text-slate-500 mt-1">管理系統運行參數與配置</p>
        </div>
        <button
          onClick={fetchConfigs}
          className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors"
          data-testid="button-refresh-configs"
        >
          重新整理
        </button>
      </div>

      {(error || success) && (
        <div className={`p-4 rounded-xl ${error ? 'bg-red-50 text-red-700 border border-red-200' : 'bg-green-50 text-green-700 border border-green-200'}`}>
          {error || success}
        </div>
      )}

      {Object.keys(configs).length === 0 ? (
        <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-100 text-center">
          <span className="text-6xl mb-4 block">⚙️</span>
          <h3 className="text-xl font-bold text-slate-700 mb-2">尚無系統設定</h3>
          <p className="text-slate-500">系統設定將在這裡顯示</p>
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(configs).map(([category, categoryConfigs]) => (
            <div
              key={category}
              className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden"
              data-testid={`card-config-category-${category}`}
            >
              <button
                onClick={() => toggleCategory(category)}
                className="w-full px-6 py-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                data-testid={`button-toggle-category-${category}`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{getCategoryIcon(category)}</span>
                  <div className="text-left">
                    <h3 className="font-bold text-slate-800">{getCategoryLabel(category)}</h3>
                    <p className="text-sm text-slate-500">{categoryConfigs.length} 項設定</p>
                  </div>
                </div>
                <svg
                  className={`w-5 h-5 text-slate-400 transition-transform ${expandedCategories.has(category) ? 'rotate-180' : ''}`}
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {expandedCategories.has(category) && (
                <div className="border-t border-slate-100">
                  {categoryConfigs.map((config) => (
                    <div
                      key={config.id}
                      className={`px-6 py-4 border-b border-slate-50 last:border-b-0 ${config.isReadOnly ? 'bg-slate-50' : 'hover:bg-slate-25'}`}
                      data-testid={`row-config-${config.category}-${config.key}`}
                    >
                      {editingConfig?.id === config.id ? (
                        <div className="space-y-3">
                          <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">
                              {config.label}
                            </label>
                            {config.description && (
                              <p className="text-sm text-slate-500 mb-2">{config.description}</p>
                            )}
                          </div>
                          
                          {config.valueType === 'boolean' ? (
                            <select
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              data-testid={`select-config-${config.key}`}
                            >
                              <option value="true">是</option>
                              <option value="false">否</option>
                            </select>
                          ) : config.valueType === 'json' || config.uiType === 'textarea' ? (
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={4}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                              data-testid={`textarea-config-${config.key}`}
                            />
                          ) : (
                            <input
                              type={config.valueType === 'number' ? 'number' : 'text'}
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                              data-testid={`input-config-${config.key}`}
                            />
                          )}

                          {config.validation && (
                            <p className="text-xs text-slate-500">
                              {config.validation.min !== undefined && `最小值: ${config.validation.min}`}
                              {config.validation.min !== undefined && config.validation.max !== undefined && ' | '}
                              {config.validation.max !== undefined && `最大值: ${config.validation.max}`}
                            </p>
                          )}

                          <div className="flex gap-2">
                            <button
                              onClick={saveConfig}
                              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                              data-testid={`button-save-config-${config.key}`}
                            >
                              儲存
                            </button>
                            <button
                              onClick={cancelEditing}
                              className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200 transition-colors"
                              data-testid={`button-cancel-config-${config.key}`}
                            >
                              取消
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h4 className="font-medium text-slate-800">{config.label}</h4>
                              {config.isReadOnly && (
                                <span className="px-2 py-0.5 bg-slate-200 text-slate-600 text-xs rounded-full">
                                  唯讀
                                </span>
                              )}
                            </div>
                            {config.description && (
                              <p className="text-sm text-slate-500 mt-0.5">{config.description}</p>
                            )}
                            <p className="text-sm text-slate-600 mt-1 font-mono bg-slate-100 px-2 py-1 rounded inline-block">
                              {formatValue(config)}
                            </p>
                          </div>
                          
                          {!config.isReadOnly && (
                            <div className="flex gap-2">
                              {config.defaultValue !== null && config.value !== config.defaultValue && (
                                <button
                                  onClick={() => resetConfig(config)}
                                  className="px-3 py-1.5 text-sm text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                  title="重置為預設值"
                                  data-testid={`button-reset-config-${config.key}`}
                                >
                                  重置
                                </button>
                              )}
                              <button
                                onClick={() => startEditing(config)}
                                className="px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                data-testid={`button-edit-config-${config.key}`}
                              >
                                編輯
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
